using TopicLog.Api.Common.Domain;
using TopicLog.Api.Modules.Shipments;
using TopicLog.Api.Modules.Trips;

namespace TopicLog.Api.Modules.Matching;

public interface IMatchingService
{
    /// <summary>
    /// Avalia a compatibilidade direta entre uma encomenda e uma viagem específica, retornando pontuação e diagnóstico detalhado.
    /// </summary>
    MatchEvaluationResult EvaluateCompatibility(Shipment shipment, Trip trip);

    /// <summary>
    /// Calcula o desvio viário adicional (distância e tempo) e classificação de viabilidade (10 km / 20 km).
    /// </summary>
    RoadDetourInfo CalculateRoadDetour(Trip trip, Shipment shipment);

    /// <summary>
    /// Localiza viagens cadastradas e ativas compatíveis com a encomenda indicada (rota, capacidade, modal e sentido).
    /// </summary>
    Task<IReadOnlyList<MatchEvaluationResult>> FindCompatibleTripsForShipmentAsync(
        Guid shipmentId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Localiza encomendas abertas e compatíveis com a viagem indicada (origem/paradas/destino, capacidade residual e modal).
    /// </summary>
    Task<IReadOnlyList<MatchEvaluationResult>> FindCompatibleShipmentsForTripAsync(
        Guid tripId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Consulta espacial de encomendas em raio de até R metros (ex: 2.000m pós-entrega D16), compatíveis com o modal e capacidade.
    /// </summary>
    Task<IReadOnlyList<NearbyShipmentOpportunity>> FindNearbyShipmentsAsync(
        double latitude,
        double longitude,
        int radiusMeters = 2000,
        VehicleType? carrierVehicleType = null,
        int? availableCapacityGrams = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Modo "No meu trajeto": Descoberta de encomendas ao longo do itinerário da viagem com cálculo de desvio viário e paginação por cursor.
    /// </summary>
    Task<CursorPagedResult<OpportunityFeedItemDto>> FindOpportunitiesOnRouteAsync(
        Guid? tripId,
        string? originCity,
        string? destinationCity,
        IReadOnlyList<string>? intermediateStops,
        int maxDetourKm = 20,
        bool includeExtendedDetours = false,
        string? cursor = null,
        int limit = 20,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Modo "Perto de mim": Descoberta de oportunidades por proximidade GPS com raio configurável e paginação por cursor.
    /// </summary>
    Task<CursorPagedResult<OpportunityFeedItemDto>> FindNearbyOpportunitiesAsync(
        double latitude,
        double longitude,
        int radiusKm = 15,
        VehicleType? vehicleType = null,
        string? cursor = null,
        int limit = 20,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Modo "Escolher região": Descoberta filtrada por UF, Município e Bairro com paginação por cursor.
    /// </summary>
    Task<CursorPagedResult<OpportunityFeedItemDto>> FindRegionalOpportunitiesAsync(
        string? uf,
        string? city,
        string? neighborhood,
        string? type = "ALL",
        string? cursor = null,
        int limit = 20,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Busca assíncrona/typeahead de municípios para o Feed Nacional.
    /// </summary>
    IReadOnlyList<MunicipalitySearchItem> SearchMunicipalities(
        string? query,
        string? uf,
        int limit = 20);
}
