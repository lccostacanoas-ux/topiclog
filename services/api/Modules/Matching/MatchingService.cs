using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Modules.Shipments;
using TopicLog.Api.Modules.Trips;

namespace TopicLog.Api.Modules.Matching;

public sealed class MatchingService : IMatchingService
{
    private readonly IShipmentsRepository _shipmentsRepository;
    private readonly ITripsRepository _tripsRepository;
    private readonly IMapsProvider _mapsProvider;

    public MatchingService(
        IShipmentsRepository shipmentsRepository,
        ITripsRepository tripsRepository,
        IMapsProvider mapsProvider)
    {
        _shipmentsRepository = shipmentsRepository;
        _tripsRepository = tripsRepository;
        _mapsProvider = mapsProvider;
    }

    public MatchEvaluationResult EvaluateCompatibility(Shipment shipment, Trip trip)
    {
        ArgumentNullException.ThrowIfNull(shipment);
        ArgumentNullException.ThrowIfNull(trip);

        string shipmentOrigin = shipment.OriginAddress?.City?.Trim() ?? string.Empty;
        string shipmentDestination = shipment.DestinationAddress?.City?.Trim() ?? string.Empty;
        string tripOrigin = trip.OriginCity?.Trim() ?? string.Empty;
        string tripDestination = trip.DestinationCity?.Trim() ?? string.Empty;

        // 1. Validação de Localizações e Coordenadas Oficiais (IBGE)
        if (string.IsNullOrWhiteSpace(shipmentOrigin) || string.IsNullOrWhiteSpace(shipmentDestination))
        {
            return CreateRejection(
                shipment,
                trip,
                MatchRejectionReason.INVALID_LOCATION,
                RouteDirectionStatus.NOT_CONNECTED,
                "A encomenda não possui cidades válidas de origem ou destino.");
        }

        if (string.IsNullOrWhiteSpace(tripOrigin) || string.IsNullOrWhiteSpace(tripDestination))
        {
            return CreateRejection(
                shipment,
                trip,
                MatchRejectionReason.INVALID_LOCATION,
                RouteDirectionStatus.NOT_CONNECTED,
                "A viagem não possui cidades válidas de origem ou destino.");
        }

        if (shipment.OriginAddress?.Status != GeoreferenceStatus.RESOLVED ||
            shipment.DestinationAddress?.Status != GeoreferenceStatus.RESOLVED ||
            !shipment.OriginAddress.ApproximateLatitude.HasValue ||
            !shipment.DestinationAddress.ApproximateLatitude.HasValue)
        {
            return CreateRejection(
                shipment,
                trip,
                MatchRejectionReason.INVALID_LOCATION,
                RouteDirectionStatus.NOT_CONNECTED,
                "A encomenda possui localização pendente, não resolvida ou inválida (georreferenciamento não concluído).");
        }

        var tripOrigCoord = _mapsProvider.ResolveCoordinatesForCity(tripOrigin);
        var tripDestCoord = _mapsProvider.ResolveCoordinatesForCity(tripDestination);
        if (tripOrigCoord == null || tripDestCoord == null)
        {
            return CreateRejection(
                shipment,
                trip,
                MatchRejectionReason.INVALID_LOCATION,
                RouteDirectionStatus.NOT_CONNECTED,
                "A viagem possui municípios não reconhecidos na base oficial do IBGE.");
        }

        // 2. Validação de Status Ativo
        if (shipment.Status != ShipmentStatus.PUBLISHED && shipment.Status != ShipmentStatus.DRAFT)
        {
            return CreateRejection(
                shipment,
                trip,
                MatchRejectionReason.INACTIVE_STATUS,
                RouteDirectionStatus.NOT_CONNECTED,
                $"A encomenda está com status '{shipment.Status}' e não aceita novos vínculos.");
        }

        if (trip.Status != TripStatus.SCHEDULED && trip.Status != TripStatus.ACTIVE)
        {
            return CreateRejection(
                shipment,
                trip,
                MatchRejectionReason.INACTIVE_STATUS,
                RouteDirectionStatus.NOT_CONNECTED,
                $"A viagem está com status '{trip.Status}' e não aceita novas encomendas.");
        }

        // 3. Validação de Modalidade (D03)
        if (shipment.VehicleType == VehicleType.CAR && trip.VehicleType != VehicleType.CAR)
        {
            return CreateRejection(
                shipment,
                trip,
                MatchRejectionReason.INCOMPATIBLE_MODAL,
                RouteDirectionStatus.NOT_CONNECTED,
                $"A encomenda exige transporte por Automóvel (CAR) e não pode ser atendida por {trip.VehicleType}.");
        }

        if (shipment.VehicleType == VehicleType.MOTORCYCLE && trip.VehicleType == VehicleType.BICYCLE)
        {
            return CreateRejection(
                shipment,
                trip,
                MatchRejectionReason.INCOMPATIBLE_MODAL,
                RouteDirectionStatus.NOT_CONNECTED,
                "A encomenda exige transporte por Motocicleta e excede as dimensões/capacidade de uma Bicicleta.");
        }

        // 4. Validação de Limites de Peso por Modal (D04)
        if (trip.VehicleType == VehicleType.BICYCLE && shipment.WeightGrams > TopicLogRules.DefaultBicycleMaxWeightGrams)
        {
            return CreateRejection(
                shipment,
                trip,
                MatchRejectionReason.MODAL_WEIGHT_EXCEEDED,
                RouteDirectionStatus.NOT_CONNECTED,
                $"O peso da encomenda ({shipment.WeightGrams} g) excede o limite regulatório de 5.000 g para Bicicletas (D04).");
        }

        // 5. Validação de Capacidade Disponível na Viagem
        if (shipment.WeightGrams > trip.AvailableCapacityGrams)
        {
            return CreateRejection(
                shipment,
                trip,
                MatchRejectionReason.INSUFFICIENT_CAPACITY,
                RouteDirectionStatus.NOT_CONNECTED,
                $"A capacidade disponível da viagem ({trip.AvailableCapacityGrams} g) é insuficiente para o peso da encomenda ({shipment.WeightGrams} g).");
        }

        // 6. Construção da Rota Sequencial da Viagem (Origem -> Paradas Intermediárias -> Destino)
        var tripStops = new List<string> { tripOrigin };
        if (trip.IntermediateStops != null && trip.IntermediateStops.Count > 0)
        {
            tripStops.AddRange(trip.IntermediateStops.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s.Trim()));
        }
        tripStops.Add(tripDestination);

