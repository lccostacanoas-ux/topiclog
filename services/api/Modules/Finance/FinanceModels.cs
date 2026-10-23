// ============================================================================
// TOPIC LOG — MÓDULO FINANCEIRO: MODELOS E CONTRATOS (PR-FIN-01)
// Decisões Vinculantes: D10 (13%), D11 (7% e R$ 39,90), D12 (Absorção de taxas) e ADR-0002
// ============================================================================

using System.Diagnostics.CodeAnalysis;
using System.Text.Json.Serialization;

namespace TopicLog.Api.Modules.Finance;

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica do modelo de domínio Topic Log")]
public enum SubscriptionStatus
{
    TRIAL,
    ACTIVE,
    PAST_DUE,
    CANCELED,
    EXPIRED
}

public class CommercialPolicy
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Version { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public decimal FreePlanCommissionPercent { get; set; }
    public decimal PremiumPlanCommissionPercent { get; set; }
    public long PremiumMonthlyFeeCents { get; set; }
    public decimal CancellationPenaltyPercent { get; set; } = 10.00m;
    public long CancellationMinFeeCents { get; set; } = 700;
    public decimal CancellationInjuredPartySharePercent { get; set; } = 80.00m;
    public DateTimeOffset ValidFrom { get; set; }
    public DateTimeOffset? ValidUntil { get; set; }
    public bool IsActive { get; set; } = true;
    public string Justification { get; set; } = string.Empty;
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public class CarrierSubscription
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CarrierId { get; set; }
    public string PlanCode { get; set; } = "FREE";
    public SubscriptionStatus Status { get; set; } = SubscriptionStatus.ACTIVE;
    public long MonthlyFeeCents { get; set; }
    public decimal CommissionRatePercent { get; set; }
    public DateTimeOffset CurrentPeriodStartUtc { get; set; }
    public DateTimeOffset CurrentPeriodEndUtc { get; set; }
    public DateTimeOffset? CanceledAtUtc { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public class FinancialSnapshot
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ContractId { get; set; }
    public Guid ProposalId { get; set; }
    public Guid ShipmentId { get; set; }
    public Guid CarrierId { get; set; }
    public Guid SenderId { get; set; }
    public Guid PolicyId { get; set; }
    public string PolicyVersion { get; set; } = string.Empty;
    public string PlanCode { get; set; } = "FREE";
    public decimal CommissionRatePercent { get; set; }
    public long TransportAmountCents { get; set; }
    public long PlatformCommissionCents { get; set; }
    public long CarrierNetCents { get; set; }
    public long RoundingDifferenceCents { get; set; }
    public bool GatewayFeesAbsorbedByPlatform { get; set; } = true;
    public DateTimeOffset SnapshottedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public class FinancialAuditEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string EntityType { get; set; } = string.Empty;
    public Guid EntityId { get; set; }
    public string Operation { get; set; } = string.Empty;
    public Guid ActorUserId { get; set; }
    public string ActorRole { get; set; } = string.Empty;
    public string? PayloadBefore { get; set; }
    public string PayloadAfter { get; set; } = string.Empty;
    public DateTimeOffset RecordedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

// ----------------------------------------------------------------------------
// DTOs de Entrada e Saída
// ----------------------------------------------------------------------------

public record CreateCommercialPolicyRequest(
    string Version,
    string Name,
    decimal FreePlanCommissionPercent,
    decimal PremiumPlanCommissionPercent,
    long PremiumMonthlyFeeCents,
    decimal? CancellationPenaltyPercent,
    long? CancellationMinFeeCents,
    decimal? CancellationInjuredPartySharePercent,
    DateTimeOffset ValidFrom,
    string Justification);

public record CommercialPolicyResponse(
    Guid Id,
    string Version,
    string Name,
    decimal FreePlanCommissionPercent,
    decimal PremiumPlanCommissionPercent,
    long PremiumMonthlyFeeCents,
    decimal CancellationPenaltyPercent,
    long CancellationMinFeeCents,
    decimal CancellationInjuredPartySharePercent,
    DateTimeOffset ValidFrom,
    DateTimeOffset? ValidUntil,
    bool IsActive,
    string Justification,
    DateTimeOffset CreatedAtUtc,
    string Status = "VIGENTE");

public record RevokeCommercialPolicyRequest(
    string? Reason);

public record SubscribePlanRequest(
    string PlanCode);

public record SubscriptionResponse(
    Guid Id,
    Guid CarrierId,
    string PlanCode,
    string Status,
    long MonthlyFeeCents,
    decimal CommissionRatePercent,
    DateTimeOffset CurrentPeriodStartUtc,
    DateTimeOffset CurrentPeriodEndUtc,
    DateTimeOffset? CanceledAtUtc);

public record FinancialSnapshotResponse(
    Guid Id,
    Guid ContractId,
    Guid ProposalId,
    Guid ShipmentId,
    Guid CarrierId,
    Guid SenderId,
    string PolicyVersion,
    string PlanCode,
    decimal CommissionRatePercent,
    long TransportAmountCents,
    long PlatformCommissionCents,
    long CarrierNetCents,
    bool GatewayFeesAbsorbedByPlatform,
    DateTimeOffset SnapshottedAtUtc);

public record SimulateSplitRequest(
    long TransportAmountCents,
    Guid? CarrierId,
    string? PlanCodeOverride);

public record SimulateSplitResponse(
    long TransportAmountCents,
    string PlanApplied,
    decimal CommissionRatePercent,
    long PlatformCommissionCents,
    long CarrierNetCents,
    bool GatewayFeesAbsorbedByPlatform,
    string PolicyVersionApplied);

public record PlanCatalogItemResponse(
    string PlanCode,
    string Name,
    string Description,
    long MonthlyFeeCents,
    decimal CommissionRatePercent,
    bool GatewayFeesAbsorbed);
