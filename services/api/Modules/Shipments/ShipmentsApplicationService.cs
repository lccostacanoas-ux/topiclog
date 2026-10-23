using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;

namespace TopicLog.Api.Modules.Shipments;

public interface IShipmentsApplicationService
{
    Task<ShipmentDetailResponse> CreateShipmentAsync(
        Guid senderId,
        string senderName,
        CreateShipmentRequest request,
        CancellationToken cancellationToken = default);

    Task<ShipmentDetailResponse?> GetShipmentByIdAsync(
        Guid id,
        Guid? requesterUserId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ShipmentSummaryResponse>> ListShipmentsAsync(
        string? originCity = null,
        string? destinationCity = null,
        CancellationToken cancellationToken = default);

    Task<string> AddShipmentPhotoAsync(
        Guid shipmentId,
        Guid requesterUserId,
        string fileName,
        Stream fileStream,
        string contentType,
        CancellationToken cancellationToken = default);
}

public sealed class ShipmentsApplicationService : IShipmentsApplicationService
{
    private readonly IShipmentsRepository _repository;
    private readonly IObjectStorageProvider _storageProvider;
    private readonly IMapsProvider _mapsProvider;

    public ShipmentsApplicationService(
        IShipmentsRepository repository,
        IObjectStorageProvider storageProvider,
        IMapsProvider? mapsProvider = null)
    {
        _repository = repository;
        _storageProvider = storageProvider;
        _mapsProvider = mapsProvider ?? new TopicLog.Api.Infrastructure.Providers.LocalFreeMapsProvider();
    }

