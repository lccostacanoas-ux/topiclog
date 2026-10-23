// ============================================================================
// TOPIC LOG — MÓDULO FINANCEIRO: INTERFACES DE REPOSITÓRIO (PR-FIN-01)
// ============================================================================

namespace TopicLog.Api.Modules.Finance;

public interface IFinancialPolicyRepository
{
    Task<CommercialPolicy?> GetActivePolicyAsync(DateTimeOffset referenceDate, CancellationToken cancellationToken = default);
    Task<CommercialPolicy?> GetPolicyByVersionAsync(string version, CancellationToken cancellationToken = default);
    Task<CommercialPolicy?> GetPolicyByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<CommercialPolicy>> GetAllPoliciesAsync(CancellationToken cancellationToken = default);
    Task<CommercialPolicy> CreatePolicyAsync(CommercialPolicy policy, CancellationToken cancellationToken = default);
    Task UpdatePolicyAsync(CommercialPolicy policy, CancellationToken cancellationToken = default);
}

public interface ISubscriptionRepository
{
    Task<CarrierSubscription?> GetActiveSubscriptionByCarrierIdAsync(Guid carrierId, DateTimeOffset referenceDate, CancellationToken cancellationToken = default);
    Task<CarrierSubscription?> GetSubscriptionByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<CarrierSubscription>> GetSubscriptionsByCarrierIdAsync(Guid carrierId, CancellationToken cancellationToken = default);
    Task<CarrierSubscription> CreateSubscriptionAsync(CarrierSubscription subscription, CancellationToken cancellationToken = default);
    Task UpdateSubscriptionAsync(CarrierSubscription subscription, CancellationToken cancellationToken = default);
}

public interface IFinancialSnapshotRepository
{
    Task<FinancialSnapshot?> GetSnapshotByContractIdAsync(Guid contractId, CancellationToken cancellationToken = default);
    Task<FinancialSnapshot> CreateSnapshotAsync(FinancialSnapshot snapshot, CancellationToken cancellationToken = default);
}

public interface IFinancialAuditRepository
{
    Task RecordAuditEntryAsync(FinancialAuditEntry entry, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<FinancialAuditEntry>> GetAuditEntriesAsync(string? entityType = null, Guid? entityId = null, CancellationToken cancellationToken = default);
}
