using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Modules.Finance;
using TopicLog.Api.Modules.Identity;
using TopicLog.Api.Modules.Notifications;
using TopicLog.Api.Modules.Proposals;
using TopicLog.Api.Modules.Shipments;
using TopicLog.Api.Modules.Trips;

namespace TopicLog.Api.Modules.Fulfillment;

public interface IFulfillmentApplicationService
{
    Task<DeliveryOrderResponse> PickupCheckinAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        PickupCheckinRequest request,
        CancellationToken cancellationToken = default);

    Task<DeliveryOrderResponse> ConfirmPickupAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        ConfirmPickupRequest request,
        CancellationToken cancellationToken = default);

    Task<DeliveryProofResponse> UploadDeliveryProofAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        DeliveryProofUploadRequest request,
        CancellationToken cancellationToken = default);

    Task<DeliveryCodeResponse> GetDeliveryCodeAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        CancellationToken cancellationToken = default);

    Task<DeliveryCodeResponse> RegenerateDeliveryCodeAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        RegenerateDeliveryCodeRequest request,
        CancellationToken cancellationToken = default);

    Task<DeliveryOrderResponse> ConfirmDeliveryAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        ConfirmDeliveryRequest request,
        CancellationToken cancellationToken = default);

    Task<DeliveryExceptionResponse> ReportDeliveryExceptionAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        ReportDeliveryExceptionRequest request,
        CancellationToken cancellationToken = default);

    Task<DeliveryOrderResponse> RescheduleDeliveryAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        RescheduleDeliveryRequest request,
        CancellationToken cancellationToken = default);

    Task<DeliveryOrderResponse> InitiateReturnToSenderAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        InitiateReturnRequest request,
        CancellationToken cancellationToken = default);

    Task<DeliveryTrackingResponse> GetTrackingAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DeliveryOrderResponse>> ListOrdersForUserAsync(
        Guid actorId,
        ActorRole actorRole,
        CancellationToken cancellationToken = default);

    Task<DeliveryOrderResponse> GetOrderAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        CancellationToken cancellationToken = default);

    Task<DeliveryOrderResponse> GetOrderByShipmentIdAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid shipmentId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<PostDeliverySuggestionResponse>> GetPostDeliverySuggestionsAsync(
        double latitude,
        double longitude,
        int maxRadiusKm = 2,
        CancellationToken cancellationToken = default);

    Task<DeliveryOrderResponse> CreateOrderForContractAsync(
        Contract contract,
        Shipment shipment,
        CancellationToken cancellationToken = default);

    Task<OrderCodesResponse> GetOrderCodesAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        CancellationToken cancellationToken = default);

    Task<DeliveryOrderResponse> UpdateCarrierLocationAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        UpdateDeliveryLocationRequest request,
        CancellationToken cancellationToken = default);

    Task<DeliveryOrderResponse> RateCarrierAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        RateCarrierRequest request,
        CancellationToken cancellationToken = default);
}

public sealed class FulfillmentApplicationService : IFulfillmentApplicationService
{
    private readonly IFulfillmentRepository _fulfillmentRepo;
    private readonly IShipmentsRepository? _shipmentsRepo;
    private readonly IProposalsRepository? _proposalsRepo;
    private readonly ITripsRepository? _tripsRepo;
    private readonly INotificationsService? _notificationsService;
    private readonly IUserRepository? _userRepository;
    private readonly IFinancialPolicyProvider? _financialPolicyProvider;
    private readonly IMercadoPagoPayoutService? _payoutService;

    public FulfillmentApplicationService(
        IFulfillmentRepository fulfillmentRepo,
        IShipmentsRepository? shipmentsRepo = null,
        IProposalsRepository? proposalsRepo = null,
        ITripsRepository? tripsRepo = null,
        INotificationsService? notificationsService = null,
        IUserRepository? userRepository = null,
        IFinancialPolicyProvider? financialPolicyProvider = null,
        IMercadoPagoPayoutService? payoutService = null)
    {
        _fulfillmentRepo = fulfillmentRepo;
        _shipmentsRepo = shipmentsRepo;
        _proposalsRepo = proposalsRepo;
        _tripsRepo = tripsRepo;
        _notificationsService = notificationsService;
        _userRepository = userRepository;
        _financialPolicyProvider = financialPolicyProvider;
        _payoutService = payoutService;
    }

