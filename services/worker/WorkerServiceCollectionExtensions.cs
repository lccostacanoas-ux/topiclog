using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using TopicLog.Worker.Contracts;
using TopicLog.Worker.Services;

namespace TopicLog.Worker;

/// <summary>
/// Extensões de registro de DI do módulo Worker.
/// </summary>
public static class WorkerServiceCollectionExtensions
{
    public static IServiceCollection AddTopicLogWorker(
        this IServiceCollection services,
        bool registerHostedService = true)
    {
        services.TryAddSingleton<WorkerStatusTracker>();
        services.TryAddSingleton<IOutboxProcessor, NoOpOutboxProcessor>();

        if (registerHostedService)
        {
            services.AddHostedService<TopicLogBackgroundWorker>();
        }

        return services;
    }
}
