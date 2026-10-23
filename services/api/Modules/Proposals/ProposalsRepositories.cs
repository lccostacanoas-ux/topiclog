using System.Collections.Concurrent;

namespace TopicLog.Api.Modules.Proposals;

public sealed record AtomicAcceptanceResult(
    bool Success,
    string? ErrorCode,
    string? ErrorMessage,
    Contract? Contract,
    Proposal? Proposal,
    IReadOnlyList<Proposal> SupersededProposals);

public interface IProposalsRepository
{
    Task<Proposal> CreateProposalAsync(Proposal proposal, CancellationToken cancellationToken = default);
    Task<Proposal?> GetProposalByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Proposal>> ListProposalsByShipmentIdAsync(Guid shipmentId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Proposal>> ListProposalsByCarrierIdAsync(Guid carrierId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Proposal>> ListProposalsForSenderAsync(Guid senderId, CancellationToken cancellationToken = default);
    Task<bool> UpdateProposalAsync(Proposal proposal, CancellationToken cancellationToken = default);

    Task<Contract> CreateContractAsync(Contract contract, CancellationToken cancellationToken = default);
    Task<Contract?> GetContractByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Contract?> GetContractByShipmentIdAsync(Guid shipmentId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Contract>> ListContractsByCarrierIdAsync(Guid carrierId, CancellationToken cancellationToken = default);
    Task<bool> UpdateContractAsync(Contract contract, CancellationToken cancellationToken = default);

    Task AddEventAsync(ProposalEvent ev, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ProposalEvent>> GetEventsByProposalIdAsync(Guid proposalId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ProposalEvent>> GetEventsByShipmentIdAsync(Guid shipmentId, CancellationToken cancellationToken = default);

    Task SavePriorityOfferAsync(PriorityOffer offer, CancellationToken cancellationToken = default);
    Task<PriorityOffer?> GetActivePriorityOfferForShipmentAsync(Guid shipmentId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<PriorityOffer>> ListPriorityOffersByCarrierIdAsync(Guid carrierId, CancellationToken cancellationToken = default);
    Task<bool> UpdatePriorityOfferAsync(PriorityOffer offer, CancellationToken cancellationToken = default);

    Task<AtomicAcceptanceResult> ExecuteAtomicAcceptanceAsync(
        Guid proposalId,
        int expectedVersion,
        Func<Proposal, Task<(bool CanAccept, string? FailureCode, string? FailureMessage, Contract Contract, Action OnCommit)>> prepareCallback,
        CancellationToken cancellationToken = default);
}

public sealed class InMemoryProposalsRepository : IProposalsRepository
{
    private readonly ConcurrentDictionary<Guid, Proposal> _proposals = new();
    private readonly ConcurrentDictionary<Guid, Contract> _contracts = new();
    private readonly ConcurrentBag<ProposalEvent> _events = new();
    private readonly ConcurrentDictionary<Guid, PriorityOffer> _priorityOffers = new();
    private readonly object _acceptanceLock = new();

    public InMemoryProposalsRepository()
    {
        SeedDemoData();
    }

    public Task<Proposal> CreateProposalAsync(Proposal proposal, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _proposals[proposal.Id] = proposal;
        return Task.FromResult(proposal);
    }

    public Task<Proposal?> GetProposalByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _proposals.TryGetValue(id, out var proposal);
        return Task.FromResult(proposal);
    }

    public Task<IReadOnlyList<Proposal>> ListProposalsByShipmentIdAsync(Guid shipmentId, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var list = _proposals.Values
            .Where(p => p.ShipmentId == shipmentId)
            .OrderByDescending(p => p.CreatedAtUtc)
            .ToList();
        return Task.FromResult<IReadOnlyList<Proposal>>(list);
    }

    public Task<IReadOnlyList<Proposal>> ListProposalsByCarrierIdAsync(Guid carrierId, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var list = _proposals.Values
            .Where(p => p.CarrierId == carrierId)
            .OrderByDescending(p => p.CreatedAtUtc)
            .ToList();
        return Task.FromResult<IReadOnlyList<Proposal>>(list);
    }

    public Task<IReadOnlyList<Proposal>> ListProposalsForSenderAsync(Guid senderId, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var list = _proposals.Values
            .Where(p => p.SenderId == senderId)
            .OrderByDescending(p => p.CreatedAtUtc)
            .ToList();
        return Task.FromResult<IReadOnlyList<Proposal>>(list);
    }

    public Task<bool> UpdateProposalAsync(Proposal proposal, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (_proposals.ContainsKey(proposal.Id))
        {
            proposal.UpdatedAtUtc = DateTimeOffset.UtcNow;
            _proposals[proposal.Id] = proposal;
            return Task.FromResult(true);
        }
        return Task.FromResult(false);
    }

    public Task<Contract> CreateContractAsync(Contract contract, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _contracts[contract.Id] = contract;
        return Task.FromResult(contract);
    }

    public Task<Contract?> GetContractByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _contracts.TryGetValue(id, out var contract);
        return Task.FromResult(contract);
    }

    public Task<Contract?> GetContractByShipmentIdAsync(Guid shipmentId, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var contract = _contracts.Values.FirstOrDefault(c => c.ShipmentId == shipmentId && c.Status == ContractStatus.ACTIVE);
        return Task.FromResult(contract);
    }

    public Task<IReadOnlyList<Contract>> ListContractsByCarrierIdAsync(Guid carrierId, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var list = _contracts.Values
            .Where(c => c.CarrierId == carrierId)
            .OrderByDescending(c => c.ContractedAtUtc)
            .ToList();
        return Task.FromResult<IReadOnlyList<Contract>>(list);
    }

    public Task<bool> UpdateContractAsync(Contract contract, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (_contracts.ContainsKey(contract.Id))
        {
            contract.UpdatedAtUtc = DateTimeOffset.UtcNow;
            _contracts[contract.Id] = contract;
            return Task.FromResult(true);
        }
        return Task.FromResult(false);
    }

    public Task AddEventAsync(ProposalEvent ev, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _events.Add(ev);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<ProposalEvent>> GetEventsByProposalIdAsync(Guid proposalId, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var list = _events
            .Where(e => e.ProposalId == proposalId)
            .OrderBy(e => e.OccurredAtUtc)
            .ToList();
        return Task.FromResult<IReadOnlyList<ProposalEvent>>(list);
    }

    public Task<IReadOnlyList<ProposalEvent>> GetEventsByShipmentIdAsync(Guid shipmentId, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var list = _events
            .Where(e => e.ShipmentId == shipmentId)
            .OrderBy(e => e.OccurredAtUtc)
            .ToList();
        return Task.FromResult<IReadOnlyList<ProposalEvent>>(list);
    }

    public Task SavePriorityOfferAsync(PriorityOffer offer, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _priorityOffers[offer.ShipmentId] = offer;
        return Task.CompletedTask;
    }

    public Task<PriorityOffer?> GetActivePriorityOfferForShipmentAsync(Guid shipmentId, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (_priorityOffers.TryGetValue(shipmentId, out var offer))
        {
            if (!offer.IsDeclined && !offer.IsAccepted && offer.ExpiresAtUtc > DateTimeOffset.UtcNow)
            {
                return Task.FromResult<PriorityOffer?>(offer);
            }
        }
        return Task.FromResult<PriorityOffer?>(null);
    }

    public Task<IReadOnlyList<PriorityOffer>> ListPriorityOffersByCarrierIdAsync(Guid carrierId, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var list = _priorityOffers.Values
            .Where(o => o.EligibleCarrierId == carrierId && !o.IsDeclined && !o.IsAccepted && o.ExpiresAtUtc > DateTimeOffset.UtcNow)
            .OrderByDescending(o => o.IssuedAtUtc)
            .ToList();
        return Task.FromResult<IReadOnlyList<PriorityOffer>>(list);
    }

    public Task<bool> UpdatePriorityOfferAsync(PriorityOffer offer, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _priorityOffers[offer.ShipmentId] = offer;
        return Task.FromResult(true);
    }

    public async Task<AtomicAcceptanceResult> ExecuteAtomicAcceptanceAsync(
        Guid proposalId,
        int expectedVersion,
        Func<Proposal, Task<(bool CanAccept, string? FailureCode, string? FailureMessage, Contract Contract, Action OnCommit)>> prepareCallback,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        // Lock at the repository level guarantees absolute exclusion across concurrent requests
        lock (_acceptanceLock)
        {
            if (!_proposals.TryGetValue(proposalId, out var proposal))
            {
                return new AtomicAcceptanceResult(
                    Success: false,
                    ErrorCode: "PROPOSAL_NOT_FOUND",
                    ErrorMessage: "A proposta solicitada não foi encontrada.",
                    Contract: null,
                    Proposal: null,
                    SupersededProposals: []);
            }

            bool alreadyContracted = _contracts.Values.Any(c => c.ShipmentId == proposal.ShipmentId && c.Status == ContractStatus.ACTIVE);
            if (alreadyContracted || proposal.Status == ProposalStatus.SUPERSEDED)
            {
                proposal.Status = ProposalStatus.SUPERSEDED;
                proposal.UpdatedAtUtc = DateTimeOffset.UtcNow;
                return new AtomicAcceptanceResult(
                    Success: false,
                    ErrorCode: "CONCURRENT_ACCEPTANCE_CONFLICT",
                    ErrorMessage: "A encomenda já foi contratada por outra proposta aceita concorrentemente.",
                    Contract: null,
                    Proposal: proposal,
                    SupersededProposals: []);
            }

            if (proposal.Status != ProposalStatus.PENDING && proposal.Status != ProposalStatus.COUNTERED)
            {
                return new AtomicAcceptanceResult(
                    Success: false,
                    ErrorCode: "INVALID_PROPOSAL_STATUS",
                    ErrorMessage: $"Apenas propostas com status PENDING ou COUNTERED podem ser aceitas. Status atual: {proposal.Status}.",
                    Contract: null,
                    Proposal: proposal,
                    SupersededProposals: []);
            }

            if (proposal.Version != expectedVersion)
            {
                return new AtomicAcceptanceResult(
                    Success: false,
                    ErrorCode: "CONCURRENT_ACCEPTANCE_CONFLICT",
                    ErrorMessage: "A versão da proposta difere da versão esperada (conflito de concorrência otimista).",
                    Contract: null,
                    Proposal: proposal,
                    SupersededProposals: []);
            }

            if (proposal.ExpiresAtUtc <= DateTimeOffset.UtcNow)
            {
                proposal.Status = ProposalStatus.EXPIRED;
                proposal.UpdatedAtUtc = DateTimeOffset.UtcNow;
                return new AtomicAcceptanceResult(
                    Success: false,
                    ErrorCode: "PROPOSAL_EXPIRED",
                    ErrorMessage: "A proposta expirou e não pode mais ser aceita.",
                    Contract: null,
                    Proposal: proposal,
                    SupersededProposals: []);
            }

            bool anotherProposalAccepted = _proposals.Values.Any(p => p.ShipmentId == proposal.ShipmentId && p.Status == ProposalStatus.ACCEPTED && p.Id != proposal.Id);
            if (anotherProposalAccepted)
            {
                proposal.Status = ProposalStatus.SUPERSEDED;
                proposal.Version++;
                proposal.UpdatedAtUtc = DateTimeOffset.UtcNow;
                return new AtomicAcceptanceResult(
                    Success: false,
                    ErrorCode: "CONCURRENT_ACCEPTANCE_CONFLICT",
                    ErrorMessage: "Outra proposta para esta encomenda já foi aceita.",
                    Contract: null,
                    Proposal: proposal,
                    SupersededProposals: []);
            }

            // Execute preparation callback synchronously inside lock to ensure transactional atomicity
            var prepTask = prepareCallback(proposal);
            var (canAccept, failureCode, failureMessage, contract, onCommit) = prepTask.GetAwaiter().GetResult();

            if (!canAccept)
            {
                return new AtomicAcceptanceResult(
                    Success: false,
                    ErrorCode: failureCode ?? "ACCEPTANCE_REJECTED",
                    ErrorMessage: failureMessage ?? "A proposta não pôde ser aceita pelas regras de negócio.",
                    Contract: null,
                    Proposal: proposal,
                    SupersededProposals: []);
            }

            // Accept winning proposal
            proposal.Status = ProposalStatus.ACCEPTED;
            proposal.Version++;
            proposal.UpdatedAtUtc = DateTimeOffset.UtcNow;

            // Supersede competing proposals
            var supersededList = new List<Proposal>();
            foreach (var other in _proposals.Values.Where(p => p.ShipmentId == proposal.ShipmentId && p.Id != proposal.Id))
            {
                if (other.Status == ProposalStatus.PENDING || other.Status == ProposalStatus.COUNTERED)
                {
                    other.Status = ProposalStatus.SUPERSEDED;
                    other.Version++;
                    other.UpdatedAtUtc = DateTimeOffset.UtcNow;
                    supersededList.Add(other);

                    _events.Add(new ProposalEvent(
                        Id: Guid.NewGuid(),
                        ProposalId: other.Id,
                        ShipmentId: other.ShipmentId,
                        ActorId: Guid.Empty,
                        ActorRole: ActorRole.SYSTEM,
                        EventType: ProposalEventType.PROPOSAL_SUPERSEDED,
                        PreviousStatus: ProposalStatus.PENDING.ToString(),
                        NewStatus: ProposalStatus.SUPERSEDED.ToString(),
                        AmountCents: other.AmountCents,
                        Justification: $"Superada pela contratação da proposta {proposal.Id}",
                        OccurredAtUtc: DateTimeOffset.UtcNow));
                }
            }

            // Store contract
            _contracts[contract.Id] = contract;

            // Apply side effects (leg capacity reservation, shipment status change)
            onCommit();

            return new AtomicAcceptanceResult(
                Success: true,
                ErrorCode: null,
                ErrorMessage: null,
                Contract: contract,
                Proposal: proposal,
                SupersededProposals: supersededList);
        }
    }

    private void SeedDemoData()
    {
        var demoSenderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var demoCarrierId = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var demoShipmentId = Guid.Parse("e0000001-0000-0000-0000-000000000001");
        var demoTripId = Guid.Parse("b0000001-0000-0000-0000-000000000001");

        var demoProposal = new Proposal
        {
            Id = Guid.Parse("d0000001-0000-0000-0000-000000000001"),
            ShipmentId = demoShipmentId,
            TripId = demoTripId,
            CarrierId = demoCarrierId,
            CarrierName = "Marcos Vinícius (Demo)",
            SenderId = demoSenderId,
            SenderName = "Carlos M. (Remetente Demo)",
            AmountCents = 4200,
            Currency = "BRL",
            Status = ProposalStatus.PENDING,
            EstimatedPickup = "Hoje às 14:00",
            EstimatedDelivery = "Amanhã às 10:00",
            Notes = "Passarei na região central no início da tarde.",
            CounterCount = 0,
            ExpiresAtUtc = DateTimeOffset.UtcNow.AddHours(22),
            Version = 1,
            CreatedAtUtc = DateTimeOffset.UtcNow.AddHours(-2),
            UpdatedAtUtc = DateTimeOffset.UtcNow.AddHours(-2)
        };

        _proposals[demoProposal.Id] = demoProposal;

        _events.Add(new ProposalEvent(
            Id: Guid.NewGuid(),
            ProposalId: demoProposal.Id,
            ShipmentId: demoProposal.ShipmentId,
            ActorId: demoProposal.CarrierId,
            ActorRole: ActorRole.CARRIER,
            EventType: ProposalEventType.PROPOSAL_CREATED,
            PreviousStatus: string.Empty,
            NewStatus: ProposalStatus.PENDING.ToString(),
            AmountCents: demoProposal.AmountCents,
            Justification: "Proposta inicial enviada pelo transportador",
            OccurredAtUtc: demoProposal.CreatedAtUtc));

        var demoShipment2Id = Guid.Parse("e0000002-0000-0000-0000-000000000002");
        var demoPriorityOffer = new PriorityOffer(
            ShipmentId: demoShipment2Id,
            EligibleCarrierId: demoCarrierId,
            FirstShipmentId: demoShipmentId,
            TripId: demoTripId,
            IssuedAtUtc: DateTimeOffset.UtcNow,
            ExpiresAtUtc: DateTimeOffset.UtcNow.AddMinutes(10),
            IsDeclined: false,
            IsAccepted: false,
            Notes: "Oferta prioritária de 10 minutos para a 2ª encomenda do mesmo remetente (Regra 2).");

        _priorityOffers[demoShipment2Id] = demoPriorityOffer;
    }
}
