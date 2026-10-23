using System.Diagnostics.CodeAnalysis;
using System.Text.Json.Serialization;

namespace TopicLog.Api.Modules.Proposals;

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica para estados de propostas na Topic Log")]
public enum ProposalStatus
{
    PENDING = 0,
    COUNTERED = 1,
    ACCEPTED = 2,
    REJECTED = 3,
    EXPIRED = 4,
    SUPERSEDED = 5,
    CANCELLED = 6
}

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica para eventos de propostas na Topic Log")]
public enum ProposalEventType
{
    PROPOSAL_CREATED = 0,
    COUNTER_PROPOSAL_SENT = 1,
    PROPOSAL_ACCEPTED = 2,
    PROPOSAL_REJECTED = 3,
    PROPOSAL_EXPIRED = 4,
    PROPOSAL_SUPERSEDED = 5,
    CONTRACT_CREATED = 6,
    CONTRACT_CANCELLED_PRE_PICKUP = 7,
    CONTRACT_CANCELLED_POST_PICKUP = 8,
    PRIORITY_OFFER_ISSUED = 9,
    PRIORITY_OFFER_DECLINED = 10,
    PRIORITY_OFFER_EXPIRED = 11
}

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica para contratos na Topic Log")]
public enum ContractStatus
{
    ACTIVE = 0,
    CANCELLED_PRE_PICKUP = 1,
    CANCELLED_POST_PICKUP = 2,
    COMPLETED = 3
}

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica para motivos de cancelamento na Topic Log")]
public enum CancellationReasonCode
{
    MUTUAL_AGREEMENT = 0,
    CARRIER_UNAVAILABLE = 1,
    SENDER_CHANGE_OF_PLANS = 2,
    OPERATIONAL_IMPOSSIBILITY = 3,
    FORCE_MAJEURE = 4,
    UNJUSTIFIED_CANCELLATION = 5
}

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica para papéis na Topic Log")]
public enum ActorRole
{
    SENDER = 0,
    CARRIER = 1,
    SYSTEM = 2,
    ADMIN = 3
}

public sealed record CommissionSnapshot(
    string PolicyVersionId,
    string PlanCode,
    decimal CommissionRate,
    long CommissionCents,
    long CarrierDueCents,
    long AmountCents,
    bool PlatformAbsorbsGatewayFees,
    DateTimeOffset SnapshottedAtUtc);

public sealed record LegReservation(
    int LegIndex,
    string FromCity,
    string ToCity,
    int ReservedGrams);

public sealed record CancellationRecord(
    DateTimeOffset CancelledAtUtc,
    Guid CancelledByUserId,
    CancellationReasonCode ReasonCode,
    string Justification,
    bool ReopenedForBidding,
    long SimulatedPenaltyCents,
    string PolicyDisclaimer);

public sealed record ProposalEvent(
    Guid Id,
    Guid ProposalId,
    Guid ShipmentId,
    Guid ActorId,
    ActorRole ActorRole,
    ProposalEventType EventType,
    string PreviousStatus,
    string NewStatus,
    long AmountCents,
    string? Justification,
    DateTimeOffset OccurredAtUtc);

public sealed class Proposal
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid ShipmentId { get; init; }
    public Guid? TripId { get; init; }
    public Guid CarrierId { get; init; }
    public string CarrierName { get; init; } = string.Empty;
    public Guid SenderId { get; init; }
    public string SenderName { get; init; } = string.Empty;
    public long AmountCents { get; set; }
    public string Currency { get; init; } = "BRL";
    public ProposalStatus Status { get; set; } = ProposalStatus.PENDING;
    public string? EstimatedPickup { get; set; }
    public string? EstimatedDelivery { get; set; }
    public string? Notes { get; set; }
    public Guid? ParentProposalId { get; init; }
    public int CounterCount { get; set; }
    public DateTimeOffset ExpiresAtUtc { get; set; }
    public int Version { get; set; } = 1;
    public DateTimeOffset CreatedAtUtc { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Contract
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid ShipmentId { get; init; }
    public Guid TripId { get; init; }
    public Guid ProposalId { get; init; }
    public Guid SenderId { get; init; }
    public string SenderName { get; init; } = string.Empty;
    public Guid CarrierId { get; init; }
    public string CarrierName { get; init; } = string.Empty;
    public long AmountCents { get; init; }
    public CommissionSnapshot CommissionSnapshot { get; init; } = default!;
    public IReadOnlyList<LegReservation> LegReservations { get; init; } = [];
    public ContractStatus Status { get; set; } = ContractStatus.ACTIVE;
    public CancellationRecord? Cancellation { get; set; }
    public DateTimeOffset ContractedAtUtc { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public sealed record PriorityOffer(
    Guid ShipmentId,
    Guid EligibleCarrierId,
    Guid FirstShipmentId,
    Guid TripId,
    DateTimeOffset IssuedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    bool IsDeclined,
    bool IsAccepted,
    string Notes);

public sealed record CreateProposalRequest(
    Guid ShipmentId,
    Guid? TripId,
    long AmountCents,
    string? EstimatedPickup,
    string? EstimatedDelivery,
    string? Notes,
    int? CustomExpirationHours);

public sealed record CounterProposalRequest(
    long AmountCents,
    string? EstimatedPickup,
    string? EstimatedDelivery,
    string? Notes,
    int? CustomExpirationHours);

public sealed record CancelContractRequest(
    [property: JsonConverter(typeof(JsonStringEnumConverter))] CancellationReasonCode ReasonCode,
    string Justification,
    bool ReopenForBidding);

public sealed record ProposalResponse(
    Guid Id,
    Guid ShipmentId,
    Guid? TripId,
    Guid CarrierId,
    string CarrierName,
    Guid SenderId,
    string SenderName,
    long AmountCents,
    string Status,
    string? EstimatedPickup,
    string? EstimatedDelivery,
    string? Notes,
    Guid? ParentProposalId,
    int CounterCount,
    DateTimeOffset ExpiresAtUtc,
    bool IsExpired,
    int Version,
    DateTimeOffset CreatedAtUtc);

public sealed record ContractResponse(
    Guid Id,
    Guid ShipmentId,
    Guid TripId,
    Guid ProposalId,
    Guid SenderId,
    string SenderName,
    Guid CarrierId,
    string CarrierName,
    long AmountCents,
    CommissionSnapshot CommissionSnapshot,
    IReadOnlyList<LegReservation> LegReservations,
    string Status,
    CancellationRecord? Cancellation,
    DateTimeOffset ContractedAtUtc);

public sealed record ProposalEventResponse(
    Guid Id,
    Guid ProposalId,
    Guid ShipmentId,
    Guid ActorId,
    string ActorRole,
    string EventType,
    string PreviousStatus,
    string NewStatus,
    long AmountCents,
    string? Justification,
    DateTimeOffset OccurredAtUtc);

public sealed record PriorityOfferResponse(
    Guid ShipmentId,
    Guid EligibleCarrierId,
    Guid FirstShipmentId,
    Guid TripId,
    DateTimeOffset IssuedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    bool IsActive,
    bool IsDeclined,
    bool IsAccepted,
    string Notes);
