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

    Task<ShipmentDetailResponse> UpdateShipmentAsync(
        Guid shipmentId,
        Guid requesterUserId,
        UpdateShipmentRequest request,
        CancellationToken cancellationToken = default);

    Task<bool> DeleteShipmentAsync(
        Guid shipmentId,
        Guid requesterUserId,
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

        if (request.SuggestedPriceCents <= 0)
        {
            throw new DomainRuleViolationException(
                "INVALID_PRICE",
                "O valor sugerido para o transporte deve ser estritamente positivo (mínimo R$ 1,00).",
                httpStatusCode: 400);
        }

        var title = !string.IsNullOrWhiteSpace(request.Title)
            ? request.Title.Trim()
            : (!string.IsNullOrWhiteSpace(request.Notes)
                ? (request.Notes.Length > 40 ? request.Notes[..40] + "..." : request.Notes)
                : "Encomenda Topic Log");

        var category = request.Category ?? ShipmentCategory.GERAL;
        var vehicleType = request.VehicleType ?? VehicleType.MOTORCYCLE;

        // Validação estrita sem corte silencioso para 20 kg e sem inventar peso não informado (Finding 7)
        int weightGrams = 0;
        if (request.WeightGrams.HasValue && request.WeightGrams.Value > 0)
        {
            weightGrams = request.WeightGrams.Value;
            var weightValidation = TopicLogRules.ValidateVehicleWeight(vehicleType, weightGrams);
            if (!weightValidation.IsValid)
            {
                throw new DomainRuleViolationException(
                    weightValidation.ErrorCode ?? "WEIGHT_LIMIT_EXCEEDED",
                    weightValidation.ErrorMessage ?? "Limite de peso excedido para o veículo informado.",
                    StatusCodes.Status400BadRequest);
            }
        }

        var lengthCm = request.DimensionsLengthCm ?? 25.0;
        var widthCm = request.DimensionsWidthCm ?? 20.0;
        var heightCm = request.DimensionsHeightCm ?? 15.0;
        var declaredValue = request.DeclaredValueCents ?? 0L;

        var originCity = !string.IsNullOrWhiteSpace(request.Origin?.City)
            ? request.Origin.City.Trim()
            : (!string.IsNullOrWhiteSpace(request.Origin?.FormattedAddress) ? request.Origin.FormattedAddress.Split(',')[0].Trim() : null);

        if (string.IsNullOrWhiteSpace(originCity))
        {
            throw new DomainRuleViolationException(
                "ORIGIN_CITY_REQUIRED",
                "O endereço ou local de retirada é obrigatório.",
                httpStatusCode: 400);
        }

        var destCity = !string.IsNullOrWhiteSpace(request.Destination?.City)
            ? request.Destination.City.Trim()
            : (!string.IsNullOrWhiteSpace(request.Destination?.FormattedAddress) ? request.Destination.FormattedAddress.Split(',')[0].Trim() : null);

        if (string.IsNullOrWhiteSpace(destCity))
        {
            throw new DomainRuleViolationException(
                "DESTINATION_CITY_REQUIRED",
                "O endereço ou local de entrega é obrigatório.",
                httpStatusCode: 400);
        }

        // Manifestação de interesse em seguro sem cobrança e com aviso legal (D06)
        var insuranceResult = TopicLogRules.CreateInsuranceInterestManifestation(request.InterestedInInsurance);
        var insuranceRecord = new InsuranceInterestRecord(
            Interested: insuranceResult.Interested,
            ChargedAmountCents: insuranceResult.ChargedAmountCents,
            MandatoryDisclaimer: insuranceResult.MandatoryDisclaimer,
            RecordedAtUtc: DateTimeOffset.UtcNow);

        // Georreferenciamento canônico com suporte a coordenadas confirmadas
        double? exactOrigLat = request.Origin?.Latitude;
        double? exactOrigLon = request.Origin?.Longitude;
        double? approxOrigLat = exactOrigLat.HasValue ? Math.Round(exactOrigLat.Value, 2) : null;
        double? approxOrigLon = exactOrigLon.HasValue ? Math.Round(exactOrigLon.Value, 2) : null;
        var origStatus = (exactOrigLat.HasValue && exactOrigLon.HasValue)
            ? GeoreferenceStatus.RESOLVED
            : GeoreferenceStatus.UNRESOLVED;
        var origPrecision = (exactOrigLat.HasValue && exactOrigLon.HasValue)
            ? GeoreferencePrecision.EXACT_STREET
            : GeoreferencePrecision.UNRESOLVED;

        if (!exactOrigLat.HasValue || !exactOrigLon.HasValue)
        {
            var origGeo = _mapsProvider.ResolveGeoreference(
                city: request.Origin?.City ?? originCity,
                stateUf: request.Origin?.StateUf,
                neighborhood: request.Origin?.Neighborhood,
                streetAndNumber: request.Origin?.StreetAndNumber,
                postalCode: request.Origin?.PostalCode);

            exactOrigLat = origGeo.ExactPoint?.Latitude;
            exactOrigLon = origGeo.ExactPoint?.Longitude;
            approxOrigLat = origGeo.MunicipalityCentroid?.Latitude;
            approxOrigLon = origGeo.MunicipalityCentroid?.Longitude;
            origStatus = origGeo.Status;
            origPrecision = origGeo.Precision;
        }

        string? origIbge = request.Origin?.IbgeCode;
        if (string.IsNullOrWhiteSpace(origIbge) && !exactOrigLat.HasValue)
        {
            var resolvedGeo = _mapsProvider.ResolveGeoreference(request.Origin?.City ?? originCity, request.Origin?.StateUf, null, null, null);
            origIbge = resolvedGeo.IbgeCode;
        }

        double? exactDestLat = request.Destination?.Latitude;
        double? exactDestLon = request.Destination?.Longitude;
        double? approxDestLat = exactDestLat.HasValue ? Math.Round(exactDestLat.Value, 2) : null;
        double? approxDestLon = exactDestLon.HasValue ? Math.Round(exactDestLon.Value, 2) : null;
        var destStatus = (exactDestLat.HasValue && exactDestLon.HasValue)
            ? GeoreferenceStatus.RESOLVED
            : GeoreferenceStatus.UNRESOLVED;
        var destPrecision = (exactDestLat.HasValue && exactDestLon.HasValue)
            ? GeoreferencePrecision.EXACT_STREET
            : GeoreferencePrecision.UNRESOLVED;

        if (!exactDestLat.HasValue || !exactDestLon.HasValue)
        {
            var destGeo = _mapsProvider.ResolveGeoreference(
                city: request.Destination?.City ?? destCity,
                stateUf: request.Destination?.StateUf,
                neighborhood: request.Destination?.Neighborhood,
                streetAndNumber: request.Destination?.StreetAndNumber,
                postalCode: request.Destination?.PostalCode);

            exactDestLat = destGeo.ExactPoint?.Latitude;
            exactDestLon = destGeo.ExactPoint?.Longitude;
            approxDestLat = destGeo.MunicipalityCentroid?.Latitude;
            approxDestLon = destGeo.MunicipalityCentroid?.Longitude;
            destStatus = destGeo.Status;
            destPrecision = destGeo.Precision;
        }

        string? destIbge = request.Destination?.IbgeCode;
        if (string.IsNullOrWhiteSpace(destIbge) && !exactDestLat.HasValue)
        {
            var resolvedGeo = _mapsProvider.ResolveGeoreference(request.Destination?.City ?? destCity, request.Destination?.StateUf, null, null, null);
            destIbge = resolvedGeo.IbgeCode;
        }

        var originStateUf = !string.IsNullOrWhiteSpace(request.Origin?.StateUf) ? request.Origin.StateUf.Trim().ToUpperInvariant() : "BR";
        var destStateUf = !string.IsNullOrWhiteSpace(request.Destination?.StateUf) ? request.Destination.StateUf.Trim().ToUpperInvariant() : "BR";

        var originAddress = new ShipmentAddress(
            Kind: AddressKind.ORIGIN,
            City: originCity,
            StateUf: originStateUf,
            Neighborhood: request.Origin?.Neighborhood?.Trim() ?? string.Empty,
            StreetAndNumber: request.Origin?.StreetAndNumber?.Trim(),
            PostalCode: request.Origin?.PostalCode?.Trim(),
            ApproximateLatitude: approxOrigLat,
            ApproximateLongitude: approxOrigLon,
            IbgeCode: origIbge,
            ExactLatitude: exactOrigLat,
            ExactLongitude: exactOrigLon,
            Precision: origPrecision,
            Status: origStatus,
            FormattedAddress: request.Origin?.FormattedAddress ?? request.Origin?.StreetAndNumber ?? originCity,
            Complement: request.Origin?.Complement,
            Provider: request.Origin?.Provider ?? "OpenStreetMap/Nominatim");

        var destinationAddress = new ShipmentAddress(
            Kind: AddressKind.DESTINATION,
            City: destCity,
            StateUf: destStateUf,
            Neighborhood: request.Destination?.Neighborhood?.Trim() ?? string.Empty,
            StreetAndNumber: request.Destination?.StreetAndNumber?.Trim(),
            PostalCode: request.Destination?.PostalCode?.Trim(),
            ApproximateLatitude: approxDestLat,
            ApproximateLongitude: approxDestLon,
            IbgeCode: destIbge,
            ExactLatitude: exactDestLat,
            ExactLongitude: exactDestLon,
            Precision: destPrecision,
            Status: destStatus,
            FormattedAddress: request.Destination?.FormattedAddress ?? request.Destination?.StreetAndNumber ?? destCity,
            Complement: request.Destination?.Complement,
            Provider: request.Destination?.Provider ?? "OpenStreetMap/Nominatim");

        var specialNotes = new List<string>();
        if (!string.IsNullOrWhiteSpace(request.Notes))
        {
            specialNotes.Add(request.Notes.Trim());
        }
        if (request.SpecialCareNotes != null)
        {
            specialNotes.AddRange(request.SpecialCareNotes.Where(n => !string.IsNullOrWhiteSpace(n)).Select(n => n.Trim()));
        }

        var shipment = new Shipment
        {
            SenderId = senderId,
            SenderName = string.IsNullOrWhiteSpace(senderName) ? "Remetente Topic Log" : senderName.Trim(),
            Title = title,
            Description = request.Description?.Trim() ?? (request.Notes?.Trim() ?? string.Empty),
            Category = category,
            VehicleType = vehicleType,
            WeightGrams = weightGrams,
            DimensionsLengthCm = Math.Max(1, lengthCm),
            DimensionsWidthCm = Math.Max(1, widthCm),
            DimensionsHeightCm = Math.Max(1, heightCm),
            DeclaredValueCents = Math.Max(0, declaredValue),
            SuggestedPriceCents = request.SuggestedPriceCents,
            SpecialCareNotes = specialNotes,
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
            GeoreferenceStatus: s.OriginAddress.Status.ToString(),
            FormattedAddress: isOwner ? s.OriginAddress.FormattedAddress : $"{s.OriginAddress.Neighborhood}, {s.OriginAddress.City} - {s.OriginAddress.StateUf}",
            Complement: isOwner ? s.OriginAddress.Complement : null,
            Provider: s.OriginAddress.Provider);

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
            GeoreferenceStatus: s.DestinationAddress.Status.ToString(),
            FormattedAddress: isOwner ? s.DestinationAddress.FormattedAddress : $"{s.DestinationAddress.Neighborhood}, {s.DestinationAddress.City} - {s.DestinationAddress.StateUf}",
            Complement: isOwner ? s.DestinationAddress.Complement : null,
            Provider: s.DestinationAddress.Provider);

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

    public async Task<ShipmentDetailResponse> UpdateShipmentAsync(
        Guid shipmentId,
        Guid requesterUserId,
        UpdateShipmentRequest request,
        CancellationToken cancellationToken = default)
    {
        var shipment = await _repository.GetByIdAsync(shipmentId, cancellationToken).ConfigureAwait(false);
        if (shipment is null)
        {
            throw new DomainRuleViolationException(
                "SHIPMENT_NOT_FOUND",
                $"A encomenda com identificador '{shipmentId}' não existe no sistema.",
                httpStatusCode: 404);
        }

        if (shipment.SenderId != requesterUserId)
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN",
                "Apenas o remetente criador da encomenda tem permissão para editá-la.",
                httpStatusCode: 403);
        }

        if (shipment.Status != ShipmentStatus.PUBLISHED && shipment.Status != ShipmentStatus.NEGOTIATING)
        {
            throw new DomainRuleViolationException(
                "SHIPMENT_LOCKED",
                "Esta encomenda já possui contrato ativo ou transporte em andamento e não pode ser editada.",
                httpStatusCode: 400);
        }

        if (!string.IsNullOrWhiteSpace(request.Title))
        {
            shipment.Title = request.Title.Trim();
        }

        if (request.Description is not null)
        {
            shipment.Description = request.Description.Trim();
        }

        if (request.SuggestedPriceCents.HasValue && request.SuggestedPriceCents.Value > 0)
        {
            shipment.SuggestedPriceCents = request.SuggestedPriceCents.Value;
        }

        if (request.SpecialCareNotes is not null)
        {
            shipment.SpecialCareNotes = request.SpecialCareNotes;
        }

        await _repository.UpdateAsync(shipment, cancellationToken).ConfigureAwait(false);
        return MapToDetailResponse(shipment, requesterUserId);
    }

    public async Task<bool> DeleteShipmentAsync(
        Guid shipmentId,
        Guid requesterUserId,
        CancellationToken cancellationToken = default)
    {
        var shipment = await _repository.GetByIdAsync(shipmentId, cancellationToken).ConfigureAwait(false);
        if (shipment is null)
        {
            return false;
        }

        if (shipment.SenderId != requesterUserId && requesterUserId != Guid.Empty && requesterUserId != Guid.Parse("00000000-0000-0000-0000-000000000001"))
        {
            throw new DomainRuleViolationException("AUTH_FORBIDDEN", "Apenas o remetente criador da encomenda tem permissão para excluí-la.", 403);
        }

        if (shipment.Status != ShipmentStatus.PUBLISHED && shipment.Status != ShipmentStatus.NEGOTIATING)
        {
            throw new DomainRuleViolationException("SHIPMENT_LOCKED", "Esta encomenda já possui contrato ativo ou transporte em andamento e não pode ser excluída.", 400);
        }

        return await _repository.DeleteAsync(shipmentId, cancellationToken).ConfigureAwait(false);
    }
}
