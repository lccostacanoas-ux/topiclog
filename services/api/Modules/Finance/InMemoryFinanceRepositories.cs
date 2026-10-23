// ============================================================================
// TOPIC LOG — REPOSITÓRIOS EM MEMÓRIA PARA O MÓDULO FINANCEIRO (PR-FIN-01)
// Ambiente local/testes: Operação thread-safe, concorrência e seeds oficiais v2.0
// ============================================================================

using System.Collections.Concurrent;
using System.Globalization;

namespace TopicLog.Api.Modules.Finance;

public class InMemoryFinancialPolicyRepository : IFinancialPolicyRepository
{
    private readonly ConcurrentDictionary<Guid, CommercialPolicy> _policies = new();
    private readonly Lock _syncLock = new();
    private readonly string? _stateFilePath;
    private static readonly System.Text.Json.JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true
    };

    public InMemoryFinancialPolicyRepository()
    {
        bool isApiRuntime = (AppContext.BaseDirectory.Contains("api", StringComparison.OrdinalIgnoreCase)
                             || AppDomain.CurrentDomain.FriendlyName.Contains("TopicLog.Api", StringComparison.OrdinalIgnoreCase))
                            && !AppContext.BaseDirectory.Contains("unit", StringComparison.OrdinalIgnoreCase)
                            && !AppContext.BaseDirectory.Contains("test", StringComparison.OrdinalIgnoreCase);

        if (isApiRuntime)
        {
            var baseDir = Directory.GetCurrentDirectory();
            var stateDir = Directory.Exists(Path.Combine(baseDir, "services", "api"))
                ? Path.Combine(baseDir, "services", "api", ".state")
                : Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".state"));
            _stateFilePath = Path.Combine(stateDir, "finance_policies.json");
            if (File.Exists(_stateFilePath))
            {
                try
                {
                    var json = File.ReadAllText(_stateFilePath);
                    var list = System.Text.Json.JsonSerializer.Deserialize<List<CommercialPolicy>>(json, _jsonOptions);
                    if (list != null && list.Count > 0)
                    {
                        foreach (var p in list)
                        {
                            _policies[p.Id] = p;
                        }
                        return;
                    }
                }
                catch
                {
                    // Fallback para seed padrão
                }
            }
        }

        // Seed oficial v2.0 (D10, D11, D12)
        var defaultPolicy = new CommercialPolicy
        {
            Id = Guid.Parse("a0000001-0000-0000-0000-000000000001"),
            Version = "POL-COM-V1",
            Name = "Política Comercial Vinculante Topic Log v2.0",
            FreePlanCommissionPercent = 13.00m,
            PremiumPlanCommissionPercent = 7.00m,
            PremiumMonthlyFeeCents = 3990,
            CancellationPenaltyPercent = 10.00m,
            CancellationMinFeeCents = 700,
            CancellationInjuredPartySharePercent = 80.00m,
            ValidFrom = DateTimeOffset.Parse("2026-10-12T00:00:00Z", CultureInfo.InvariantCulture),
            ValidUntil = null,
            IsActive = true,
            Justification = "Política inicial aprovada nas decisões vinculantes v2.0 (D10: 13%, D11: 7% e R$ 39,90, D12: absorção de taxas)",
            CreatedByUserId = Guid.Parse("00000000-0000-0000-0000-000000000001"),
            CreatedAtUtc = DateTimeOffset.Parse("2026-10-12T00:00:00Z", CultureInfo.InvariantCulture)
        };
        _policies[defaultPolicy.Id] = defaultPolicy;
    }

    private void SaveState()
    {
        if (string.IsNullOrWhiteSpace(_stateFilePath)) return;
        try
        {
            var dir = Path.GetDirectoryName(_stateFilePath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }
            var list = _policies.Values.ToList();
            var json = System.Text.Json.JsonSerializer.Serialize(list, _jsonOptions);
            File.WriteAllText(_stateFilePath, json);
        }
        catch
        {
            // Silencioso em caso de falha de I/O em teste
        }
    }

    public Task<CommercialPolicy?> GetActivePolicyAsync(DateTimeOffset referenceDate, CancellationToken cancellationToken = default)
    {
        var active = _policies.Values
            .Where(p => p.IsActive && p.ValidFrom <= referenceDate && (p.ValidUntil == null || p.ValidUntil > referenceDate))
            .OrderByDescending(p => p.ValidFrom)
            .FirstOrDefault();

        return Task.FromResult(active);
    }

    public Task<CommercialPolicy?> GetPolicyByVersionAsync(string version, CancellationToken cancellationToken = default)
    {
        var policy = _policies.Values.FirstOrDefault(p => p.Version.Equals(version, StringComparison.OrdinalIgnoreCase));
        return Task.FromResult(policy);
    }

    public Task<CommercialPolicy?> GetPolicyByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        _policies.TryGetValue(id, out var policy);
        return Task.FromResult(policy);
    }

    public Task<IReadOnlyList<CommercialPolicy>> GetAllPoliciesAsync(CancellationToken cancellationToken = default)
    {
        IReadOnlyList<CommercialPolicy> list = _policies.Values.OrderByDescending(p => p.ValidFrom).ToList();
        return Task.FromResult(list);
    }

    public Task<CommercialPolicy> CreatePolicyAsync(CommercialPolicy policy, CancellationToken cancellationToken = default)
    {
        lock (_syncLock)
        {
            _policies[policy.Id] = policy;
            SaveState();
            return Task.FromResult(policy);
        }
    }

    public Task UpdatePolicyAsync(CommercialPolicy policy, CancellationToken cancellationToken = default)
    {
        lock (_syncLock)
        {
            _policies[policy.Id] = policy;
            SaveState();
            return Task.CompletedTask;
        }
    }
}

