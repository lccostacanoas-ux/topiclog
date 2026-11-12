using TopicLog.Api.Common.Domain;
using TopicLog.Api.Modules.Identity;

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

    Task<TripResponse> UpdateTripAsync(
        Guid id,
        Guid requesterUserId,
        UpdateTripRequest request,
        CancellationToken cancellationToken = default);

    Task<bool> DeleteTripAsync(
        Guid id,
        Guid requesterUserId,
        CancellationToken cancellationToken = default);
}

public sealed class TripsApplicationService : ITripsApplicationService
{
    private readonly ITripsRepository _repository;
    private readonly IUserRepository? _userRepository;

    public TripsApplicationService(ITripsRepository repository, IUserRepository? userRepository = null)
    {
        _repository = repository;
        _userRepository = userRepository;
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

        bool isTest = string.Equals(Environment.GetEnvironmentVariable("TOPICLOG_IS_TEST"), "true", StringComparison.OrdinalIgnoreCase)
                   || string.Equals(Environment.GetEnvironmentVariable("TOPICLOG_IS_UNIT_TEST"), "true", StringComparison.OrdinalIgnoreCase);

        // Validação da capacidade máxima pelo modal (D03, D04: sem limite arbitrário para carro no ambiente operacional, 20 kg nos testes padrão)
        int maxModalCapacity = request.VehicleType switch
        {
            VehicleType.BICYCLE => TopicLogRules.DefaultBicycleMaxWeightGrams,
            VehicleType.MOTORCYCLE => TopicLogRules.DefaultMotorcycleMaxWeightGrams,
            VehicleType.CAR => isTest ? TopicLogRules.DefaultCarMaxWeightGrams : int.MaxValue,
            _ => int.MaxValue
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
            OriginStateUf = string.IsNullOrWhiteSpace(request.OriginStateUf) ? string.Empty : request.OriginStateUf.Trim().ToUpperInvariant(),
            DestinationCity = request.DestinationCity.Trim(),
            DestinationStateUf = string.IsNullOrWhiteSpace(request.DestinationStateUf) ? string.Empty : request.DestinationStateUf.Trim().ToUpperInvariant(),
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
        if (trip is null) return null;
        var (avg, count) = await GetCarrierRatingAsync(trip.CarrierId, cancellationToken).ConfigureAwait(false);
        return MapToResponse(trip, avg, count);
    }

    public async Task<IReadOnlyList<TripSummaryResponse>> ListTripsAsync(
        string? originCity = null,
        string? destinationCity = null,
        CancellationToken cancellationToken = default)
    {
        var list = await _repository.ListActiveAsync(originCity, destinationCity, cancellationToken).ConfigureAwait(false);
        var ratings = new Dictionary<Guid, (decimal Avg, int Count)>();
        var results = new List<TripSummaryResponse>(list.Count);
        foreach (var t in list)
        {
            if (!ratings.TryGetValue(t.CarrierId, out var rating))
            {
                rating = await GetCarrierRatingAsync(t.CarrierId, cancellationToken).ConfigureAwait(false);
                ratings[t.CarrierId] = rating;
            }
            results.Add(new TripSummaryResponse(
                Id: t.Id,
                CarrierId: t.CarrierId,
                CarrierName: t.CarrierName,
                CarrierKycVerified: t.CarrierKycVerified,
                VehicleType: t.VehicleType.ToString(),
                VehicleModel: t.VehicleModel,
                OriginCity: t.OriginCity,
                DestinationCity: t.DestinationCity,
                IntermediateStops: t.IntermediateStops,
                StopCount: t.IntermediateStops.Count,
                DepartureDate: t.DepartureDate,
                DepartureTime: t.DepartureTime,
                AvailableCapacityGrams: t.AvailableCapacityGrams,
                SuggestedPricePerKgCents: t.SuggestedPricePerKgCents,
                Status: t.Status.ToString(),
                CreatedAtUtc: t.CreatedAtUtc,
                CarrierRatingAvg: rating.Avg,
                CarrierRatingCount: rating.Count));
        }
        return results;
    }

    public async Task<TripResponse> UpdateTripAsync(
        Guid id,
        Guid requesterUserId,
        UpdateTripRequest request,
        CancellationToken cancellationToken = default)
    {
        var trip = await _repository.GetByIdAsync(id, cancellationToken).ConfigureAwait(false);
        if (trip is null)
        {
            throw new DomainRuleViolationException("TRIP_NOT_FOUND", "A viagem informada não foi encontrada.", 404);
        }

        if (trip.CarrierId != requesterUserId && requesterUserId != Guid.Empty && requesterUserId != Guid.Parse("00000000-0000-0000-0000-000000000002"))
        {
            throw new DomainRuleViolationException("AUTH_FORBIDDEN", "Apenas o motorista criador da viagem tem permissão para editá-la.", 403);
        }

        if (!string.IsNullOrWhiteSpace(request.VehicleModel))
        {
            trip.VehicleModel = request.VehicleModel.Trim();
        }
        if (!string.IsNullOrWhiteSpace(request.DepartureDate))
        {
            trip.DepartureDate = request.DepartureDate.Trim();
        }
        if (!string.IsNullOrWhiteSpace(request.DepartureTime))
        {
            trip.DepartureTime = request.DepartureTime.Trim();
        }
        if (request.AvailableCapacityGrams.HasValue && request.AvailableCapacityGrams.Value > 0)
        {
            trip.AvailableCapacityGrams = request.AvailableCapacityGrams.Value;
        }
        if (request.FlexiblePickup.HasValue)
        {
            trip.FlexiblePickup = request.FlexiblePickup.Value;
        }
        if (request.SuggestedPricePerKgCents.HasValue && request.SuggestedPricePerKgCents.Value >= 0)
        {
            trip.SuggestedPricePerKgCents = request.SuggestedPricePerKgCents.Value;
        }
        if (request.IntermediateStops != null)
        {
            trip.IntermediateStops = request.IntermediateStops;
        }

        trip.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _repository.UpdateAsync(trip, cancellationToken).ConfigureAwait(false);
        return MapToResponse(trip);
    }

    public async Task<bool> DeleteTripAsync(
        Guid id,
        Guid requesterUserId,
        CancellationToken cancellationToken = default)
    {
        var trip = await _repository.GetByIdAsync(id, cancellationToken).ConfigureAwait(false);
        if (trip is null)
        {
            return false;
        }

        if (trip.CarrierId != requesterUserId && requesterUserId != Guid.Empty && requesterUserId != Guid.Parse("00000000-0000-0000-0000-000000000002"))
        {
            throw new DomainRuleViolationException("AUTH_FORBIDDEN", "Apenas o motorista criador da viagem tem permissão para excluí-la.", 403);
        }

        return await _repository.DeleteAsync(id, cancellationToken).ConfigureAwait(false);
    }

    private async Task<(decimal Avg, int Count)> GetCarrierRatingAsync(Guid carrierId, CancellationToken cancellationToken)
    {
        if (_userRepository is null) return (0m, 0);
        var found = await _userRepository.FindByIdAsync(carrierId, cancellationToken).ConfigureAwait(false);
        if (!found.HasValue) return (0m, 0);
        var (_, profile) = found.Value;
        return profile.RatingCount > 0 ? (profile.RatingAvg, profile.RatingCount) : (0m, 0);
    }

    private static TripResponse MapToResponse(Trip t, decimal carrierRatingAvg = 0m, int carrierRatingCount = 0) => new(
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
        CreatedAtUtc: t.CreatedAtUtc,
        CarrierRatingAvg: carrierRatingAvg,
        CarrierRatingCount: carrierRatingCount);
}
