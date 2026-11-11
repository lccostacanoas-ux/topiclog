using System.Text.Json.Serialization;
using TopicLog.Api.Common.Domain;

namespace TopicLog.Api.Modules.Trips;

public enum TripStatus
{
    SCHEDULED = 0,
    ACTIVE = 1,
    COMPLETED = 2,
    CANCELLED = 3
}

public sealed record TripWaypoint(
    int Sequence,
    string City,
    string StateUf,
    string? EstimatedArrival);

public sealed class Trip
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid CarrierId { get; init; }
    public string CarrierName { get; init; } = string.Empty;
    public bool CarrierKycVerified { get; init; }
    public VehicleType VehicleType { get; set; } = VehicleType.CAR;
    public string VehicleModel { get; set; } = string.Empty;
    public string OriginCity { get; set; } = string.Empty;
    public string OriginStateUf { get; set; } = "MG";
    public string DestinationCity { get; set; } = string.Empty;
    public string DestinationStateUf { get; set; } = "MG";
    public IReadOnlyList<string> IntermediateStops { get; set; } = [];
    public string DepartureDate { get; set; } = string.Empty;
    public string DepartureTime { get; set; } = string.Empty;
    public int AvailableCapacityGrams { get; set; }
    public Dictionary<string, int> LegCapacities { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public bool FlexiblePickup { get; set; }
    public long SuggestedPricePerKgCents { get; set; }
    public TripStatus Status { get; set; } = TripStatus.SCHEDULED;
    public DateTimeOffset CreatedAtUtc { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public sealed record UpdateTripRequest(
    string? VehicleModel,
    string? DepartureDate,
    string? DepartureTime,
    int? AvailableCapacityGrams,
    bool? FlexiblePickup,
    long? SuggestedPricePerKgCents,
    IReadOnlyList<string>? IntermediateStops);

public sealed record CreateTripRequest(
    [property: JsonConverter(typeof(JsonStringEnumConverter))] VehicleType VehicleType,
    string? VehicleModel,
    string OriginCity,
    string DestinationCity,
    IReadOnlyList<string>? IntermediateStops,
    string DepartureDate,
    string? DepartureTime,
    int AvailableCapacityGrams,
    bool FlexiblePickup,
    long SuggestedPricePerKgCents,
    string? OriginStateUf = null,
    string? DestinationStateUf = null);

public sealed record TripResponse(
    Guid Id,
    Guid CarrierId,
    string CarrierName,
    bool CarrierKycVerified,
    string VehicleType,
    string VehicleModel,
    string OriginCity,
    string OriginStateUf,
    string DestinationCity,
    string DestinationStateUf,
    IReadOnlyList<string> IntermediateStops,
    string DepartureDate,
    string DepartureTime,
    int AvailableCapacityGrams,
    bool FlexiblePickup,
    long SuggestedPricePerKgCents,
    string Status,
    DateTimeOffset CreatedAtUtc);

public sealed record TripSummaryResponse(
    Guid Id,
    Guid CarrierId,
    string CarrierName,
    bool CarrierKycVerified,
    string VehicleType,
    string VehicleModel,
    string OriginCity,
    string DestinationCity,
    IReadOnlyList<string> IntermediateStops,
    int StopCount,
    string DepartureDate,
    string DepartureTime,
    int AvailableCapacityGrams,
    long SuggestedPricePerKgCents,
    string Status,
    DateTimeOffset CreatedAtUtc);
