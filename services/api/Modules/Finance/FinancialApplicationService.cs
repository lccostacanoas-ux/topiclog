// ============================================================================
// TOPIC LOG — SERVIÇO DE APLICAÇÃO E PROVEDOR FINANCEIRO (PR-FIN-01)
// ============================================================================

using System.Text.Json;
using TopicLog.Api.Common.Domain;

namespace TopicLog.Api.Modules.Finance;

public interface IFinancialPolicyProvider
{
    Task<CommercialPolicy> GetEffectivePolicyAsync(DateTimeOffset referenceDate, CancellationToken cancellationToken = default);

    Task<FinancialSnapshot> CreateOrGetSnapshotForContractAsync(
        Guid contractId,
        Guid proposalId,
        Guid shipmentId,
        Guid carrierId,
        Guid senderId,
        long amountCents,
        DateTimeOffset referenceDate,
        CancellationToken cancellationToken = default);

    Task<FinancialSnapshot?> GetSnapshotByContractIdAsync(Guid contractId, CancellationToken cancellationToken = default);

    Task<SimulateSplitResponse> SimulateSplitAsync(
        long amountCents,
        Guid? carrierId,
        string? planCodeOverride,
        DateTimeOffset? referenceDate = null,
        CancellationToken cancellationToken = default);

    Task<CommercialPolicyResponse> CreatePolicyVersionAsync(
        Guid actorUserId,
        string actorRole,
        CreateCommercialPolicyRequest request,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CommercialPolicyResponse>> GetPolicyHistoryAsync(CancellationToken cancellationToken = default);

    Task<CommercialPolicyResponse> RevokePolicyAsync(
        Guid policyId,
        Guid actorUserId,
        string actorRole,
        string? reason,
        CancellationToken cancellationToken = default);

    Task<SubscriptionResponse> SubscribePlanAsync(Guid carrierId, string planCode, CancellationToken cancellationToken = default);

    Task<SubscriptionResponse> CancelSubscriptionAsync(Guid carrierId, CancellationToken cancellationToken = default);

    Task<SubscriptionResponse?> GetCarrierSubscriptionAsync(Guid carrierId, CancellationToken cancellationToken = default);

    IReadOnlyList<PlanCatalogItemResponse> GetAvailablePlans();
}

public class FinancialApplicationService : IFinancialPolicyProvider, IDisposable
{
    private readonly IFinancialPolicyRepository _policyRepository;
    private readonly ISubscriptionRepository _subscriptionRepository;
    private readonly IFinancialSnapshotRepository _snapshotRepository;
    private readonly IFinancialAuditRepository _auditRepository;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private bool _disposed;

    public FinancialApplicationService(
        IFinancialPolicyRepository policyRepository,
        ISubscriptionRepository subscriptionRepository,
        IFinancialSnapshotRepository snapshotRepository,
        IFinancialAuditRepository auditRepository)
    {
        _policyRepository = policyRepository;
        _subscriptionRepository = subscriptionRepository;
        _snapshotRepository = snapshotRepository;
        _auditRepository = auditRepository;
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            _gate.Dispose();
            _disposed = true;
        }
        GC.SuppressFinalize(this);
    }

    public async Task<CommercialPolicy> GetEffectivePolicyAsync(DateTimeOffset referenceDate, CancellationToken cancellationToken = default)
    {
        var policy = await _policyRepository.GetActivePolicyAsync(referenceDate, cancellationToken);
        if (policy is null)
        {
            throw new DomainRuleViolationException(
                "NO_ACTIVE_COMMERCIAL_POLICY",
                $"Nenhuma política comercial ativa foi encontrada para a data de referência {referenceDate:O}.",
                500);
        }
        return policy;
    }

