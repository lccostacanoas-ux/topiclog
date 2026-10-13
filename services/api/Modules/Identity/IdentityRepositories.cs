using System.Collections.Concurrent;

namespace TopicLog.Api.Modules.Identity;

/// <summary>
/// Contrato de persistência de contas e perfis independente da tecnologia de banco (DEC-01.2).
/// </summary>
public interface IUserRepository
{
    Task<(UserEntity User, UserProfileEntity Profile)?> FindByEmailAsync(
        string normalizedEmail,
        CancellationToken cancellationToken);

    Task<(UserEntity User, UserProfileEntity Profile)?> FindByIdAsync(
        Guid userId,
        CancellationToken cancellationToken);

    Task<bool> ExistsByCpfHashAsync(
        string cpfHash,
        Guid? excludeUserId,
        CancellationToken cancellationToken);

    Task CreateAsync(
        UserEntity user,
        UserProfileEntity profile,
        CancellationToken cancellationToken);

    Task UpdateAsync(
        UserEntity user,
        UserProfileEntity profile,
        CancellationToken cancellationToken);
}

/// <summary>
/// Contrato de persistência de sessões de Refresh Token rotativo independente da tecnologia de banco (DEC-01.2).
/// </summary>
public interface IRefreshTokenRepository
{
    Task SaveAsync(
        RefreshTokenSessionEntity session,
        CancellationToken cancellationToken);

    Task<RefreshTokenSessionEntity?> FindByTokenHashAsync(
        string tokenHash,
        CancellationToken cancellationToken);

    Task UpdateAsync(
        RefreshTokenSessionEntity session,
        CancellationToken cancellationToken);

    Task RevokeFamilyAsync(
        Guid tokenFamilyId,
        DateTimeOffset revokedAtUtc,
        CancellationToken cancellationToken);
}

/// <summary>
/// Contrato de trilha de auditoria imutável (Append-Only) independente da tecnologia de banco (DEC-01.2).
/// Não expõe métodos de atualização ou exclusão.
/// </summary>
public interface IAuditRepository
{
    Task AppendAsync(
        AuditEventEntity auditEvent,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<AuditEventEntity>> ListRecentAsync(
        int limit,
        CancellationToken cancellationToken);
}

/// <summary>
/// Implementação temporária em memória de <see cref="IUserRepository"/> exclusiva para
/// desenvolvimento local e testes iniciais em equipamento de 8 GB de RAM (DEC-01.1, DEC-01.4).
/// A persistência real com PostgreSQL 16 (infra/sql/001_identity_kyc_audit.sql) e seus
/// testes de integração permanecem pendentes antes de homologação para produção.
/// </summary>
public sealed class InMemoryUserRepository : IUserRepository
{
    private readonly Lock _syncRoot = new();
    private readonly Dictionary<Guid, (UserEntity User, UserProfileEntity Profile)> _byId = [];
    private readonly Dictionary<string, Guid> _idByEmail = new(StringComparer.OrdinalIgnoreCase);

    public Task<(UserEntity User, UserProfileEntity Profile)?> FindByEmailAsync(
        string normalizedEmail,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(normalizedEmail);
        cancellationToken.ThrowIfCancellationRequested();

        lock (_syncRoot)
        {
            if (_idByEmail.TryGetValue(normalizedEmail.Trim(), out Guid id)
                && _byId.TryGetValue(id, out var entry))
            {
                return Task.FromResult<(UserEntity, UserProfileEntity)?>(Clone(entry));
            }

            return Task.FromResult<(UserEntity, UserProfileEntity)?>(null);
        }
    }

