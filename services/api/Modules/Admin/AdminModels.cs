// ============================================================================
// TOPIC LOG — MODELOS DE DOMÍNIO E DTOS ADMINISTRATIVOS (PR-ADM-01 / PR-FIN-02)
// ============================================================================

using System.Diagnostics.CodeAnalysis;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;

namespace TopicLog.Api.Modules.Admin;

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica da Topic Log")]
public enum VehicleModerationStatus
{
    PENDING_APPROVAL = 0,
    APPROVED = 1,
    REJECTED = 2,
    INACTIVE = 3
}

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica da Topic Log")]
public enum PaymentMethodCode
{
    PIX = 0,
    CREDIT_CARD = 1,
    DEBIT_CARD = 2,
    BANK_SLIP = 3
}

public class OperationalSettings
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Version { get; set; } = "OP-SET-V1";
    public int BicycleMaxWeightGrams { get; set; } = 5000;
    public int MotorcycleMaxWeightGrams { get; set; } = 20000;
    public int CarMaxWeightGrams { get; set; } = 20000;
    public int CarMaxAgeYears { get; set; } = 7;
    public decimal GeoDeviationCompatibleKm { get; set; } = 10.00m;
    public decimal GeoDeviationRequiresEvalKm { get; set; } = 20.00m;
    public decimal PostDeliveryRadiusKm { get; set; } = 2.00m;
    public int ProposalStandardValidityHours { get; set; } = 24;
    public int ProposalSameDayValidityHours { get; set; } = 2;
    public int PrioritySecondShipmentMinutes { get; set; } = 10;
    public decimal CancellationPenaltyPercent { get; set; } = 10.00m;
    public long CancellationMinFeeCents { get; set; } = 700;
    public decimal CancellationInjuredPartySharePercent { get; set; } = 80.00m;
    public bool IsActive { get; set; } = true;
    public string Justification { get; set; } = string.Empty;
    public Guid UpdatedByUserId { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public class CarrierVehicle
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CarrierId { get; set; }
    public string CarrierName { get; set; } = string.Empty;
    public VehicleType VehicleType { get; set; }
    public string BrandModel { get; set; } = string.Empty;
    public int ManufacturingYear { get; set; }
    public string PlateMasked { get; set; } = string.Empty;
    public int DeclaredCapacityGrams { get; set; }
    public string? CrlvDocumentKey { get; set; }
    public VehicleModerationStatus Status { get; set; } = VehicleModerationStatus.PENDING_APPROVAL;
    public string? RejectionReason { get; set; }
    public Guid? ModeratedByUserId { get; set; }
    public DateTimeOffset? ModeratedAtUtc { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public class PaymentMethodSetting
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public PaymentMethodCode MethodCode { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string ProviderName { get; set; } = "Asaas Sandbox";
    public bool IsEnabled { get; set; } = true;
    public decimal FeePercent { get; set; }
    public long FixedFeeCents { get; set; }
    public bool PlatformAbsorbsFee { get; set; } = true;
    public long MinAmountCents { get; set; } = 500;
    public long MaxAmountCents { get; set; } = 500000;
    public string Justification { get; set; } = string.Empty;
    public Guid? UpdatedByUserId { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public class AdminAuditEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ActorUserId { get; set; }
    public string ActorRole { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string? PayloadBefore { get; set; }
    public string PayloadAfter { get; set; } = string.Empty;
    public string? CorrelationId { get; set; }
    public DateTimeOffset RecordedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

// ----------------------------------------------------------------------------
// DTOs de Entrada e Saída
// ----------------------------------------------------------------------------

public record UpdateOperationalSettingsRequest(
    int? BicycleMaxWeightGrams,
    int? MotorcycleMaxWeightGrams,
    int? CarMaxWeightGrams,
    int? CarMaxAgeYears,
    decimal? GeoDeviationCompatibleKm,
    decimal? GeoDeviationRequiresEvalKm,
    decimal? PostDeliveryRadiusKm,
    int? ProposalStandardValidityHours,
    int? ProposalSameDayValidityHours,
    int? PrioritySecondShipmentMinutes,
    decimal? CancellationPenaltyPercent,
    long? CancellationMinFeeCents,
    decimal? CancellationInjuredPartySharePercent,
    string Justification);

public record OperationalSettingsResponse(
    Guid Id,
    string Version,
    int BicycleMaxWeightGrams,
    int MotorcycleMaxWeightGrams,
    int CarMaxWeightGrams,
    int CarMaxAgeYears,
    decimal GeoDeviationCompatibleKm,
    decimal GeoDeviationRequiresEvalKm,
    decimal PostDeliveryRadiusKm,
    int ProposalStandardValidityHours,
    int ProposalSameDayValidityHours,
    int PrioritySecondShipmentMinutes,
    decimal CancellationPenaltyPercent,
    long CancellationMinFeeCents,
    decimal CancellationInjuredPartySharePercent,
    bool IsActive,
    string Justification,
    DateTimeOffset UpdatedAtUtc);

public record RegisterCarrierVehicleRequest(
    string VehicleType,
    string BrandModel,
    int ManufacturingYear,
    string Plate,
    int DeclaredCapacityGrams,
    string? CrlvDocumentKey);

public record ModerateVehicleRequest(
    string Status,
    string? RejectionReason = null,
    string? MfaCode = null);

public record CarrierVehicleResponse(
    Guid Id,
    Guid CarrierId,
    string CarrierName,
    string VehicleType,
    string BrandModel,
    int ManufacturingYear,
    string PlateMasked,
    int DeclaredCapacityGrams,
    string Status,
    string? RejectionReason,
    Guid? ModeratedByUserId,
    DateTimeOffset? ModeratedAtUtc,
    int AgeYears,
    bool RegulatoryAgeWarning,
    DateTimeOffset CreatedAtUtc);

public record TogglePaymentMethodRequest(
    bool IsEnabled,
    string Justification,
    string? MfaCode = null);

public record PaymentMethodResponse(
    string MethodCode,
    string DisplayName,
    string ProviderName,
    bool IsEnabled,
    decimal FeePercent,
    long FixedFeeCents,
    bool PlatformAbsorbsFee,
    long MinAmountCents,
    long MaxAmountCents,
    string Justification,
    DateTimeOffset UpdatedAtUtc);

public record CheckoutSimulationRequest(
    long AmountCents,
    string PaymentMethodCode,
    Guid? CarrierId = null,
    Guid? ShipmentId = null,
    string? PlanCodeOverride = null);

public record CheckoutSimulationResponse(
    Guid SimulationId,
    long GrossAmountCents,
    string PaymentMethodCode,
    string Provider,
    long PlatformAbsorbedGatewayFeeCents,
    decimal AppliedCommissionPercent,
    long PlatformCommissionCents,
    long CarrierNetCents,
    long SenderTotalCents,
    bool AccountingInvariantPreserved,
    bool PlatformAbsorbsGatewayFee,
    string SandboxPaymentReference,
    string SandboxInstructions,
    DateTimeOffset SimulatedAtUtc);

public record AdminDashboardMetricsResponse(
    int TotalUsers,
    int TotalCarriers,
    int TotalSenders,
    int TotalPublishedShipments,
    int TotalActiveTrips,
    int TotalFormalizedContracts,
    int TotalVehiclesPendingModeration,
    int TotalActiveSubscriptions,
    string CurrentPolicyVersion,
    decimal FreePlanCommissionPercent,
    decimal PremiumPlanCommissionPercent,
    long PremiumMonthlyFeeCents,
    DateTimeOffset GeneratedAtUtc);
