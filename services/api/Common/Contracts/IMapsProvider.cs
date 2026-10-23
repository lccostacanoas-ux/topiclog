using System.Diagnostics.CodeAnalysis;
using TopicLog.Api.Common.Domain;

namespace TopicLog.Api.Common.Contracts;

/// <summary>
/// Coordenada geográfica aproximada (nunca expor endereço exato no feed público — 05-Banco-de-Dados.md).
/// </summary>
public sealed record GeoApproximatePoint(double Latitude, double Longitude);

public sealed record MunicipalityGeoInfo(
    string IbgeCode,
    string Name,
    string StateUf,
    GeoApproximatePoint ApproximateCenter,
    bool IsPilotPriority,
    int? PilotPriorityOrder);

public sealed record RoadRouteResult(
    double DistanceKm,
    int DurationMinutes,
    double DetourKm,
    int AdditionalDurationMinutes);

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica para precisão de georreferenciamento na Topic Log")]
public enum GeoreferencePrecision
{
    EXACT_STREET = 0,
    APPROXIMATE_NEIGHBORHOOD = 1,
    MUNICIPALITY_CENTROID = 2,
    UNRESOLVED = 3,
    INVALID = 4
}

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica para status de georreferenciamento na Topic Log")]
public enum GeoreferenceStatus
{
    RESOLVED = 0,
    PENDING = 1,
    UNRESOLVED = 2,
    INVALID = 3
}

public sealed record GeoreferenceResolutionResult(
    string? IbgeCode,
    string NormalizedCity,
    string StateUf,
    GeoApproximatePoint? MunicipalityCentroid,
    GeoApproximatePoint? ExactPoint,
    GeoreferencePrecision Precision,
    GeoreferenceStatus Status,
    bool IsEstimated,
    string? ErrorMessage);

/// <summary>
/// Interface desacoplada de mapas e geocodificação (D02, D15).
/// No protótipo utiliza solução gratuita respeitando licença e limites; preparada para Google Maps futuro.
/// </summary>
public interface IMapsProvider
{
    string ProviderName { get; }

    string LicenseAttribution { get; }

    Task<MunicipalityGeoInfo?> GetMunicipalityByIbgeAsync(
        string ibgeCode,
        CancellationToken cancellationToken);

    MunicipalityGeoInfo? ResolveMunicipalityByIbge(string ibgeCode);

    GeoApproximatePoint? ResolveCoordinatesForCity(string cityName);

    GeoreferenceResolutionResult ResolveGeoreference(
        string? city,
        string? stateUf = null,
        string? neighborhood = null,
        string? streetAndNumber = null,
        string? postalCode = null);

    double CalculateApproximateDistanceKm(
        GeoApproximatePoint origin,
        GeoApproximatePoint destination);

    double CalculateApproximateDistanceMeters(
        GeoApproximatePoint origin,
        GeoApproximatePoint destination);

    RoadRouteResult CalculateRoadRoute(
        IReadOnlyList<GeoApproximatePoint> waypoints,
        VehicleType vehicleType);

    IReadOnlyList<MunicipalityGeoInfo> SearchMunicipalities(
        string? query,
        string? uf,
        int limit = 20);
}
