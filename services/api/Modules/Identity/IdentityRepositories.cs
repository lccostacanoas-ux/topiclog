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

            lock (_syncRoot)
            {
                foreach (var item in items)
                {
                    if (item.User is not null && item.Profile is not null)
                    {
                        _byId[item.User.Id] = (item.User, item.Profile);
                        _idByEmail[item.User.Email.Trim().ToLowerInvariant()] = item.User.Id;
                    }
                }
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

    private void SeedDefaultUsers()
    {
        lock (_syncRoot)
        {
            var luizId = Guid.Parse("a0000000-0000-0000-0000-000000000001");
            string luizEmail = "lccostacanoas@gmail.com";
            if (!_idByEmail.ContainsKey(luizEmail))
            {
                var user = new UserEntity
                {
                    Id = luizId,
                    Email = luizEmail,
                    PhoneEncrypted = "encrypted_31988887777",
                    PhoneMasked = "(31) 98888-7777",
                    PasswordHash = "12345678",
                    Status = UserAccountStatus.ACTIVE,
                    CreatedAtUtc = DateTimeOffset.UtcNow,
                    UpdatedAtUtc = DateTimeOffset.UtcNow
                };

                var profile = new UserProfileEntity
                {
                    UserId = luizId,
                    DisplayName = "Luiz Carlos Costa",
                    City = "Belo Horizonte",
                    StateUf = "MG",
                    CpfMasked = "550.***.***-67",
                    CpfHash = "cpfhash_luiz_carlos_costa",
                    Roles = [UserRole.CARRIER],
                    KycStatus = KycStatus.VERIFIED,
                    TermsAcceptedVersion = "2026-v1.0",
                    TermsAcceptedAtUtc = DateTimeOffset.UtcNow,
                    RatingAvg = 5.0m,
                    RatingCount = 34,
                    VehicleType = "CARRO",
                    VehicleModel = "Fiat Strada Endurance",
                    VehiclePlate = "BRA2E19",
                    VehicleYear = "2023",
                    Renavam = "00987654321",
                    CnhNumber = "04982314560",
                    CnhCategory = "B",
                    CarrierTermsAccepted = true,
                    CarrierTermsAcceptedAtUtc = DateTimeOffset.UtcNow,
                    BankName = "Mercado Pago",
                    PixKeyType = "CPF",
                    PixKey = "55042724567",
                    MpAccountEmail = "lccostacanoas@gmail.com",
                    UpdatedAtUtc = DateTimeOffset.UtcNow
                };

                _byId[luizId] = (user, profile);
                _idByEmail[luizEmail] = luizId;
            }
            else if (_idByEmail.TryGetValue(luizEmail, out Guid existingId) && _byId.TryGetValue(existingId, out var existingEntry))
            {
                if (string.IsNullOrWhiteSpace(existingEntry.Profile.VehiclePlate))
                {
                    existingEntry.Profile.VehicleType = "CARRO";
                    existingEntry.Profile.VehicleModel = "Fiat Strada Endurance";
                    existingEntry.Profile.VehiclePlate = "BRA2E19";
                    existingEntry.Profile.VehicleYear = "2023";
                    existingEntry.Profile.Renavam = "00987654321";
                    existingEntry.Profile.CnhCategory = "B";
                    existingEntry.Profile.CnhNumber = "04982314560";
                    existingEntry.Profile.CarrierTermsAccepted = true;
                    existingEntry.Profile.PixKeyType = "CPF";
                    existingEntry.Profile.PixKey = "55042724567";
                    existingEntry.Profile.BankName = "Mercado Pago";
                    existingEntry.Profile.MpAccountEmail = "lccostacanoas@gmail.com";
                }
            }

            string aliasEmail = "luizcostacanoas@gmail.com";
            if (!_idByEmail.ContainsKey(aliasEmail))
            {
                var aliasId = Guid.Parse("a0000000-0000-0000-0000-000000000002");
                var userAlias = new UserEntity
                {
                    Id = aliasId,
                    Email = aliasEmail,
                    PhoneEncrypted = "encrypted_31988887777",
                    PhoneMasked = "(31) 98888-7777",
                    PasswordHash = "123456",
                    Status = UserAccountStatus.ACTIVE,
                    CreatedAtUtc = DateTimeOffset.UtcNow,
                    UpdatedAtUtc = DateTimeOffset.UtcNow
                };

                var profileAlias = new UserProfileEntity
                {
                    UserId = aliasId,
                    DisplayName = "Luiz Carlos Costa",
                    City = "Belo Horizonte",
                    StateUf = "MG",
                    CpfMasked = "550.***.***-67",
                    CpfHash = "cpfhash_luiz_carlos_costa_alias",
                    Roles = [UserRole.CARRIER],
                    KycStatus = KycStatus.VERIFIED,
                    TermsAcceptedVersion = "2026-v1.0",
                    TermsAcceptedAtUtc = DateTimeOffset.UtcNow,
                    RatingAvg = 5.0m,
                    RatingCount = 34,
                    VehicleType = "CARRO",
                    VehicleModel = "Fiat Strada Endurance",
                    VehiclePlate = "BRA2E19",
                    VehicleYear = "2023",
                    Renavam = "00987654321",
                    CnhNumber = "04982314560",
                    CnhCategory = "B",
                    CarrierTermsAccepted = true,
                    CarrierTermsAcceptedAtUtc = DateTimeOffset.UtcNow,
                    BankName = "Mercado Pago",
                    PixKeyType = "CPF",
                    PixKey = "55042724567",
                    MpAccountEmail = "lccostacanoas@gmail.com",
                    UpdatedAtUtc = DateTimeOffset.UtcNow
                };

                _byId[aliasId] = (userAlias, profileAlias);
                _idByEmail[aliasEmail] = aliasId;
            }
        }
    }

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

            // Fallback amigável: se o usuário digitou o Nome Completo (ex: "Luiz Carlos Costa")
            var matchByName = _byId.Values.FirstOrDefault(x =>
                string.Equals(x.Profile.DisplayName?.Trim(), normalizedEmail.Trim(), StringComparison.OrdinalIgnoreCase) ||
                string.Equals(x.Profile.DisplayName?.Trim().Normalize(System.Text.NormalizationForm.FormD), normalizedEmail.Trim().Normalize(System.Text.NormalizationForm.FormD), StringComparison.OrdinalIgnoreCase));
            if (matchByName != default && matchByName.User is not null)
            {
                return Task.FromResult<(UserEntity, UserProfileEntity)?>(Clone(matchByName));
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
