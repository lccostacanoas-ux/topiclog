using System.Diagnostics.CodeAnalysis;
using System.Text.Json.Serialization;

namespace TopicLog.Api.Modules.Fulfillment;

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica do modelo de domínio Topic Log")]
public enum DeliveryOrderStatus
{
    AWAITING_PICKUP = 0,
    IN_TRANSIT = 1,
    OUT_FOR_DELIVERY = 2,
    DELIVERED_VERIFIED = 3,
    EXCEPTION_REPORTED = 4,
    RESCHEDULED = 5,
    RETURN_TO_SENDER_INITIATED = 6,
    DISPUTED = 7,
    CLOSED = 8
}

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica do modelo de domínio Topic Log")]
public enum DeliveryExceptionReason
{
    RECIPIENT_ABSENT = 0,
    INACCESSIBLE_LOCATION = 1,
    RECIPIENT_REFUSED = 2,
    DAMAGED_PACKAGE = 3,
    OTHER = 4
}

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica do modelo de domínio Topic Log")]
public enum DeliveryExceptionAction
{
    RESCHEDULE_DELIVERY = 0,
    RETURN_TO_SENDER = 1,
    OPEN_DISPUTE = 2
}

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica do modelo de domínio Topic Log")]
public enum DeliveryEventType
{
    PICKUP_CHECKIN = 0,
    PICKUP_CONFIRMED = 1,
    IN_TRANSIT = 2,
    OUT_FOR_DELIVERY = 3,
    PHOTO_PROOF_SUBMITTED = 4,
    DELIVERY_CODE_FAILED = 5,
    DELIVERY_CHALLENGE_LOCKED = 6,
    DELIVERY_CODE_REGENERATED = 7,
    DELIVERY_VERIFIED = 8,
    EXCEPTION_REPORTED = 9,
    DELIVERY_RESCHEDULED = 10,
    RETURN_INITIATED = 11
}

public sealed class DeliveryOrder
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid ContractId { get; init; }
    public Guid ShipmentId { get; init; }
    public Guid TripId { get; init; }
    public Guid SenderId { get; init; }
    public string SenderName { get; init; } = string.Empty;
    public Guid CarrierId { get; init; }
    public string CarrierName { get; init; } = string.Empty;
    public string RecipientName { get; init; } = string.Empty;
    public string? RecipientPhone { get; init; }
    public string? RecipientDocumentMasked { get; init; }
    public DeliveryOrderStatus Status { get; set; } = DeliveryOrderStatus.AWAITING_PICKUP;
    public DateTimeOffset? PickedUpAtUtc { get; set; }
    public DateTimeOffset? DeliveredAtUtc { get; set; }
    public DateTimeOffset CreatedAtUtc { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class DeliveryChallenge
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid DeliveryOrderId { get; init; }
    public string CodeHash { get; set; } = string.Empty;
    public string CodeSalt { get; set; } = string.Empty;
    public int FailedAttempts { get; set; }
    public int MaxAttempts { get; init; } = 3;
    public bool IsLocked { get; set; }
    public DateTimeOffset? LockedAtUtc { get; set; }
    public DateTimeOffset ExpiresAtUtc { get; set; }
    public DateTimeOffset? VerifiedAtUtc { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAtUtc { get; init; } = DateTimeOffset.UtcNow;

    // Apenas em memória durante a emissão/recuperação para exibição exclusiva ao remetente
    [JsonIgnore]
    public string? PlainCode { get; set; }
}

public sealed class DeliveryProof
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid DeliveryOrderId { get; init; }
    public string FileUrl { get; init; } = string.Empty;
    public string Sha256Hash { get; init; } = string.Empty;
    public string MimeType { get; init; } = "image/jpeg";
    public long FileSizeBytes { get; init; }
    public double? ApproximateLat { get; init; }
    public double? ApproximateLng { get; init; }
    public Guid UploadedByUserId { get; init; }
    public DateTimeOffset UploadedAtUtc { get; init; } = DateTimeOffset.UtcNow;
}

public sealed class DeliveryEvent
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid DeliveryOrderId { get; init; }
    public DeliveryEventType EventType { get; init; }
    public Guid ActorId { get; init; }
    public string ActorRole { get; init; } = string.Empty;
    public string PreviousStatus { get; init; } = string.Empty;
    public string NewStatus { get; init; } = string.Empty;
    public string? Notes { get; init; }
    public double? ApproximateLat { get; init; }
    public double? ApproximateLng { get; init; }
    public DateTimeOffset OccurredAtUtc { get; init; } = DateTimeOffset.UtcNow;
}