    public Task<(UserEntity User, UserProfileEntity Profile)?> FindByIdAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_syncRoot)
        {
            if (_byId.TryGetValue(userId, out var entry))
            {
                return Task.FromResult<(UserEntity, UserProfileEntity)?>(Clone(entry));
            }

            return Task.FromResult<(UserEntity, UserProfileEntity)?>(null);
        }
    }

    public Task<bool> ExistsByCpfHashAsync(
        string cpfHash,
        Guid? excludeUserId,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(cpfHash);
        cancellationToken.ThrowIfCancellationRequested();

        lock (_syncRoot)
        {
            bool exists = _byId.Values.Any(x =>
                (!excludeUserId.HasValue || x.User.Id != excludeUserId.Value)
                && string.Equals(x.Profile.CpfHash, cpfHash, StringComparison.Ordinal));

            return Task.FromResult(exists);
        }
    }

    public Task CreateAsync(
        UserEntity user,
        UserProfileEntity profile,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(user);
        ArgumentNullException.ThrowIfNull(profile);
        cancellationToken.ThrowIfCancellationRequested();

        string normalizedEmail = user.Email.Trim().ToLowerInvariant();

        lock (_syncRoot)
        {
            if (_idByEmail.ContainsKey(normalizedEmail))
            {
                throw new InvalidOperationException("E-mail já cadastrado no repositório.");
            }

            if (!string.IsNullOrWhiteSpace(profile.CpfHash)
                && _byId.Values.Any(x => string.Equals(x.Profile.CpfHash, profile.CpfHash, StringComparison.Ordinal)))
            {
                throw new InvalidOperationException("CPF já vinculado a outra conta no repositório.");
            }

            _idByEmail[normalizedEmail] = user.Id;
            _byId[user.Id] = Clone((user, profile));
        }

        return Task.CompletedTask;
    }

    public Task UpdateAsync(
        UserEntity user,
        UserProfileEntity profile,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(user);
        ArgumentNullException.ThrowIfNull(profile);
        cancellationToken.ThrowIfCancellationRequested();

        lock (_syncRoot)
        {
            if (!_byId.ContainsKey(user.Id))
            {
                throw new InvalidOperationException("Usuário não encontrado para atualização.");
            }

            _byId[user.Id] = Clone((user, profile));
        }

        return Task.CompletedTask;
    }

    private static (UserEntity User, UserProfileEntity Profile) Clone((UserEntity User, UserProfileEntity Profile) source)
    {
        var clonedUser = new UserEntity
        {
            Id = source.User.Id,
            Email = source.User.Email,
            PhoneEncrypted = source.User.PhoneEncrypted,
            PhoneMasked = source.User.PhoneMasked,
            PasswordHash = source.User.PasswordHash,
            Status = source.User.Status,
            FailedLoginAttempts = source.User.FailedLoginAttempts,
            LockoutUntilUtc = source.User.LockoutUntilUtc,
            CreatedAtUtc = source.User.CreatedAtUtc,
            UpdatedAtUtc = source.User.UpdatedAtUtc
        };

        var clonedProfile = new UserProfileEntity
        {
            UserId = source.Profile.UserId,
            DisplayName = source.Profile.DisplayName,
            CpfHash = source.Profile.CpfHash,
            CpfMasked = source.Profile.CpfMasked,
            City = source.Profile.City,
            StateUf = source.Profile.StateUf,
            Roles = [.. source.Profile.Roles],
            KycStatus = source.Profile.KycStatus,
            TermsAcceptedVersion = source.Profile.TermsAcceptedVersion,
            TermsAcceptedAtUtc = source.Profile.TermsAcceptedAtUtc,
            RatingAvg = source.Profile.RatingAvg,
            RatingCount = source.Profile.RatingCount,
            UpdatedAtUtc = source.Profile.UpdatedAtUtc
        };

        return (clonedUser, clonedProfile);
    }
}

/// <summary>
/// Implementação temporária em memória de <see cref="IRefreshTokenRepository"/> para desenvolvimento e testes iniciais (DEC-01.1).
/// </summary>
public sealed class InMemoryRefreshTokenRepository : IRefreshTokenRepository
{
    private readonly Lock _syncRoot = new();
    private readonly Dictionary<string, RefreshTokenSessionEntity> _byHash = new(StringComparer.Ordinal);

    public Task SaveAsync(
        RefreshTokenSessionEntity session,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(session);
        cancellationToken.ThrowIfCancellationRequested();

        lock (_syncRoot)
        {
            _byHash[session.TokenHash] = Clone(session);
        }

        return Task.CompletedTask;
    }

    public Task<RefreshTokenSessionEntity?> FindByTokenHashAsync(
        string tokenHash,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tokenHash);
        cancellationToken.ThrowIfCancellationRequested();

        lock (_syncRoot)
        {
            return _byHash.TryGetValue(tokenHash, out var session)
                ? Task.FromResult<RefreshTokenSessionEntity?>(Clone(session))
                : Task.FromResult<RefreshTokenSessionEntity?>(null);
        }
    }

    public Task UpdateAsync(
        RefreshTokenSessionEntity session,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(session);
        cancellationToken.ThrowIfCancellationRequested();

        lock (_syncRoot)
        {
            _byHash[session.TokenHash] = Clone(session);
        }

        return Task.CompletedTask;
    }

    public Task RevokeFamilyAsync(
        Guid tokenFamilyId,
        DateTimeOffset revokedAtUtc,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_syncRoot)
        {
            foreach (var session in _byHash.Values.Where(s => s.TokenFamilyId == tokenFamilyId))
            {
                session.RevokedAtUtc ??= revokedAtUtc;
            }
        }

        return Task.CompletedTask;
    }

    private static RefreshTokenSessionEntity Clone(RefreshTokenSessionEntity src) =>
        new()
        {
            Id = src.Id,
            UserId = src.UserId,
            TokenHash = src.TokenHash,
            TokenFamilyId = src.TokenFamilyId,
            ExpiresAtUtc = src.ExpiresAtUtc,
            RevokedAtUtc = src.RevokedAtUtc,
            ReplacedByTokenHash = src.ReplacedByTokenHash,
            CreatedAtUtc = src.CreatedAtUtc
        };
}

/// <summary>
/// Implementação temporária Append-Only em memória de <see cref="IAuditRepository"/> (DEC-01.1).
/// </summary>
public sealed class InMemoryAuditRepository : IAuditRepository
{
    private readonly ConcurrentQueue<AuditEventEntity> _events = new();

    public Task AppendAsync(
        AuditEventEntity auditEvent,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(auditEvent);
        cancellationToken.ThrowIfCancellationRequested();

        _events.Enqueue(auditEvent);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<AuditEventEntity>> ListRecentAsync(
        int limit,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        int safeLimit = Math.Clamp(limit, 1, 500);

        IReadOnlyList<AuditEventEntity> result = _events
            .Reverse()
            .Take(safeLimit)
            .ToList();

        return Task.FromResult(result);
    }
}
