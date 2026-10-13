using System.Diagnostics.CodeAnalysis;

namespace TopicLog.Api.Common.Contracts;

/// <summary>
/// Máquina de estados de pagamento conforme 02-TRD-Tecnico.md (Seção 6).
/// </summary>
public enum PaymentStatus
{
    CREATED = 0,
    PENDING = 1,
    AUTHORIZED = 2,
    CONFIRMED = 3,
    SETTLED = 4,
    FAILED = 5,
    REFUNDED = 6,
    CHARGEBACK = 7
}

/// <summary>
/// Máquina de estados de transferência ao transportador conforme 02-TRD-Tecnico.md (Seção 6 e D17).
/// Iniciar transferência não equivale a crédito bancário imediato.
/// </summary>
[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica da máquina de estados definida em 02-TRD-Tecnico.md")]
public enum TransferStatus
{
    NOT_ELIGIBLE = 0,
    ELIGIBLE = 1,
    REQUESTED = 2,
    PROCESSING = 3,
    SUCCEEDED = 4,
    BLOCKED = 5,
    FAILED = 6,
    REVERSED = 7
}

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica das modalidades de pagamento em 05-Banco-de-Dados.md")]
public enum PaymentMethodKind
{
    PIX = 0,
    DEBIT_CARD = 1,
    CREDIT_CARD = 2
}

public sealed record CreateSandboxChargeRequest(
    Guid OrderId,
    long TransportAmountCents,
    PaymentMethodKind Method,
    int Installments,
    string IdempotencyKey);

public sealed record SandboxChargeResult(
    string ProviderName,
    string ProviderPaymentId,
    PaymentStatus Status,
    long ChargedToSenderCents,
    long EstimatedGatewayFeeCentsAbsorbedByPlatform,
    bool IsSandbox);

public sealed record RequestTransferCommand(
    Guid OrderId,
    Guid CarrierId,
    long AmountCents,
    string IdempotencyKey);

public sealed record TransferResult(
    string ProviderName,
    string ProviderTransferId,
    TransferStatus Status,
    bool IsBankPayoutSettled,
    string StatusDisplayMessage);

/// <summary>
/// Interface desacoplada para provedor financeiro (Asaas prioritário em sandbox — D07, D12, D13, D17).
/// Nenhuma operação real é permitida enquanto RealPaymentsEnabled for false.
/// </summary>
public interface IPaymentProvider
{
    string ProviderName { get; }

    bool IsSandboxMode { get; }

    Task<SandboxChargeResult> CreateChargeAsync(
        CreateSandboxChargeRequest request,
        CancellationToken cancellationToken);

    Task<TransferResult> RequestEligibleTransferAsync(
        RequestTransferCommand command,
        CancellationToken cancellationToken);

    bool VerifyWebhookSignature(string rawPayload, string? signatureHeader);
}
