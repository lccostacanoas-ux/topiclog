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

    double CalculateApproximateDistanceKm(
        GeoApproximatePoint origin,
        GeoApproximatePoint destination);
}
