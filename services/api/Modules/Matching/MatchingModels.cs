using System.Diagnostics.CodeAnalysis;
using System.Text.Json.Serialization;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Modules.Shipments;
using TopicLog.Api.Modules.Trips;

namespace TopicLog.Api.Modules.Matching;

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica da Topic Log")]
public enum RouteDirectionStatus
{
    SAME_DIRECTION = 0,
    REVERSED_ROUTE = 1,
    CROSS_ROUTE = 2,
    NOT_CONNECTED = 3
}

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica da Topic Log")]
public enum RouteMatchType
{
    EXACT_ORIGIN_DESTINATION = 0,
    ORIGIN_AND_WAYPOINT = 1,
    WAYPOINT_AND_DESTINATION = 2,
    WAYPOINT_TO_WAYPOINT = 3,
    PROXIMITY_RADIAL = 4,
    NONE = 5
}

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica da Topic Log")]
public enum MatchRejectionReason
{
    NONE = 0,
    REVERSED_ROUTE = 1,
    INCOMPATIBLE_ROUTE = 2,
    INSUFFICIENT_CAPACITY = 3,
    INCOMPATIBLE_MODAL = 4,
    MODAL_WEIGHT_EXCEEDED = 5,
    INVALID_LOCATION = 6,
    INACTIVE_STATUS = 7
}

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica da Topic Log")]
public enum DetourClassification
{
    COMPATIBLE = 0,             // <= 10 km
    REQUIRES_EVALUATION = 1,    // > 10 km e <= 20 km
    EXCLUDED_BY_DEFAULT = 2,    // > 20 km
    INSUFFICIENT_LOCATION = 3   // Localização não resolvida / insuficiente
}

public sealed record RouteStop(
    string City,
    string StateUf,
    int Sequence,
    double? Latitude,
    double? Longitude);

public sealed record MatchEvaluationResult(
    bool IsCompatible,
    int MatchScore,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] RouteMatchType MatchType,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] RouteDirectionStatus DirectionStatus,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] MatchRejectionReason RejectionReason,
    string ReasonDescription,
    double EstimatedDistanceKm,
    double? DetourDistanceKm,
    Guid ShipmentId,
    string ShipmentTitle,
    Guid TripId,
    Guid CarrierId,
    string CarrierName,
    string VehicleType,
    int ShipmentWeightGrams,
    int AvailableCapacityGrams,
    string PickupPoint,
    string DeliveryPoint);

public sealed record RoadDetourInfo(
    double AdditionalDistanceKm,
    int AdditionalDurationMinutes,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] DetourClassification Classification,
    string BadgeLabel,
    IReadOnlyList<string> Reasons,
    bool IsDistanceEstimated = true);

public sealed record OpportunityFeedItemDto(
    Guid Id,
    string Type,
    string Title,
    string Category,
    string VehicleType,
    int WeightGrams,
    double? VolumeLiters,
    long SuggestedPriceCents,
    string OriginCity,
    string OriginNeighborhood,
    double? OriginLatitude,
    double? OriginLongitude,
    string DestinationCity,
    string DestinationNeighborhood,
    double? DestinationLatitude,
    double? DestinationLongitude,
    RoadDetourInfo? Detour,
    bool IsCapacityAvailable,
    int AvailableCapacityInLegsGrams,
    DateTimeOffset CreatedAtUtc,
    string? OriginIbgeCode = null,
    string? DestinationIbgeCode = null,
    string GeoreferenceStatus = "RESOLVED",
    bool IsDistanceEstimated = true);

public sealed record CursorPagedResult<T>(
    IReadOnlyList<T> Items,
    string? NextCursor,
    bool HasMore,
    int TotalMatching,
    int Limit);

public sealed record MunicipalitySearchItem(
    string IbgeCode,
    string Name,
    string StateUf,
    double Latitude,
    double Longitude,
    bool IsPilotPriority);

public sealed record LegCapacityInfo(
    int LegSequence,
    string FromCity,
    string ToCity,
    int AvailableCapacityGrams);

public sealed record NearbyShipmentOpportunity(
    Guid ShipmentId,
    string Title,
    string Category,
    string VehicleType,
    int WeightGrams,
    long SuggestedPriceCents,
    string OriginCity,
    string OriginNeighborhood,
    string DestinationCity,
    double DistanceMeters,
    bool IsWithin2Km,
    DateTimeOffset CreatedAtUtc);

public sealed record EvaluateMatchingRequest(
    Guid ShipmentId,
    Guid TripId);
