using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TopicLog.Worker.Contracts;

namespace TopicLog.Worker.Services;

/// <summary>
/// Implementação inicial segura (No-Op em PR-00) do processador de Outbox/Inbox.
/// </summary>
public sealed class NoOpOutboxProcessor : IOutboxProcessor
{
    public Task<int> ProcessPendingBatchAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(0);
    }
}

/// <summary>
/// Monitor de estado em memória do Worker para inspeção pelo Health Check de prontidão (/health/ready).
/// </summary>
public sealed class WorkerStatusTracker
{
    private long _totalCycles;
    private DateTimeOffset? _lastCycleUtc;
    private volatile bool _isRunning;
    private string _executionMode = "InProcess";

    public void MarkStarted(string executionMode)
    {
        _executionMode = executionMode;
        _isRunning = true;
        _lastCycleUtc = DateTimeOffset.UtcNow;
    }

    public void RecordCycle()
    {
        Interlocked.Increment(ref _totalCycles);
        _lastCycleUtc = DateTimeOffset.UtcNow;
    }

    public void MarkStopped()
    {
        _isRunning = false;
    }

    public WorkerOperationalStatus GetSnapshot() =>
        new(
            IsRunning: _isRunning,
            ExecutionMode: _executionMode,
            LastCycleUtc: _lastCycleUtc,
            TotalCyclesExecuted: Interlocked.Read(ref _totalCycles));
}

/// <summary>
/// Serviço em background do Topic Log.
/// Projetado para rodar acoplado (In-Process) na API em máquinas de 8 GB de RAM
/// ou como processo isolado em produção.
/// </summary>
public sealed partial class TopicLogBackgroundWorker : BackgroundService
{
    private readonly IOutboxProcessor _outboxProcessor;
    private readonly WorkerStatusTracker _statusTracker;
    private readonly ILogger<TopicLogBackgroundWorker> _logger;
    private readonly TimeSpan _pollingInterval;

    public TopicLogBackgroundWorker(
        IOutboxProcessor outboxProcessor,
        WorkerStatusTracker statusTracker,
        ILogger<TopicLogBackgroundWorker> logger,
        TimeSpan? pollingInterval = null)
    {
        _outboxProcessor = outboxProcessor;
        _statusTracker = statusTracker;
        _logger = logger;
        _pollingInterval = pollingInterval ?? TimeSpan.FromSeconds(30);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _statusTracker.MarkStarted("InProcess");
        LogWorkerStarted(_logger, _pollingInterval.TotalSeconds);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await _outboxProcessor.ProcessPendingBatchAsync(stoppingToken).ConfigureAwait(false);
                _statusTracker.RecordCycle();
                await Task.Delay(_pollingInterval, stoppingToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Encerramento normal solicitado pelo host
        }
        finally
        {
            _statusTracker.MarkStopped();
            LogWorkerStopped(_logger);
        }
    }

    [LoggerMessage(
        EventId = 1001,
        Level = LogLevel.Information,
        Message = "TopicLogBackgroundWorker iniciado em modo enxuto (intervalo: {IntervalSeconds}s).")]
    private static partial void LogWorkerStarted(ILogger logger, double intervalSeconds);

    [LoggerMessage(
        EventId = 1002,
        Level = LogLevel.Information,
        Message = "TopicLogBackgroundWorker finalizado com segurança.")]
    private static partial void LogWorkerStopped(ILogger logger);
}
