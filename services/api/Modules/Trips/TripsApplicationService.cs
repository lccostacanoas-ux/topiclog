using TopicLog.Api.Common.Domain;

namespace TopicLog.Api.Modules.Trips;

public interface ITripsApplicationService
{
    Task<TripResponse> CreateTripAsync(
        Guid carrierId,
        string carrierName,
        bool carrierKycVerified,
        CreateTripRequest request,
        CancellationToken cancellationToken = default);

    Task<TripResponse?> GetTripByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<TripSummaryResponse>> ListTripsAsync(
        string? originCity = null,
        string? destinationCity = null,
        CancellationToken cancellationToken = default);
}

public sealed class TripsApplicationService : ITripsApplicationService
{
    private readonly ITripsRepository _repository;

    public TripsApplicationService(ITripsRepository repository)
    {
        _repository = repository;
    }

    public async Task<TripResponse> CreateTripAsync(
        Guid carrierId,
        string carrierName,
        bool carrierKycVerified,
        CreateTripRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (string.IsNullOrWhiteSpace(request.OriginCity))
        {
            throw new DomainRuleViolationException(
                "ORIGIN_CITY_REQUIRED",
                "A cidade de origem da viagem é obrigatória.",
                httpStatusCode: 400);
        }

        if (string.IsNullOrWhiteSpace(request.DestinationCity))
        {
            throw new DomainRuleViolationException(
                "DESTINATION_CITY_REQUIRED",
                "A cidade de destino da viagem é obrigatória.",
                httpStatusCode: 400);
        }

        if (request.AvailableCapacityGrams <= 0)
        {
            throw new DomainRuleViolationException(
                "INVALID_CAPACITY",
                "A capacidade disponível deve ser estritamente maior que zero gramas.",
                httpStatusCode: 400);
        }

        // Validação da capacidade máxima pelo modal (D03, D04)
        int maxModalCapacity = request.VehicleType switch
        {
            VehicleType.BICYCLE => TopicLogRules.DefaultBicycleMaxWeightGrams,
            VehicleType.MOTORCYCLE => TopicLogRules.DefaultMotorcycleMaxWeightGrams,
            VehicleType.CAR => TopicLogRules.DefaultCarMaxWeightGrams,
            _ => TopicLogRules.DefaultCarMaxWeightGrams
        };

        if (request.AvailableCapacityGrams > maxModalCapacity)
        {
            throw new DomainRuleViolationException(
                "VEHICLE_WEIGHT_LIMIT_EXCEEDED",
                $"A capacidade informada ({request.AvailableCapacityGrams} g) excede o limite máximo permitido para {request.VehicleType} ({maxModalCapacity} g) conforme a regra D04.",
                httpStatusCode: 400);
        }

        var stops = request.IntermediateStops?
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList() ?? [];

        var trip = new Trip
        {
            CarrierId = carrierId,
            CarrierName = string.IsNullOrWhiteSpace(carrierName) ? "Transportador Topic Log" : carrierName.Trim(),
            CarrierKycVerified = carrierKycVerified,
            VehicleType = request.VehicleType,
            VehicleModel = string.IsNullOrWhiteSpace(request.VehicleModel) ? "Veículo padrão cadastrado" : request.VehicleModel.Trim(),
            OriginCity = request.OriginCity.Trim(),
            OriginStateUf = "MG",
            DestinationCity = request.DestinationCity.Trim(),
            DestinationStateUf = "MG",
            IntermediateStops = stops,
            DepartureDate = string.IsNullOrWhiteSpace(request.DepartureDate) ? "A combinar" : request.DepartureDate.Trim(),
            DepartureTime = string.IsNullOrWhiteSpace(request.DepartureTime) ? "08:00" : request.DepartureTime.Trim(),
            AvailableCapacityGrams = request.AvailableCapacityGrams,
            FlexiblePickup = request.FlexiblePickup,
            SuggestedPricePerKgCents = Math.Max(0, request.SuggestedPricePerKgCents),
            Status = TripStatus.SCHEDULED,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };

        var created = await _repository.CreateAsync(trip, cancellationToken).ConfigureAwait(false);
        return MapToResponse(created);
    }

    public async Task<TripResponse?> GetTripByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var trip = await _repository.GetByIdAsync(id, cancellationToken).ConfigureAwait(false);
        return trip is null ? null : MapToResponse(trip);
    }

    public async Task<IReadOnlyList<TripSummaryResponse>> ListTripsAsync(
        string? originCity = null,
        string? destinationCity = null,
        CancellationToken cancellationToken = default)
    {
        var list = await _repository.ListActiveAsync(originCity, destinationCity, cancellationToken).ConfigureAwait(false);
        return list.Select(t => new TripSummaryResponse(
            Id: t.Id,
            CarrierId: t.CarrierId,
            CarrierName: t.CarrierName,
            CarrierKycVerified: t.CarrierKycVerified,
            VehicleType: t.VehicleType.ToString(),
            VehicleModel: t.VehicleModel,
            OriginCity: t.OriginCity,
            DestinationCity: t.DestinationCity,
            StopCount: t.IntermediateStops.Count,
            DepartureDate: t.DepartureDate,
            DepartureTime: t.DepartureTime,
            AvailableCapacityGrams: t.AvailableCapacityGrams,
            SuggestedPricePerKgCents: t.SuggestedPricePerKgCents,
            Status: t.Status.ToString(),
            CreatedAtUtc: t.CreatedAtUtc)).ToList();
    }

    private static TripResponse MapToResponse(Trip t) => new(
        Id: t.Id,
        CarrierId: t.CarrierId,
        CarrierName: t.CarrierName,
        CarrierKycVerified: t.CarrierKycVerified,
        VehicleType: t.VehicleType.ToString(),
        VehicleModel: t.VehicleModel,
        OriginCity: t.OriginCity,
        OriginStateUf: t.OriginStateUf,
        DestinationCity: t.DestinationCity,
        DestinationStateUf: t.DestinationStateUf,
        IntermediateStops: t.IntermediateStops,
        DepartureDate: t.DepartureDate,
        DepartureTime: t.DepartureTime,
        AvailableCapacityGrams: t.AvailableCapacityGrams,
        FlexiblePickup: t.FlexiblePickup,
        SuggestedPricePerKgCents: t.SuggestedPricePerKgCents,
        Status: t.Status.ToString(),
        CreatedAtUtc: t.CreatedAtUtc);
}
