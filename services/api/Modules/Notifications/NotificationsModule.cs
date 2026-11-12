using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using TopicLog.Api.Common;
using TopicLog.Api.Modules.Identity;

namespace TopicLog.Api.Modules.Notifications;

public sealed class UserNotification
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid UserId { get; init; }
    public string Type { get; init; } = "SYSTEM";
    public string Title { get; init; } = string.Empty;
    public string Message { get; init; } = string.Empty;
    public string Href { get; init; } = "/";
    public Guid? RelatedShipmentId { get; init; }
    public Guid? RelatedContractId { get; init; }
    public bool IsRead { get; set; }
    public DateTimeOffset CreatedAtUtc { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReadAtUtc { get; set; }
}

public sealed record NotificationListResponse(
    IReadOnlyList<UserNotification> Items,
    int UnreadCount);

public interface INotificationsService
{
    Task<UserNotification> NotifyAsync(
        Guid userId,
        string type,
        string title,
        string message,
        string href,
        Guid? relatedShipmentId = null,
        Guid? relatedContractId = null,
        CancellationToken cancellationToken = default);

    Task<NotificationListResponse> ListForUserAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<bool> MarkReadAsync(Guid userId, Guid notificationId, CancellationToken cancellationToken = default);
    Task<int> MarkAllReadAsync(Guid userId, CancellationToken cancellationToken = default);
}

public sealed class NotificationsService : INotificationsService
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private static string StorageFilePath => StoragePathResolver.ResolveFilePath("notifications_store.json");

    private readonly ConcurrentDictionary<Guid, UserNotification> _storage = new();
    private readonly Lock _diskLock = new();

    public NotificationsService()
    {
        LoadFromDisk();
    }

    private void LoadFromDisk()
    {
        bool isUnitTest = string.Equals(Environment.GetEnvironmentVariable("TOPICLOG_IS_UNIT_TEST"), "true", StringComparison.OrdinalIgnoreCase);
        if (isUnitTest) return;

        try
        {
            if (!File.Exists(StorageFilePath)) return;
            var json = File.ReadAllText(StorageFilePath);
            var list = JsonSerializer.Deserialize<List<UserNotification>>(json);
            if (list is null) return;
            foreach (var item in list)
            {
                if (item is not null)
                {
                    _storage[item.Id] = item;
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[TopicLog.Storage] Aviso ao carregar notificações: {ex.Message}");
        }
    }

    private void SaveToDisk()
    {
        bool isTest = string.Equals(Environment.GetEnvironmentVariable("TOPICLOG_IS_TEST"), "true", StringComparison.OrdinalIgnoreCase)
                   || string.Equals(Environment.GetEnvironmentVariable("TOPICLOG_IS_UNIT_TEST"), "true", StringComparison.OrdinalIgnoreCase);
        if (isTest) return;

        lock (_diskLock)
        {
            try
            {
                var list = _storage.Values
                    .OrderByDescending(n => n.CreatedAtUtc)
                    .Take(1000)
                    .ToList();
                var json = JsonSerializer.Serialize(list, JsonOptions);
                StoragePathResolver.SaveFileAtomically(StorageFilePath, json);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TopicLog.Storage] Erro ao persistir notificações: {ex.Message}");
            }
        }
    }

    public Task<UserNotification> NotifyAsync(
        Guid userId,
        string type,
        string title,
        string message,
        string href,
        Guid? relatedShipmentId = null,
        Guid? relatedContractId = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (userId == Guid.Empty)
        {
            return Task.FromResult(new UserNotification
            {
                UserId = userId,
                Type = type,
                Title = title,
                Message = message,
                Href = href
            });
        }

        var item = new UserNotification
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Type = type,
            Title = title,
            Message = message,
            Href = string.IsNullOrWhiteSpace(href) ? "/" : href,
            RelatedShipmentId = relatedShipmentId,
            RelatedContractId = relatedContractId,
            IsRead = false,
            CreatedAtUtc = DateTimeOffset.UtcNow
        };

        _storage[item.Id] = item;
        SaveToDisk();
        return Task.FromResult(item);
    }

    public Task<NotificationListResponse> ListForUserAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var items = _storage.Values
            .Where(n => n.UserId == userId)
            .OrderByDescending(n => n.CreatedAtUtc)
            .Take(50)
            .ToList();

        int unreadCount = items.Count(n => !n.IsRead);
        return Task.FromResult(new NotificationListResponse(items, unreadCount));
    }

    public Task<bool> MarkReadAsync(Guid userId, Guid notificationId, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (_storage.TryGetValue(notificationId, out var item) && item.UserId == userId)
        {
            if (!item.IsRead)
            {
                item.IsRead = true;
                item.ReadAtUtc = DateTimeOffset.UtcNow;
                SaveToDisk();
            }
            return Task.FromResult(true);
        }

        return Task.FromResult(false);
    }

    public Task<int> MarkAllReadAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        int changed = 0;
        var now = DateTimeOffset.UtcNow;
        foreach (var item in _storage.Values.Where(n => n.UserId == userId && !n.IsRead))
        {
            item.IsRead = true;
            item.ReadAtUtc = now;
            changed++;
        }

        if (changed > 0)
        {
            SaveToDisk();
        }

        return Task.FromResult(changed);
    }
}

public static class NotificationsEndpoints
{
    public static IServiceCollection AddTopicLogNotificationsModule(this IServiceCollection services)
    {
        services.AddSingleton<INotificationsService, NotificationsService>();
        return services;
    }

    public static IEndpointRouteBuilder MapTopicLogNotificationsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/notifications");

        group.MapGet("/", async (
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            INotificationsService notifications,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var list = await notifications.ListForUserAsync(actor.UserId, cancellationToken).ConfigureAwait(false);
            return Results.Ok(list);
        });

        group.MapPost("/{id:guid}/read", async (
            Guid id,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            INotificationsService notifications,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            bool ok = await notifications.MarkReadAsync(actor.UserId, id, cancellationToken).ConfigureAwait(false);
            return ok ? Results.Ok(new { marked = true }) : Results.NotFound();
        });

        group.MapPost("/read-all", async (
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            INotificationsService notifications,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            int count = await notifications.MarkAllReadAsync(actor.UserId, cancellationToken).ConfigureAwait(false);
            return Results.Ok(new { markedCount = count });
        });

        return app;
    }
}
