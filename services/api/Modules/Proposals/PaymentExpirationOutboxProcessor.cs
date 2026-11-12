using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TopicLog.Worker.Contracts;

namespace TopicLog.Api.Modules.Proposals;

/// <summary>
/// Processador de outbox in-process para expirar janelas de pagamento Pix de 15 minutos
/// e devolver encomendas nao pagas ao mural publico.
/// </summary>
public sealed class PaymentExpirationOutboxProcessor : IOutboxProcessor
{
    private static readonly Action<ILogger, int, Exception?> LogExpiredReservations =
        LoggerMessage.Define<int>(
            LogLevel.Information,
            new EventId(1, nameof(PaymentExpirationOutboxProcessor)),
            "TopicLog.Outbox: {Count} reserva(s) de pagamento Pix expiradas após 15 minutos.");

    private static readonly Action<ILogger, Exception?> LogProcessingWarning =
        LoggerMessage.Define(
            LogLevel.Warning,
            new EventId(2, nameof(PaymentExpirationOutboxProcessor)),
            "Falha não bloqueante ao processar expiração de pagamentos pendentes.");

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PaymentExpirationOutboxProcessor> _logger;

    public PaymentExpirationOutboxProcessor(
        IServiceScopeFactory scopeFactory,
        ILogger<PaymentExpirationOutboxProcessor> logger)
    {
        _scopeFactory = scopeFactory ?? throw new ArgumentNullException(nameof(scopeFactory));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<int> ProcessPendingBatchAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var proposalsService = scope.ServiceProvider.GetService<IProposalsApplicationService>();
            if (proposalsService is null)
            {
                return 0;
            }

            int expiredCount = await proposalsService.ExpirePendingPaymentsAsync(cancellationToken).ConfigureAwait(false);
            if (expiredCount > 0)
            {
                LogExpiredReservations(_logger, expiredCount, null);
            }
            return expiredCount;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            LogProcessingWarning(_logger, ex);
            return 0;
        }
    }
}
