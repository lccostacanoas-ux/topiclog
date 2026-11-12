using System.Collections.Concurrent;
using TopicLog.Api.Common.Contracts;

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

    Task<IReadOnlyList<(UserEntity User, UserProfileEntity Profile)>> ListAllAsync(
        CancellationToken cancellationToken = default);
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
/// Contrato de persistência de códigos temporários de recuperação de senha (hash HMAC, uso único).
/// </summary>
public interface IPasswordResetRepository
{
    Task SaveAndInvalidatePreviousAsync(
        PasswordResetTokenEntity token,
        CancellationToken cancellationToken);

    Task<PasswordResetTokenEntity?> FindLatestActiveByEmailAsync(
        string normalizedEmail,
        CancellationToken cancellationToken);

    Task UpdateAsync(
        PasswordResetTokenEntity token,
        CancellationToken cancellationToken);
}

/// <summary>
/// Implementação de <see cref="IUserRepository"/> com armazenamento local persistente em disco (JSON)
/// e cache indexado em memória para suportar testes locais e reiniciar o servidor sem perda de contas (DEC-01.1).
/// </summary>
public sealed class InMemoryUserRepository : IUserRepository
{
    private static readonly System.Text.Json.JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private static string StorageFilePath => TopicLog.Api.Common.StoragePathResolver.ResolveFilePath("users_store.json");

    private readonly Lock _syncRoot = new();
    private readonly Dictionary<Guid, (UserEntity User, UserProfileEntity Profile)> _byId = [];
    private readonly Dictionary<string, Guid> _idByEmail = new(StringComparer.OrdinalIgnoreCase);

    public InMemoryUserRepository()
    {
        LoadFromDisk();
        SeedDefaultUsers();
    }