[SuppressMessage("Naming", "CA1711:Identifiers should not have incorrect suffix", Justification = "Nomenclatura canônica definida nos documentos da Topic Log")]
public sealed class DeliveryException
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid DeliveryOrderId { get; init; }
    public DeliveryExceptionReason ReasonCode { get; init; }
    public string Justification { get; init; } = string.Empty;
    public string? PhotoUrl { get; init; }
    public Guid ReportedByUserId { get; init; }
    public string Status { get; set; } = "PENDING_RESOLUTION";
    public DeliveryExceptionAction? ResolutionAction { get; set; }
    public DateTimeOffset? RescheduledFor { get; set; }
    public DateTimeOffset CreatedAtUtc { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ResolvedAtUtc { get; set; }
}

// Request DTOs
public sealed record PickupCheckinRequest(
    double? Latitude = null,
    double? Longitude = null,
    string? Notes = null);

public sealed record ConfirmPickupRequest(
    string? HandoverNotes = null);

public sealed record DeliveryProofUploadRequest(
    string FileBase64OrUrl,
    string? MimeType = "image/jpeg",
    string? Description = null,
    double? Latitude = null,
    double? Longitude = null);

public sealed record ConfirmDeliveryRequest(
    string DeliveryCode,
    string? RecipientSignatureOrNotes = null);

public sealed record ReportDeliveryExceptionRequest(
    [property: JsonConverter(typeof(JsonStringEnumConverter))] DeliveryExceptionReason Reason,
    string Justification,
    string? ProofPhotoBase64OrUrl = null,
    double? Latitude = null,
    double? Longitude = null);

public sealed record RegenerateDeliveryCodeRequest(
    string? Justification = null);

public sealed record RescheduleDeliveryRequest(
    string RescheduledDate,
    string? RescheduledTimeWindow = null,
    string Justification = "Reagendamento acordado entre remetente e destinatário");

public sealed record InitiateReturnRequest(
    string Justification = "Devolução ao remetente iniciada após tentativa de entrega frustrada");

// Response DTOs
public sealed record DeliveryOrderResponse(
    Guid Id,
    Guid ContractId,
    Guid ShipmentId,
    Guid TripId,
    Guid SenderId,
    string SenderName,
    Guid CarrierId,
    string CarrierName,
    string RecipientName,
    string? RecipientPhone,
    string? RecipientDocumentMasked,
    string Status,
    DateTimeOffset? PickedUpAtUtc,
    DateTimeOffset? DeliveredAtUtc,
    DateTimeOffset CreatedAtUtc);

public sealed record DeliveryCodeResponse(
    Guid OrderId,
    string DeliveryCode,
    int RemainingAttempts,
    DateTimeOffset ExpiresAtUtc,
    bool IsLocked,
    string Disclaimer);

public sealed record DeliveryEventResponse(
    Guid Id,
    Guid DeliveryOrderId,
    string EventType,
    Guid ActorId,
    string ActorRole,
    string PreviousStatus,
    string NewStatus,
    string? Notes,
    DateTimeOffset OccurredAtUtc);

public sealed record DeliveryProofResponse(
    Guid Id,
    Guid DeliveryOrderId,
    string FileUrl,
    string Sha256Hash,
    string MimeType,
    long FileSizeBytes,
    DateTimeOffset UploadedAtUtc);

public sealed record DeliveryExceptionResponse(
    Guid Id,
    Guid DeliveryOrderId,
    string ReasonCode,
    string Justification,
    string? PhotoUrl,
    string Status,
    string? ResolutionAction,
    DateTimeOffset? RescheduledFor,
    DateTimeOffset CreatedAtUtc);

public sealed record DeliveryTrackingResponse(
    DeliveryOrderResponse Order,
    IReadOnlyList<DeliveryEventResponse> Events,
    DeliveryProofResponse? Proof,
    DeliveryExceptionResponse? ActiveException,
    bool CanCarrierConfirm,
    bool HasProofPhoto);

public sealed record PostDeliverySuggestionResponse(
    Guid ShipmentId,
    string Title,
    string OriginCity,
    string DestinationCity,
    int WeightGrams,
    long SuggestedPriceCents,
    double DistanceKm);
