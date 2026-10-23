using System.Diagnostics.CodeAnalysis;
using System.Text.Json.Serialization;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;

namespace TopicLog.Api.Modules.Shipments;

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica definida nos documentos da Topic Log")]
public enum ShipmentCategory
{
    DOCUMENTOS = 0,
    AUTOPECAS = 1,
    ELETRONICOS = 2,
    SAUDE = 3,
    ALIMENTOS = 4,
    GERAL = 5
}

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica definida nos documentos da Topic Log")]
public enum ShipmentStatus
{
    DRAFT = 0,
    PUBLISHED = 1,
    NEGOTIATING = 2,
    CONTRACTED = 3,
    IN_TRANSIT = 4,
    DELIVERED = 5,
    CLOSED = 6,
    CANCELLED = 7
}

public enum AddressKind
{
    ORIGIN = 0,
    DESTINATION = 1
}

public sealed record ShipmentAddress(
    AddressKind Kind,
    string City,
    string StateUf,
    string Neighborhood,
    string? StreetAndNumber,
    string? PostalCode,
    double? ApproximateLatitude,
    double? ApproximateLongitude,
    string? IbgeCode = null,
    double? ExactLatitude = null,
    double? ExactLongitude = null,
    GeoreferencePrecision Precision = GeoreferencePrecision.MUNICIPALITY_CENTROID,
    GeoreferenceStatus Status = GeoreferenceStatus.RESOLVED);

public sealed record InsuranceInterestRecord(
    bool Interested,
    long ChargedAmountCents,
    string MandatoryDisclaimer,
    DateTimeOffset RecordedAtUtc);

public sealed class Shipment
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid SenderId { get; init; }
    public string SenderName { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public ShipmentCategory Category { get; init; } = ShipmentCategory.GERAL;
    public VehicleType VehicleType { get; init; } = VehicleType.MOTORCYCLE;
    public int WeightGrams { get; init; }
    public double DimensionsLengthCm { get; init; }
    public double DimensionsWidthCm { get; init; }
    public double DimensionsHeightCm { get; init; }
    public long DeclaredValueCents { get; init; }
    public long SuggestedPriceCents { get; init; }
    public IReadOnlyList<string> SpecialCareNotes { get; init; } = [];
    public ShipmentAddress OriginAddress { get; set; } = default!;
    public ShipmentAddress DestinationAddress { get; set; } = default!;
    public string PickupWindow { get; init; } = string.Empty;
    public string DeliveryWindow { get; init; } = string.Empty;
    public InsuranceInterestRecord InsuranceInterest { get; init; } = default!;
    public ShipmentStatus Status { get; set; } = ShipmentStatus.PUBLISHED;
    public List<string> PhotoStorageKeys { get; init; } = [];
    public DateTimeOffset CreatedAtUtc { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public sealed record AddressInputDto(
    string City,
    string? StateUf,
    string Neighborhood,
    string? StreetAndNumber,
    string? PostalCode,
    string? IbgeCode = null);

public sealed record CreateShipmentRequest(
    string Title,
    string Description,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] ShipmentCategory Category,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] VehicleType VehicleType,
    int WeightGrams,
    double DimensionsLengthCm,
    double DimensionsWidthCm,
    double DimensionsHeightCm,
    long DeclaredValueCents,
    long SuggestedPriceCents,
    IReadOnlyList<string>? SpecialCareNotes,
    AddressInputDto Origin,
    AddressInputDto Destination,
    string? PickupWindow,
    string? DeliveryWindow,
    bool InterestedInInsurance);

public sealed record ShipmentAddressResponse(
    string Kind,
    string City,
    string StateUf,
    string Neighborhood,
    string? StreetAndNumber,
    double? ApproximateLatitude,
    double? ApproximateLongitude,
    bool IsMaskedForPrivacy,
    string? IbgeCode = null,
    string GeoreferencePrecision = "MUNICIPALITY_CENTROID",
    string GeoreferenceStatus = "RESOLVED");

public sealed record ShipmentDetailResponse(
    Guid Id,
    Guid SenderId,
    string SenderName,
    string Title,
    string Description,
    string Category,
    string VehicleType,
    int WeightGrams,
    double DimensionsLengthCm,
    double DimensionsWidthCm,
    double DimensionsHeightCm,
    long DeclaredValueCents,
    long SuggestedPriceCents,
    IReadOnlyList<string> SpecialCareNotes,
    ShipmentAddressResponse Origin,
    ShipmentAddressResponse Destination,
    string PickupWindow,
    string DeliveryWindow,
    InsuranceInterestResponse InsuranceInterest,
    string Status,
    IReadOnlyList<string> PhotoUrls,
    DateTimeOffset CreatedAtUtc);

public sealed record ShipmentSummaryResponse(
    Guid Id,
    Guid SenderId,
    string SenderName,
    string Title,
    string Category,
    string VehicleType,
    int WeightGrams,
    long SuggestedPriceCents,
    string OriginCity,
    string OriginNeighborhood,
    string DestinationCity,
    string DestinationNeighborhood,
    string DeliveryWindow,
    string Status,
    int PhotoCount,
    DateTimeOffset CreatedAtUtc);

public sealed record InsuranceInterestResponse(
    bool Interested,
    long ChargedAmountCents,
    bool HasActivePolicy,
    bool GuaranteesCoverage,
    string MandatoryDisclaimer);