    private void LoadFromDisk()
    {
        try
        {
            if (!File.Exists(StorageFilePath))
            {
                return;
            }

            var json = File.ReadAllText(StorageFilePath);
            var items = System.Text.Json.JsonSerializer.Deserialize<List<PersistedUserEntry>>(json);
            if (items is null) return;

            bool migratedAny = false;
            var aliasId = Guid.Parse("a0000000-0000-0000-0000-000000000002");

            lock (_syncRoot)
            {
                foreach (var item in items)
                {
                    if (item.User is not null && item.Profile is not null)
                    {
                        if (item.User.Id == aliasId)
                        {
                            migratedAny = true;
                            continue;
                        }

                        if (IdentityApplicationService.ApplyAutoVerificationIfComplete(item.User, item.Profile))
                        {
                            migratedAny = true;
                        }

                        _byId[item.User.Id] = (item.User, item.Profile);
                        _idByEmail[item.User.Email.Trim().ToLowerInvariant()] = item.User.Id;
                    }
                }
            }

            if (migratedAny)
            {
                SaveToDisk();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[TopicLog.Storage] Aviso ao carregar contas de usuários: {ex.Message}");
        }
    }

    private void SaveToDisk()
    {
        List<PersistedUserEntry> entries;
        lock (_syncRoot)
        {
            entries = _byId.Values.Select(x => new PersistedUserEntry(x.User, x.Profile)).ToList();
        }

        try
        {
            var json = System.Text.Json.JsonSerializer.Serialize(entries, JsonOptions);
            TopicLog.Api.Common.StoragePathResolver.SaveFileAtomically(StorageFilePath, json);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[TopicLog.Storage] Erro crítico ao salvar contas de usuários: {ex.Message}");
            throw new InvalidOperationException("Falha na persistência de contas de usuários em disco.", ex);
        }
    }

    private static void SeedDefaultUsers()
    {
        // Produção: nenhuma conta pessoal ou administrativa com senha fixa é pré-semeada no código.
    }

    public Task<(UserEntity User, UserProfileEntity Profile)?> FindByEmailAsync(
        string normalizedEmail,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(normalizedEmail);
        cancellationToken.ThrowIfCancellationRequested();

        string cleanEmail = normalizedEmail.Trim().ToLowerInvariant();

        lock (_syncRoot)
        {
            if (_idByEmail.TryGetValue(cleanEmail, out Guid id)
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
            SaveToDisk();
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
            SaveToDisk();
        }

        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<(UserEntity User, UserProfileEntity Profile)>> ListAllAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_syncRoot)
        {
            IReadOnlyList<(UserEntity User, UserProfileEntity Profile)> result = _byId.Values.Select(Clone).ToList();
            return Task.FromResult(result);
        }
    }

    private sealed record PersistedUserEntry(UserEntity User, UserProfileEntity Profile);

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
            PostalCode = source.Profile.PostalCode,
            Street = source.Profile.Street,
            Number = source.Profile.Number,
            Neighborhood = source.Profile.Neighborhood,
            Complement = source.Profile.Complement,
            Roles = [.. source.Profile.Roles],
            KycStatus = source.Profile.KycStatus,
            TermsAcceptedVersion = source.Profile.TermsAcceptedVersion,
            TermsAcceptedAtUtc = source.Profile.TermsAcceptedAtUtc,
            RatingAvg = source.Profile.RatingAvg,
            RatingCount = source.Profile.RatingCount,
            VehicleType = source.Profile.VehicleType,
            VehicleModel = source.Profile.VehicleModel,
            VehiclePlate = source.Profile.VehiclePlate,
            VehicleYear = source.Profile.VehicleYear,
            Renavam = source.Profile.Renavam,
            CnhCategory = source.Profile.CnhCategory,
            CnhNumber = source.Profile.CnhNumber,
            CarrierTermsAccepted = source.Profile.CarrierTermsAccepted,
            CarrierTermsAcceptedAtUtc = source.Profile.CarrierTermsAcceptedAtUtc,
            PixKeyType = source.Profile.PixKeyType,
            PixKey = source.Profile.PixKey,
            BankName = source.Profile.BankName,
            MpAccountEmail = source.Profile.MpAccountEmail,
            CnhDocumentName = source.Profile.CnhDocumentName,
            CnhDocumentData = source.Profile.CnhDocumentData,
            CrlvDocumentName = source.Profile.CrlvDocumentName,
            CrlvDocumentData = source.Profile.CrlvDocumentData,
            IdentityDocumentName = source.Profile.IdentityDocumentName,
            IdentityDocumentData = source.Profile.IdentityDocumentData,
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

/// <summary>
/// Implementação persistente em disco (JSON atômico) de <see cref="IPasswordResetRepository"/>.
/// Armazena apenas hashes dos códigos de recuperação com expiração e controle de tentativas.
/// </summary>
public sealed class InMemoryPasswordResetRepository : IPasswordResetRepository
{
    private static readonly System.Text.Json.JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private static string StorageFilePath =>
        TopicLog.Api.Common.StoragePathResolver.ResolveFilePath("password_reset_tokens.json");

    private readonly Lock _syncRoot = new();
    private readonly List<PasswordResetTokenEntity> _tokens = [];

    public InMemoryPasswordResetRepository()
    {
        LoadFromDisk();
    }

    private void LoadFromDisk()
    {
        try
        {
            if (!File.Exists(StorageFilePath))
            {
                return;
            }

            string json = File.ReadAllText(StorageFilePath).TrimStart('\uFEFF');
            var items = System.Text.Json.JsonSerializer.Deserialize<List<PasswordResetTokenEntity>>(json);
            if (items is null) return;

            DateTimeOffset cutoff = DateTimeOffset.UtcNow.AddHours(-24);
            lock (_syncRoot)
            {
                _tokens.Clear();
                foreach (var item in items)
                {
                    if (item.ExpiresAtUtc >= cutoff)
                    {
                        _tokens.Add(Clone(item));
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[TopicLog.Storage] Aviso ao carregar tokens de recuperação: {ex.Message}");
        }
    }

    private void SaveToDiskLocked()
    {
        try
        {
            DateTimeOffset cutoff = DateTimeOffset.UtcNow.AddHours(-24);
            var snapshot = _tokens.Where(t => t.ExpiresAtUtc >= cutoff).Select(Clone).ToList();
            string json = System.Text.Json.JsonSerializer.Serialize(snapshot, JsonOptions);
            TopicLog.Api.Common.StoragePathResolver.SaveFileAtomically(StorageFilePath, json);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[TopicLog.Storage] Erro ao salvar tokens de recuperação: {ex.Message}");
        }
    }

    public Task SaveAndInvalidatePreviousAsync(
        PasswordResetTokenEntity token,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(token);
        cancellationToken.ThrowIfCancellationRequested();

        lock (_syncRoot)
        {
            DateTimeOffset nowUtc = DateTimeOffset.UtcNow;
            foreach (var existing in _tokens)
            {
                if (existing.UserId == token.UserId && existing.ConsumedAtUtc is null)
                {
                    existing.ConsumedAtUtc = nowUtc;
                }
            }

            _tokens.Add(Clone(token));
            SaveToDiskLocked();
        }

        return Task.CompletedTask;
    }

    public Task<PasswordResetTokenEntity?> FindLatestActiveByEmailAsync(
        string normalizedEmail,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(normalizedEmail);
        cancellationToken.ThrowIfCancellationRequested();

        string cleanEmail = normalizedEmail.Trim().ToLowerInvariant();
        lock (_syncRoot)
        {
            var match = _tokens
                .Where(t => string.Equals(t.NormalizedEmail, cleanEmail, StringComparison.OrdinalIgnoreCase)
                         && t.ConsumedAtUtc is null)
                .OrderByDescending(t => t.CreatedAtUtc)
                .FirstOrDefault();

            return Task.FromResult(match is null ? null : Clone(match));
        }
    }

    public Task UpdateAsync(
        PasswordResetTokenEntity token,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(token);
        cancellationToken.ThrowIfCancellationRequested();

        lock (_syncRoot)
        {
            int idx = _tokens.FindIndex(t => t.Id == token.Id);
            if (idx >= 0)
            {
                _tokens[idx] = Clone(token);
                SaveToDiskLocked();
            }
        }

        return Task.CompletedTask;
    }

    private static PasswordResetTokenEntity Clone(PasswordResetTokenEntity src) => new()
    {
        Id = src.Id,
        UserId = src.UserId,
        NormalizedEmail = src.NormalizedEmail,
        CodeHash = src.CodeHash,
        ExpiresAtUtc = src.ExpiresAtUtc,
        Attempts = src.Attempts,
        MaxAttempts = src.MaxAttempts,
        CreatedAtUtc = src.CreatedAtUtc,
        ConsumedAtUtc = src.ConsumedAtUtc
    };
}