    public async Task<ShipmentDetailResponse> CreateShipmentAsync(
        Guid senderId,
        string senderName,
        CreateShipmentRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (string.IsNullOrWhiteSpace(request.Title) || request.Title.Trim().Length < 3)
        {
            throw new DomainRuleViolationException(
                "INVALID_TITLE",
                "O título da encomenda deve possuir no mínimo 3 caracteres.",
                httpStatusCode: 400);
        }

        // Validação vinculante de modal e peso (D03, D04)
        var weightValidation = TopicLogRules.ValidateVehicleWeight(
            request.VehicleType,
            request.WeightGrams);

        if (!weightValidation.IsValid)
        {
            throw new DomainRuleViolationException(
                weightValidation.ErrorCode ?? "VEHICLE_WEIGHT_LIMIT_EXCEEDED",
                weightValidation.ErrorMessage ?? "O peso informado excede o limite permitido para o modal.",
                httpStatusCode: 400);
        }

        if (string.IsNullOrWhiteSpace(request.Origin?.City))
        {
            throw new DomainRuleViolationException(
                "ORIGIN_CITY_REQUIRED",
                "A cidade de origem é obrigatória.",
                httpStatusCode: 400);
        }

        if (string.IsNullOrWhiteSpace(request.Destination?.City))
        {
            throw new DomainRuleViolationException(
                "DESTINATION_CITY_REQUIRED",
                "A cidade de destino é obrigatória.",
                httpStatusCode: 400);
        }

        // Manifestação de interesse em seguro sem cobrança e com aviso legal (D06)
        var insuranceResult = TopicLogRules.CreateInsuranceInterestManifestation(request.InterestedInInsurance);
        var insuranceRecord = new InsuranceInterestRecord(
            Interested: insuranceResult.Interested,
            ChargedAmountCents: insuranceResult.ChargedAmountCents,
            MandatoryDisclaimer: insuranceResult.MandatoryDisclaimer,
            RecordedAtUtc: DateTimeOffset.UtcNow);

        // Georreferenciamento canônico oficial via IMapsProvider (Eliminando qualquer fallback arbitrário)
        var origGeo = _mapsProvider.ResolveGeoreference(
            city: request.Origin.City,
            stateUf: request.Origin.StateUf,
            neighborhood: request.Origin.Neighborhood,
            streetAndNumber: request.Origin.StreetAndNumber,
            postalCode: request.Origin.PostalCode);

        var destGeo = _mapsProvider.ResolveGeoreference(
            city: request.Destination.City,
            stateUf: request.Destination.StateUf,
            neighborhood: request.Destination.Neighborhood,
            streetAndNumber: request.Destination.StreetAndNumber,
            postalCode: request.Destination.PostalCode);

        var originAddress = new ShipmentAddress(
            Kind: AddressKind.ORIGIN,
            City: !string.IsNullOrWhiteSpace(origGeo.NormalizedCity) ? origGeo.NormalizedCity : request.Origin.City.Trim(),
            StateUf: !string.IsNullOrWhiteSpace(origGeo.StateUf) ? origGeo.StateUf : (request.Origin.StateUf?.Trim().ToUpperInvariant() ?? "MG"),
            Neighborhood: request.Origin.Neighborhood?.Trim() ?? string.Empty,
            StreetAndNumber: request.Origin.StreetAndNumber?.Trim(),
            PostalCode: request.Origin.PostalCode?.Trim(),
            ApproximateLatitude: origGeo.MunicipalityCentroid?.Latitude,
            ApproximateLongitude: origGeo.MunicipalityCentroid?.Longitude,
            IbgeCode: origGeo.IbgeCode ?? request.Origin.IbgeCode,
            ExactLatitude: origGeo.ExactPoint?.Latitude,
            ExactLongitude: origGeo.ExactPoint?.Longitude,
            Precision: origGeo.Precision,
            Status: origGeo.Status);

        var destinationAddress = new ShipmentAddress(
            Kind: AddressKind.DESTINATION,
            City: !string.IsNullOrWhiteSpace(destGeo.NormalizedCity) ? destGeo.NormalizedCity : request.Destination.City.Trim(),
            StateUf: !string.IsNullOrWhiteSpace(destGeo.StateUf) ? destGeo.StateUf : (request.Destination.StateUf?.Trim().ToUpperInvariant() ?? "MG"),
            Neighborhood: request.Destination.Neighborhood?.Trim() ?? string.Empty,
            StreetAndNumber: request.Destination.StreetAndNumber?.Trim(),
            PostalCode: request.Destination.PostalCode?.Trim(),
            ApproximateLatitude: destGeo.MunicipalityCentroid?.Latitude,
            ApproximateLongitude: destGeo.MunicipalityCentroid?.Longitude,
            IbgeCode: destGeo.IbgeCode ?? request.Destination.IbgeCode,
            ExactLatitude: destGeo.ExactPoint?.Latitude,
            ExactLongitude: destGeo.ExactPoint?.Longitude,
            Precision: destGeo.Precision,
            Status: destGeo.Status);

        var shipment = new Shipment
        {
            SenderId = senderId,
            SenderName = string.IsNullOrWhiteSpace(senderName) ? "Remetente Topic Log" : senderName.Trim(),
            Title = request.Title.Trim(),
            Description = request.Description?.Trim() ?? string.Empty,
            Category = request.Category,
            VehicleType = request.VehicleType,
            WeightGrams = request.WeightGrams,
            DimensionsLengthCm = Math.Max(1, request.DimensionsLengthCm),
            DimensionsWidthCm = Math.Max(1, request.DimensionsWidthCm),
            DimensionsHeightCm = Math.Max(1, request.DimensionsHeightCm),
            DeclaredValueCents = Math.Max(0, request.DeclaredValueCents),
            SuggestedPriceCents = Math.Max(0, request.SuggestedPriceCents),
            SpecialCareNotes = request.SpecialCareNotes?.Where(n => !string.IsNullOrWhiteSpace(n)).Select(n => n.Trim()).ToList() ?? [],
            OriginAddress = originAddress,
            DestinationAddress = destinationAddress,
            PickupWindow = string.IsNullOrWhiteSpace(request.PickupWindow) ? "A combinar" : request.PickupWindow.Trim(),
            DeliveryWindow = string.IsNullOrWhiteSpace(request.DeliveryWindow) ? "A combinar" : request.DeliveryWindow.Trim(),
            InsuranceInterest = insuranceRecord,
            Status = ShipmentStatus.PUBLISHED,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };

        var created = await _repository.CreateAsync(shipment, cancellationToken).ConfigureAwait(false);
        return MapToDetailResponse(created, requesterUserId: senderId);
    }

    public async Task<ShipmentDetailResponse?> GetShipmentByIdAsync(
        Guid id,
        Guid? requesterUserId,
        CancellationToken cancellationToken = default)
    {
        var shipment = await _repository.GetByIdAsync(id, cancellationToken).ConfigureAwait(false);
        if (shipment == null)
        {
            return null;
        }

        return MapToDetailResponse(shipment, requesterUserId);
    }

    public async Task<IReadOnlyList<ShipmentSummaryResponse>> ListShipmentsAsync(
        string? originCity = null,
        string? destinationCity = null,
        CancellationToken cancellationToken = default)
    {
        var list = await _repository.ListActiveAsync(originCity, destinationCity, cancellationToken).ConfigureAwait(false);
        return list.Select(s => new ShipmentSummaryResponse(
            Id: s.Id,
            SenderId: s.SenderId,
            SenderName: s.SenderName,
            Title: s.Title,
            Category: s.Category.ToString(),
            VehicleType: s.VehicleType.ToString(),
            WeightGrams: s.WeightGrams,
            SuggestedPriceCents: s.SuggestedPriceCents,
            OriginCity: s.OriginAddress.City,
            OriginNeighborhood: s.OriginAddress.Neighborhood,
            DestinationCity: s.DestinationAddress.City,
            DestinationNeighborhood: s.DestinationAddress.Neighborhood,
            DeliveryWindow: s.DeliveryWindow,
            Status: s.Status.ToString(),
            PhotoCount: s.PhotoStorageKeys.Count,
            CreatedAtUtc: s.CreatedAtUtc)).ToList();
    }