    public async Task<FinancialSnapshot> CreateOrGetSnapshotForContractAsync(
        Guid contractId,
        Guid proposalId,
        Guid shipmentId,
        Guid carrierId,
        Guid senderId,
        long amountCents,
        DateTimeOffset referenceDate,
        CancellationToken cancellationToken = default)
    {
        // 1. Idempotência: Se o snapshot já existe, retorna imutável sem recalcular
        var existing = await _snapshotRepository.GetSnapshotByContractIdAsync(contractId, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        if (amountCents <= 0)
        {
            throw new DomainRuleViolationException(
                "INVALID_AMOUNT",
                "O valor da operação em centavos deve ser estritamente positivo para cálculo do snapshot financeiro.");
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            // Dupla checagem sob lock
            existing = await _snapshotRepository.GetSnapshotByContractIdAsync(contractId, cancellationToken);
            if (existing is not null)
            {
                return existing;
            }

            // 2. Busca política comercial vigente no momento exato do aceite
            var policy = await GetEffectivePolicyAsync(referenceDate, cancellationToken);

            // 3. Verifica se o transportador possui plano Premium ativo na data de referência
            var activeSubscription = await _subscriptionRepository.GetActiveSubscriptionByCarrierIdAsync(carrierId, referenceDate, cancellationToken);
            bool isPremium = activeSubscription is not null && activeSubscription.PlanCode == "PREMIUM";

            string planCode = isPremium ? "PREMIUM" : "FREE";
            decimal commissionPercent = isPremium ? policy.PremiumPlanCommissionPercent : policy.FreePlanCommissionPercent;

            // 4. Cálculo com matemática de inteiros e arredondamento financeiro determinístico (MidpointRounding.AwayFromZero)
            long commissionCents = (long)Math.Round(amountCents * (commissionPercent / 100.0m), MidpointRounding.AwayFromZero);
            long carrierNetCents = amountCents - commissionCents;

            // Invariante contábil (ADR-0002)
            if (commissionCents + carrierNetCents != amountCents)
            {
                throw new DomainRuleViolationException(
                    "FINANCIAL_INVARIANT_VIOLATION",
                    "Violação da invariante contábil: a soma da comissão com o líquido do transportador diverge do valor bruto.",
                    500);
            }

            var snapshot = new FinancialSnapshot
            {
                Id = Guid.NewGuid(),
                ContractId = contractId,
                ProposalId = proposalId,
                ShipmentId = shipmentId,
                CarrierId = carrierId,
                SenderId = senderId,
                PolicyId = policy.Id,
                PolicyVersion = policy.Version,
                PlanCode = planCode,
                CommissionRatePercent = commissionPercent,
                TransportAmountCents = amountCents,
                PlatformCommissionCents = commissionCents,
                CarrierNetCents = carrierNetCents,
                RoundingDifferenceCents = 0,
                GatewayFeesAbsorbedByPlatform = true,
                SnapshottedAtUtc = DateTimeOffset.UtcNow
            };

            var created = await _snapshotRepository.CreateSnapshotAsync(snapshot, cancellationToken);

            // Auditoria da geração do snapshot
            await _auditRepository.RecordAuditEntryAsync(new FinancialAuditEntry
            {
                EntityType = "FINANCIAL_SNAPSHOT",
                EntityId = created.Id,
                Operation = "SNAPSHOT_FROZEN",
                ActorUserId = senderId,
                ActorRole = "CLIENT",
                PayloadBefore = null,
                PayloadAfter = JsonSerializer.Serialize(created),
                RecordedAtUtc = DateTimeOffset.UtcNow
            }, cancellationToken);

            return created;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<FinancialSnapshot?> GetSnapshotByContractIdAsync(Guid contractId, CancellationToken cancellationToken = default)
    {
        return await _snapshotRepository.GetSnapshotByContractIdAsync(contractId, cancellationToken);
    }

    public async Task<SimulateSplitResponse> SimulateSplitAsync(
        long amountCents,
        Guid? carrierId,
        string? planCodeOverride,
        DateTimeOffset? referenceDate = null,
        CancellationToken cancellationToken = default)
    {
        if (amountCents <= 0)
        {
            throw new DomainRuleViolationException(
                "INVALID_AMOUNT",
                "O valor a simular deve ser estritamente positivo.");
        }

        var refDate = referenceDate ?? DateTimeOffset.UtcNow;
        var policy = await GetEffectivePolicyAsync(refDate, cancellationToken);

        string planApplied = "FREE";
        decimal commissionPercent = policy.FreePlanCommissionPercent;

        if (!string.IsNullOrWhiteSpace(planCodeOverride))
        {
            if (planCodeOverride.Equals("PREMIUM", StringComparison.OrdinalIgnoreCase))
            {
                planApplied = "PREMIUM";
                commissionPercent = policy.PremiumPlanCommissionPercent;
            }
        }
        else if (carrierId.HasValue)
        {
            var sub = await _subscriptionRepository.GetActiveSubscriptionByCarrierIdAsync(carrierId.Value, refDate, cancellationToken);
            if (sub is not null && sub.PlanCode == "PREMIUM")
            {
                planApplied = "PREMIUM";
                commissionPercent = policy.PremiumPlanCommissionPercent;
            }
        }

        long platformCommissionCents = (long)Math.Round(amountCents * (commissionPercent / 100.0m), MidpointRounding.AwayFromZero);
        long carrierNetCents = amountCents - platformCommissionCents;

        return new SimulateSplitResponse(
            TransportAmountCents: amountCents,
            PlanApplied: planApplied,
            CommissionRatePercent: commissionPercent,
            PlatformCommissionCents: platformCommissionCents,
            CarrierNetCents: carrierNetCents,
            GatewayFeesAbsorbedByPlatform: true,
            PolicyVersionApplied: policy.Version);
    }

    public async Task<CommercialPolicyResponse> CreatePolicyVersionAsync(
        Guid actorUserId,
        string actorRole,
        CreateCommercialPolicyRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        // Autorização estrita: apenas GENERAL_ADMIN pode publicar nova política
        if (!actorRole.Equals("GENERAL_ADMIN", StringComparison.OrdinalIgnoreCase))
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN_INSUFFICIENT_ROLE",
                "Apenas administradores gerais (GENERAL_ADMIN) possuem autorização para publicar novas versões de políticas comerciais.",
                403);
        }

        if (string.IsNullOrWhiteSpace(request.Version))
        {
            throw new DomainRuleViolationException("INVALID_VERSION", "O identificador da versão não pode ser vazio.");
        }

        if (request.FreePlanCommissionPercent < 0 || request.FreePlanCommissionPercent > 100 ||
            request.PremiumPlanCommissionPercent < 0 || request.PremiumPlanCommissionPercent > 100)
        {
            throw new DomainRuleViolationException("INVALID_COMMISSION_PERCENT", "Os percentuais de comissão devem estar entre 0% e 100%.");
        }

        if (request.PremiumMonthlyFeeCents < 0)
        {
            throw new DomainRuleViolationException("INVALID_MONTHLY_FEE", "A mensalidade do plano Premium não pode ser negativa.");
        }

        if (string.IsNullOrWhiteSpace(request.Justification))
        {
            throw new DomainRuleViolationException("JUSTIFICATION_REQUIRED", "É obrigatório registrar a justificativa técnica/comercial da nova versão.");
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            var now = DateTimeOffset.UtcNow;

            if (request.ValidFrom <= now)
            {
                throw new DomainRuleViolationException(
                    "CONFLICTING_POLICY_VALIDITY",
                    $"A data de início da nova política ({request.ValidFrom:O}) deve ser estritamente posterior ao horário atual ({now:O}).",
                    422);
            }

            var existingByVersion = await _policyRepository.GetPolicyByVersionAsync(request.Version, cancellationToken);
            if (existingByVersion is not null)
            {
                throw new DomainRuleViolationException(
                    "POLICY_VERSION_ALREADY_EXISTS",
                    $"A versão '{request.Version}' já existe e é imutável. Escolha um novo identificador de versão.",
                    409);
            }

            var allPolicies = await _policyRepository.GetAllPoliciesAsync(cancellationToken);
            var activePolicies = allPolicies
                .Where(p => p.IsActive)
                .OrderBy(p => p.ValidFrom)
                .ToList();

            var currentActive = activePolicies
                .FirstOrDefault(p => p.ValidFrom <= now && (p.ValidUntil == null || p.ValidUntil > now));

            if (currentActive is not null && request.ValidFrom <= currentActive.ValidFrom)
            {
                throw new DomainRuleViolationException(
                    "CONFLICTING_POLICY_VALIDITY",
                    $"A data de início da nova política ({request.ValidFrom:O}) deve ser estritamente posterior à data de início da política ativa atual ({currentActive.ValidFrom:O}).",
                    422);
            }

            // Evitar conflitos ou sobreposições concorrentes com políticas agendadas existentes:
            var conflictingScheduled = activePolicies
                .FirstOrDefault(p => p.ValidFrom > now && p.ValidFrom >= request.ValidFrom);

            if (conflictingScheduled is not null)
            {
                throw new DomainRuleViolationException(
                    "CONFLICTING_POLICY_VALIDITY",
                    $"Conflito de vigência: já existe uma política agendada ('{conflictingScheduled.Version}') com início em {conflictingScheduled.ValidFrom:O}. Revogue a versão agendada antes de publicar uma data anterior ou concomitante.",
                    422);
            }

            // Encadeamento determinístico: identifica a política predecessora ativa imediata
            var predecessor = activePolicies
                .Where(p => p.ValidFrom < request.ValidFrom)
                .OrderByDescending(p => p.ValidFrom)
                .FirstOrDefault();

            if (predecessor is not null)
            {
                predecessor.ValidUntil = request.ValidFrom;
                await _policyRepository.UpdatePolicyAsync(predecessor, cancellationToken);
            }

            var newPolicy = new CommercialPolicy
            {
                Id = Guid.NewGuid(),
                Version = request.Version.Trim().ToUpperInvariant(),
                Name = request.Name.Trim(),
                FreePlanCommissionPercent = request.FreePlanCommissionPercent,
                PremiumPlanCommissionPercent = request.PremiumPlanCommissionPercent,
                PremiumMonthlyFeeCents = request.PremiumMonthlyFeeCents,
                CancellationPenaltyPercent = request.CancellationPenaltyPercent ?? 10.00m,
                CancellationMinFeeCents = request.CancellationMinFeeCents ?? 700,
                CancellationInjuredPartySharePercent = request.CancellationInjuredPartySharePercent ?? 80.00m,
                ValidFrom = request.ValidFrom,
                ValidUntil = null,
                IsActive = true,
                Justification = request.Justification.Trim(),
                CreatedByUserId = actorUserId,
                CreatedAtUtc = now
            };

            var created = await _policyRepository.CreatePolicyAsync(newPolicy, cancellationToken);

            await _auditRepository.RecordAuditEntryAsync(new FinancialAuditEntry
            {
                EntityType = "COMMERCIAL_POLICY",
                EntityId = created.Id,
                Operation = "POLICY_CREATED",
                ActorUserId = actorUserId,
                ActorRole = actorRole,
                PayloadBefore = predecessor is not null ? JsonSerializer.Serialize(predecessor) : null,
                PayloadAfter = JsonSerializer.Serialize(created),
                RecordedAtUtc = now
            }, cancellationToken);

            return MapPolicyResponse(created);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<CommercialPolicyResponse> RevokePolicyAsync(
        Guid policyId,
        Guid actorUserId,
        string actorRole,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        if (!actorRole.Equals("GENERAL_ADMIN", StringComparison.OrdinalIgnoreCase))
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN_INSUFFICIENT_ROLE",
                "Apenas administradores gerais (GENERAL_ADMIN) possuem autorização para revogar políticas comerciais.",
                403);
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            var policy = await _policyRepository.GetPolicyByIdAsync(policyId, cancellationToken);
            if (policy is null)
            {
                throw new DomainRuleViolationException("POLICY_NOT_FOUND", "Política comercial não encontrada para o ID informado.", 404);
            }

            if (!policy.IsActive)
            {
                throw new DomainRuleViolationException("POLICY_ALREADY_REVOKED", "Esta política já se encontra revogada.", 422);
            }

            var now = DateTimeOffset.UtcNow;

            // Não é permitido revogar políticas históricas cujo período de vigência já foi concluído
            if (policy.ValidUntil.HasValue && policy.ValidUntil.Value <= now)
            {
                throw new DomainRuleViolationException("CANNOT_REVOKE_HISTORICAL_POLICY", "Não é permitido revogar políticas históricas cujo período de vigência já foi concluído.", 422);
            }

            // Não é permitido revogar a política atualmente vigente sem substituição
            if (policy.ValidFrom <= now && (policy.ValidUntil == null || policy.ValidUntil > now))
            {
                throw new DomainRuleViolationException("CANNOT_REVOKE_ACTIVE_POLICY", "A política atualmente vigente não pode ser sumariamente revogada sem a publicação de uma nova versão para substituí-la.", 422);
            }

            var policyBefore = JsonSerializer.Serialize(policy);

            policy.IsActive = false;
            string cleanReason = string.IsNullOrWhiteSpace(reason) ? "Revogação administrativa de versão futura" : reason.Trim();
            policy.Justification += $" | [REVOGADA em {now:O} por {actorRole}: {cleanReason}]";

            await _policyRepository.UpdatePolicyAsync(policy, cancellationToken);

            // Recalcular encadeamento das políticas ativas remanescentes
            var allPolicies = await _policyRepository.GetAllPoliciesAsync(cancellationToken);
            var remainingActive = allPolicies
                .Where(p => p.IsActive)
                .OrderBy(p => p.ValidFrom)
                .ToList();

            for (int i = 0; i < remainingActive.Count; i++)
            {
                var current = remainingActive[i];
                DateTimeOffset? expectedValidUntil = (i < remainingActive.Count - 1)
                    ? remainingActive[i + 1].ValidFrom
                    : null;

                if (current.ValidUntil != expectedValidUntil)
                {
                    current.ValidUntil = expectedValidUntil;
                    await _policyRepository.UpdatePolicyAsync(current, cancellationToken);
                }
            }

            await _auditRepository.RecordAuditEntryAsync(new FinancialAuditEntry
            {
                EntityType = "COMMERCIAL_POLICY",
                EntityId = policy.Id,
                Operation = "POLICY_REVOKED",
                ActorUserId = actorUserId,
                ActorRole = actorRole,
                PayloadBefore = policyBefore,
                PayloadAfter = JsonSerializer.Serialize(policy),
                RecordedAtUtc = now
            }, cancellationToken);

            return MapPolicyResponse(policy);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<IReadOnlyList<CommercialPolicyResponse>> GetPolicyHistoryAsync(CancellationToken cancellationToken = default)
    {
        var list = await _policyRepository.GetAllPoliciesAsync(cancellationToken);
        return list.Select(MapPolicyResponse).ToList();
    }

    public async Task<SubscriptionResponse> SubscribePlanAsync(Guid carrierId, string planCode, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(planCode) || !planCode.Equals("PREMIUM", StringComparison.OrdinalIgnoreCase))
        {
            throw new DomainRuleViolationException("INVALID_PLAN", "Apenas o plano 'PREMIUM' está disponível para contratação de assinatura.");
        }

        var policy = await GetEffectivePolicyAsync(DateTimeOffset.UtcNow, cancellationToken);

        await _gate.WaitAsync(cancellationToken);
        try
        {
            var existingSub = await _subscriptionRepository.GetActiveSubscriptionByCarrierIdAsync(carrierId, DateTimeOffset.UtcNow, cancellationToken);
            if (existingSub is not null && existingSub.PlanCode == "PREMIUM")
            {
                // Já ativo: estende o período em 30 dias
                existingSub.CurrentPeriodEndUtc = existingSub.CurrentPeriodEndUtc.AddDays(30);
                existingSub.UpdatedAtUtc = DateTimeOffset.UtcNow;
                await _subscriptionRepository.UpdateSubscriptionAsync(existingSub, cancellationToken);

                await _auditRepository.RecordAuditEntryAsync(new FinancialAuditEntry
                {
                    EntityType = "CARRIER_SUBSCRIPTION",
                    EntityId = existingSub.Id,
                    Operation = "SUBSCRIPTION_RENEWED",
                    ActorUserId = carrierId,
                    ActorRole = "CARRIER",
                    PayloadBefore = null,
                    PayloadAfter = JsonSerializer.Serialize(existingSub),
                    RecordedAtUtc = DateTimeOffset.UtcNow
                }, cancellationToken);

                return MapSubscriptionResponse(existingSub);
            }

            var now = DateTimeOffset.UtcNow;
            var newSub = new CarrierSubscription
            {
                Id = Guid.NewGuid(),
                CarrierId = carrierId,
                PlanCode = "PREMIUM",
                Status = SubscriptionStatus.ACTIVE,
                MonthlyFeeCents = policy.PremiumMonthlyFeeCents,
                CommissionRatePercent = policy.PremiumPlanCommissionPercent,
                CurrentPeriodStartUtc = now,
                CurrentPeriodEndUtc = now.AddDays(30),
                CanceledAtUtc = null,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };

            var created = await _subscriptionRepository.CreateSubscriptionAsync(newSub, cancellationToken);

            await _auditRepository.RecordAuditEntryAsync(new FinancialAuditEntry
            {
                EntityType = "CARRIER_SUBSCRIPTION",
                EntityId = created.Id,
                Operation = "SUBSCRIPTION_ACTIVATED",
                ActorUserId = carrierId,
                ActorRole = "CARRIER",
                PayloadBefore = null,
                PayloadAfter = JsonSerializer.Serialize(created),
                RecordedAtUtc = DateTimeOffset.UtcNow
            }, cancellationToken);

            return MapSubscriptionResponse(created);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<SubscriptionResponse> CancelSubscriptionAsync(Guid carrierId, CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            var sub = await _subscriptionRepository.GetActiveSubscriptionByCarrierIdAsync(carrierId, DateTimeOffset.UtcNow, cancellationToken);
            if (sub is null)
            {
                throw new DomainRuleViolationException(
                    "NO_ACTIVE_SUBSCRIPTION",
                    "O transportador não possui uma assinatura Premium ativa para cancelamento.",
                    404);
            }

            // Preservação contratual: Marca canceled_at, mas mantém ativo até o fim do período já contratado
            sub.Status = SubscriptionStatus.CANCELED;
            sub.CanceledAtUtc = DateTimeOffset.UtcNow;
            sub.UpdatedAtUtc = DateTimeOffset.UtcNow;
            await _subscriptionRepository.UpdateSubscriptionAsync(sub, cancellationToken);

            await _auditRepository.RecordAuditEntryAsync(new FinancialAuditEntry
            {
                EntityType = "CARRIER_SUBSCRIPTION",
                EntityId = sub.Id,
                Operation = "SUBSCRIPTION_CANCELED",
                ActorUserId = carrierId,
                ActorRole = "CARRIER",
                PayloadBefore = null,
                PayloadAfter = JsonSerializer.Serialize(sub),
                RecordedAtUtc = DateTimeOffset.UtcNow
            }, cancellationToken);

            return MapSubscriptionResponse(sub);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<SubscriptionResponse?> GetCarrierSubscriptionAsync(Guid carrierId, CancellationToken cancellationToken = default)
    {
        var sub = await _subscriptionRepository.GetActiveSubscriptionByCarrierIdAsync(carrierId, DateTimeOffset.UtcNow, cancellationToken);
        return sub is not null ? MapSubscriptionResponse(sub) : null;
    }

    public IReadOnlyList<PlanCatalogItemResponse> GetAvailablePlans()
    {
        return new List<PlanCatalogItemResponse>
        {
            new(
                PlanCode: "STANDARD",
                Name: "Plano Padrão Gratuito",
                Description: "Sem mensalidade fixa. Comissão de 13% sobre fretes realizados. Todas as taxas de gateway absorvidas pela plataforma.",
                MonthlyFeeCents: 0,
                CommissionRatePercent: 13.00m,
                GatewayFeesAbsorbed: true),
            new(
                PlanCode: "PREMIUM",
                Name: "Plano Premium Transportador",
                Description: "Assinatura mensal de R$ 39,90. Comissão reduzida de apenas 7% sobre fretes. Todas as taxas de gateway absorvidas.",
                MonthlyFeeCents: 3990,
                CommissionRatePercent: 7.00m,
                GatewayFeesAbsorbed: true)
        };
    }

    public static string DeterminePolicyStatus(CommercialPolicy p, DateTimeOffset? referenceDate = null)
    {
        var now = referenceDate ?? DateTimeOffset.UtcNow;
        if (!p.IsActive) return "REVOGADA";
        if (p.ValidFrom > now) return "AGENDADA";
        if (p.ValidUntil.HasValue && p.ValidUntil.Value <= now) return "HISTORICA";
        return "VIGENTE";
    }

    private static CommercialPolicyResponse MapPolicyResponse(CommercialPolicy p) => new(
        p.Id,
        p.Version,
        p.Name,
        p.FreePlanCommissionPercent,
        p.PremiumPlanCommissionPercent,
        p.PremiumMonthlyFeeCents,
        p.CancellationPenaltyPercent,
        p.CancellationMinFeeCents,
        p.CancellationInjuredPartySharePercent,
        p.ValidFrom,
        p.ValidUntil,
        p.IsActive,
        p.Justification,
        p.CreatedAtUtc,
        DeterminePolicyStatus(p));

    private static SubscriptionResponse MapSubscriptionResponse(CarrierSubscription s) => new(
        s.Id,
        s.CarrierId,
        s.PlanCode,
        s.Status.ToString(),
        s.MonthlyFeeCents,
        s.CommissionRatePercent,
        s.CurrentPeriodStartUtc,
        s.CurrentPeriodEndUtc,
        s.CanceledAtUtc);
}
