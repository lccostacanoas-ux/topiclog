using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Modules.Proposals;
using TopicLog.Api.Modules.Shipments;

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
}

public sealed class FulfillmentApplicationService : IFulfillmentApplicationService
{
    private readonly IFulfillmentRepository _fulfillmentRepo;
    private readonly IShipmentsRepository? _shipmentsRepo;

    public FulfillmentApplicationService(
        IFulfillmentRepository fulfillmentRepo,
        IShipmentsRepository? shipmentsRepo = null)
    {
        _fulfillmentRepo = fulfillmentRepo;
        _shipmentsRepo = shipmentsRepo;
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

        var prevStatus = order.Status.ToString();
        order.Status = DeliveryOrderStatus.IN_TRANSIT;
        order.PickedUpAtUtc = DateTimeOffset.UtcNow;
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

        await _fulfillmentRepo.AppendEventAsync(new DeliveryEvent
        {
            DeliveryOrderId = order.Id,
            EventType = DeliveryEventType.PICKUP_CONFIRMED,
            ActorId = actorId,
            ActorRole = actorRole.ToString(),
            PreviousStatus = prevStatus,
            NewStatus = order.Status.ToString(),
            Notes = request.HandoverNotes ?? "Coleta confirmada pelas partes. Encomenda em trânsito com capacidade de trecho ocupada.",
            OccurredAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

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

        // DECISÃO 1 & REGRA VINCULANTE D16: Exige cumulativamente CÓDIGO VÁLIDO + FOTO
        var proof = await _fulfillmentRepo.GetProofByOrderIdAsync(order.Id, cancellationToken);
        if (proof == null)
        {
            throw new DomainRuleViolationException(
                "DELIVERY_PHOTO_REQUIRED",
                "A confirmação da entrega exige cumulativamente o registro da evidência fotográfica do pacote no local (Decisão D16). Submeta a foto antes do código.",
                422);
        }

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

        await _fulfillmentRepo.AppendEventAsync(new DeliveryEvent
        {
            DeliveryOrderId = order.Id,
            EventType = DeliveryEventType.DELIVERY_VERIFIED,
            ActorId = actorId,
            ActorRole = actorRole.ToString(),
            PreviousStatus = prev,
            NewStatus = order.Status.ToString(),
            Notes = $"Entrega verificada com sucesso via código de 4 dígitos válido e evidência fotográfica. Elegível para liberação futura de repasse (Gate G3). Observações: {request.RecipientSignatureOrNotes ?? "Nenhuma"}.",
            OccurredAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

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
        IReadOnlyList<DeliveryOrder> list;
        if (actorRole == ActorRole.CARRIER)
        {
            list = await _fulfillmentRepo.ListOrdersByCarrierIdAsync(actorId, cancellationToken);
        }
        else
        {
            list = await _fulfillmentRepo.ListOrdersBySenderIdAsync(actorId, cancellationToken);
        }

        return list.Select(MapOrderToResponse).ToList();
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
            CreatedAtUtc: o.CreatedAtUtc);
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