    public async Task<string> AddShipmentPhotoAsync(
        Guid shipmentId,
        Guid requesterUserId,
        string fileName,
        Stream fileStream,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        var shipment = await _repository.GetByIdAsync(shipmentId, cancellationToken).ConfigureAwait(false);
        if (shipment == null)
        {
            throw new DomainRuleViolationException("SHIPMENT_NOT_FOUND", "Encomenda não encontrada.", 404);
        }

        if (shipment.SenderId != requesterUserId)
        {
            throw new DomainRuleViolationException("FORBIDDEN", "Somente o remetente proprietário pode anexar fotos.", 403);
        }

        var stored = await _storageProvider.StorePrivateObjectAsync(
            category: "shipment-photos",
            fileName: fileName,
            content: fileStream,
            contentType: contentType,
            cancellationToken: cancellationToken).ConfigureAwait(false);

        shipment.PhotoStorageKeys.Add(stored.StorageKey);
        await _repository.UpdateAsync(shipment, cancellationToken).ConfigureAwait(false);

        return _storageProvider.GenerateTemporarySignedPath(stored.StorageKey, TimeSpan.FromHours(2));
    }

    private ShipmentDetailResponse MapToDetailResponse(Shipment s, Guid? requesterUserId)
    {
        bool isOwner = requesterUserId.HasValue && requesterUserId.Value == s.SenderId;

        var originResp = new ShipmentAddressResponse(
            Kind: "ORIGIN",
            City: s.OriginAddress.City,
            StateUf: s.OriginAddress.StateUf,
            Neighborhood: s.OriginAddress.Neighborhood,
            StreetAndNumber: isOwner ? s.OriginAddress.StreetAndNumber : null,
            ApproximateLatitude: s.OriginAddress.ApproximateLatitude,
            ApproximateLongitude: s.OriginAddress.ApproximateLongitude,
            IsMaskedForPrivacy: !isOwner,
            IbgeCode: s.OriginAddress.IbgeCode,
            GeoreferencePrecision: s.OriginAddress.Precision.ToString(),
            GeoreferenceStatus: s.OriginAddress.Status.ToString());

        var destinationResp = new ShipmentAddressResponse(
            Kind: "DESTINATION",
            City: s.DestinationAddress.City,
            StateUf: s.DestinationAddress.StateUf,
            Neighborhood: s.DestinationAddress.Neighborhood,
            StreetAndNumber: isOwner ? s.DestinationAddress.StreetAndNumber : null,
            ApproximateLatitude: s.DestinationAddress.ApproximateLatitude,
            ApproximateLongitude: s.DestinationAddress.ApproximateLongitude,
            IsMaskedForPrivacy: !isOwner,
            IbgeCode: s.DestinationAddress.IbgeCode,
            GeoreferencePrecision: s.DestinationAddress.Precision.ToString(),
            GeoreferenceStatus: s.DestinationAddress.Status.ToString());

        var photoUrls = s.PhotoStorageKeys
            .Select(key => _storageProvider.GenerateTemporarySignedPath(key, TimeSpan.FromHours(2)))
            .ToList();

        var insuranceResp = new InsuranceInterestResponse(
            Interested: s.InsuranceInterest.Interested,
            ChargedAmountCents: s.InsuranceInterest.ChargedAmountCents,
            HasActivePolicy: false,
            GuaranteesCoverage: false,
            MandatoryDisclaimer: s.InsuranceInterest.MandatoryDisclaimer);

        return new ShipmentDetailResponse(
            Id: s.Id,
            SenderId: s.SenderId,
            SenderName: s.SenderName,
            Title: s.Title,
            Description: s.Description,
            Category: s.Category.ToString(),
            VehicleType: s.VehicleType.ToString(),
            WeightGrams: s.WeightGrams,
            DimensionsLengthCm: s.DimensionsLengthCm,
            DimensionsWidthCm: s.DimensionsWidthCm,
            DimensionsHeightCm: s.DimensionsHeightCm,
            DeclaredValueCents: s.DeclaredValueCents,
            SuggestedPriceCents: s.SuggestedPriceCents,
            SpecialCareNotes: s.SpecialCareNotes,
            Origin: originResp,
            Destination: destinationResp,
            PickupWindow: s.PickupWindow,
            DeliveryWindow: s.DeliveryWindow,
            InsuranceInterest: insuranceResp,
            Status: s.Status.ToString(),
            PhotoUrls: photoUrls,
            CreatedAtUtc: s.CreatedAtUtc);
    }
}