    public async Task<DeliveryOrderResponse> PickupCheckinAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        PickupCheckinRequest request,
        CancellationToken cancellationToken = default)
    {
        var order = await GetOrderOrThrowAsync(orderId, cancellationToken);
        EnsureIsCarrierOfOrder(actorId, actorRole, order);

        if (order.Status != DeliveryOrderStatus.AWAITING_PICKUP)
        {
            // Idempotência caso já tenha sido realizado
            return MapOrderToResponse(order);
        }

        await _fulfillmentRepo.AppendEventAsync(new DeliveryEvent
        {
            DeliveryOrderId = order.Id,
            EventType = DeliveryEventType.PICKUP_CHECKIN,
            ActorId = actorId,
            ActorRole = actorRole.ToString(),
            PreviousStatus = order.Status.ToString(),
            NewStatus = order.Status.ToString(),
            Notes = request.Notes ?? "Check-in presencial no ponto de coleta realizado pelo transportador.",
            ApproximateLat = request.Latitude,
            ApproximateLng = request.Longitude,
            OccurredAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

        return MapOrderToResponse(order);
    }

    public async Task<DeliveryOrderResponse> ConfirmPickupAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        ConfirmPickupRequest request,
        CancellationToken cancellationToken = default)
    {
        var order = await GetOrderOrThrowAsync(orderId, cancellationToken);
        EnsureIsParticipantOfOrder(actorId, actorRole, order);

        if (order.Status == DeliveryOrderStatus.IN_TRANSIT || order.Status == DeliveryOrderStatus.DELIVERED_VERIFIED)
        {
            // Idempotente em caso de retransmissão
            return MapOrderToResponse(order);
        }

        // Valida o código de coleta/início de viagem de 4 dígitos quando exigido pela ordem
        if (!string.IsNullOrWhiteSpace(order.PickupCodeHash) && !string.IsNullOrWhiteSpace(order.PickupCodeSalt))
        {
            var providedPickupCode = (request.PickupCode ?? string.Empty).Trim();
            if (providedPickupCode.Length != 4 || !providedPickupCode.All(char.IsDigit) ||
                !InMemoryFulfillmentRepository.VerifyCodeHash(providedPickupCode, order.PickupCodeHash, order.PickupCodeSalt))
            {
                throw new DomainRuleViolationException(
                    "PICKUP_CODE_INVALID",
                    "Código de coleta / início de viagem incorreto. Solicite o código de 4 dígitos ao remetente no momento da retirada.",
                    400);
            }
        }

        var prevStatus = order.Status.ToString();
        order.PickupConfirmed = true;
        order.Status = DeliveryOrderStatus.IN_TRANSIT;
        order.PickedUpAtUtc = DateTimeOffset.UtcNow;
        if (!order.CurrentLatitude.HasValue && order.OriginLatitude.HasValue)
        {
            order.CurrentLatitude = order.OriginLatitude;
            order.CurrentLongitude = order.OriginLongitude;
            order.LastLocationUpdatedAtUtc = DateTimeOffset.UtcNow;
        }
        order.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await _fulfillmentRepo.UpdateOrderAsync(order, cancellationToken);

        if (_shipmentsRepo != null)
        {
            var shipment = await _shipmentsRepo.GetByIdAsync(order.ShipmentId, cancellationToken);
            if (shipment != null)
            {
                shipment.Status = ShipmentStatus.IN_TRANSIT;
                await _shipmentsRepo.UpdateAsync(shipment, cancellationToken);
            }
        }

        if (_tripsRepo != null && order.TripId != Guid.Empty)
        {
            var trip = await _tripsRepo.GetByIdAsync(order.TripId, cancellationToken);
            if (trip != null && trip.Status == TripStatus.SCHEDULED)
            {
                trip.Status = TripStatus.ACTIVE;
                await _tripsRepo.UpdateAsync(trip, cancellationToken);
            }
        }

        await _fulfillmentRepo.AppendEventAsync(new DeliveryEvent
        {
            DeliveryOrderId = order.Id,
            EventType = DeliveryEventType.PICKUP_CONFIRMED,
            ActorId = actorId,
            ActorRole = actorRole.ToString(),
            PreviousStatus = prevStatus,
            NewStatus = order.Status.ToString(),
            Notes = request.HandoverNotes ?? "Coleta confirmada com código de início de viagem. Encomenda em trânsito.",
            OccurredAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

        if (_notificationsService != null)
        {
            await _notificationsService.NotifyAsync(
                order.SenderId,
                "TRIP_STARTED",
                "Viagem iniciada!",
                $"{order.CarrierName} confirmou a coleta com o código e iniciou o transporte da sua encomenda.",
                "/minhas-atividades",
                relatedShipmentId: order.ShipmentId,
                relatedContractId: order.ContractId,
                cancellationToken: cancellationToken);

            await _notificationsService.NotifyAsync(
                order.CarrierId,
                "TRIP_STARTED",
                "Viagem em andamento",
                $"Coleta validada para a encomenda de {order.SenderName}. Acompanhe o trajeto e solicite o código de entrega no destino.",
                "/minhas-atividades",
                relatedShipmentId: order.ShipmentId,
                relatedContractId: order.ContractId,
                cancellationToken: cancellationToken);
        }

        return MapOrderToResponse(order);
    }

    public async Task<DeliveryProofResponse> UploadDeliveryProofAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        DeliveryProofUploadRequest request,
        CancellationToken cancellationToken = default)
    {
        var order = await GetOrderOrThrowAsync(orderId, cancellationToken);
        EnsureIsCarrierOfOrder(actorId, actorRole, order);

        if (string.IsNullOrWhiteSpace(request.FileBase64OrUrl))
        {
            throw new DomainRuleViolationException(
                "DELIVERY_PROOF_FILE_REQUIRED",
                "A imagem da evidência fotográfica da entrega é obrigatória (Decisão D16).",
                400);
        }

        // Sanitização básica LGPD: rejeita se payload contiver indicadores explícitos de biometria bruta
        if (request.FileBase64OrUrl.Contains("raw-face-biometry", StringComparison.OrdinalIgnoreCase))
        {
            throw new DomainRuleViolationException(
                "LGPD_BIOMETRY_FORBIDDEN",
                "A prova fotográfica de entrega não pode conter biometria facial identificável (LGPD D05).",
                422);
        }

        // Gera hash SHA256 do payload
        var sha256 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(request.FileBase64OrUrl)));

        var proof = new DeliveryProof
        {
            DeliveryOrderId = order.Id,
            FileUrl = request.FileBase64OrUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                ? request.FileBase64OrUrl
                : $"https://storage.topiclog.local/proofs/{order.Id}/{Guid.NewGuid():N}.jpg",
            Sha256Hash = sha256,
            MimeType = request.MimeType ?? "image/jpeg",
            FileSizeBytes = Encoding.UTF8.GetByteCount(request.FileBase64OrUrl),
            ApproximateLat = request.Latitude,
            ApproximateLng = request.Longitude,
            UploadedByUserId = actorId,
            UploadedAtUtc = DateTimeOffset.UtcNow
        };

        await _fulfillmentRepo.CreateProofAsync(proof, cancellationToken);

        // Se a ordem estava em trânsito, avança para rota de entrega
        if (order.Status == DeliveryOrderStatus.IN_TRANSIT)
        {
            order.Status = DeliveryOrderStatus.OUT_FOR_DELIVERY;
            order.UpdatedAtUtc = DateTimeOffset.UtcNow;
            await _fulfillmentRepo.UpdateOrderAsync(order, cancellationToken);
        }

        await _fulfillmentRepo.AppendEventAsync(new DeliveryEvent
        {
            DeliveryOrderId = order.Id,
            EventType = DeliveryEventType.PHOTO_PROOF_SUBMITTED,
            ActorId = actorId,
            ActorRole = actorRole.ToString(),
            PreviousStatus = order.Status.ToString(),
            NewStatus = order.Status.ToString(),
            Notes = $"Evidência fotográfica registrada pelo transportador ({proof.FileSizeBytes} bytes, SHA-256: {sha256[..8]}...).",
            ApproximateLat = request.Latitude,
            ApproximateLng = request.Longitude,
            OccurredAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

        return new DeliveryProofResponse(
            Id: proof.Id,
            DeliveryOrderId: proof.DeliveryOrderId,
            FileUrl: proof.FileUrl,
            Sha256Hash: proof.Sha256Hash,
            MimeType: proof.MimeType,
            FileSizeBytes: proof.FileSizeBytes,
            UploadedAtUtc: proof.UploadedAtUtc);
    }

    public async Task<DeliveryCodeResponse> GetDeliveryCodeAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        CancellationToken cancellationToken = default)
    {
        var order = await GetOrderOrThrowAsync(orderId, cancellationToken);

        // DECISÃO 1 & 2: O transportador NUNCA pode consultar o código de segurança pela API
        if (actorRole == ActorRole.CARRIER || actorId == order.CarrierId)
        {
            throw new DomainRuleViolationException(
                "FORBIDDEN_CARRIER_CANNOT_VIEW_DELIVERY_CODE",
                "O transportador não possui permissão para visualizar o código de entrega. O código de 4 dígitos deve ser fornecido presencialmente pelo destinatário no momento da entrega (Decisão D16).",
                403);
        }

        // Apenas o Remetente (ou Admin) pode consultar
        if (actorRole != ActorRole.ADMIN && actorRole != ActorRole.SYSTEM && actorId != order.SenderId)
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN_NOT_PARTY",
                "Apenas o remetente titular possui autorização para consultar o código secreto de entrega.",
                403);
        }

        var challenge = await _fulfillmentRepo.GetActiveChallengeByOrderIdAsync(order.Id, cancellationToken);
        if (challenge == null)
        {
            // Cria um novo desafio sob demanda se não existir
            challenge = await GenerateChallengeInternalAsync(order.Id, cancellationToken);
        }

        var remainingAttempts = Math.Max(0, challenge.MaxAttempts - challenge.FailedAttempts);
        var plainCode = challenge.PlainCode ?? "4826";

        return new DeliveryCodeResponse(
            OrderId: order.Id,
            DeliveryCode: plainCode,
            RemainingAttempts: remainingAttempts,
            ExpiresAtUtc: challenge.ExpiresAtUtc,
            IsLocked: challenge.IsLocked,
            Disclaimer: "Forneça este código de 4 dígitos ao transportador somente após inspecionar o pacote fisicamente.");
    }

    public async Task<DeliveryCodeResponse> RegenerateDeliveryCodeAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        RegenerateDeliveryCodeRequest request,
        CancellationToken cancellationToken = default)
    {
        var order = await GetOrderOrThrowAsync(orderId, cancellationToken);

        // Apenas Remetente pode regenerar
        if (actorRole != ActorRole.ADMIN && actorRole != ActorRole.SYSTEM && actorId != order.SenderId)
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN_NOT_PARTY",
                "Apenas o remetente pode solicitar a reemissão do código de segurança de entrega.",
                403);
        }

        var newChallenge = await GenerateChallengeInternalAsync(order.Id, cancellationToken);

        await _fulfillmentRepo.AppendEventAsync(new DeliveryEvent
        {
            DeliveryOrderId = order.Id,
            EventType = DeliveryEventType.DELIVERY_CODE_REGENERATED,
            ActorId = actorId,
            ActorRole = actorRole.ToString(),
            PreviousStatus = order.Status.ToString(),
            NewStatus = order.Status.ToString(),
            Notes = $"Novo código de segurança gerado pelo remetente. Desafio anterior invalidado. Justificativa: {request.Justification ?? "Solicitação manual de reemissão"}.",
            OccurredAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

        return new DeliveryCodeResponse(
            OrderId: order.Id,
            DeliveryCode: newChallenge.PlainCode!,
            RemainingAttempts: newChallenge.MaxAttempts,
            ExpiresAtUtc: newChallenge.ExpiresAtUtc,
            IsLocked: false,
            Disclaimer: "Novo código gerado com sucesso. Código anterior invalidado.");
    }

    public async Task<DeliveryOrderResponse> ConfirmDeliveryAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        ConfirmDeliveryRequest request,
        CancellationToken cancellationToken = default)
    {
        var order = await GetOrderOrThrowAsync(orderId, cancellationToken);
        EnsureIsCarrierOfOrder(actorId, actorRole, order);

        if (order.Status == DeliveryOrderStatus.DELIVERED_VERIFIED)
        {
            // Idempotência
            return MapOrderToResponse(order);
        }

        // Confirmação da entrega por senha / código de segurança de 4 dígitos (PIN)
        var challenge = await _fulfillmentRepo.GetActiveChallengeByOrderIdAsync(order.Id, cancellationToken);
        if (challenge == null)
        {
            throw new DomainRuleViolationException(
                "DELIVERY_CHALLENGE_NOT_FOUND",
                "Desafio de código de segurança não localizado para esta encomenda.",
                404);
        }

        if (challenge.IsLocked)
        {
            throw new DomainRuleViolationException(
                "DELIVERY_CHALLENGE_LOCKED",
                "O código de segurança foi bloqueado devido a 3 tentativas incorretas consecutivas. Solicite a reemissão de um novo código pelo remetente.",
                422);
        }

        if (challenge.ExpiresAtUtc < DateTimeOffset.UtcNow)
        {
            throw new DomainRuleViolationException(
                "DELIVERY_CHALLENGE_EXPIRED",
                "O código de segurança expirou. Solicite a renovação pelo remetente.",
                422);
        }

        var providedCode = (request.DeliveryCode ?? string.Empty).Trim();
        if (providedCode.Length != 4 || !providedCode.All(char.IsDigit))
        {
            throw new DomainRuleViolationException(
                "DELIVERY_CODE_INVALID_FORMAT",
                "O código de entrega deve conter exatamente 4 dígitos numéricos.",
                400);
        }

        var isValid = InMemoryFulfillmentRepository.VerifyCodeHash(providedCode, challenge.CodeHash, challenge.CodeSalt);

        if (!isValid)
        {
            challenge.FailedAttempts++;
            if (challenge.FailedAttempts >= challenge.MaxAttempts)
            {
                challenge.IsLocked = true;
                challenge.LockedAtUtc = DateTimeOffset.UtcNow;
                await _fulfillmentRepo.UpdateChallengeAsync(challenge, cancellationToken);

                await _fulfillmentRepo.AppendEventAsync(new DeliveryEvent
                {
                    DeliveryOrderId = order.Id,
                    EventType = DeliveryEventType.DELIVERY_CHALLENGE_LOCKED,
                    ActorId = actorId,
                    ActorRole = actorRole.ToString(),
                    PreviousStatus = order.Status.ToString(),
                    NewStatus = order.Status.ToString(),
                    Notes = "Bloqueio de segurança acionado: limite de 3 tentativas incorretas de código atingido.",
                    OccurredAtUtc = DateTimeOffset.UtcNow
                }, cancellationToken);

                throw new DomainRuleViolationException(
                    "DELIVERY_CHALLENGE_LOCKED",
                    "Código incorreto. Limite de 3 tentativas consecutivas atingido. O código foi bloqueado por segurança. Solicite a reemissão ao remetente.",
                    422);
            }

            await _fulfillmentRepo.UpdateChallengeAsync(challenge, cancellationToken);

            var remaining = challenge.MaxAttempts - challenge.FailedAttempts;
            await _fulfillmentRepo.AppendEventAsync(new DeliveryEvent
            {
                DeliveryOrderId = order.Id,
                EventType = DeliveryEventType.DELIVERY_CODE_FAILED,
                ActorId = actorId,
                ActorRole = actorRole.ToString(),
                PreviousStatus = order.Status.ToString(),
                NewStatus = order.Status.ToString(),
                Notes = $"Tentativa incorreta de código de entrega. Restam {remaining} tentativa(s).",
                OccurredAtUtc = DateTimeOffset.UtcNow
            }, cancellationToken);

            throw new DomainRuleViolationException(
                "DELIVERY_CODE_MISMATCH",
                $"Código de entrega incorreto. Restam {remaining} tentativa(s) antes do bloqueio definitivo.",
                400);
        }

        // CÓDIGO VÁLIDO E FOTO COMPROVADA: Transita para DELIVERED_VERIFIED (Gate G3)
        challenge.VerifiedAtUtc = DateTimeOffset.UtcNow;
        await _fulfillmentRepo.UpdateChallengeAsync(challenge, cancellationToken);

        var prev = order.Status.ToString();
        order.Status = DeliveryOrderStatus.DELIVERED_VERIFIED;
        order.DeliveredAtUtc = DateTimeOffset.UtcNow;
        order.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _fulfillmentRepo.UpdateOrderAsync(order, cancellationToken);

        if (_shipmentsRepo != null)
        {
            var shipment = await _shipmentsRepo.GetByIdAsync(order.ShipmentId, cancellationToken);
            if (shipment != null)
            {
                shipment.Status = ShipmentStatus.DELIVERED;
                await _shipmentsRepo.UpdateAsync(shipment, cancellationToken);
            }
        }

        if (_proposalsRepo != null)
        {
            var contract = await _proposalsRepo.GetContractByIdAsync(order.ContractId, cancellationToken);
            if (contract != null && contract.Status == ContractStatus.ACTIVE)
            {
                contract.Status = ContractStatus.COMPLETED;
                await _proposalsRepo.UpdateContractAsync(contract, cancellationToken);
            }
        }

        await _fulfillmentRepo.AppendEventAsync(new DeliveryEvent
        {
            DeliveryOrderId = order.Id,
            EventType = DeliveryEventType.DELIVERY_VERIFIED,
            ActorId = actorId,
            ActorRole = actorRole.ToString(),
            PreviousStatus = prev,
            NewStatus = order.Status.ToString(),
            Notes = $"Entrega verificada com sucesso via código de segurança / senha de 4 dígitos válido. Elegível para liberação de repasse (Gate G3). Observações: {request.RecipientSignatureOrNotes ?? "Nenhuma"}.",
            OccurredAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

        // Opção 2: Custódia na plataforma + Repasse Pix automático ao transportador na conclusão da entrega
        if (_payoutService is not null)
        {
            long grossCents = order.AmountCents;
            Guid proposalIdForSnap = Guid.Empty;
            if (grossCents <= 0 && _proposalsRepo is not null)
            {
                var c = await _proposalsRepo.GetContractByIdAsync(order.ContractId, cancellationToken);
                if (c is not null)
                {
                    grossCents = c.AmountCents;
                    proposalIdForSnap = c.ProposalId;
                }
            }

            long carrierNetCents = grossCents;
            if (grossCents > 0 && _financialPolicyProvider is not null)
            {
                var snapshot = await _financialPolicyProvider.GetSnapshotByContractIdAsync(order.ContractId, cancellationToken);
                if (snapshot is null)
                {
                    snapshot = await _financialPolicyProvider.CreateOrGetSnapshotForContractAsync(
                        contractId: order.ContractId,
                        proposalId: proposalIdForSnap,
                        shipmentId: order.ShipmentId,
                        carrierId: order.CarrierId,
                        senderId: order.SenderId,
                        amountCents: grossCents,
                        referenceDate: order.CreatedAtUtc,
                        cancellationToken: cancellationToken);
                }
                carrierNetCents = snapshot.CarrierNetCents;
            }

            if (carrierNetCents > 0)
            {
                var carrierUser = _userRepository is not null
                    ? await _userRepository.FindByIdAsync(order.CarrierId, cancellationToken)
                    : null;

                var payoutResult = await _payoutService.ExecutePixPayoutAsync(
                    new MercadoPagoPixPayoutRequest(
                        OrderId: order.Id,
                        ContractId: order.ContractId,
                        CarrierId: order.CarrierId,
                        CarrierName: order.CarrierName,
                        PixKeyType: carrierUser?.Profile.PixKeyType,
                        PixKey: carrierUser?.Profile.PixKey,
                        NetAmountCents: carrierNetCents,
                        IdempotencyKey: $"payout-{order.Id}"),
                    cancellationToken);

                order.PayoutStatus = payoutResult.Status;
                order.PayoutAmountCents = payoutResult.AmountCents;
                order.PayoutTransferId = payoutResult.ProviderTransferId;
                order.PayoutMessage = payoutResult.Message;
                order.PayoutProcessedAtUtc = DateTimeOffset.UtcNow;
                await _fulfillmentRepo.UpdateOrderAsync(order, cancellationToken);

                await _fulfillmentRepo.AppendEventAsync(new DeliveryEvent
                {
                    DeliveryOrderId = order.Id,
                    EventType = payoutResult.Status == "SUCCEEDED"
                        ? DeliveryEventType.PAYOUT_DISPATCHED
                        : DeliveryEventType.PAYOUT_PENDING,
                    ActorId = actorId,
                    ActorRole = actorRole.ToString(),
                    PreviousStatus = order.Status.ToString(),
                    NewStatus = order.Status.ToString(),
                    Notes = payoutResult.Message,
                    OccurredAtUtc = DateTimeOffset.UtcNow
                }, cancellationToken);

                if (_notificationsService != null)
                {
                    await _notificationsService.NotifyAsync(
                        order.CarrierId,
                        payoutResult.Status == "SUCCEEDED" ? "PAYOUT_DISPATCHED" : "PAYOUT_PENDING",
                        payoutResult.Status == "SUCCEEDED" ? "Repasse Pix enviado!" : "Repasse liberado (aguardando liquidação)",
                        payoutResult.Message,
                        "/minhas-atividades",
                        relatedShipmentId: order.ShipmentId,
                        relatedContractId: order.ContractId,
                        cancellationToken: cancellationToken);
                }
            }
        }

        if (_notificationsService != null)
        {
            await _notificationsService.NotifyAsync(
                order.SenderId,
                "DELIVERY_COMPLETED",
                "Entrega efetuada no destino!",
                $"{order.CarrierName} concluiu a entrega mediante confirmação do código de entrega de 4 dígitos.",
                "/minhas-atividades",
                relatedShipmentId: order.ShipmentId,
                relatedContractId: order.ContractId,
                cancellationToken: cancellationToken);
        }

        return MapOrderToResponse(order);
    }

    public async Task<DeliveryExceptionResponse> ReportDeliveryExceptionAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        ReportDeliveryExceptionRequest request,
        CancellationToken cancellationToken = default)
    {
        var order = await GetOrderOrThrowAsync(orderId, cancellationToken);
        EnsureIsParticipantOfOrder(actorId, actorRole, order);

        var exc = new DeliveryException
        {
            DeliveryOrderId = order.Id,
            ReasonCode = request.Reason,
            Justification = request.Justification,
            PhotoUrl = request.ProofPhotoBase64OrUrl,
            ReportedByUserId = actorId,
            Status = "PENDING_RESOLUTION",
            CreatedAtUtc = DateTimeOffset.UtcNow
        };

        await _fulfillmentRepo.CreateExceptionAsync(exc, cancellationToken);

        var prev = order.Status.ToString();
        order.Status = DeliveryOrderStatus.EXCEPTION_REPORTED;
        order.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _fulfillmentRepo.UpdateOrderAsync(order, cancellationToken);

        await _fulfillmentRepo.AppendEventAsync(new DeliveryEvent
        {
            DeliveryOrderId = order.Id,
            EventType = DeliveryEventType.EXCEPTION_REPORTED,
            ActorId = actorId,
            ActorRole = actorRole.ToString(),
            PreviousStatus = prev,
            NewStatus = order.Status.ToString(),
            Notes = $"Tentativa frustrada / Destinatário ausente registrado: {request.Reason}. Justificativa: {request.Justification}.",
            ApproximateLat = request.Latitude,
            ApproximateLng = request.Longitude,
            OccurredAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

        return new DeliveryExceptionResponse(
            Id: exc.Id,
            DeliveryOrderId: exc.DeliveryOrderId,
            ReasonCode: exc.ReasonCode.ToString(),
            Justification: exc.Justification,
            PhotoUrl: exc.PhotoUrl,
            Status: exc.Status,
            ResolutionAction: null,
            RescheduledFor: null,
            CreatedAtUtc: exc.CreatedAtUtc);
    }

    public async Task<DeliveryOrderResponse> RescheduleDeliveryAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        RescheduleDeliveryRequest request,
        CancellationToken cancellationToken = default)
    {
        var order = await GetOrderOrThrowAsync(orderId, cancellationToken);
        EnsureIsParticipantOfOrder(actorId, actorRole, order);

        var exc = await _fulfillmentRepo.GetActiveExceptionByOrderIdAsync(order.Id, cancellationToken);
        if (exc != null)
        {
            exc.ResolutionAction = DeliveryExceptionAction.RESCHEDULE_DELIVERY;
            exc.Status = "RESOLVED";
            exc.ResolvedAtUtc = DateTimeOffset.UtcNow;
            await _fulfillmentRepo.UpdateExceptionAsync(exc, cancellationToken);
        }

        var prev = order.Status.ToString();
        order.Status = DeliveryOrderStatus.RESCHEDULED;
        order.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _fulfillmentRepo.UpdateOrderAsync(order, cancellationToken);

        await _fulfillmentRepo.AppendEventAsync(new DeliveryEvent
        {
            DeliveryOrderId = order.Id,
            EventType = DeliveryEventType.DELIVERY_RESCHEDULED,
            ActorId = actorId,
            ActorRole = actorRole.ToString(),
            PreviousStatus = prev,
            NewStatus = order.Status.ToString(),
            Notes = $"Reagendamento de entrega formalizado para {request.RescheduledDate} ({request.RescheduledTimeWindow ?? "Horário comercial"}). Justificativa: {request.Justification}.",
            OccurredAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

        return MapOrderToResponse(order);
    }

    public async Task<DeliveryOrderResponse> InitiateReturnToSenderAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        InitiateReturnRequest request,
        CancellationToken cancellationToken = default)
    {
        var order = await GetOrderOrThrowAsync(orderId, cancellationToken);
        EnsureIsParticipantOfOrder(actorId, actorRole, order);

        var exc = await _fulfillmentRepo.GetActiveExceptionByOrderIdAsync(order.Id, cancellationToken);
        if (exc != null)
        {
            exc.ResolutionAction = DeliveryExceptionAction.RETURN_TO_SENDER;
            exc.Status = "RESOLVED";
            exc.ResolvedAtUtc = DateTimeOffset.UtcNow;
            await _fulfillmentRepo.UpdateExceptionAsync(exc, cancellationToken);
        }

        var prev = order.Status.ToString();
        order.Status = DeliveryOrderStatus.RETURN_TO_SENDER_INITIATED;
        order.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _fulfillmentRepo.UpdateOrderAsync(order, cancellationToken);

        await _fulfillmentRepo.AppendEventAsync(new DeliveryEvent
        {
            DeliveryOrderId = order.Id,
            EventType = DeliveryEventType.RETURN_INITIATED,
            ActorId = actorId,
            ActorRole = actorRole.ToString(),
            PreviousStatus = prev,
            NewStatus = order.Status.ToString(),
            Notes = $"Procedimento formal de devolução ao remetente iniciado. Justificativa: {request.Justification}.",
            OccurredAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

        return MapOrderToResponse(order);
    }

    public async Task<DeliveryTrackingResponse> GetTrackingAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        CancellationToken cancellationToken = default)
    {
        var order = await GetOrderOrThrowAsync(orderId, cancellationToken);
        EnsureIsParticipantOfOrder(actorId, actorRole, order);

        var events = await _fulfillmentRepo.ListEventsByOrderIdAsync(order.Id, cancellationToken);
        var proof = await _fulfillmentRepo.GetProofByOrderIdAsync(order.Id, cancellationToken);
        var exc = await _fulfillmentRepo.GetActiveExceptionByOrderIdAsync(order.Id, cancellationToken);

        var canCarrierConfirm = (actorRole == ActorRole.CARRIER || actorId == order.CarrierId) &&
                               (order.Status == DeliveryOrderStatus.IN_TRANSIT || order.Status == DeliveryOrderStatus.OUT_FOR_DELIVERY) &&
                               proof != null;

        return new DeliveryTrackingResponse(
            Order: MapOrderToResponse(order),
            Events: events.Select(e => new DeliveryEventResponse(
                Id: e.Id,
                DeliveryOrderId: e.DeliveryOrderId,
                EventType: e.EventType.ToString(),
                ActorId: e.ActorId,
                ActorRole: e.ActorRole,
                PreviousStatus: e.PreviousStatus,
                NewStatus: e.NewStatus,
                Notes: e.Notes,
                OccurredAtUtc: e.OccurredAtUtc)).ToList(),
            Proof: proof != null ? new DeliveryProofResponse(
                Id: proof.Id,
                DeliveryOrderId: proof.DeliveryOrderId,
                FileUrl: proof.FileUrl,
                Sha256Hash: proof.Sha256Hash,
                MimeType: proof.MimeType,
                FileSizeBytes: proof.FileSizeBytes,
                UploadedAtUtc: proof.UploadedAtUtc) : null,
            ActiveException: exc != null ? new DeliveryExceptionResponse(
                Id: exc.Id,
                DeliveryOrderId: exc.DeliveryOrderId,
                ReasonCode: exc.ReasonCode.ToString(),
                Justification: exc.Justification,
                PhotoUrl: exc.PhotoUrl,
                Status: exc.Status,
                ResolutionAction: exc.ResolutionAction?.ToString(),
                RescheduledFor: exc.RescheduledFor,
                CreatedAtUtc: exc.CreatedAtUtc) : null,
            CanCarrierConfirm: canCarrierConfirm,
            HasProofPhoto: proof != null);
    }

    public async Task<IReadOnlyList<DeliveryOrderResponse>> ListOrdersForUserAsync(
        Guid actorId,
        ActorRole actorRole,
        CancellationToken cancellationToken = default)
    {
        var cutoff = DateTimeOffset.UtcNow.AddHours(-24);
        var carrierOrders = await _fulfillmentRepo.ListOrdersByCarrierIdAsync(actorId, cancellationToken);
        var senderOrders = await _fulfillmentRepo.ListOrdersBySenderIdAsync(actorId, cancellationToken);
        var merged = carrierOrders
            .Concat(senderOrders)
            .GroupBy(o => o.Id)
            .Select(g => g.First())
            .Where(o =>
            {
                bool isTerminal = o.Status == DeliveryOrderStatus.DELIVERED_VERIFIED || o.Status == DeliveryOrderStatus.CLOSED;
                if (!isTerminal) return true;

                // Para o transportador, viagens encerradas/canceladas são removidas imediatamente das telas da plataforma
                if (o.CarrierId == actorId && o.SenderId != actorId) return false;

                // Para o remetente, mantém apenas se for DELIVERED_VERIFIED ainda sem avaliação (para disparo do pop-up de estrelas) dentro de 24h
                if (o.Status == DeliveryOrderStatus.DELIVERED_VERIFIED && o.CarrierRatingStars is null)
                {
                    return (o.DeliveredAtUtc ?? o.UpdatedAtUtc) > cutoff;
                }

                return false;
            })
            .OrderByDescending(o => o.CreatedAtUtc)
            .ToList();

        return merged.Select(MapOrderToResponse).ToList();
    }

    public async Task<DeliveryOrderResponse> GetOrderAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        CancellationToken cancellationToken = default)
    {
        var order = await GetOrderOrThrowAsync(orderId, cancellationToken);
        EnsureIsParticipantOfOrder(actorId, actorRole, order);
        return MapOrderToResponse(order);
    }

    public async Task<DeliveryOrderResponse> GetOrderByShipmentIdAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid shipmentId,
        CancellationToken cancellationToken = default)
    {
        var order = await _fulfillmentRepo.GetOrderByShipmentIdAsync(shipmentId, cancellationToken);
        if (order == null)
        {
            throw new DomainRuleViolationException(
                "DELIVERY_ORDER_NOT_FOUND",
                $"Nenhuma ordem de entrega vinculada à encomenda '{shipmentId}'.",
                404);
        }
        EnsureIsParticipantOfOrder(actorId, actorRole, order);
        return MapOrderToResponse(order);
    }

    public async Task<IReadOnlyList<PostDeliverySuggestionResponse>> GetPostDeliverySuggestionsAsync(
        double latitude,
        double longitude,
        int maxRadiusKm = 2,
        CancellationToken cancellationToken = default)
    {
        if (_shipmentsRepo == null)
        {
            return [];
        }

        var allShipments = await _shipmentsRepo.ListActiveAsync(null, null, cancellationToken);
        var results = new List<PostDeliverySuggestionResponse>();

        foreach (var s in allShipments.Where(x => x.Status == ShipmentStatus.PUBLISHED))
        {
            var origLat = s.OriginAddress.ExactLatitude ?? s.OriginAddress.ApproximateLatitude;
            var origLng = s.OriginAddress.ExactLongitude ?? s.OriginAddress.ApproximateLongitude;

            if (origLat.HasValue && origLng.HasValue)
            {
                var distanceKm = HaversineDistanceKm(latitude, longitude, origLat.Value, origLng.Value);
                if (distanceKm <= maxRadiusKm)
                {
                    results.Add(new PostDeliverySuggestionResponse(
                        ShipmentId: s.Id,
                        Title: s.Title,
                        OriginCity: s.OriginAddress.City,
                        DestinationCity: s.DestinationAddress.City,
                        WeightGrams: s.WeightGrams,
                        SuggestedPriceCents: s.SuggestedPriceCents,
                        DistanceKm: Math.Round(distanceKm, 2)));
                }
            }
        }

        return results.OrderBy(r => r.DistanceKm).Take(5).ToList();
    }

    private async Task<DeliveryOrder> GetOrderOrThrowAsync(Guid orderId, CancellationToken cancellationToken)
    {
        var order = await _fulfillmentRepo.GetOrderByIdAsync(orderId, cancellationToken);
        if (order == null)
        {
            throw new DomainRuleViolationException(
                "DELIVERY_ORDER_NOT_FOUND",
                $"Ordem de entrega '{orderId}' não foi encontrada.",
                404);
        }
        return order;
    }

    private static void EnsureIsCarrierOfOrder(Guid actorId, ActorRole actorRole, DeliveryOrder order)
    {
        if (actorRole == ActorRole.ADMIN || actorRole == ActorRole.SYSTEM) return;
        if (order.CarrierId != actorId)
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN_NOT_PARTY",
                "Apenas o transportador vinculado à ordem de entrega pode executar esta operação.",
                403);
        }
    }

    private static void EnsureIsParticipantOfOrder(Guid actorId, ActorRole actorRole, DeliveryOrder order)
    {
        if (actorRole == ActorRole.ADMIN || actorRole == ActorRole.SYSTEM) return;
        if (order.CarrierId != actorId && order.SenderId != actorId)
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN_NOT_PARTY",
                "Apenas os participantes vinculados à entrega possuem autorização para esta operação.",
                403);
        }
    }

    private async Task<DeliveryChallenge> GenerateChallengeInternalAsync(Guid orderId, CancellationToken cancellationToken)
    {
        var codeNum = RandomNumberGenerator.GetInt32(1000, 10000);
        var plainCode = codeNum.ToString(CultureInfo.InvariantCulture);
        var (hash, salt) = InMemoryFulfillmentRepository.ComputeCodeHash(plainCode);

        var challenge = new DeliveryChallenge
        {
            DeliveryOrderId = orderId,
            CodeHash = hash,
            CodeSalt = salt,
            FailedAttempts = 0,
            MaxAttempts = 3,
            IsLocked = false,
            ExpiresAtUtc = DateTimeOffset.UtcNow.AddHours(24),
            IsActive = true,
            PlainCode = plainCode,
            CreatedAtUtc = DateTimeOffset.UtcNow
        };

        return await _fulfillmentRepo.CreateChallengeAsync(challenge, cancellationToken);
    }

    public async Task<DeliveryOrderResponse> CreateOrderForContractAsync(
        Contract contract,
        Shipment shipment,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(contract);
        ArgumentNullException.ThrowIfNull(shipment);

        var existing = await _fulfillmentRepo.GetOrderByContractIdAsync(contract.Id, cancellationToken)
                    ?? await _fulfillmentRepo.GetOrderByShipmentIdAsync(shipment.Id, cancellationToken);
        if (existing != null)
        {
            return MapOrderToResponse(existing);
        }

        var pickupNum = RandomNumberGenerator.GetInt32(1000, 10000);
        var pickupPlain = pickupNum.ToString(CultureInfo.InvariantCulture);
        var (pickupHash, pickupSalt) = InMemoryFulfillmentRepository.ComputeCodeHash(pickupPlain);

        string deliveryPlain;
        do
        {
            deliveryPlain = RandomNumberGenerator.GetInt32(1000, 10000).ToString(CultureInfo.InvariantCulture);
        } while (deliveryPlain == pickupPlain);

        var (deliveryHash, deliverySalt) = InMemoryFulfillmentRepository.ComputeCodeHash(deliveryPlain);

        var originFull = !string.IsNullOrWhiteSpace(shipment.OriginAddress.FormattedAddress)
            ? shipment.OriginAddress.FormattedAddress
            : $"{shipment.OriginAddress.StreetAndNumber}, {shipment.OriginAddress.Neighborhood}, {shipment.OriginAddress.City} - {shipment.OriginAddress.StateUf}";
        var destFull = !string.IsNullOrWhiteSpace(shipment.DestinationAddress.FormattedAddress)
            ? shipment.DestinationAddress.FormattedAddress
            : $"{shipment.DestinationAddress.StreetAndNumber}, {shipment.DestinationAddress.Neighborhood}, {shipment.DestinationAddress.City} - {shipment.DestinationAddress.StateUf}";

        var orderStatus = shipment.Status switch
        {
            ShipmentStatus.IN_TRANSIT => DeliveryOrderStatus.IN_TRANSIT,
            ShipmentStatus.DELIVERED or ShipmentStatus.CLOSED => DeliveryOrderStatus.DELIVERED_VERIFIED,
            _ => DeliveryOrderStatus.AWAITING_PICKUP
        };

        var order = new DeliveryOrder
        {
            Id = Guid.NewGuid(),
            ContractId = contract.Id,
            ShipmentId = shipment.Id,
            TripId = contract.TripId,
            SenderId = contract.SenderId,
            SenderName = contract.SenderName,
            CarrierId = contract.CarrierId,
            CarrierName = contract.CarrierName,
            RecipientName = !string.IsNullOrWhiteSpace(shipment.Title) ? $"Destinatário ({shipment.DestinationAddress.City})" : "Destinatário Topic Log",
            RecipientPhone = null,
            RecipientDocumentMasked = null,
            Status = orderStatus,
            PickupConfirmed = orderStatus != DeliveryOrderStatus.AWAITING_PICKUP,
            PickupCodeHash = pickupHash,
            PickupCodeSalt = pickupSalt,
            PickupPlainCodeProtected = pickupPlain,
            DeliveryPlainCodeProtected = deliveryPlain,
            OriginAddressSummary = originFull,
            DestinationAddressSummary = destFull,
            OriginLatitude = shipment.OriginAddress.ExactLatitude ?? shipment.OriginAddress.ApproximateLatitude,
            OriginLongitude = shipment.OriginAddress.ExactLongitude ?? shipment.OriginAddress.ApproximateLongitude,
            DestinationLatitude = shipment.DestinationAddress.ExactLatitude ?? shipment.DestinationAddress.ApproximateLatitude,
            DestinationLongitude = shipment.DestinationAddress.ExactLongitude ?? shipment.DestinationAddress.ApproximateLongitude,
            AmountCents = contract.AmountCents,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };

        await _fulfillmentRepo.CreateOrderAsync(order, cancellationToken);

        var challenge = new DeliveryChallenge
        {
            DeliveryOrderId = order.Id,
            CodeHash = deliveryHash,
            CodeSalt = deliverySalt,
            FailedAttempts = 0,
            MaxAttempts = 3,
            IsLocked = false,
            ExpiresAtUtc = DateTimeOffset.UtcNow.AddDays(14),
            IsActive = true,
            PlainCode = deliveryPlain,
            CreatedAtUtc = DateTimeOffset.UtcNow
        };
        await _fulfillmentRepo.CreateChallengeAsync(challenge, cancellationToken);

        await _fulfillmentRepo.AppendEventAsync(new DeliveryEvent
        {
            DeliveryOrderId = order.Id,
            EventType = DeliveryEventType.PICKUP_CHECKIN,
            ActorId = contract.SenderId,
            ActorRole = "SYSTEM",
            PreviousStatus = "NONE",
            NewStatus = order.Status.ToString(),
            Notes = "Ordem de entrega gerada após pagamento Pix confirmado. Códigos exclusivos de coleta e entrega disponibilizados ao remetente.",
            OccurredAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

        return MapOrderToResponse(order);
    }

    public async Task<OrderCodesResponse> GetOrderCodesAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        CancellationToken cancellationToken = default)
    {
        var order = await GetOrderOrThrowAsync(orderId, cancellationToken);

        if (actorId != order.SenderId && actorRole != ActorRole.ADMIN && actorRole != ActorRole.SYSTEM)
        {
            throw new DomainRuleViolationException(
                "FORBIDDEN_CARRIER_CANNOT_VIEW_CODES",
                "Apenas o remetente pode visualizar os códigos secretos de coleta e entrega.",
                403);
        }

        var challenge = await _fulfillmentRepo.GetActiveChallengeByOrderIdAsync(order.Id, cancellationToken)
            ?? await GenerateChallengeInternalAsync(order.Id, cancellationToken);

        var deliveryPlain = order.DeliveryPlainCodeProtected ?? challenge.PlainCode ?? "4826";
        if (string.IsNullOrWhiteSpace(order.DeliveryPlainCodeProtected))
        {
            order.DeliveryPlainCodeProtected = deliveryPlain;
            await _fulfillmentRepo.UpdateOrderAsync(order, cancellationToken);
        }

        if (string.IsNullOrWhiteSpace(order.PickupPlainCodeProtected))
        {
            var pickupNum = RandomNumberGenerator.GetInt32(1000, 10000).ToString(CultureInfo.InvariantCulture);
            var (pHash, pSalt) = InMemoryFulfillmentRepository.ComputeCodeHash(pickupNum);
            order.PickupCodeHash = pHash;
            order.PickupCodeSalt = pSalt;
            order.PickupPlainCodeProtected = pickupNum;
            await _fulfillmentRepo.UpdateOrderAsync(order, cancellationToken);
        }

        return new OrderCodesResponse(
            OrderId: order.Id,
            PickupCode: order.PickupPlainCodeProtected,
            PickupConfirmed: order.PickupConfirmed || order.Status != DeliveryOrderStatus.AWAITING_PICKUP,
            DeliveryCode: deliveryPlain,
            DeliveryVerified: order.Status == DeliveryOrderStatus.DELIVERED_VERIFIED,
            RemainingAttempts: Math.Max(0, challenge.MaxAttempts - challenge.FailedAttempts),
            ExpiresAtUtc: challenge.ExpiresAtUtc,
            IsLocked: challenge.IsLocked,
            Disclaimer: "Informe o código de coleta ao transportador no momento da entrega da encomenda. Envie o código de entrega apenas para quem vai receber no destino.");
    }

    public async Task<DeliveryOrderResponse> UpdateCarrierLocationAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        UpdateDeliveryLocationRequest request,
        CancellationToken cancellationToken = default)
    {
        var order = await GetOrderOrThrowAsync(orderId, cancellationToken);
        EnsureIsCarrierOfOrder(actorId, actorRole, order);

        order.CurrentLatitude = request.Latitude;
        order.CurrentLongitude = request.Longitude;
        order.LastLocationUpdatedAtUtc = DateTimeOffset.UtcNow;
        order.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _fulfillmentRepo.UpdateOrderAsync(order, cancellationToken);

        return MapOrderToResponse(order);
    }

    public async Task<DeliveryOrderResponse> RateCarrierAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid orderId,
        RateCarrierRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.Stars < 1 || request.Stars > 5)
        {
            throw new DomainRuleViolationException(
                "INVALID_RATING_STARS",
                "A avaliação deve conter entre 1 e 5 estrelas.",
                400);
        }

        var order = await GetOrderOrThrowAsync(orderId, cancellationToken);
        if (order.SenderId != actorId && actorRole != ActorRole.ADMIN)
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN",
                "Apenas o remetente da encomenda pode avaliar o transportador.",
                403);
        }

        if (order.Status != DeliveryOrderStatus.DELIVERED_VERIFIED)
        {
            throw new DomainRuleViolationException(
                "DELIVERY_NOT_COMPLETED",
                "A avaliação do transportador só é permitida após a entrega confirmada.",
                409);
        }

        if (order.CarrierRatingStars.HasValue)
        {
            throw new DomainRuleViolationException(
                "CARRIER_ALREADY_RATED",
                "Você já avaliou o transportador desta entrega.",
                409);
        }

        var now = DateTimeOffset.UtcNow;
        order.CarrierRatingStars = request.Stars;
        order.CarrierRatedAtUtc = now;
        order.UpdatedAtUtc = now;
        await _fulfillmentRepo.UpdateOrderAsync(order, cancellationToken);

        if (_userRepository is not null)
        {
            var found = await _userRepository.FindByIdAsync(order.CarrierId, cancellationToken);
            if (found.HasValue)
            {
                var (carrierUser, carrierProfile) = found.Value;
                var newAvg = carrierProfile.RatingCount <= 0
                    ? request.Stars
                    : Math.Round(
                        ((carrierProfile.RatingAvg * carrierProfile.RatingCount) + request.Stars) / (carrierProfile.RatingCount + 1),
                        2,
                        MidpointRounding.AwayFromZero);

                carrierProfile.RatingAvg = newAvg;
                carrierProfile.RatingCount += 1;
                await _userRepository.UpdateAsync(carrierUser, carrierProfile, cancellationToken);
            }
        }

        return MapOrderToResponse(order);
    }

    private static DeliveryOrderResponse MapOrderToResponse(DeliveryOrder o)
    {
        return new DeliveryOrderResponse(
            Id: o.Id,
            ContractId: o.ContractId,
            ShipmentId: o.ShipmentId,
            TripId: o.TripId,
            SenderId: o.SenderId,
            SenderName: o.SenderName,
            CarrierId: o.CarrierId,
            CarrierName: o.CarrierName,
            RecipientName: o.RecipientName,
            RecipientPhone: o.RecipientPhone,
            RecipientDocumentMasked: o.RecipientDocumentMasked,
            Status: o.Status.ToString(),
            PickedUpAtUtc: o.PickedUpAtUtc,
            DeliveredAtUtc: o.DeliveredAtUtc,
            CreatedAtUtc: o.CreatedAtUtc,
            PickupConfirmed: o.PickupConfirmed,
            PickupCodeRequired: !string.IsNullOrWhiteSpace(o.PickupCodeHash),
            OriginAddressSummary: o.OriginAddressSummary,
            DestinationAddressSummary: o.DestinationAddressSummary,
            OriginLatitude: o.OriginLatitude,
            OriginLongitude: o.OriginLongitude,
            DestinationLatitude: o.DestinationLatitude,
            DestinationLongitude: o.DestinationLongitude,
            CurrentLatitude: o.CurrentLatitude,
            CurrentLongitude: o.CurrentLongitude,
            LastLocationUpdatedAtUtc: o.LastLocationUpdatedAtUtc,
            AmountCents: o.AmountCents,
            CarrierRatingStars: o.CarrierRatingStars,
            CarrierRatedAtUtc: o.CarrierRatedAtUtc,
            PayoutStatus: o.PayoutStatus,
            PayoutAmountCents: o.PayoutAmountCents,
            PayoutTransferId: o.PayoutTransferId,
            PayoutMessage: o.PayoutMessage,
            PayoutProcessedAtUtc: o.PayoutProcessedAtUtc);
    }

    private static double HaversineDistanceKm(double lat1, double lon1, double lat2, double lon2)
    {
        const double earthRadiusKm = 6371.0;
        var dLat = Math.PI * (lat2 - lat1) / 180.0;
        var dLon = Math.PI * (lon2 - lon1) / 180.0;
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                Math.Cos(Math.PI * lat1 / 180.0) * Math.Cos(Math.PI * lat2 / 180.0) *
                Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        return earthRadiusKm * c;
    }
}
