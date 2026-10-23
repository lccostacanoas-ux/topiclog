using System.Collections.Concurrent;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;

namespace TopicLog.Api.Modules.Shipments;

public interface IShipmentsRepository
{
    Task<Shipment> CreateAsync(Shipment shipment, CancellationToken cancellationToken = default);
    Task<Shipment?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Shipment>> ListActiveAsync(string? originCity = null, string? destinationCity = null, CancellationToken cancellationToken = default);
    Task<bool> UpdateAsync(Shipment shipment, CancellationToken cancellationToken = default);
}

public sealed class InMemoryShipmentsRepository : IShipmentsRepository
{
    private readonly ConcurrentDictionary<Guid, Shipment> _storage = new();

    public InMemoryShipmentsRepository()
    {
        SeedDemoShipments();
    }

    public Task<Shipment> CreateAsync(Shipment shipment, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _storage[shipment.Id] = shipment;
        return Task.FromResult(shipment);
    }

    public Task<Shipment?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _storage.TryGetValue(id, out var shipment);
        return Task.FromResult(shipment);
    }

    public Task<IReadOnlyList<Shipment>> ListActiveAsync(string? originCity = null, string? destinationCity = null, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var query = _storage.Values.AsEnumerable();

        if (!string.IsNullOrWhiteSpace(originCity))
        {
            query = query.Where(s => s.OriginAddress.City.Equals(originCity.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(destinationCity))
        {
            query = query.Where(s => s.DestinationAddress.City.Equals(destinationCity.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        var results = query
            .OrderByDescending(s => s.CreatedAtUtc)
            .ToList();

        return Task.FromResult<IReadOnlyList<Shipment>>(results);
    }

    public Task<bool> UpdateAsync(Shipment shipment, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (_storage.ContainsKey(shipment.Id))
        {
            shipment.UpdatedAtUtc = DateTimeOffset.UtcNow;
            _storage[shipment.Id] = shipment;
            return Task.FromResult(true);
        }
        return Task.FromResult(false);
    }

    private void SeedDemoShipments()
    {
        var demoSenderId = Guid.Parse("00000000-0000-0000-0000-000000000001");

        var demo1 = new Shipment
        {
            Id = Guid.Parse("e0000001-0000-0000-0000-000000000001"),
            SenderId = demoSenderId,
            SenderName = "Carlos M. (Remetente Demo)",
            Title = "Documentos e Contratos Jurídicos Lacrados",
            Description = "Envelope pardo impermeável contendo 3 vias assinadas de contrato societário. Não dobrar nem expor ao calor.",
            Category = ShipmentCategory.DOCUMENTOS,
            VehicleType = VehicleType.MOTORCYCLE,
            WeightGrams = 800,
            DimensionsLengthCm = 32,
            DimensionsWidthCm = 24,
            DimensionsHeightCm = 4,
            DeclaredValueCents = 15000,
            SuggestedPriceCents = 4500,
            SpecialCareNotes = ["Não Dobrar", "Protegido de Chuva", "Lacrado"],
            OriginAddress = new ShipmentAddress(
                Kind: AddressKind.ORIGIN,
                City: "João Monlevade",
                StateUf: "MG",
                Neighborhood: "Carneirinhos",
                StreetAndNumber: "Av. Getúlio Vargas, 1420",
                PostalCode: "35930-001",
                ApproximateLatitude: -19.8105,
                ApproximateLongitude: -43.1740,
                IbgeCode: "3136207",
                Precision: GeoreferencePrecision.MUNICIPALITY_CENTROID,
                Status: GeoreferenceStatus.RESOLVED),
            DestinationAddress = new ShipmentAddress(
                Kind: AddressKind.DESTINATION,
                City: "Belo Horizonte",
                StateUf: "MG",
                Neighborhood: "Savassi",
                StreetAndNumber: "Rua Fernandes Tourinho, 250",
                PostalCode: "30112-000",
                ApproximateLatitude: -19.9380,
                ApproximateLongitude: -43.9350,
                IbgeCode: "3106200",
                Precision: GeoreferencePrecision.MUNICIPALITY_CENTROID,
                Status: GeoreferenceStatus.RESOLVED),
            PickupWindow = "Hoje até 14h",
            DeliveryWindow = "Hoje até 18h",
            InsuranceInterest = new InsuranceInterestRecord(
                Interested: false,
                ChargedAmountCents: 0,
                MandatoryDisclaimer: "Esta manifestação não contrata seguro e não garante cobertura",
                RecordedAtUtc: DateTimeOffset.UtcNow),
            Status = ShipmentStatus.PUBLISHED,
            CreatedAtUtc = DateTimeOffset.UtcNow.AddHours(-2)
        };

        var demo2 = new Shipment
        {
            Id = Guid.Parse("e0000002-0000-0000-0000-000000000002"),
            SenderId = demoSenderId,
            SenderName = "Metalúrgica Vale (Demo)",
            Title = "Válvula Reguladora de Pressão Mecânica",
            Description = "Caixa reforçada com espuma interna contendo válvula metálica de precisão para linha de produção siderúrgica.",
            Category = ShipmentCategory.AUTOPECAS,
            VehicleType = VehicleType.CAR,
            WeightGrams = 7500,
            DimensionsLengthCm = 25,
            DimensionsWidthCm = 20,
            DimensionsHeightCm = 15,
            DeclaredValueCents = 85000,
            SuggestedPriceCents = 9000,
            SpecialCareNotes = ["Carga Mecânica", "Manter na Horizontal", "Caixa Lacrada"],
            OriginAddress = new ShipmentAddress(
                Kind: AddressKind.ORIGIN,
                City: "João Monlevade",
                StateUf: "MG",
                Neighborhood: "Distrito Industrial",
                StreetAndNumber: "Rodovia BR-381, km 345",
                PostalCode: "35930-900",
                ApproximateLatitude: -19.8250,
                ApproximateLongitude: -43.1500,
                IbgeCode: "3136207",
                Precision: GeoreferencePrecision.MUNICIPALITY_CENTROID,
                Status: GeoreferenceStatus.RESOLVED),
            DestinationAddress = new ShipmentAddress(
                Kind: AddressKind.DESTINATION,
                City: "Ipatinga",
                StateUf: "MG",
                Neighborhood: "Horto",
                StreetAndNumber: "Av. Castelo Branco, 890",
                PostalCode: "35160-291",
                ApproximateLatitude: -19.4680,
                ApproximateLongitude: -42.5400,
                IbgeCode: "3131307",
                Precision: GeoreferencePrecision.MUNICIPALITY_CENTROID,
                Status: GeoreferenceStatus.RESOLVED),
            PickupWindow = "Amanhã cedo",
            DeliveryWindow = "Amanhã até 12h",
            InsuranceInterest = new InsuranceInterestRecord(
                Interested: true,
                ChargedAmountCents: 0,
                MandatoryDisclaimer: "Esta manifestação não contrata seguro e não garante cobertura",
                RecordedAtUtc: DateTimeOffset.UtcNow),
            Status = ShipmentStatus.PUBLISHED,
            CreatedAtUtc = DateTimeOffset.UtcNow.AddHours(-1)
        };

        _storage[demo1.Id] = demo1;
        _storage[demo2.Id] = demo2;
    }

    public void RemediateLegacyGeoreferences(TopicLog.Api.Common.Contracts.IMapsProvider mapsProvider)
    {
        ArgumentNullException.ThrowIfNull(mapsProvider);

        foreach (var kvp in _storage)
        {
            var shipment = kvp.Value;
            bool updated = false;

            if (IsLegacyGenericCoordinate(shipment.OriginAddress))
            {
                var resolved = mapsProvider.ResolveGeoreference(shipment.OriginAddress.City, shipment.OriginAddress.StateUf);
                shipment.OriginAddress = shipment.OriginAddress with
                {
                    IbgeCode = resolved.IbgeCode,
                    ApproximateLatitude = resolved.MunicipalityCentroid?.Latitude,
                    ApproximateLongitude = resolved.MunicipalityCentroid?.Longitude,
                    ExactLatitude = resolved.ExactPoint?.Latitude,
                    ExactLongitude = resolved.ExactPoint?.Longitude,
                    Precision = resolved.Precision,
                    Status = resolved.Status
                };
                updated = true;
            }

            if (IsLegacyGenericCoordinate(shipment.DestinationAddress))
            {
                var resolved = mapsProvider.ResolveGeoreference(shipment.DestinationAddress.City, shipment.DestinationAddress.StateUf);
                shipment.DestinationAddress = shipment.DestinationAddress with
                {
                    IbgeCode = resolved.IbgeCode,
                    ApproximateLatitude = resolved.MunicipalityCentroid?.Latitude,
                    ApproximateLongitude = resolved.MunicipalityCentroid?.Longitude,
                    ExactLatitude = resolved.ExactPoint?.Latitude,
                    ExactLongitude = resolved.ExactPoint?.Longitude,
                    Precision = resolved.Precision,
                    Status = resolved.Status
                };
                updated = true;
            }

            if (updated)
            {
                _storage[shipment.Id] = shipment;
            }
        }
    }

    private static bool IsLegacyGenericCoordinate(ShipmentAddress? addr)
    {
        if (addr == null) return false;
        if (!addr.ApproximateLatitude.HasValue || !addr.ApproximateLongitude.HasValue) return false;
        return Math.Abs(addr.ApproximateLatitude.Value - (-19.8000)) < 0.0001 &&
               Math.Abs(addr.ApproximateLongitude.Value - (-43.0000)) < 0.0001;
    }
}

