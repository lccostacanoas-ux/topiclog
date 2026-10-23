using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Modules.Identity;

namespace TopicLog.Api.Modules.Shipments;

public static class ShipmentsEndpoints
{
    public static IServiceCollection AddTopicLogShipmentsModule(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddSingleton<IShipmentsRepository, InMemoryShipmentsRepository>();
        services.AddSingleton<IShipmentsApplicationService, ShipmentsApplicationService>();

        return services;
    }

    public static WebApplication MapTopicLogShipmentsEndpoints(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        // POST /api/v1/shipments — Publicação de encomenda (PRD-03, D03, D04, D06)
        app.MapPost("/api/v1/shipments", async (
            [FromBody] CreateShipmentRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IShipmentsApplicationService shipmentsService,
            CancellationToken cancellationToken) =>
        {
            Guid senderId;
            string senderName;

            if (authorization.TryGetAuthenticatedActor(httpContext, out var actor) && actor is not null)
            {
                senderId = actor.UserId;
                senderName = actor.Email;
            }
            else
            {
                // Fallback sandbox com isolamento determinístico para modo de testes locais
                senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
                senderName = "Remetente Sandbox (Demo)";
            }

            var created = await shipmentsService.CreateShipmentAsync(
                senderId,
                senderName,
                request,
                cancellationToken).ConfigureAwait(false);

            return Results.Created($"/api/v1/shipments/{created.Id}", created);
        });

        // GET /api/v1/shipments — Catálogo público de encomendas ativas com privacidade preservada (D08)
        app.MapGet("/api/v1/shipments", async (
            [FromQuery] string? originCity,
            [FromQuery] string? destinationCity,
            IShipmentsApplicationService shipmentsService,
            CancellationToken cancellationToken) =>
        {
            var shipments = await shipmentsService.ListShipmentsAsync(
                originCity,
                destinationCity,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(shipments);
        });

        // GET /api/v1/shipments/{id:guid} — Detalhes da encomenda (revela endereço exato apenas ao remetente)
        app.MapGet("/api/v1/shipments/{id:guid}", async (
            Guid id,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IShipmentsApplicationService shipmentsService,
            CancellationToken cancellationToken) =>
        {
            authorization.TryGetAuthenticatedActor(httpContext, out var actor);
            var requesterUserId = actor?.UserId;

            var shipment = await shipmentsService.GetShipmentByIdAsync(
                id,
                requesterUserId,
                cancellationToken).ConfigureAwait(false);

            if (shipment is null)
            {
                return Results.NotFound(new
                {
                    type = "https://topiclog.com.br/errors/shipment-not-found",
                    title = "Encomenda não encontrada",
                    status = 404,
                    detail = $"A encomenda com ID '{id}' não existe ou foi removida."
                });
            }

            return Results.Ok(shipment);
        });

        // POST /api/v1/shipments/{id:guid}/media — Upload privado de fotos da encomenda (IObjectStorageProvider)
        app.MapPost("/api/v1/shipments/{id:guid}/media", async (
            Guid id,
            HttpRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IShipmentsApplicationService shipmentsService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);

            if (!request.HasFormContentType || request.Form.Files.Count == 0)
            {
                return Results.BadRequest(new
                {
                    type = "https://topiclog.com.br/errors/missing-file",
                    title = "Arquivo ausente",
                    status = 400,
                    detail = "Nenhum arquivo de imagem foi enviado no corpo da requisição multipart/form-data."
                });
            }

            var file = request.Form.Files[0];
            await using var stream = file.OpenReadStream();

            var photoUrl = await shipmentsService.AddShipmentPhotoAsync(
                id,
                actor.UserId,
                file.FileName,
                stream,
                file.ContentType,
                cancellationToken).ConfigureAwait(false);

            return Results.Created(photoUrl, new { photoUrl });
        });

        return app;
    }
}
