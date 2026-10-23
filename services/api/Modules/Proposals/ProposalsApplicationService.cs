using Microsoft.Extensions.Options;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Common.Options;
using TopicLog.Api.Modules.Finance;
using TopicLog.Api.Modules.Shipments;
using TopicLog.Api.Modules.Trips;

namespace TopicLog.Api.Modules.Proposals;

public interface IProposalsApplicationService
{
    Task<ProposalResponse> CreateProposalAsync(
        Guid carrierId,
        string carrierName,
        CreateProposalRequest request,
        CancellationToken cancellationToken = default);

    Task<ProposalResponse> CounterProposalAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid proposalId,
        CounterProposalRequest request,
        CancellationToken cancellationToken = default);

    Task<ContractResponse> AcceptProposalAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid proposalId,
        int expectedVersion,
        CancellationToken cancellationToken = default);

    Task<ProposalResponse> RejectProposalAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid proposalId,
        string? reason,
        CancellationToken cancellationToken = default);

    Task<ProposalResponse> CancelProposalAsync(
        Guid actorId,
        Guid proposalId,
        string? reason,
        CancellationToken cancellationToken = default);

    Task<ContractResponse> CancelContractPrePickupAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid contractId,
        CancelContractRequest request,
        CancellationToken cancellationToken = default);

    Task<PriorityOfferResponse> RespondPriorityOfferAsync(
        Guid carrierId,
        Guid shipmentId,
        bool accept,
        CancellationToken cancellationToken = default);

    Task<ProposalResponse?> GetProposalByIdAsync(Guid id, Guid? viewerUserId = null, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ProposalResponse>> ListProposalsByShipmentIdAsync(Guid shipmentId, Guid? viewerUserId = null, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ProposalResponse>> ListProposalsByCarrierIdAsync(Guid carrierId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ProposalResponse>> ListProposalsForSenderAsync(Guid senderId, CancellationToken cancellationToken = default);

    Task<ContractResponse?> GetContractByIdAsync(Guid contractId, Guid? viewerUserId = null, CancellationToken cancellationToken = default);
    Task<ContractResponse?> GetContractByShipmentIdAsync(Guid shipmentId, Guid? viewerUserId = null, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ContractResponse>> ListContractsByCarrierIdAsync(Guid carrierId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ProposalEventResponse>> GetProposalEventsAsync(Guid proposalId, Guid? viewerUserId = null, CancellationToken cancellationToken = default);
    Task<PriorityOfferResponse?> GetActivePriorityOfferAsync(Guid shipmentId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<PriorityOfferResponse>> ListActivePriorityOffersForCarrierAsync(Guid carrierId, CancellationToken cancellationToken = default);
}

public sealed class ProposalsApplicationService : IProposalsApplicationService
{
    private readonly IProposalsRepository _proposalsRepository;
    private readonly IShipmentsRepository _shipmentsRepository;
    private readonly ITripsRepository _tripsRepository;
    private readonly TopicLogOptions _options;
    private readonly IFinancialPolicyProvider? _financialPolicyProvider;

    public ProposalsApplicationService(
        IProposalsRepository proposalsRepository,
        IShipmentsRepository shipmentsRepository,
        ITripsRepository tripsRepository,
        IOptions<TopicLogOptions> options,
        IFinancialPolicyProvider? financialPolicyProvider = null)
    {
        _proposalsRepository = proposalsRepository ?? throw new ArgumentNullException(nameof(proposalsRepository));
        _shipmentsRepository = shipmentsRepository ?? throw new ArgumentNullException(nameof(shipmentsRepository));
        _tripsRepository = tripsRepository ?? throw new ArgumentNullException(nameof(tripsRepository));
        _options = options?.Value ?? throw new ArgumentNullException(nameof(options));
        _financialPolicyProvider = financialPolicyProvider;
    }

    public async Task<ProposalResponse> CreateProposalAsync(
        Guid carrierId,
        string carrierName,
        CreateProposalRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.AmountCents <= 0)
        {
            throw new DomainRuleViolationException(
                "INVALID_AMOUNT",
                "O valor da proposta em centavos deve ser estritamente positivo.");
        }

        var shipment = await _shipmentsRepository.GetByIdAsync(request.ShipmentId, cancellationToken)
            ?? throw new DomainRuleViolationException("SHIPMENT_NOT_FOUND", "A encomenda informada não foi encontrada.", 404);

        if (shipment.Status != ShipmentStatus.PUBLISHED && shipment.Status != ShipmentStatus.NEGOTIATING)
        {
            throw new DomainRuleViolationException(
                "SHIPMENT_NOT_AVAILABLE",
                $"A encomenda não está disponível para receber propostas. Status atual: {shipment.Status}.");
        }

        if (shipment.SenderId == carrierId)
        {
            throw new DomainRuleViolationException(
                "SELF_CONTRACTING_FORBIDDEN",
                "Violação D05/D08: O remetente não pode enviar proposta para sua própria encomenda.", 403);
        }

        // Regra 2: Verificação de janela de prioridade ativa de 10 min
        var activePriorityOffer = await _proposalsRepository.GetActivePriorityOfferForShipmentAsync(shipment.Id, cancellationToken);
        if (activePriorityOffer is not null && activePriorityOffer.EligibleCarrierId != carrierId)
        {
            var remainingSec = (int)Math.Max(0, (activePriorityOffer.ExpiresAtUtc - DateTimeOffset.UtcNow).TotalSeconds);
            throw new DomainRuleViolationException(
                "PRIORITY_OFFER_ACTIVE",
                $"Esta encomenda possui uma janela de oferta prioritária exclusiva (Regra 2) para o transportador da primeira encomenda. Restam {remainingSec} segundos.",
                409);
        }

        Trip? trip = null;
        if (request.TripId.HasValue)
        {
            trip = await _tripsRepository.GetByIdAsync(request.TripId.Value, cancellationToken);
        }

        // Cálculo de expiração
        DateTimeOffset expiresAtUtc;
        if (request.CustomExpirationHours.HasValue && request.CustomExpirationHours.Value > 0)
        {
            int hours = Math.Min(request.CustomExpirationHours.Value, 24);
            expiresAtUtc = DateTimeOffset.UtcNow.AddHours(hours);
        }
        else if (trip is not null && trip.DepartureDate.Contains("Hoje", StringComparison.OrdinalIgnoreCase))
        {
            expiresAtUtc = DateTimeOffset.UtcNow.AddHours(2);
        }
        else
        {
            expiresAtUtc = DateTimeOffset.UtcNow.AddHours(24);
        }

        var proposal = new Proposal
        {
            Id = Guid.NewGuid(),
            ShipmentId = shipment.Id,
            TripId = request.TripId,
            CarrierId = carrierId,
            CarrierName = carrierName,
            SenderId = shipment.SenderId,
            SenderName = shipment.SenderName,
            AmountCents = request.AmountCents,
            Currency = "BRL",
            Status = ProposalStatus.PENDING,
            EstimatedPickup = request.EstimatedPickup,
            EstimatedDelivery = request.EstimatedDelivery,
            Notes = request.Notes,
            CounterCount = 0,
            ExpiresAtUtc = expiresAtUtc,
            Version = 1,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };

        await _proposalsRepository.CreateProposalAsync(proposal, cancellationToken);

        await _proposalsRepository.AddEventAsync(new ProposalEvent(
            Id: Guid.NewGuid(),
            ProposalId: proposal.Id,
            ShipmentId: proposal.ShipmentId,
            ActorId: carrierId,
            ActorRole: ActorRole.CARRIER,
            EventType: ProposalEventType.PROPOSAL_CREATED,
            PreviousStatus: string.Empty,
            NewStatus: ProposalStatus.PENDING.ToString(),
            AmountCents: proposal.AmountCents,
            Justification: "Proposta criada pelo transportador",
            OccurredAtUtc: DateTimeOffset.UtcNow), cancellationToken);

        if (shipment.Status == ShipmentStatus.PUBLISHED)
        {
            shipment.Status = ShipmentStatus.NEGOTIATING;
            await _shipmentsRepository.UpdateAsync(shipment, cancellationToken);
        }

        return MapToProposalResponse(proposal);
    }

    public async Task<ProposalResponse> CounterProposalAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid proposalId,
        CounterProposalRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.AmountCents <= 0)
        {
            throw new DomainRuleViolationException(
                "INVALID_AMOUNT",
                "O valor da contraproposta em centavos deve ser estritamente positivo.");
        }

        var proposal = await _proposalsRepository.GetProposalByIdAsync(proposalId, cancellationToken)
            ?? throw new DomainRuleViolationException("PROPOSAL_NOT_FOUND", "A proposta informada não foi encontrada.", 404);

        // 1. Autorização: Apenas transportador ou remetente da proposta podem contrapropor
        if (actorId != proposal.CarrierId && actorId != proposal.SenderId)
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN_NOT_PARTY",
                "Apenas o transportador ou o remetente vinculados à proposta podem enviar contrapropostas.",
                403);
        }

        // 2. Alternância de turnos com base no histórico de eventos
        var events = await _proposalsRepository.GetEventsByProposalIdAsync(proposalId, cancellationToken);
        var lastNegotiationEvent = events.LastOrDefault(e =>
            e.EventType == ProposalEventType.PROPOSAL_CREATED ||
            e.EventType == ProposalEventType.COUNTER_PROPOSAL_SENT);

        if (lastNegotiationEvent is not null && lastNegotiationEvent.ActorId == actorId)
        {
            throw new DomainRuleViolationException(
                "COUNTER_TURN_VIOLATION",
                "Não é o seu turno para contrapropor. Aguarde a manifestação da outra parte antes de enviar nova contraproposta.",
                422);
        }

        if (proposal.Status != ProposalStatus.PENDING && proposal.Status != ProposalStatus.COUNTERED)
        {
            throw new DomainRuleViolationException(
                "INVALID_PROPOSAL_STATUS",
                $"A proposta não pode receber contraproposta com status {proposal.Status}.");
        }

        if (proposal.ExpiresAtUtc <= DateTimeOffset.UtcNow)
        {
            proposal.Status = ProposalStatus.EXPIRED;
            await _proposalsRepository.UpdateProposalAsync(proposal, cancellationToken);
            throw new DomainRuleViolationException("PROPOSAL_EXPIRED", "A proposta expirou e não pode receber contraproposta.", 410);
        }

        long previousAmount = proposal.AmountCents;
        proposal.AmountCents = request.AmountCents;
        proposal.EstimatedPickup = request.EstimatedPickup ?? proposal.EstimatedPickup;
        proposal.EstimatedDelivery = request.EstimatedDelivery ?? proposal.EstimatedDelivery;
        proposal.Notes = request.Notes ?? proposal.Notes;
        proposal.CounterCount++;
        proposal.Status = ProposalStatus.COUNTERED;
        proposal.Version++;
        proposal.UpdatedAtUtc = DateTimeOffset.UtcNow;

        int expHours = request.CustomExpirationHours.GetValueOrDefault(24);
        proposal.ExpiresAtUtc = DateTimeOffset.UtcNow.AddHours(Math.Clamp(expHours, 1, 24));

        await _proposalsRepository.UpdateProposalAsync(proposal, cancellationToken);

        await _proposalsRepository.AddEventAsync(new ProposalEvent(
            Id: Guid.NewGuid(),
            ProposalId: proposal.Id,
            ShipmentId: proposal.ShipmentId,
            ActorId: actorId,
            ActorRole: actorRole,
            EventType: ProposalEventType.COUNTER_PROPOSAL_SENT,
            PreviousStatus: ProposalStatus.PENDING.ToString(),
            NewStatus: ProposalStatus.COUNTERED.ToString(),
            AmountCents: proposal.AmountCents,
            Justification: $"Contraproposta enviada: de R$ {previousAmount / 100.0:N2} para R$ {proposal.AmountCents / 100.0:N2}",
            OccurredAtUtc: DateTimeOffset.UtcNow), cancellationToken);

        return MapToProposalResponse(proposal);
    }

    public async Task<ContractResponse> AcceptProposalAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid proposalId,
        int expectedVersion,
        CancellationToken cancellationToken = default)
    {
        var targetProposal = await _proposalsRepository.GetProposalByIdAsync(proposalId, cancellationToken)
            ?? throw new DomainRuleViolationException("PROPOSAL_NOT_FOUND", "A proposta informada não foi encontrada.", 404);

        var shipment = await _shipmentsRepository.GetByIdAsync(targetProposal.ShipmentId, cancellationToken)
            ?? throw new DomainRuleViolationException("SHIPMENT_NOT_FOUND", "A encomenda vinculada não foi encontrada.", 404);

        Trip? trip = null;
        if (targetProposal.TripId.HasValue)
        {
            trip = await _tripsRepository.GetByIdAsync(targetProposal.TripId.Value, cancellationToken);
        }

        // 1. Autorização: Apenas transportador ou remetente vinculados à negociação podem aceitar
        if (actorId != shipment.SenderId && actorId != targetProposal.CarrierId)
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN_NOT_PARTY",
                "Apenas os participantes da negociação (remetente ou transportador) podem aceitar a proposta.",
                403);
        }

        // 2. Regra de turno no aceite: ninguém pode aceitar sua própria oferta/contraproposta
        if (targetProposal.Status == ProposalStatus.PENDING && actorId == targetProposal.CarrierId)
        {
            throw new DomainRuleViolationException(
                "SELF_ACCEPTANCE_FORBIDDEN",
                "O transportador não pode aceitar sua própria proposta original. Aguarde a manifestação do remetente.",
                422);
        }

        var propEvents = await _proposalsRepository.GetEventsByProposalIdAsync(proposalId, cancellationToken);
        var lastCounter = propEvents.LastOrDefault(e => e.EventType == ProposalEventType.COUNTER_PROPOSAL_SENT);
        if (lastCounter is not null && lastCounter.ActorId == actorId)
        {
            throw new DomainRuleViolationException(
                "SELF_ACCEPTANCE_FORBIDDEN",
                "Você não pode aceitar sua própria contraproposta. Aguarde a decisão da contraparte.",
                422);
        }

        var atomicResult = await _proposalsRepository.ExecuteAtomicAcceptanceAsync(
            proposalId,
            expectedVersion,
            async (prop) =>
            {
                // Validações internas sincronizadas atomicamente
                if (shipment.Status == ShipmentStatus.CONTRACTED || shipment.Status == ShipmentStatus.DELIVERED || shipment.Status == ShipmentStatus.CLOSED)
                {
                    return (false, "CONCURRENT_ACCEPTANCE_CONFLICT", "A encomenda já se encontra contratada.", null!, null!);
                }

                // Reserva de Capacidade por Trecho (Legs)
                var legReservations = new List<LegReservation>();
                Action onCommitAction = () => { };

                if (trip is not null)
                {
                    var waypoints = new List<string> { trip.OriginCity };
                    waypoints.AddRange(trip.IntermediateStops);
                    waypoints.Add(trip.DestinationCity);

                    int fromIdx = waypoints.FindIndex(w => w.Equals(shipment.OriginAddress.City, StringComparison.OrdinalIgnoreCase));
                    int toIdx = waypoints.FindIndex(w => w.Equals(shipment.DestinationAddress.City, StringComparison.OrdinalIgnoreCase));

                    if (fromIdx >= 0 && toIdx >= 0 && fromIdx < toIdx)
                    {
                        // Rota multi-trecho
                        for (int i = fromIdx; i < toIdx; i++)
                        {
                            string legKey = $"leg_{i}_{waypoints[i]}_{waypoints[i + 1]}".ToLowerInvariant();
                            int currentCap = trip.LegCapacities.TryGetValue(legKey, out int capVal) ? capVal : trip.AvailableCapacityGrams;

                            if (currentCap < shipment.WeightGrams)
                            {
                                return (false, "INSUFFICIENT_LEG_CAPACITY", $"Capacidade insuficiente no trecho {waypoints[i]} -> {waypoints[i + 1]} ({currentCap}g disponíveis, {shipment.WeightGrams}g requeridos).", null!, null!);
                            }

                            legReservations.Add(new LegReservation(i, waypoints[i], waypoints[i + 1], shipment.WeightGrams));
                        }

                        onCommitAction = () =>
                        {
                            foreach (var res in legReservations)
                            {
                                string legKey = $"leg_{res.LegIndex}_{res.FromCity}_{res.ToCity}".ToLowerInvariant();
                                int cur = trip.LegCapacities.TryGetValue(legKey, out int cap) ? cap : trip.AvailableCapacityGrams;
                                trip.LegCapacities[legKey] = Math.Max(0, cur - res.ReservedGrams);
                            }
                            trip.AvailableCapacityGrams = Math.Max(0, trip.LegCapacities.Values.Min());
                            _tripsRepository.UpdateAsync(trip, CancellationToken.None).GetAwaiter().GetResult();

                            shipment.Status = ShipmentStatus.CONTRACTED;
                            _shipmentsRepository.UpdateAsync(shipment, CancellationToken.None).GetAwaiter().GetResult();
                        };
                    }
                    else
                    {
                        // Trecho direto
                        if (trip.AvailableCapacityGrams < shipment.WeightGrams)
                        {
                            return (false, "INSUFFICIENT_LEG_CAPACITY", $"Capacidade insuficiente na viagem ({trip.AvailableCapacityGrams}g disponíveis, {shipment.WeightGrams}g requeridos).", null!, null!);
                        }

                        legReservations.Add(new LegReservation(0, trip.OriginCity, trip.DestinationCity, shipment.WeightGrams));
                        onCommitAction = () =>
                        {
                            trip.AvailableCapacityGrams = Math.Max(0, trip.AvailableCapacityGrams - shipment.WeightGrams);
                            _tripsRepository.UpdateAsync(trip, CancellationToken.None).GetAwaiter().GetResult();

                            shipment.Status = ShipmentStatus.CONTRACTED;
                            _shipmentsRepository.UpdateAsync(shipment, CancellationToken.None).GetAwaiter().GetResult();
                        };
                    }
                }
                else
                {
                    legReservations.Add(new LegReservation(0, shipment.OriginAddress.City, shipment.DestinationAddress.City, shipment.WeightGrams));
                    onCommitAction = () =>
                    {
                        shipment.Status = ShipmentStatus.CONTRACTED;
                        _shipmentsRepository.UpdateAsync(shipment, CancellationToken.None).GetAwaiter().GetResult();
                    };
                }

                // Cálculo do Snapshot Comercial (D10, D11, D12 / PR-FIN-01)
                var contractId = Guid.NewGuid();
                CommissionSnapshot snapshot;

                if (_financialPolicyProvider is not null)
                {
                    var dynSnapshot = await _financialPolicyProvider.CreateOrGetSnapshotForContractAsync(
                        contractId: contractId,
                        proposalId: prop.Id,
                        shipmentId: prop.ShipmentId,
                        carrierId: prop.CarrierId,
                        senderId: prop.SenderId,
                        amountCents: prop.AmountCents,
                        referenceDate: DateTimeOffset.UtcNow,
                        cancellationToken: cancellationToken);

                    snapshot = new CommissionSnapshot(
                        PolicyVersionId: dynSnapshot.PolicyVersion,
                        PlanCode: dynSnapshot.PlanCode,
                        CommissionRate: dynSnapshot.CommissionRatePercent / 100.0m,
                        CommissionCents: dynSnapshot.PlatformCommissionCents,
                        CarrierDueCents: dynSnapshot.CarrierNetCents,
                        AmountCents: dynSnapshot.TransportAmountCents,
                        PlatformAbsorbsGatewayFees: dynSnapshot.GatewayFeesAbsorbedByPlatform,
                        SnapshottedAtUtc: dynSnapshot.SnapshottedAtUtc);
                }
                else
                {
                    decimal commissionRate = _options.DefaultCommercialPolicies.FreePlanCommissionRate;
                    var domainSnapshot = TopicLogRules.CalculateCommissionSnapshot(
                        transportAmountCents: prop.AmountCents,
                        commissionRate: commissionRate,
                        policyVersionId: "POL-COM-V1",
                        planCode: "FREE");

                    snapshot = new CommissionSnapshot(
                        PolicyVersionId: domainSnapshot.PolicyVersionId,
                        PlanCode: domainSnapshot.PlanCode,
                        CommissionRate: domainSnapshot.CommissionRate,
                        CommissionCents: domainSnapshot.CommissionCents,
                        CarrierDueCents: domainSnapshot.CarrierDueCents,
                        AmountCents: domainSnapshot.TransportAmountCents,
                        PlatformAbsorbsGatewayFees: domainSnapshot.GatewayFeesAbsorbedByPlatform,
                        SnapshottedAtUtc: DateTimeOffset.UtcNow);
                }

                var contract = new Contract
                {
                    Id = contractId,
                    ShipmentId = prop.ShipmentId,
                    TripId = prop.TripId ?? Guid.Empty,
                    ProposalId = prop.Id,
                    SenderId = prop.SenderId,
                    SenderName = prop.SenderName,
                    CarrierId = prop.CarrierId,
                    CarrierName = prop.CarrierName,
                    AmountCents = prop.AmountCents,
                    CommissionSnapshot = snapshot,
                    LegReservations = legReservations,
                    Status = ContractStatus.ACTIVE,
                    Cancellation = null,
                    ContractedAtUtc = DateTimeOffset.UtcNow,
                    UpdatedAtUtc = DateTimeOffset.UtcNow
                };

                return await Task.FromResult((true, (string?)null, (string?)null, contract, onCommitAction));
            },
            cancellationToken);

        if (!atomicResult.Success)
        {
            int statusCode = atomicResult.ErrorCode == "CONCURRENT_ACCEPTANCE_CONFLICT" ? 409 : 422;
            throw new DomainRuleViolationException(
                atomicResult.ErrorCode ?? "ACCEPTANCE_ERROR",
                atomicResult.ErrorMessage ?? "Falha ao aceitar proposta.",
                statusCode);
        }

        var contract = atomicResult.Contract!;

        // Eventos de auditoria
        await _proposalsRepository.AddEventAsync(new ProposalEvent(
            Id: Guid.NewGuid(),
            ProposalId: targetProposal.Id,
            ShipmentId: targetProposal.ShipmentId,
            ActorId: actorId,
            ActorRole: actorRole,
            EventType: ProposalEventType.PROPOSAL_ACCEPTED,
            PreviousStatus: targetProposal.Status.ToString(),
            NewStatus: ProposalStatus.ACCEPTED.ToString(),
            AmountCents: targetProposal.AmountCents,
            Justification: "Proposta aceita com reserva confirmada",
            OccurredAtUtc: DateTimeOffset.UtcNow), cancellationToken);

        await _proposalsRepository.AddEventAsync(new ProposalEvent(
            Id: Guid.NewGuid(),
            ProposalId: targetProposal.Id,
            ShipmentId: targetProposal.ShipmentId,
            ActorId: actorId,
            ActorRole: actorRole,
            EventType: ProposalEventType.CONTRACT_CREATED,
            PreviousStatus: string.Empty,
            NewStatus: ContractStatus.ACTIVE.ToString(),
            AmountCents: targetProposal.AmountCents,
            Justification: $"Contrato {contract.Id} formalizado com sucesso",
            OccurredAtUtc: DateTimeOffset.UtcNow), cancellationToken);

        // Se havia uma prioridade ativa sobre esta encomenda, marca como aceita
        var currentOffer = await _proposalsRepository.GetActivePriorityOfferForShipmentAsync(shipment.Id, cancellationToken);
        if (currentOffer is not null)
        {
            var updatedOffer = currentOffer with { IsAccepted = true };
            await _proposalsRepository.UpdatePriorityOfferAsync(updatedOffer, cancellationToken);
        }

        // Regra 2: Detecção de 2ª encomenda do mesmo remetente para Oferta Prioritária de 10 min
        await EvaluatePriorityOfferForSecondShipmentAsync(shipment, targetProposal, trip, cancellationToken);

        return MapToContractResponse(contract);
    }

    public async Task<ProposalResponse> RejectProposalAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid proposalId,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        var proposal = await _proposalsRepository.GetProposalByIdAsync(proposalId, cancellationToken)
            ?? throw new DomainRuleViolationException("PROPOSAL_NOT_FOUND", "A proposta informada não foi encontrada.", 404);

        if (actorId != proposal.SenderId && actorId != proposal.CarrierId)
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN_NOT_PARTY",
                "Apenas os participantes da negociação podem recusar a proposta.",
                403);
        }

        if (proposal.Status != ProposalStatus.PENDING && proposal.Status != ProposalStatus.COUNTERED)
        {
            throw new DomainRuleViolationException(
                "INVALID_PROPOSAL_STATUS",
                $"A proposta não pode ser rejeitada com status {proposal.Status}.");
        }

        proposal.Status = ProposalStatus.REJECTED;
        proposal.Version++;
        proposal.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _proposalsRepository.UpdateProposalAsync(proposal, cancellationToken);

        await _proposalsRepository.AddEventAsync(new ProposalEvent(
            Id: Guid.NewGuid(),
            ProposalId: proposal.Id,
            ShipmentId: proposal.ShipmentId,
            ActorId: actorId,
            ActorRole: actorRole,
            EventType: ProposalEventType.PROPOSAL_REJECTED,
            PreviousStatus: ProposalStatus.PENDING.ToString(),
            NewStatus: ProposalStatus.REJECTED.ToString(),
            AmountCents: proposal.AmountCents,
            Justification: reason ?? "Proposta recusada pelo usuário",
            OccurredAtUtc: DateTimeOffset.UtcNow), cancellationToken);

        return MapToProposalResponse(proposal);
    }

    public async Task<ProposalResponse> CancelProposalAsync(
        Guid actorId,
        Guid proposalId,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        var proposal = await _proposalsRepository.GetProposalByIdAsync(proposalId, cancellationToken)
            ?? throw new DomainRuleViolationException("PROPOSAL_NOT_FOUND", "A proposta informada não foi encontrada.", 404);

        if (proposal.CarrierId != actorId && proposal.SenderId != actorId)
        {
            throw new DomainRuleViolationException("UNAUTHORIZED_PROPOSAL_ACTION", "Apenas o autor ou destinatário da proposta pode cancelá-la.", 403);
        }

        if (proposal.Status != ProposalStatus.PENDING && proposal.Status != ProposalStatus.COUNTERED)
        {
            throw new DomainRuleViolationException(
                "INVALID_PROPOSAL_STATUS",
                $"Apenas propostas pendentes ou contrapostas podem ser canceladas. Status atual: {proposal.Status}.");
        }

        proposal.Status = ProposalStatus.CANCELLED;
        proposal.Version++;
        proposal.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _proposalsRepository.UpdateProposalAsync(proposal, cancellationToken);

        await _proposalsRepository.AddEventAsync(new ProposalEvent(
            Id: Guid.NewGuid(),
            ProposalId: proposal.Id,
            ShipmentId: proposal.ShipmentId,
            ActorId: actorId,
            ActorRole: ActorRole.CARRIER,
            EventType: ProposalEventType.PROPOSAL_SUPERSEDED,
            PreviousStatus: ProposalStatus.PENDING.ToString(),
            NewStatus: ProposalStatus.CANCELLED.ToString(),
            AmountCents: proposal.AmountCents,
            Justification: reason ?? "Proposta cancelada pelo autor",
            OccurredAtUtc: DateTimeOffset.UtcNow), cancellationToken);

        return MapToProposalResponse(proposal);
    }

    public async Task<ContractResponse> CancelContractPrePickupAsync(
        Guid actorId,
        ActorRole actorRole,
        Guid contractId,
        CancelContractRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var contract = await _proposalsRepository.GetContractByIdAsync(contractId, cancellationToken)
            ?? throw new DomainRuleViolationException("CONTRACT_NOT_FOUND", "O contrato informado não foi encontrado.", 404);

        if (actorId != contract.SenderId && actorId != contract.CarrierId)
        {
            throw new DomainRuleViolationException(
                "UNAUTHORIZED_CONTRACT_ACTION",
                "Apenas o remetente ou o transportador vinculados ao contrato podem realizar o cancelamento pré-coleta.",
                403);
        }

        if (contract.Status != ContractStatus.ACTIVE)
        {
            throw new DomainRuleViolationException(
                "CONTRACT_NOT_CANCELLABLE",
                $"Apenas contratos ativos e pré-coleta podem ser cancelados. Status atual: {contract.Status}.");
        }

        var shipment = await _shipmentsRepository.GetByIdAsync(contract.ShipmentId, cancellationToken)
            ?? throw new DomainRuleViolationException("SHIPMENT_NOT_FOUND", "A encomenda do contrato não foi encontrada.", 404);

        // Liberação de capacidade reservada na viagem
        if (contract.TripId != Guid.Empty)
        {
            var trip = await _tripsRepository.GetByIdAsync(contract.TripId, cancellationToken);
            if (trip is not null)
            {
                foreach (var res in contract.LegReservations)
                {
                    string legKey = $"leg_{res.LegIndex}_{res.FromCity}_{res.ToCity}".ToLowerInvariant();
                    if (trip.LegCapacities.TryGetValue(legKey, out int currentLegCap))
                    {
                        trip.LegCapacities[legKey] = currentLegCap + res.ReservedGrams;
                    }
                }
                trip.AvailableCapacityGrams += shipment.WeightGrams;
                await _tripsRepository.UpdateAsync(trip, cancellationToken);
            }
        }

        // Reabertura ou cancelamento da encomenda
        if (request.ReopenForBidding)
        {
            shipment.Status = ShipmentStatus.PUBLISHED;
        }
        else
        {
            shipment.Status = ShipmentStatus.CANCELLED;
        }
        await _shipmentsRepository.UpdateAsync(shipment, cancellationToken);

        // Cálculo da penalidade simulada pré-coleta
        long simulatedPenaltyCents = 0;
        string disclaimer;

        if (request.ReasonCode is CancellationReasonCode.MUTUAL_AGREEMENT
            or CancellationReasonCode.FORCE_MAJEURE
            or CancellationReasonCode.OPERATIONAL_IMPOSSIBILITY)
        {
            simulatedPenaltyCents = 0;
            disclaimer = "Cancelamento pré-coleta consensual/justificado: isento de taxas conforme política da plataforma.";
        }
        else
        {
            // 10% do valor com mínimo de R$ 7,00 (700 centavos)
            simulatedPenaltyCents = Math.Max(700, (long)decimal.Round(contract.AmountCents * 0.10m, 0, MidpointRounding.AwayFromZero));
            disclaimer = "Simulação de taxa de cancelamento pré-coleta (10% com piso de R$ 7,00, rateio 80% lesado / 20% plataforma) sem débito real no MVP.";
        }

        var cancellationRecord = new CancellationRecord(
            CancelledAtUtc: DateTimeOffset.UtcNow,
            CancelledByUserId: actorId,
            ReasonCode: request.ReasonCode,
            Justification: request.Justification,
            ReopenedForBidding: request.ReopenForBidding,
            SimulatedPenaltyCents: simulatedPenaltyCents,
            PolicyDisclaimer: disclaimer);

        contract.Status = ContractStatus.CANCELLED_PRE_PICKUP;
        contract.Cancellation = cancellationRecord;
        contract.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _proposalsRepository.UpdateContractAsync(contract, cancellationToken);

        await _proposalsRepository.AddEventAsync(new ProposalEvent(
            Id: Guid.NewGuid(),
            ProposalId: contract.ProposalId,
            ShipmentId: contract.ShipmentId,
            ActorId: actorId,
            ActorRole: actorRole,
            EventType: ProposalEventType.CONTRACT_CANCELLED_PRE_PICKUP,
            PreviousStatus: ContractStatus.ACTIVE.ToString(),
            NewStatus: ContractStatus.CANCELLED_PRE_PICKUP.ToString(),
            AmountCents: contract.AmountCents,
            Justification: $"Cancelamento pré-coleta: {request.ReasonCode}. {request.Justification}",
            OccurredAtUtc: DateTimeOffset.UtcNow), cancellationToken);

        return MapToContractResponse(contract);
    }

    public async Task<PriorityOfferResponse> RespondPriorityOfferAsync(
        Guid carrierId,
        Guid shipmentId,
        bool accept,
        CancellationToken cancellationToken = default)
    {
        var offer = await _proposalsRepository.GetActivePriorityOfferForShipmentAsync(shipmentId, cancellationToken)
            ?? throw new DomainRuleViolationException("PRIORITY_OFFER_NOT_FOUND", "Nenhuma oferta prioritária ativa encontrada para esta encomenda.", 404);

        if (offer.EligibleCarrierId != carrierId)
        {
            throw new DomainRuleViolationException("UNAUTHORIZED_PRIORITY_OFFER", "Esta oferta prioritária pertence a outro transportador.", 403);
        }

        if (!accept)
        {
            var declinedOffer = offer with { IsDeclined = true };
            await _proposalsRepository.UpdatePriorityOfferAsync(declinedOffer, cancellationToken);

            await _proposalsRepository.AddEventAsync(new ProposalEvent(
                Id: Guid.NewGuid(),
                ProposalId: Guid.Empty,
                ShipmentId: shipmentId,
                ActorId: carrierId,
                ActorRole: ActorRole.CARRIER,
                EventType: ProposalEventType.PRIORITY_OFFER_DECLINED,
                PreviousStatus: "PRIORITY_OFFER_ACTIVE",
                NewStatus: "DECLINED_OPEN_TO_FEED",
                AmountCents: 0,
                Justification: "Transportador recusou a oferta prioritária da 2ª encomenda sem penalidade. Encomenda liberada para o Feed geral.",
                OccurredAtUtc: DateTimeOffset.UtcNow), cancellationToken);

            return MapToPriorityOfferResponse(declinedOffer);
        }

        var acceptedOffer = offer with { IsAccepted = true };
        await _proposalsRepository.UpdatePriorityOfferAsync(acceptedOffer, cancellationToken);
        return MapToPriorityOfferResponse(acceptedOffer);
    }

    public async Task<ProposalResponse?> GetProposalByIdAsync(Guid id, Guid? viewerUserId = null, CancellationToken cancellationToken = default)
    {
        var p = await _proposalsRepository.GetProposalByIdAsync(id, cancellationToken);
        if (p is null) return null;

        if (viewerUserId.HasValue && viewerUserId.Value != p.SenderId && viewerUserId.Value != p.CarrierId)
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN_NOT_PARTY",
                "Acesso negado: você não tem permissão para visualizar esta proposta.",
                403);
        }

        return MapToProposalResponse(p);
    }

    public async Task<IReadOnlyList<ProposalResponse>> ListProposalsByShipmentIdAsync(Guid shipmentId, Guid? viewerUserId = null, CancellationToken cancellationToken = default)
    {
        var list = await _proposalsRepository.ListProposalsByShipmentIdAsync(shipmentId, cancellationToken);
        if (viewerUserId.HasValue)
        {
            var shipment = await _shipmentsRepository.GetByIdAsync(shipmentId, cancellationToken);
            if (shipment is not null && shipment.SenderId != viewerUserId.Value)
            {
                // Se for outro usuário (ex.: transportador concorrente), vê apenas suas próprias propostas
                list = list.Where(p => p.CarrierId == viewerUserId.Value).ToList();
            }
        }
        return list.Select(MapToProposalResponse).ToList();
    }

    public async Task<IReadOnlyList<ProposalResponse>> ListProposalsByCarrierIdAsync(Guid carrierId, CancellationToken cancellationToken = default)
    {
        var list = await _proposalsRepository.ListProposalsByCarrierIdAsync(carrierId, cancellationToken);
        return list.Select(MapToProposalResponse).ToList();
    }

    public async Task<IReadOnlyList<ProposalResponse>> ListProposalsForSenderAsync(Guid senderId, CancellationToken cancellationToken = default)
    {
        var list = await _proposalsRepository.ListProposalsForSenderAsync(senderId, cancellationToken);
        return list.Select(MapToProposalResponse).ToList();
    }

    public async Task<ContractResponse?> GetContractByIdAsync(Guid contractId, Guid? viewerUserId = null, CancellationToken cancellationToken = default)
    {
        var c = await _proposalsRepository.GetContractByIdAsync(contractId, cancellationToken);
        if (c is null) return null;

        if (viewerUserId.HasValue && viewerUserId.Value != c.SenderId && viewerUserId.Value != c.CarrierId)
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN_NOT_PARTY",
                "Acesso negado: você não tem permissão para visualizar este contrato.",
                403);
        }

        return MapToContractResponse(c);
    }

    public async Task<ContractResponse?> GetContractByShipmentIdAsync(Guid shipmentId, Guid? viewerUserId = null, CancellationToken cancellationToken = default)
    {
        var c = await _proposalsRepository.GetContractByShipmentIdAsync(shipmentId, cancellationToken);
        if (c is null) return null;

        if (viewerUserId.HasValue && viewerUserId.Value != c.SenderId && viewerUserId.Value != c.CarrierId)
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN_NOT_PARTY",
                "Acesso negado: você não tem permissão para visualizar este contrato.",
                403);
        }

        return MapToContractResponse(c);
    }

    public async Task<IReadOnlyList<ContractResponse>> ListContractsByCarrierIdAsync(Guid carrierId, CancellationToken cancellationToken = default)
    {
        var list = await _proposalsRepository.ListContractsByCarrierIdAsync(carrierId, cancellationToken);
        return list.Select(MapToContractResponse).ToList();
    }

    public async Task<IReadOnlyList<ProposalEventResponse>> GetProposalEventsAsync(Guid proposalId, Guid? viewerUserId = null, CancellationToken cancellationToken = default)
    {
        if (viewerUserId.HasValue)
        {
            var p = await _proposalsRepository.GetProposalByIdAsync(proposalId, cancellationToken);
            if (p is not null && viewerUserId.Value != p.SenderId && viewerUserId.Value != p.CarrierId)
            {
                throw new DomainRuleViolationException(
                    "AUTH_FORBIDDEN_NOT_PARTY",
                    "Acesso negado: você não tem permissão para visualizar os eventos desta proposta.",
                    403);
            }
        }

        var list = await _proposalsRepository.GetEventsByProposalIdAsync(proposalId, cancellationToken);
        return list.Select(e => new ProposalEventResponse(
            Id: e.Id,
            ProposalId: e.ProposalId,
            ShipmentId: e.ShipmentId,
            ActorId: e.ActorId,
            ActorRole: e.ActorRole.ToString(),
            EventType: e.EventType.ToString(),
            PreviousStatus: e.PreviousStatus,
            NewStatus: e.NewStatus,
            AmountCents: e.AmountCents,
            Justification: e.Justification,
            OccurredAtUtc: e.OccurredAtUtc)).ToList();
    }

    public async Task<PriorityOfferResponse?> GetActivePriorityOfferAsync(Guid shipmentId, CancellationToken cancellationToken = default)
    {
        var offer = await _proposalsRepository.GetActivePriorityOfferForShipmentAsync(shipmentId, cancellationToken);
        return offer is null ? null : MapToPriorityOfferResponse(offer);
    }

    public async Task<IReadOnlyList<PriorityOfferResponse>> ListActivePriorityOffersForCarrierAsync(Guid carrierId, CancellationToken cancellationToken = default)
    {
        var list = await _proposalsRepository.ListPriorityOffersByCarrierIdAsync(carrierId, cancellationToken);
        return list.Select(MapToPriorityOfferResponse).ToList();
    }

    private async Task EvaluatePriorityOfferForSecondShipmentAsync(
        Shipment firstShipment,
        Proposal firstProposal,
        Trip? trip,
        CancellationToken cancellationToken)
    {
        if (trip is null) return;

        try
        {
            var activeShipments = await _shipmentsRepository.ListActiveAsync(cancellationToken: cancellationToken);
            var otherShipments = activeShipments
                .Where(s => s.Id != firstShipment.Id
                    && s.SenderId == firstShipment.SenderId
                    && (s.Status == ShipmentStatus.PUBLISHED || s.Status == ShipmentStatus.NEGOTIATING))
                .ToList();

            foreach (var secondShipment in otherShipments)
            {
                // Regra 2: Encomenda publicada em até 10 min da primeira ou enquanto a primeira aguarda coleta
                bool isWithinTimeWindow = Math.Abs((secondShipment.CreatedAtUtc - firstShipment.CreatedAtUtc).TotalMinutes) <= 10.0
                    || firstShipment.Status == ShipmentStatus.CONTRACTED;

                if (!isWithinTimeWindow) continue;

                // Verifica capacidade restante
                if (trip.AvailableCapacityGrams < secondShipment.WeightGrams) continue;

                // Verifica se já existe oferta ativa para ela
                var existingOffer = await _proposalsRepository.GetActivePriorityOfferForShipmentAsync(secondShipment.Id, cancellationToken);
                if (existingOffer is not null) continue;

                // Emite oferta prioritária de 10 min (Regra 2)
                var priorityOffer = new PriorityOffer(
                    ShipmentId: secondShipment.Id,
                    EligibleCarrierId: firstProposal.CarrierId,
                    FirstShipmentId: firstShipment.Id,
                    TripId: trip.Id,
                    IssuedAtUtc: DateTimeOffset.UtcNow,
                    ExpiresAtUtc: DateTimeOffset.UtcNow.AddMinutes(10),
                    IsDeclined: false,
                    IsAccepted: false,
                    Notes: $"Oferta prioritária de 10 minutos para a 2ª encomenda '{secondShipment.Title}' do cliente {firstShipment.SenderName}.");

                await _proposalsRepository.SavePriorityOfferAsync(priorityOffer, cancellationToken);

                await _proposalsRepository.AddEventAsync(new ProposalEvent(
                    Id: Guid.NewGuid(),
                    ProposalId: Guid.Empty,
                    ShipmentId: secondShipment.Id,
                    ActorId: firstProposal.CarrierId,
                    ActorRole: ActorRole.SYSTEM,
                    EventType: ProposalEventType.PRIORITY_OFFER_ISSUED,
                    PreviousStatus: secondShipment.Status.ToString(),
                    NewStatus: "PRIORITY_OFFER_ACTIVE",
                    AmountCents: secondShipment.SuggestedPriceCents,
                    Justification: "Janela prioritária de 10 minutos concedida ao transportador da primeira encomenda.",
                    OccurredAtUtc: DateTimeOffset.UtcNow), cancellationToken);

                break; // 1 oferta prioritária por vez para a próxima 2ª encomenda
            }
        }
        catch (Exception)
        {
            // Falha não bloqueante ao avaliar oferta prioritária da 2ª encomenda
        }
    }

    private static ProposalResponse MapToProposalResponse(Proposal p) => new(
        Id: p.Id,
        ShipmentId: p.ShipmentId,
        TripId: p.TripId,
        CarrierId: p.CarrierId,
        CarrierName: p.CarrierName,
        SenderId: p.SenderId,
        SenderName: p.SenderName,
        AmountCents: p.AmountCents,
        Status: p.Status.ToString(),
        EstimatedPickup: p.EstimatedPickup,
        EstimatedDelivery: p.EstimatedDelivery,
        Notes: p.Notes,
        ParentProposalId: p.ParentProposalId,
        CounterCount: p.CounterCount,
        ExpiresAtUtc: p.ExpiresAtUtc,
        IsExpired: p.ExpiresAtUtc <= DateTimeOffset.UtcNow,
        Version: p.Version,
        CreatedAtUtc: p.CreatedAtUtc);

    private static ContractResponse MapToContractResponse(Contract c) => new(
        Id: c.Id,
        ShipmentId: c.ShipmentId,
        TripId: c.TripId,
        ProposalId: c.ProposalId,
        SenderId: c.SenderId,
        SenderName: c.SenderName,
        CarrierId: c.CarrierId,
        CarrierName: c.CarrierName,
        AmountCents: c.AmountCents,
        CommissionSnapshot: c.CommissionSnapshot,
        LegReservations: c.LegReservations,
        Status: c.Status.ToString(),
        Cancellation: c.Cancellation,
        ContractedAtUtc: c.ContractedAtUtc);

    private static PriorityOfferResponse MapToPriorityOfferResponse(PriorityOffer o) => new(
        ShipmentId: o.ShipmentId,
        EligibleCarrierId: o.EligibleCarrierId,
        FirstShipmentId: o.FirstShipmentId,
        TripId: o.TripId,
        IssuedAtUtc: o.IssuedAtUtc,
        ExpiresAtUtc: o.ExpiresAtUtc,
        IsActive: !o.IsDeclined && !o.IsAccepted && o.ExpiresAtUtc > DateTimeOffset.UtcNow,
        IsDeclined: o.IsDeclined,
        IsAccepted: o.IsAccepted,
        Notes: o.Notes);
}
