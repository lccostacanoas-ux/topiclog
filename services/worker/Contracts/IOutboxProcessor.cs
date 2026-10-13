namespace TopicLog.Worker.Contracts;

/// <summary>
/// Contrato para processamento assíncrono de eventos transacionais (Outbox e Webhook Inbox).
/// </summary>
public interface IOutboxProcessor
{
    /// <summary>
    /// Executa um ciclo de varredura de eventos pendentes de forma idempotente.
    /// </summary>
    Task<int> ProcessPendingBatchAsync(CancellationToken cancellationToken);
}

/// <summary>
/// Estado operacional do Worker assíncrono para diagnóstico e Health Checks.
/// </summary>
public sealed record WorkerOperationalStatus(
    bool IsRunning,
    string ExecutionMode,
    DateTimeOffset? LastCycleUtc,
    long TotalCyclesExecuted);