        // 7. Avaliação de Sequência de Rota e Sentido de Deslocamento
        int origIndex = FindCityIndex(tripStops, shipmentOrigin);
        int destIndex = FindCityIndex(tripStops, shipmentDestination);

        if (origIndex >= 0 && destIndex >= 0)
        {
            if (origIndex > destIndex)
            {
                return CreateRejection(
                    shipment,
                    trip,
                    MatchRejectionReason.REVERSED_ROUTE,
                    RouteDirectionStatus.REVERSED_ROUTE,
                    $"A rota da encomenda ({shipmentOrigin} -> {shipmentDestination}) trafega no sentido oposto ao da viagem cadastrada ({tripOrigin} -> {tripDestination}).");
            }

            if (origIndex == destIndex)
            {
                return CreateApproval(
                    shipment,
                    trip,
                    matchScore: 90,
                    matchType: RouteMatchType.WAYPOINT_TO_WAYPOINT,
                    directionStatus: RouteDirectionStatus.SAME_DIRECTION,
                    description: $"Entrega municipal direta em {shipmentOrigin} durante a passagem da viagem.");
            }

            bool isExactOrigin = origIndex == 0;
            bool isExactDest = destIndex == tripStops.Count - 1;

            RouteMatchType matchType;
            int score;
            string desc;

            if (isExactOrigin && isExactDest)
            {
                matchType = RouteMatchType.EXACT_ORIGIN_DESTINATION;
                score = 100;
                desc = $"Compatibilidade direta total de ponta a ponta ({shipmentOrigin} -> {shipmentDestination}).";
            }
            else if (isExactOrigin)
            {
                matchType = RouteMatchType.ORIGIN_AND_WAYPOINT;
                score = 92;
                desc = $"Origem direta em {shipmentOrigin} com entrega em parada intermediária ({shipmentDestination}).";
            }
            else if (isExactDest)
            {
                matchType = RouteMatchType.WAYPOINT_AND_DESTINATION;
                score = 92;
                desc = $"Coleta em parada intermediária ({shipmentOrigin}) com entrega no destino final ({shipmentDestination}).";
            }
            else
            {
                matchType = RouteMatchType.WAYPOINT_TO_WAYPOINT;
                score = 86;
                desc = $"Coleta e entrega entre paradas intermediárias da viagem ({shipmentOrigin} -> {shipmentDestination}).";
            }

            return CreateApproval(shipment, trip, score, matchType, RouteDirectionStatus.SAME_DIRECTION, desc);
        }

        if (CitiesMatch(shipmentOrigin, tripDestination) && CitiesMatch(shipmentDestination, tripOrigin))
        {
            return CreateRejection(
                shipment,
                trip,
                MatchRejectionReason.REVERSED_ROUTE,
                RouteDirectionStatus.REVERSED_ROUTE,
                $"A rota da encomenda ({shipmentOrigin} -> {shipmentDestination}) é a contramão direta da viagem ({tripOrigin} -> {tripDestination}).");
        }