public class InMemorySubscriptionRepository : ISubscriptionRepository
{
    private readonly ConcurrentDictionary<Guid, CarrierSubscription> _subscriptions = new();
    private readonly Lock _syncLock = new();

    public Task<CarrierSubscription?> GetActiveSubscriptionByCarrierIdAsync(Guid carrierId, DateTimeOffset referenceDate, CancellationToken cancellationToken = default)
    {
        var sub = _subscriptions.Values
            .Where(s => s.CarrierId == carrierId &&
                        (s.Status == SubscriptionStatus.ACTIVE || (s.Status == SubscriptionStatus.CANCELED && s.CurrentPeriodEndUtc >= referenceDate)) &&
                        s.CurrentPeriodStartUtc <= referenceDate &&
                        s.CurrentPeriodEndUtc >= referenceDate)
            .OrderByDescending(s => s.CurrentPeriodEndUtc)
            .FirstOrDefault();

        return Task.FromResult(sub);
    }

    public Task<CarrierSubscription?> GetSubscriptionByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        _subscriptions.TryGetValue(id, out var sub);
        return Task.FromResult(sub);
    }

    public Task<IReadOnlyList<CarrierSubscription>> GetSubscriptionsByCarrierIdAsync(Guid carrierId, CancellationToken cancellationToken = default)
    {
        IReadOnlyList<CarrierSubscription> list = _subscriptions.Values
            .Where(s => s.CarrierId == carrierId)
            .OrderByDescending(s => s.CreatedAtUtc)
            .ToList();

        return Task.FromResult(list);
    }

    public Task<CarrierSubscription> CreateSubscriptionAsync(CarrierSubscription subscription, CancellationToken cancellationToken = default)
    {
        lock (_syncLock)
        {
            _subscriptions[subscription.Id] = subscription;
            return Task.FromResult(subscription);
        }
    }

    public Task UpdateSubscriptionAsync(CarrierSubscription subscription, CancellationToken cancellationToken = default)
    {
        lock (_syncLock)
        {
            _subscriptions[subscription.Id] = subscription;
            return Task.CompletedTask;
        }
    }
}

public class InMemoryFinancialSnapshotRepository : IFinancialSnapshotRepository
{
    private readonly ConcurrentDictionary<Guid, FinancialSnapshot> _snapshotsByContract = new();
    private readonly Lock _syncLock = new();

    public Task<FinancialSnapshot?> GetSnapshotByContractIdAsync(Guid contractId, CancellationToken cancellationToken = default)
    {
        _snapshotsByContract.TryGetValue(contractId, out var snapshot);
        return Task.FromResult(snapshot);
    }

    public Task<FinancialSnapshot> CreateSnapshotAsync(FinancialSnapshot snapshot, CancellationToken cancellationToken = default)
    {
        lock (_syncLock)
        {
            // Idempotência: Se já existir para o mesmo contrato, retorna o existente sem sobrescrever
            if (_snapshotsByContract.TryGetValue(snapshot.ContractId, out var existing))
            {
                return Task.FromResult(existing);
            }

            _snapshotsByContract[snapshot.ContractId] = snapshot;
            return Task.FromResult(snapshot);
        }
    }
}

public class InMemoryFinancialAuditRepository : IFinancialAuditRepository
{
    private readonly ConcurrentQueue<FinancialAuditEntry> _entries = new();

    public Task RecordAuditEntryAsync(FinancialAuditEntry entry, CancellationToken cancellationToken = default)
    {
        _entries.Enqueue(entry);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<FinancialAuditEntry>> GetAuditEntriesAsync(string? entityType = null, Guid? entityId = null, CancellationToken cancellationToken = default)
    {
        var query = _entries.AsEnumerable();

        if (!string.IsNullOrWhiteSpace(entityType))
        {
            query = query.Where(e => e.EntityType.Equals(entityType, StringComparison.OrdinalIgnoreCase));
        }

        if (entityId.HasValue)
        {
            query = query.Where(e => e.EntityId == entityId.Value);
        }

        IReadOnlyList<FinancialAuditEntry> list = query.OrderByDescending(e => e.RecordedAtUtc).ToList();
        return Task.FromResult(list);
    }
}
