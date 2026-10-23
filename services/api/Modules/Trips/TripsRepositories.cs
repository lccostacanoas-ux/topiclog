using System.Collections.Concurrent;
using TopicLog.Api.Common.Domain;

namespace TopicLog.Api.Modules.Trips;

public interface ITripsRepository
{
    Task<Trip> CreateAsync(Trip trip, CancellationToken cancellationToken = default);
    Task<Trip?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Trip>> ListActiveAsync(string? originCity = null, string? destinationCity = null, CancellationToken cancellationToken = default);
    Task<bool> UpdateAsync(Trip trip, CancellationToken cancellationToken = default);
}

public sealed class InMemoryTripsRepository : ITripsRepository
{
    private readonly ConcurrentDictionary<Guid, Trip> _storage = new();

    public InMemoryTripsRepository()
    {
        SeedDemoTrips();
    }

    public Task<Trip> CreateAsync(Trip trip, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _storage[trip.Id] = trip;
        return Task.FromResult(trip);
    }

    public Task<Trip?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _storage.TryGetValue(id, out var trip);
        return Task.FromResult(trip);
    }

    public Task<bool> UpdateAsync(Trip trip, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (_storage.ContainsKey(trip.Id))
        {
            trip.UpdatedAtUtc = DateTimeOffset.UtcNow;
            _storage[trip.Id] = trip;
            return Task.FromResult(true);
        }
        return Task.FromResult(false);
    }

    public Task<IReadOnlyList<Trip>> ListActiveAsync(string? originCity = null, string? destinationCity = null, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var query = _storage.Values.AsEnumerable();

        if (!string.IsNullOrWhiteSpace(originCity))
        {
            query = query.Where(t => t.OriginCity.Equals(originCity.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(destinationCity))
        {
            query = query.Where(t => t.DestinationCity.Equals(destinationCity.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        var results = query
            .OrderByDescending(t => t.CreatedAtUtc)
            .ToList();

        return Task.FromResult<IReadOnlyList<Trip>>(results);
    }

    private void SeedDemoTrips()
    {
        var demoCarrierId = Guid.Parse("00000000-0000-0000-0000-000000000002");

        var demo1 = new Trip
        {
            Id = Guid.Parse("b0000001-0000-0000-0000-000000000001"),
            CarrierId = demoCarrierId,
            CarrierName = "Marcos Vinícius (Demo)",
            CarrierKycVerified = true,
            VehicleType = VehicleType.CAR,
            VehicleModel = "Fiat Strada 2023 (Caçamba fechada com capota marítima)",
            OriginCity = "João Monlevade",
            OriginStateUf = "MG",
            DestinationCity = "Belo Horizonte",
            DestinationStateUf = "MG",
            IntermediateStops = ["Barão de Cocais", "Caeté"],
            DepartureDate = "Amanhã",
            DepartureTime = "07:30",
            AvailableCapacityGrams = 16000,
            FlexiblePickup = true,
            SuggestedPricePerKgCents = 800,
            Status = TripStatus.SCHEDULED,
            CreatedAtUtc = DateTimeOffset.UtcNow.AddHours(-3)
        };

        var demo2 = new Trip
        {
            Id = Guid.Parse("b0000002-0000-0000-0000-000000000002"),
            CarrierId = demoCarrierId,
            CarrierName = "Rodrigo Almeida (Demo)",
            CarrierKycVerified = true,
            VehicleType = VehicleType.MOTORCYCLE,
            VehicleModel = "Honda CG 160 (Baú reforçado impermeável 45L)",
            OriginCity = "Belo Horizonte",
            OriginStateUf = "MG",
            DestinationCity = "João Monlevade",
            DestinationStateUf = "MG",
            IntermediateStops = [],
            DepartureDate = "Hoje",
            DepartureTime = "14:00",
            AvailableCapacityGrams = 10000,
            FlexiblePickup = false,
            SuggestedPricePerKgCents = 1200,
            Status = TripStatus.SCHEDULED,
            CreatedAtUtc = DateTimeOffset.UtcNow.AddHours(-2)
        };

        var demo3 = new Trip
        {
            Id = Guid.Parse("b0000003-0000-0000-0000-000000000003"),
            CarrierId = demoCarrierId,
            CarrierName = "Gabriel Ciclista (Demo)",
            CarrierKycVerified = true,
            VehicleType = VehicleType.BICYCLE,
            VehicleModel = "Bicicleta Urbana Cargueira (Bolsas laterais impermeáveis)",
            OriginCity = "João Monlevade",
            OriginStateUf = "MG",
            DestinationCity = "João Monlevade",
            DestinationStateUf = "MG",
            IntermediateStops = ["Carneirinhos", "Loanda", "Areia Preta"],
            DepartureDate = "Diário (Seg a Sex)",
            DepartureTime = "09:00 às 17:00",
            AvailableCapacityGrams = 5000,
            FlexiblePickup = true,
            SuggestedPricePerKgCents = 500,
            Status = TripStatus.SCHEDULED,
            CreatedAtUtc = DateTimeOffset.UtcNow.AddHours(-1)
        };

        _storage[demo1.Id] = demo1;
        _storage[demo2.Id] = demo2;
        _storage[demo3.Id] = demo3;
    }
}