        return CreateRejection(
            shipment,
            trip,
            MatchRejectionReason.INCOMPATIBLE_ROUTE,
            RouteDirectionStatus.NOT_CONNECTED,
            $"O trajeto da encomenda ({shipmentOrigin} -> {shipmentDestination}) não coincide com o itinerário da viagem ({string.Join(" -> ", tripStops)}).");
    }

    public RoadDetourInfo CalculateRoadDetour(Trip trip, Shipment shipment)
    {
        return CalculateRoadDetour(trip, shipment, null, null, null);
    }

    public RoadDetourInfo CalculateRoadDetour(
        Trip trip,
        Shipment shipment,
        IReadOnlyList<GeoApproximatePoint>? precomputedBaseWaypoints,
        RoadRouteResult? precomputedBaseRoute,
        GeoApproximatePoint[]? reusableTestArray)
    {
        ArgumentNullException.ThrowIfNull(trip);
        ArgumentNullException.ThrowIfNull(shipment);

        // 1. Portões Rígidos de Incompatibilidade
        if (trip.Status != TripStatus.SCHEDULED && trip.Status != TripStatus.ACTIVE)
        {
            return new RoadDetourInfo(999.0, 999, DetourClassification.EXCLUDED_BY_DEFAULT, "Viagem Inativa", ["A viagem não está em status ativo"]);
        }

        if (shipment.Status != ShipmentStatus.PUBLISHED && shipment.Status != ShipmentStatus.DRAFT)
        {
            return new RoadDetourInfo(999.0, 999, DetourClassification.EXCLUDED_BY_DEFAULT, "Carga Inativa", ["A encomenda não aceita novos vínculos"]);
        }

        if (shipment.VehicleType == VehicleType.CAR && trip.VehicleType != VehicleType.CAR)
        {
            return new RoadDetourInfo(999.0, 999, DetourClassification.EXCLUDED_BY_DEFAULT, "Modal Incompatível", [$"A encomenda exige CAR e a viagem é {trip.VehicleType}"]);
        }

        if (shipment.VehicleType == VehicleType.MOTORCYCLE && trip.VehicleType == VehicleType.BICYCLE)
        {
            return new RoadDetourInfo(999.0, 999, DetourClassification.EXCLUDED_BY_DEFAULT, "Modal Incompatível", ["A encomenda exige Motocicleta e excede o modal Bicicleta"]);
        }

        if (trip.VehicleType == VehicleType.BICYCLE && shipment.WeightGrams > TopicLogRules.DefaultBicycleMaxWeightGrams)
        {
            return new RoadDetourInfo(999.0, 999, DetourClassification.EXCLUDED_BY_DEFAULT, "Peso Excedido (D04)", [$"Peso ({shipment.WeightGrams} g) excede o limite regulatório de 5.000 g para Bicicletas (D04)"]);
        }

        if (shipment.WeightGrams > trip.AvailableCapacityGrams)
        {
            return new RoadDetourInfo(999.0, 999, DetourClassification.EXCLUDED_BY_DEFAULT, "Capacidade Insuficiente", [$"Capacidade da viagem ({trip.AvailableCapacityGrams} g) é inferior ao peso da encomenda ({shipment.WeightGrams} g)"]);
        }

        // 2. Trajeto Base da Viagem
        var baseWaypoints = precomputedBaseWaypoints ?? BuildTripWaypoints(trip);
        if (baseWaypoints == null || baseWaypoints.Count < 2)
        {
            return new RoadDetourInfo(
                AdditionalDistanceKm: -1,
                AdditionalDurationMinutes: -1,
                Classification: DetourClassification.INSUFFICIENT_LOCATION,
                BadgeLabel: "Localização Pendente",
                Reasons: ["Não foi possível resolver as coordenadas geográficas dos municípios da viagem na base IBGE"],
                IsDistanceEstimated: true);
        }

        var baseRoute = precomputedBaseRoute ?? _mapsProvider.CalculateRoadRoute(baseWaypoints, trip.VehicleType);
        double baseDistanceKm = baseRoute.DistanceKm;
        int baseDurationMinutes = baseRoute.DurationMinutes;

        // 3. Pontos de Coleta e Entrega da Encomenda
        var pickupPoint = ResolveShipmentPoint(shipment.OriginAddress);
        var deliveryPoint = ResolveShipmentPoint(shipment.DestinationAddress);

        if (pickupPoint == null || deliveryPoint == null ||
            shipment.OriginAddress?.Status != GeoreferenceStatus.RESOLVED ||
            shipment.DestinationAddress?.Status != GeoreferenceStatus.RESOLVED)
        {
            return new RoadDetourInfo(
                AdditionalDistanceKm: -1,
                AdditionalDurationMinutes: -1,
                Classification: DetourClassification.INSUFFICIENT_LOCATION,
                BadgeLabel: "Localização Pendente",
                Reasons: ["Não foi possível resolver as coordenadas geográficas oficiais do município da encomenda"],
                IsDistanceEstimated: true);
        }

        // 4. Sentido e Validação de Contramão
        string tripOrigin = trip.OriginCity.Trim();
        string tripDest = trip.DestinationCity.Trim();
        string shipmentOrigin = shipment.OriginAddress?.City?.Trim() ?? string.Empty;
        string shipmentDest = shipment.DestinationAddress?.City?.Trim() ?? string.Empty;

        if (trip.IntermediateStops != null && trip.IntermediateStops.Count > 0)
        {
            var directEval = EvaluateCompatibility(shipment, trip);
            if (directEval.DirectionStatus == RouteDirectionStatus.REVERSED_ROUTE)
            {
                return new RoadDetourInfo(999.0, 999, DetourClassification.EXCLUDED_BY_DEFAULT, "Sentido Oposto", ["A rota da encomenda trafega no sentido oposto ao da viagem cadastrada"]);
            }
        }
        else if (CitiesMatch(shipmentOrigin, tripDest) && CitiesMatch(shipmentDest, tripOrigin))
        {
            return new RoadDetourInfo(999.0, 999, DetourClassification.EXCLUDED_BY_DEFAULT, "Sentido Oposto", ["A rota da encomenda trafega no sentido oposto ao da viagem cadastrada"]);
        }

        // 5. Inserção Sequencial Ótima (Coleta sempre antes da entrega)
        double bestWithDetourKm = double.MaxValue;
        int bestWithDetourDuration = int.MaxValue;
        int n = baseWaypoints.Count;
        var testArray = reusableTestArray ?? new GeoApproximatePoint[n + 2];

        for (int i = 0; i < n; i++)
        {
            for (int j = i; j < n; j++)
            {
                int idx = 0;
                for (int k = 0; k <= i; k++) testArray[idx++] = baseWaypoints[k];
                testArray[idx++] = pickupPoint;
                for (int k = i + 1; k <= j; k++) testArray[idx++] = baseWaypoints[k];
                testArray[idx++] = deliveryPoint;
                for (int k = j + 1; k < n; k++) testArray[idx++] = baseWaypoints[k];

                var route = _mapsProvider.CalculateRoadRoute(testArray, trip.VehicleType);
                if (route.DistanceKm < bestWithDetourKm)
                {
                    bestWithDetourKm = route.DistanceKm;
                    bestWithDetourDuration = route.DurationMinutes;
                }
            }
        }

        double detourKm = Math.Round(Math.Max(0.0, bestWithDetourKm - baseDistanceKm), 2);
        int additionalDuration = Math.Max(0, bestWithDetourDuration - baseDurationMinutes);

        bool isEstimated = (shipment.OriginAddress?.Precision != GeoreferencePrecision.EXACT_STREET) ||
                           (shipment.DestinationAddress?.Precision != GeoreferencePrecision.EXACT_STREET);
        string estimatedSuffix = isEstimated ? " (estimado via centróide do município)" : string.Empty;

        // 6. Classificação de Viabilidade
        if (detourKm <= 10.0)
        {
            return new RoadDetourInfo(
                AdditionalDistanceKm: detourKm,
                AdditionalDurationMinutes: additionalDuration,
                Classification: DetourClassification.COMPATIBLE,
                BadgeLabel: detourKm == 0 ? "No itinerário direto" : $"Compatível (+{detourKm:F1} km{(isEstimated ? " est." : "")})",
                Reasons: [detourKm == 0 ? "A carga coincide exatamente com os pontos da viagem" : $"Desvio de {detourKm:F1} km dentro do limite preferencial de 10 km{estimatedSuffix}"],
                IsDistanceEstimated: isEstimated);
        }
        else if (detourKm <= 20.0)
        {
            return new RoadDetourInfo(
                AdditionalDistanceKm: detourKm,
                AdditionalDurationMinutes: additionalDuration,
                Classification: DetourClassification.REQUIRES_EVALUATION,
                BadgeLabel: $"Exige avaliação (+{detourKm:F1} km{(isEstimated ? " est." : "")})",
                Reasons: [$"Desvio de {detourKm:F1} km (entre 10 km e 20 km); exige avaliação do transportador{estimatedSuffix}"],
                IsDistanceEstimated: isEstimated);
        }
        else
        {
            return new RoadDetourInfo(
                AdditionalDistanceKm: detourKm,
                AdditionalDurationMinutes: additionalDuration,
                Classification: DetourClassification.EXCLUDED_BY_DEFAULT,
                BadgeLabel: $"Desvio extenso (+{detourKm:F1} km{(isEstimated ? " est." : "")})",
                Reasons: [$"Desvio de {detourKm:F1} km superior a 20 km; fora da listagem padrão{estimatedSuffix}"],
                IsDistanceEstimated: isEstimated);
        }
    }

    public async Task<IReadOnlyList<MatchEvaluationResult>> FindCompatibleTripsForShipmentAsync(
        Guid shipmentId,
        CancellationToken cancellationToken = default)
    {
        var shipment = await _shipmentsRepository.GetByIdAsync(shipmentId, cancellationToken).ConfigureAwait(false);
        if (shipment == null)
        {
            return [];
        }

        var allTrips = await _tripsRepository.ListActiveAsync(cancellationToken: cancellationToken).ConfigureAwait(false);
        var matches = new List<MatchEvaluationResult>();

        foreach (var trip in allTrips)
        {
            var evaluation = EvaluateCompatibility(shipment, trip);
            if (evaluation.IsCompatible)
            {
                matches.Add(evaluation);
            }
        }

        return matches
            .OrderByDescending(m => m.MatchScore)
            .ThenBy(m => m.EstimatedDistanceKm)
            .ToList();
    }

    public async Task<IReadOnlyList<MatchEvaluationResult>> FindCompatibleShipmentsForTripAsync(
        Guid tripId,
        CancellationToken cancellationToken = default)
    {
        var trip = await _tripsRepository.GetByIdAsync(tripId, cancellationToken).ConfigureAwait(false);
        if (trip == null)
        {
            return [];
        }

        var allShipments = await _shipmentsRepository.ListActiveAsync(cancellationToken: cancellationToken).ConfigureAwait(false);
        var matches = new List<MatchEvaluationResult>();

        foreach (var shipment in allShipments)
        {
            var evaluation = EvaluateCompatibility(shipment, trip);
            if (evaluation.IsCompatible)
            {
                matches.Add(evaluation);
            }
        }

        return matches
            .OrderByDescending(m => m.MatchScore)
            .ThenBy(m => m.EstimatedDistanceKm)
            .ToList();
    }

    public async Task<IReadOnlyList<NearbyShipmentOpportunity>> FindNearbyShipmentsAsync(
        double latitude,
        double longitude,
        int radiusMeters = 2000,
        VehicleType? carrierVehicleType = null,
        int? availableCapacityGrams = null,
        CancellationToken cancellationToken = default)
    {
        var centerPoint = new GeoApproximatePoint(latitude, longitude);
        var allShipments = await _shipmentsRepository.ListActiveAsync(cancellationToken: cancellationToken).ConfigureAwait(false);

        var opportunities = new List<NearbyShipmentOpportunity>();

        foreach (var s in allShipments)
        {
            if (s.Status != ShipmentStatus.PUBLISHED)
            {
                continue;
            }

            if (availableCapacityGrams.HasValue && s.WeightGrams > availableCapacityGrams.Value)
            {
                continue;
            }

            if (carrierVehicleType.HasValue)
            {
                if (s.VehicleType == VehicleType.CAR && carrierVehicleType.Value != VehicleType.CAR)
                {
                    continue;
                }
                if (s.VehicleType == VehicleType.MOTORCYCLE && carrierVehicleType.Value == VehicleType.BICYCLE)
                {
                    continue;
                }
                if (carrierVehicleType.Value == VehicleType.BICYCLE && s.WeightGrams > TopicLogRules.DefaultBicycleMaxWeightGrams)
                {
                    continue;
                }
            }

            var originPoint = ResolveShipmentPoint(s.OriginAddress);
            if (originPoint == null || s.OriginAddress?.Status != GeoreferenceStatus.RESOLVED)
            {
                continue;
            }
            double distanceMeters = _mapsProvider.CalculateApproximateDistanceMeters(centerPoint, originPoint);

            if (distanceMeters <= radiusMeters)
            {
                opportunities.Add(new NearbyShipmentOpportunity(
                    ShipmentId: s.Id,
                    Title: s.Title,
                    Category: s.Category.ToString(),
                    VehicleType: s.VehicleType.ToString(),
                    WeightGrams: s.WeightGrams,
                    SuggestedPriceCents: s.SuggestedPriceCents,
                    OriginCity: s.OriginAddress.City,
                    OriginNeighborhood: s.OriginAddress.Neighborhood,
                    DestinationCity: s.DestinationAddress.City,
                    DistanceMeters: distanceMeters,
                    IsWithin2Km: distanceMeters <= 2000.0,
                    CreatedAtUtc: s.CreatedAtUtc));
            }
        }

        return opportunities
            .OrderBy(o => o.DistanceMeters)
            .ToList();
    }

    public async Task<CursorPagedResult<OpportunityFeedItemDto>> FindOpportunitiesOnRouteAsync(
        Guid? tripId,
        string? originCity,
        string? destinationCity,
        IReadOnlyList<string>? intermediateStops,
        int maxDetourKm = 20,
        bool includeExtendedDetours = false,
        string? cursor = null,
        int limit = 20,
        CancellationToken cancellationToken = default)
    {
        Trip trip;
        if (tripId.HasValue)
        {
            var found = await _tripsRepository.GetByIdAsync(tripId.Value, cancellationToken).ConfigureAwait(false);
            if (found == null)
            {
                return new CursorPagedResult<OpportunityFeedItemDto>([], null, false, 0, limit);
            }
            trip = found;
        }
        else
        {
            trip = new Trip
            {
                OriginCity = originCity ?? "João Monlevade",
                DestinationCity = destinationCity ?? "Belo Horizonte",
                IntermediateStops = intermediateStops ?? [],
                AvailableCapacityGrams = 20000,
                VehicleType = VehicleType.CAR,
                Status = TripStatus.SCHEDULED
            };
        }

        var baseWaypoints = BuildTripWaypoints(trip);
        if (baseWaypoints == null || baseWaypoints.Count < 2)
        {
            return new CursorPagedResult<OpportunityFeedItemDto>([], null, false, 0, limit);
        }

        var baseRoute = _mapsProvider.CalculateRoadRoute(baseWaypoints, trip.VehicleType);
        var reusableArray = new GeoApproximatePoint[baseWaypoints.Count + 2];

        var allShipments = await _shipmentsRepository.ListActiveAsync(cancellationToken: cancellationToken).ConfigureAwait(false);
        var candidates = new List<OpportunityFeedItemDto>();

        foreach (var s in allShipments)
        {
            if (s.Status != ShipmentStatus.PUBLISHED) continue;

            if (s.VehicleType == VehicleType.CAR && trip.VehicleType != VehicleType.CAR) continue;
            if (s.WeightGrams > trip.AvailableCapacityGrams) continue;
            if (trip.VehicleType == VehicleType.BICYCLE && s.WeightGrams > TopicLogRules.DefaultBicycleMaxWeightGrams) continue;

            var detour = CalculateRoadDetour(trip, s, baseWaypoints, baseRoute, reusableArray);

            if (detour.Classification == DetourClassification.INSUFFICIENT_LOCATION)
            {
                if (!includeExtendedDetours)
                {
                    continue;
                }
            }
            else if (detour.Classification == DetourClassification.EXCLUDED_BY_DEFAULT && !includeExtendedDetours)
            {
                continue;
            }
            else if (detour.AdditionalDistanceKm > maxDetourKm && !includeExtendedDetours)
            {
                continue;
            }

            candidates.Add(MapToOpportunityDto(s, detour, trip.AvailableCapacityGrams));
        }

        var ordered = candidates
            .OrderBy(c => c.Detour?.Classification ?? DetourClassification.EXCLUDED_BY_DEFAULT)
            .ThenBy(c => c.Detour?.AdditionalDistanceKm ?? 999.0)
            .ThenByDescending(c => c.CreatedAtUtc)
            .ThenBy(c => c.Id)
            .ToList();

        return ApplyCursorPagination(ordered, cursor, limit);
    }

    private List<GeoApproximatePoint>? BuildTripWaypoints(Trip trip)
    {
        var origPoint = _mapsProvider.ResolveCoordinatesForCity(trip.OriginCity);
        if (origPoint == null) return null;

        var waypoints = new List<GeoApproximatePoint> { origPoint };

        if (trip.IntermediateStops != null)
        {
            foreach (var stop in trip.IntermediateStops)
            {
                if (!string.IsNullOrWhiteSpace(stop))
                {
                    var p = _mapsProvider.ResolveCoordinatesForCity(stop.Trim());
                    if (p != null) waypoints.Add(p);
                }
            }
        }

        var destPoint = _mapsProvider.ResolveCoordinatesForCity(trip.DestinationCity);
        if (destPoint == null) return null;

        waypoints.Add(destPoint);
        return waypoints;
    }

    public async Task<CursorPagedResult<OpportunityFeedItemDto>> FindNearbyOpportunitiesAsync(
        double latitude,
        double longitude,
        int radiusKm = 15,
        VehicleType? vehicleType = null,
        string? cursor = null,
        int limit = 20,
        CancellationToken cancellationToken = default)
    {
        var center = new GeoApproximatePoint(latitude, longitude);
        double radiusMeters = radiusKm * 1000.0;

        var allShipments = await _shipmentsRepository.ListActiveAsync(cancellationToken: cancellationToken).ConfigureAwait(false);
        var matches = new List<OpportunityFeedItemDto>();

        foreach (var s in allShipments)
        {
            if (s.Status != ShipmentStatus.PUBLISHED) continue;
            if (vehicleType.HasValue && s.VehicleType == VehicleType.CAR && vehicleType.Value != VehicleType.CAR) continue;

            var origPoint = ResolveShipmentPoint(s.OriginAddress);
            if (origPoint == null || s.OriginAddress?.Status != GeoreferenceStatus.RESOLVED) continue;

            double distMeters = _mapsProvider.CalculateApproximateDistanceMeters(center, origPoint);

            if (distMeters <= radiusMeters)
            {
                double distKm = Math.Round(distMeters / 1000.0, 1);
                bool isEstimated = s.OriginAddress?.Precision != GeoreferencePrecision.EXACT_STREET;
                var detour = new RoadDetourInfo(
                    AdditionalDistanceKm: distKm,
                    AdditionalDurationMinutes: (int)Math.Round((distKm / 50.0) * 60.0),
                    Classification: distKm <= 10.0 ? DetourClassification.COMPATIBLE : DetourClassification.REQUIRES_EVALUATION,
                    BadgeLabel: $"A {distKm:F1} km de você{(isEstimated ? " (est.)" : "")}",
                    Reasons: [$"Localizado a {distKm:F1} km do seu ponto atual{(isEstimated ? " (estimado via centróide do município)" : "")}"],
                    IsDistanceEstimated: isEstimated);

                matches.Add(MapToOpportunityDto(s, detour, s.WeightGrams));
            }
        }

        var ordered = matches
            .OrderBy(m => m.Detour?.AdditionalDistanceKm ?? 999.0)
            .ThenByDescending(m => m.CreatedAtUtc)
            .ThenBy(m => m.Id)
            .ToList();

        return ApplyCursorPagination(ordered, cursor, limit);
    }

    public async Task<CursorPagedResult<OpportunityFeedItemDto>> FindRegionalOpportunitiesAsync(
        string? uf,
        string? city,
        string? neighborhood,
        string? type = "ALL",
        string? cursor = null,
        int limit = 20,
        CancellationToken cancellationToken = default)
    {
        var items = new List<OpportunityFeedItemDto>();

        if (string.Equals(type, "ALL", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(type, "SHIPMENTS", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(type, "SHIPMENT", StringComparison.OrdinalIgnoreCase))
        {
            var shipments = await _shipmentsRepository.ListActiveAsync(cancellationToken: cancellationToken).ConfigureAwait(false);
            foreach (var s in shipments)
            {
                if (s.Status != ShipmentStatus.PUBLISHED) continue;

                if (!string.IsNullOrWhiteSpace(uf) &&
                    !MatchUf(s.OriginAddress?.StateUf, s.DestinationAddress?.StateUf, uf))
                    continue;

                if (!string.IsNullOrWhiteSpace(city) &&
                    !MatchCity(s.OriginAddress?.City, s.DestinationAddress?.City, city))
                    continue;

                if (!string.IsNullOrWhiteSpace(neighborhood) &&
                    !MatchNeighborhood(s.OriginAddress?.Neighborhood, s.DestinationAddress?.Neighborhood, neighborhood))
                    continue;

                items.Add(MapToOpportunityDto(s, null, s.WeightGrams));
            }
        }

        var ordered = items
            .OrderByDescending(i => i.CreatedAtUtc)
            .ThenBy(i => i.Id)
            .ToList();

        return ApplyCursorPagination(ordered, cursor, limit);
    }

    public IReadOnlyList<MunicipalitySearchItem> SearchMunicipalities(string? query, string? uf, int limit = 20)
    {
        var geos = _mapsProvider.SearchMunicipalities(query, uf, limit);
        return geos.Select(g => new MunicipalitySearchItem(
            IbgeCode: g.IbgeCode,
            Name: g.Name,
            StateUf: g.StateUf,
            Latitude: g.ApproximateCenter.Latitude,
            Longitude: g.ApproximateCenter.Longitude,
            IsPilotPriority: g.IsPilotPriority)).ToList();
    }

    private OpportunityFeedItemDto MapToOpportunityDto(Shipment s, RoadDetourInfo? detour, int availableCapacityGrams)
    {
        double volLiters = Math.Round((s.DimensionsLengthCm * s.DimensionsWidthCm * s.DimensionsHeightCm) / 1000.0, 1);
        var origPoint = ResolveShipmentPoint(s.OriginAddress);
        var destPoint = ResolveShipmentPoint(s.DestinationAddress);

        bool isEstimated = (s.OriginAddress?.Precision != GeoreferencePrecision.EXACT_STREET) ||
                           (s.DestinationAddress?.Precision != GeoreferencePrecision.EXACT_STREET);

        string geoStatus = (s.OriginAddress?.Status == GeoreferenceStatus.UNRESOLVED || s.DestinationAddress?.Status == GeoreferenceStatus.UNRESOLVED)
            ? "UNRESOLVED"
            : (s.OriginAddress?.Status == GeoreferenceStatus.INVALID || s.DestinationAddress?.Status == GeoreferenceStatus.INVALID)
                ? "INVALID"
                : "RESOLVED";

        return new OpportunityFeedItemDto(
            Id: s.Id,
            Type: "SHIPMENT",
            Title: s.Title,
            Category: s.Category.ToString(),
            VehicleType: s.VehicleType.ToString(),
            WeightGrams: s.WeightGrams,
            VolumeLiters: volLiters,
            SuggestedPriceCents: s.SuggestedPriceCents,
            OriginCity: s.OriginAddress?.City ?? string.Empty,
            OriginNeighborhood: s.OriginAddress?.Neighborhood ?? string.Empty,
            OriginLatitude: origPoint?.Latitude,
            OriginLongitude: origPoint?.Longitude,
            DestinationCity: s.DestinationAddress?.City ?? string.Empty,
            DestinationNeighborhood: s.DestinationAddress?.Neighborhood ?? string.Empty,
            DestinationLatitude: destPoint?.Latitude,
            DestinationLongitude: destPoint?.Longitude,
            Detour: detour,
            IsCapacityAvailable: s.WeightGrams <= availableCapacityGrams,
            AvailableCapacityInLegsGrams: availableCapacityGrams,
            CreatedAtUtc: s.CreatedAtUtc,
            OriginIbgeCode: s.OriginAddress?.IbgeCode,
            DestinationIbgeCode: s.DestinationAddress?.IbgeCode,
            GeoreferenceStatus: geoStatus,
            IsDistanceEstimated: isEstimated);
    }

    private static CursorPagedResult<T> ApplyCursorPagination<T>(List<T> items, string? cursor, int limit)
    {
        int offset = 0;
        if (!string.IsNullOrWhiteSpace(cursor))
        {
            try
            {
                string decoded = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(cursor));
                if (int.TryParse(decoded, out int parsedOffset))
                {
                    offset = parsedOffset;
                }
            }
            catch
            {
                offset = 0;
            }
        }

        int pageSize = Math.Max(1, Math.Min(limit, 100));
        var pagedItems = items.Skip(offset).Take(pageSize).ToList();
        int nextOffset = offset + pagedItems.Count;
        bool hasMore = nextOffset < items.Count;
        string? nextCursor = hasMore ? Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(nextOffset.ToString(System.Globalization.CultureInfo.InvariantCulture))) : null;

        return new CursorPagedResult<T>(
            Items: pagedItems,
            NextCursor: nextCursor,
            HasMore: hasMore,
            TotalMatching: items.Count,
            Limit: pageSize);
    }

    private GeoApproximatePoint? ResolveShipmentPoint(ShipmentAddress? address)
    {
        if (address == null) return null;

        if (address.ExactLatitude.HasValue && address.ExactLongitude.HasValue)
        {
            return new GeoApproximatePoint(address.ExactLatitude.Value, address.ExactLongitude.Value);
        }

        if (address.ApproximateLatitude.HasValue && address.ApproximateLongitude.HasValue)
        {
            return new GeoApproximatePoint(address.ApproximateLatitude.Value, address.ApproximateLongitude.Value);
        }

        if (!string.IsNullOrWhiteSpace(address.City))
        {
            return _mapsProvider.ResolveCoordinatesForCity(address.City);
        }

        return null;
    }

    private static bool MatchUf(string? uf1, string? uf2, string targetUf)
    {
        return string.Equals(uf1, targetUf, StringComparison.OrdinalIgnoreCase) ||
               string.Equals(uf2, targetUf, StringComparison.OrdinalIgnoreCase);
    }

    private static bool MatchCity(string? city1, string? city2, string targetCity)
    {
        string normTarget = NormalizeCity(targetCity);
        return (!string.IsNullOrWhiteSpace(city1) && NormalizeCity(city1).Contains(normTarget, StringComparison.OrdinalIgnoreCase)) ||
               (!string.IsNullOrWhiteSpace(city2) && NormalizeCity(city2).Contains(normTarget, StringComparison.OrdinalIgnoreCase));
    }

    private static bool MatchNeighborhood(string? neigh1, string? neigh2, string targetNeigh)
    {
        string normTarget = NormalizeCity(targetNeigh);
        return (!string.IsNullOrWhiteSpace(neigh1) && NormalizeCity(neigh1).Contains(normTarget, StringComparison.OrdinalIgnoreCase)) ||
               (!string.IsNullOrWhiteSpace(neigh2) && NormalizeCity(neigh2).Contains(normTarget, StringComparison.OrdinalIgnoreCase));
    }

    private MatchEvaluationResult CreateApproval(
        Shipment shipment,
        Trip trip,
        int matchScore,
        RouteMatchType matchType,
        RouteDirectionStatus directionStatus,
        string description)
    {
        double distanceKm = CalculateEstimatedDistance(shipment);

        return new MatchEvaluationResult(
            IsCompatible: true,
            MatchScore: matchScore,
            MatchType: matchType,
            DirectionStatus: directionStatus,
            RejectionReason: MatchRejectionReason.NONE,
            ReasonDescription: description,
            EstimatedDistanceKm: distanceKm,
            DetourDistanceKm: 0.0,
            ShipmentId: shipment.Id,
            ShipmentTitle: shipment.Title,
            TripId: trip.Id,
            CarrierId: trip.CarrierId,
            CarrierName: trip.CarrierName,
            VehicleType: trip.VehicleType.ToString(),
            ShipmentWeightGrams: shipment.WeightGrams,
            AvailableCapacityGrams: trip.AvailableCapacityGrams,
            PickupPoint: $"{shipment.OriginAddress.City} ({shipment.OriginAddress.Neighborhood})",
            DeliveryPoint: $"{shipment.DestinationAddress.City} ({shipment.DestinationAddress.Neighborhood})");
    }

    private MatchEvaluationResult CreateRejection(
        Shipment shipment,
        Trip trip,
        MatchRejectionReason reason,
        RouteDirectionStatus directionStatus,
        string description)
    {
        double distanceKm = CalculateEstimatedDistance(shipment);

        return new MatchEvaluationResult(
            IsCompatible: false,
            MatchScore: 0,
            MatchType: RouteMatchType.NONE,
            DirectionStatus: directionStatus,
            RejectionReason: reason,
            ReasonDescription: description,
            EstimatedDistanceKm: distanceKm,
            DetourDistanceKm: null,
            ShipmentId: shipment.Id,
            ShipmentTitle: shipment.Title,
            TripId: trip.Id,
            CarrierId: trip.CarrierId,
            CarrierName: trip.CarrierName,
            VehicleType: trip.VehicleType.ToString(),
            ShipmentWeightGrams: shipment.WeightGrams,
            AvailableCapacityGrams: trip.AvailableCapacityGrams,
            PickupPoint: $"{shipment.OriginAddress?.City} ({shipment.OriginAddress?.Neighborhood})",
            DeliveryPoint: $"{shipment.DestinationAddress?.City} ({shipment.DestinationAddress?.Neighborhood})");
    }

    private double CalculateEstimatedDistance(Shipment shipment)
    {
        var p1 = ResolveShipmentPoint(shipment.OriginAddress);
        var p2 = ResolveShipmentPoint(shipment.DestinationAddress);
        if (p1 == null || p2 == null)
        {
            return 0.0;
        }
        return _mapsProvider.CalculateApproximateDistanceKm(p1, p2);
    }

    private static int FindCityIndex(List<string> stops, string city)
    {
        for (int i = 0; i < stops.Count; i++)
        {
            if (CitiesMatch(stops[i], city))
            {
                return i;
            }
        }
        return -1;
    }

    private static bool CitiesMatch(string cityA, string cityB)
    {
        if (string.IsNullOrWhiteSpace(cityA) || string.IsNullOrWhiteSpace(cityB))
        {
            return false;
        }

        string normA = NormalizeCity(cityA);
        string normB = NormalizeCity(cityB);

        return normA.Equals(normB, StringComparison.OrdinalIgnoreCase) ||
               normA.Contains(normB, StringComparison.OrdinalIgnoreCase) ||
               normB.Contains(normA, StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeCity(string city)
    {
        return city
            .Trim()
            .Replace("ã", "a", StringComparison.OrdinalIgnoreCase)
            .Replace("á", "a", StringComparison.OrdinalIgnoreCase)
            .Replace("é", "e", StringComparison.OrdinalIgnoreCase)
            .Replace("ê", "e", StringComparison.OrdinalIgnoreCase)
            .Replace("í", "i", StringComparison.OrdinalIgnoreCase)
            .Replace("ó", "o", StringComparison.OrdinalIgnoreCase)
            .Replace("ô", "o", StringComparison.OrdinalIgnoreCase)
            .Replace("ú", "u", StringComparison.OrdinalIgnoreCase)
            .Replace("ç", "c", StringComparison.OrdinalIgnoreCase);
    }
}
