namespace TopicLog.Api.Modules.Verification;

/// <summary>
/// Contrato de persistência de casos e checks de KYC independente da tecnologia de banco (DEC-01).
/// </summary>
public interface IKycRepository
{
    Task<KycCaseEntity?> FindLatestByUserIdAsync(
        Guid userId,
        CancellationToken cancellationToken);

    Task<KycCaseEntity?> FindByIdAsync(
        Guid caseId,
        CancellationToken cancellationToken);

    Task SaveCaseAsync(
        KycCaseEntity kycCase,
        CancellationToken cancellationToken);
}

/// <summary>
/// Implementação temporária em memória de <see cref="IKycRepository"/> exclusiva para
/// desenvolvimento local e testes iniciais em equipamento de 8 GB de RAM (DEC-01).
/// A persistência real com PostgreSQL 16 (INFRA/sql/001_identity_kyc_audit.sql) e seus
/// testes de integração permanecem pendentes antes de homologação para produção.
/// </summary>
public sealed class InMemoryKycRepository : IKycRepository
{
    private readonly Lock _syncRoot = new();
    private readonly Dictionary<Guid, KycCaseEntity> _byCaseId = [];
    private readonly Dictionary<Guid, Guid> _latestCaseIdByUser = [];

    public Task<KycCaseEntity?> FindLatestByUserIdAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_syncRoot)
        {
            if (_latestCaseIdByUser.TryGetValue(userId, out Guid caseId)
                && _byCaseId.TryGetValue(caseId, out var kycCase))
            {
                return Task.FromResult<KycCaseEntity?>(Clone(kycCase));
            }

            return Task.FromResult<KycCaseEntity?>(null);
        }
    }

    public Task<KycCaseEntity?> FindByIdAsync(
        Guid caseId,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_syncRoot)
        {
            return _byCaseId.TryGetValue(caseId, out var kycCase)
                ? Task.FromResult<KycCaseEntity?>(Clone(kycCase))
                : Task.FromResult<KycCaseEntity?>(null);
        }
    }

    public Task SaveCaseAsync(
        KycCaseEntity kycCase,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(kycCase);
        cancellationToken.ThrowIfCancellationRequested();

        lock (_syncRoot)
        {
            var cloned = Clone(kycCase);
            _byCaseId[cloned.Id] = cloned;
            _latestCaseIdByUser[cloned.UserId] = cloned.Id;
        }

        return Task.CompletedTask;
    }

    private static KycCaseEntity Clone(KycCaseEntity src) =>
        new()
        {
            Id = src.Id,
            UserId = src.UserId,
            Provider = src.Provider,
            ProviderReferenceId = src.ProviderReferenceId,
            Status = src.Status,
            RejectionReason = src.RejectionReason,
            SubmittedAtUtc = src.SubmittedAtUtc,
            DecidedAtUtc = src.DecidedAtUtc,
            ExpiresAtUtc = src.ExpiresAtUtc,
            Checks = src.Checks
                .Select(c => new KycCheckEntity
                {
                    Id = c.Id,
                    KycCaseId = c.KycCaseId,
                    CheckType = c.CheckType,
                    Status = c.Status,
                    EvidenceReference = c.EvidenceReference,
                    VerifiedAtUtc = c.VerifiedAtUtc
                })
                .ToList()
        };
}
