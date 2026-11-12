using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Options;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Common.Options;

namespace TopicLog.Api.Modules.Identity;

/// <summary>
/// Serviço de aplicação do módulo Identity (PR-01.1):
/// Cadastro sem exigência imediata de KYC (D05), aceite de termos com responsabilidade distribuída (D08),
/// login com proteção contra força bruta, rotação de refresh token e controle RBAC/ABAC.
/// </summary>
public sealed class IdentityApplicationService
{
    private const int PasswordResetCodeExpirationMinutes = 15;
    private const int PasswordResetResendCooldownSeconds = 60;

    private static readonly HashSet<UserRole> SelfAssignableRoles =
    [
        UserRole.SENDER,
        UserRole.CARRIER,
        UserRole.RECIPIENT
    ];

    private readonly IUserRepository _userRepository;
    private readonly IRefreshTokenRepository _refreshTokenRepository;
    private readonly IPasswordResetRepository _passwordResetRepository;
    private readonly IAuditRepository _auditRepository;
    private readonly IEmailDeliveryService _emailService;
    private readonly SecurityCryptoService _crypto;
    private readonly ResourceAuthorizationService _authorization;
    private readonly SecurityOptions _securityOptions;

    public IdentityApplicationService(
        IUserRepository userRepository,
        IRefreshTokenRepository refreshTokenRepository,
        IPasswordResetRepository passwordResetRepository,
        IAuditRepository auditRepository,
        IEmailDeliveryService emailService,
        SecurityCryptoService crypto,
        ResourceAuthorizationService authorization,
        IOptions<SecurityOptions> securityOptions)
    {
        ArgumentNullException.ThrowIfNull(userRepository);
        ArgumentNullException.ThrowIfNull(refreshTokenRepository);
        ArgumentNullException.ThrowIfNull(passwordResetRepository);
        ArgumentNullException.ThrowIfNull(auditRepository);
        ArgumentNullException.ThrowIfNull(emailService);
        ArgumentNullException.ThrowIfNull(crypto);
        ArgumentNullException.ThrowIfNull(authorization);
        ArgumentNullException.ThrowIfNull(securityOptions);

        _userRepository = userRepository;
        _refreshTokenRepository = refreshTokenRepository;
        _passwordResetRepository = passwordResetRepository;
        _auditRepository = auditRepository;
        _emailService = emailService;
        _crypto = crypto;
        _authorization = authorization;
        _securityOptions = securityOptions.Value;
    }

    public async Task<AuthSessionResponse> RegisterAsync(
        RegisterUserRequest request,
        string correlationId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!request.AcceptTerms)
        {
            throw new DomainRuleViolationException(
                "TERMS_ACCEPTANCE_REQUIRED",
                "É obrigatório aceitar os Termos de Uso e Política de Privacidade com distribuição legal de responsabilidades (D08).",
                StatusCodes.Status400BadRequest);
        }

        string normalizedEmail = NormalizeAndValidateEmail(request.Email);
        ValidatePasswordStrength(request.Password);

        if (string.IsNullOrWhiteSpace(request.DisplayName) || request.DisplayName.Trim().Length < 3)
        {
            throw new DomainRuleViolationException(
                "INVALID_DISPLAY_NAME",
                "O nome de exibição deve ter pelo menos 3 caracteres.",
                StatusCodes.Status400BadRequest);
        }

        string phoneDigits = SecurityCryptoService.NormalizeDigits(request.Phone);
        if (phoneDigits.Length is < 10 or > 15)
        {
            throw new DomainRuleViolationException(
                "INVALID_PHONE",
                "Informe um número de telefone válido com DDD.",
                StatusCodes.Status400BadRequest);
        }

        var existingByEmail = await _userRepository.FindByEmailAsync(normalizedEmail, cancellationToken).ConfigureAwait(false);
        if (existingByEmail is not null)
        {
            throw new DomainRuleViolationException(
                "EMAIL_ALREADY_REGISTERED",
                "Já existe uma conta cadastrada com o e-mail informado.",
                StatusCodes.Status409Conflict);
        }

        var assignedRoles = ParseAndValidateSelfAssignableRoles(request.InitialRoles);

        string? cpfHash = null;
        string? cpfMasked = null;
        if (string.IsNullOrWhiteSpace(request.Cpf))
        {
            throw new DomainRuleViolationException(
                "CPF_REQUIRED",
                "O CPF é obrigatório para criar uma conta na TopicLog.",
                StatusCodes.Status400BadRequest);
        }

        if (!SecurityCryptoService.IsValidCpf(request.Cpf))
        {
            throw new DomainRuleViolationException(
                "INVALID_CPF",
                "O CPF informado é inválido conforme os dígitos verificadores oficiais da Receita Federal.",
                StatusCodes.Status400BadRequest);
        }

        string cpfDigits = SecurityCryptoService.NormalizeDigits(request.Cpf);
        cpfHash = _crypto.ComputeCpfHash(cpfDigits);
        bool cpfExists = await _userRepository.ExistsByCpfHashAsync(cpfHash, excludeUserId: null, cancellationToken).ConfigureAwait(false);
        if (cpfExists)
        {
            throw new DomainRuleViolationException(
                "CPF_ALREADY_REGISTERED",
                "O CPF informado já está vinculado a outra conta.",
                StatusCodes.Status409Conflict);
        }

        cpfMasked = SecurityCryptoService.MaskCpf(cpfDigits);

        if (assignedRoles.Contains(UserRole.CARRIER))
        {
            if (string.IsNullOrWhiteSpace(request.VehicleModel) || string.IsNullOrWhiteSpace(request.VehiclePlate))
            {
                throw new DomainRuleViolationException(
                    "CARRIER_VEHICLE_REQUIRED",
                    "O cadastro do veículo (modelo e placa) é obrigatório para transportadores parceiros.",
                    StatusCodes.Status400BadRequest);
            }

            if (!request.AcceptCarrierTerms)
            {
                throw new DomainRuleViolationException(
                    "CARRIER_TERMS_REQUIRED",
                    "O aceite do Termo de Adesão e Responsabilidade do Transportador e Veículo é obrigatório.",
                    StatusCodes.Status400BadRequest);
            }
        }
        DateTimeOffset nowUtc = DateTimeOffset.UtcNow;

        var user = new UserEntity
        {
            Id = Guid.NewGuid(),
            Email = normalizedEmail,
            PhoneEncrypted = _crypto.EncryptPhone(phoneDigits),
            PhoneMasked = SecurityCryptoService.MaskPhone(phoneDigits),
            PasswordHash = _crypto.HashPassword(request.Password),
            Status = UserAccountStatus.ACTIVE,
            FailedLoginAttempts = 0,
            LockoutUntilUtc = null,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc
        };

        string termsVersion = string.IsNullOrWhiteSpace(request.TermsVersion)
            ? _securityOptions.RequiredTermsVersion
            : request.TermsVersion.Trim();

        var profile = new UserProfileEntity
        {
            UserId = user.Id,
            DisplayName = request.DisplayName.Trim(),
            CpfHash = cpfHash,
            CpfMasked = cpfMasked,
            City = string.IsNullOrWhiteSpace(request.City) ? string.Empty : request.City.Trim(),
            StateUf = string.IsNullOrWhiteSpace(request.StateUf) ? string.Empty : request.StateUf.Trim().ToUpperInvariant(),
            PostalCode = string.IsNullOrWhiteSpace(request.PostalCode) ? null : request.PostalCode.Trim(),
            Street = string.IsNullOrWhiteSpace(request.Street) ? null : request.Street.Trim(),
            Number = string.IsNullOrWhiteSpace(request.Number) ? null : request.Number.Trim(),
            Neighborhood = string.IsNullOrWhiteSpace(request.Neighborhood) ? null : request.Neighborhood.Trim(),
            Complement = string.IsNullOrWhiteSpace(request.Complement) ? null : request.Complement.Trim(),
            Roles = assignedRoles,
            KycStatus = KycStatus.NOT_STARTED,
            TermsAcceptedVersion = termsVersion,
            TermsAcceptedAtUtc = nowUtc,
            RatingAvg = 5.00m,
            RatingCount = 0,
            VehicleType = request.VehicleType,
            VehicleModel = request.VehicleModel?.Trim(),
            VehiclePlate = request.VehiclePlate?.Trim().ToUpperInvariant(),
            VehicleYear = request.VehicleYear?.Trim(),
            Renavam = request.Renavam?.Trim(),
            CnhCategory = request.CnhCategory?.Trim().ToUpperInvariant(),
            CnhNumber = request.CnhNumber?.Trim(),
            CarrierTermsAccepted = assignedRoles.Contains(UserRole.CARRIER) && request.AcceptCarrierTerms,
            CarrierTermsAcceptedAtUtc = assignedRoles.Contains(UserRole.CARRIER) && request.AcceptCarrierTerms ? nowUtc : null,
            UpdatedAtUtc = nowUtc
        };

        ApplyAutoVerificationIfComplete(user, profile);

        await _userRepository.CreateAsync(user, profile, cancellationToken).ConfigureAwait(false);

        await _auditRepository.AppendAsync(
            new AuditEventEntity(
                Id: Guid.NewGuid(),
                ActorUserId: user.Id,
                EntityType: "USER",
                EntityId: user.Id.ToString("D"),
                Action: "USER_REGISTERED",
                CorrelationId: correlationId,
                MetadataJson: JsonSerializer.Serialize(new
                {
                    roles = profile.Roles.Select(r => r.ToString()).ToArray(),
                    kycStatus = profile.KycStatus.ToString(),
                    termsVersion = profile.TermsAcceptedVersion,
                    city = profile.City,
                    stateUf = profile.StateUf
                }),
                CreatedAtUtc: nowUtc),
            cancellationToken).ConfigureAwait(false);

        return await IssueSessionTokensAsync(user, profile, tokenFamilyId: Guid.NewGuid(), nowUtc, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<AuthSessionResponse> LoginAsync(
        LoginRequest request,
        string correlationId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            throw new DomainRuleViolationException(
                "AUTH_INVALID_CREDENTIALS",
                "E-mail ou senha inválidos.",
                StatusCodes.Status401Unauthorized);
        }

        string normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var entry = await _userRepository.FindByEmailAsync(normalizedEmail, cancellationToken).ConfigureAwait(false);
        DateTimeOffset nowUtc = DateTimeOffset.UtcNow;

        if (entry is null)
        {
            await _auditRepository.AppendAsync(
                new AuditEventEntity(
                    Id: Guid.NewGuid(),
                    ActorUserId: null,
                    EntityType: "AUTH_SESSION",
                    EntityId: "ANONYMOUS",
                    Action: "LOGIN_FAILED_UNKNOWN_EMAIL",
                    CorrelationId: correlationId,
                    MetadataJson: "{}",
                    CreatedAtUtc: nowUtc),
                cancellationToken).ConfigureAwait(false);

            throw new DomainRuleViolationException(
                "AUTH_INVALID_CREDENTIALS",
                "E-mail ou senha inválidos.",
                StatusCodes.Status401Unauthorized);
        }

        var (user, profile) = entry.Value;

        if (user.Status == UserAccountStatus.SUSPENDED)
        {
            throw new DomainRuleViolationException(
                "AUTH_ACCOUNT_SUSPENDED",
                "A conta encontra-se suspensa preventivamente.",
                StatusCodes.Status403Forbidden);
        }

        if (user.LockoutUntilUtc.HasValue && user.LockoutUntilUtc.Value > nowUtc)
        {
            await _auditRepository.AppendAsync(
                new AuditEventEntity(
                    Id: Guid.NewGuid(),
                    ActorUserId: user.Id,
                    EntityType: "USER",
                    EntityId: user.Id.ToString("D"),
                    Action: "LOGIN_BLOCKED_LOCKOUT",
                    CorrelationId: correlationId,
                    MetadataJson: JsonSerializer.Serialize(new { lockoutUntilUtc = user.LockoutUntilUtc.Value }),
                    CreatedAtUtc: nowUtc),
                cancellationToken).ConfigureAwait(false);

            throw new DomainRuleViolationException(
                "AUTH_ACCOUNT_LOCKED",
                "Conta temporariamente bloqueada devido a múltiplas tentativas inválidas de acesso.",
                StatusCodes.Status423Locked);
        }

        if (!SecurityCryptoService.VerifyPassword(request.Password, user.PasswordHash))
        {
            user.FailedLoginAttempts++;
            user.UpdatedAtUtc = nowUtc;

            bool triggeredLockout = false;
            if (user.FailedLoginAttempts >= _securityOptions.MaxFailedLoginAttempts)
            {
                user.Status = UserAccountStatus.LOCKED;
                user.LockoutUntilUtc = nowUtc.AddMinutes(_securityOptions.LockoutDurationMinutes);
                triggeredLockout = true;
            }

            await _userRepository.UpdateAsync(user, profile, cancellationToken).ConfigureAwait(false);

            await _auditRepository.AppendAsync(
                new AuditEventEntity(
                    Id: Guid.NewGuid(),
                    ActorUserId: user.Id,
                    EntityType: "USER",
                    EntityId: user.Id.ToString("D"),
                    Action: triggeredLockout ? "ACCOUNT_LOCKED_BRUTE_FORCE" : "LOGIN_FAILED",
                    CorrelationId: correlationId,
                    MetadataJson: JsonSerializer.Serialize(new
                    {
                        failedAttempts = user.FailedLoginAttempts,
                        locked = triggeredLockout
                    }),
                    CreatedAtUtc: nowUtc),
                cancellationToken).ConfigureAwait(false);

            if (triggeredLockout)
            {
                throw new DomainRuleViolationException(
                    "AUTH_ACCOUNT_LOCKED",
                    "Conta temporariamente bloqueada devido a múltiplas tentativas inválidas de acesso.",
                    StatusCodes.Status423Locked);
            }

            throw new DomainRuleViolationException(
                "AUTH_INVALID_CREDENTIALS",
                "E-mail ou senha inválidos.",
                StatusCodes.Status401Unauthorized);
        }

        user.FailedLoginAttempts = 0;
        user.LockoutUntilUtc = null;
        user.Status = UserAccountStatus.ACTIVE;
        user.UpdatedAtUtc = nowUtc;

        if (_crypto.NeedsRehash(user.PasswordHash))
        {
            user.PasswordHash = _crypto.HashPassword(request.Password);
        }

        await _userRepository.UpdateAsync(user, profile, cancellationToken).ConfigureAwait(false);

        await _auditRepository.AppendAsync(
            new AuditEventEntity(
                Id: Guid.NewGuid(),
                ActorUserId: user.Id,
                EntityType: "AUTH_SESSION",
                EntityId: user.Id.ToString("D"),
                Action: "LOGIN_SUCCEEDED",
                CorrelationId: correlationId,
                MetadataJson: "{}",
                CreatedAtUtc: nowUtc),
            cancellationToken).ConfigureAwait(false);

        return await IssueSessionTokensAsync(user, profile, tokenFamilyId: Guid.NewGuid(), nowUtc, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<AuthSessionResponse> RefreshSessionAsync(
        RefreshTokenRequest request,
        string correlationId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (string.IsNullOrWhiteSpace(request.RefreshToken))
        {
            throw new DomainRuleViolationException(
                "AUTH_REFRESH_TOKEN_MISSING",
                "Refresh token obrigatório.",
                StatusCodes.Status401Unauthorized);
        }

        string tokenHash = SecurityCryptoService.HashRefreshToken(request.RefreshToken);
        var session = await _refreshTokenRepository.FindByTokenHashAsync(tokenHash, cancellationToken).ConfigureAwait(false);
        DateTimeOffset nowUtc = DateTimeOffset.UtcNow;

        if (session is null)
        {
            throw new DomainRuleViolationException(
                "AUTH_REFRESH_TOKEN_INVALID",
                "Refresh token inválido ou inexistente.",
                StatusCodes.Status401Unauthorized);
        }

        if (session.RevokedAtUtc.HasValue)
        {
            await _refreshTokenRepository.RevokeFamilyAsync(session.TokenFamilyId, nowUtc, cancellationToken).ConfigureAwait(false);

            await _auditRepository.AppendAsync(
                new AuditEventEntity(
                    Id: Guid.NewGuid(),
                    ActorUserId: session.UserId,
                    EntityType: "AUTH_SESSION",
                    EntityId: session.TokenFamilyId.ToString("D"),
                    Action: "REFRESH_TOKEN_REUSE_DETECTED",
                    CorrelationId: correlationId,
                    MetadataJson: JsonSerializer.Serialize(new { tokenFamilyId = session.TokenFamilyId }),
                    CreatedAtUtc: nowUtc),
                cancellationToken).ConfigureAwait(false);

            throw new DomainRuleViolationException(
                "AUTH_REFRESH_TOKEN_REUSED",
                "Tentativa de reuso de refresh token detectada. Toda a família de sessão foi revogada por segurança.",
                StatusCodes.Status401Unauthorized);
        }

        if (session.ExpiresAtUtc <= nowUtc)
        {
            throw new DomainRuleViolationException(
                "AUTH_REFRESH_TOKEN_EXPIRED",
                "Refresh token expirado.",
                StatusCodes.Status401Unauthorized);
        }

        var entry = await _userRepository.FindByIdAsync(session.UserId, cancellationToken).ConfigureAwait(false)
            ?? throw new DomainRuleViolationException(
                "USER_NOT_FOUND",
                "Conta de usuário não localizada.",
                StatusCodes.Status401Unauthorized);

        var (user, profile) = entry;
        var (newRawRefresh, newRefreshHash) = SecurityCryptoService.CreateRefreshTokenPair();

        session.RevokedAtUtc = nowUtc;
        session.ReplacedByTokenHash = newRefreshHash;
        await _refreshTokenRepository.UpdateAsync(session, cancellationToken).ConfigureAwait(false);

        var nextSession = new RefreshTokenSessionEntity
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = newRefreshHash,
            TokenFamilyId = session.TokenFamilyId,
            ExpiresAtUtc = nowUtc.AddDays(_securityOptions.RefreshTokenLifetimeDays),
            CreatedAtUtc = nowUtc
        };
        await _refreshTokenRepository.SaveAsync(nextSession, cancellationToken).ConfigureAwait(false);

        var (accessToken, expiresInSeconds, _) = _crypto.CreateAccessToken(user, profile, nowUtc);
        return new AuthSessionResponse(
            AccessToken: accessToken,
            RefreshToken: newRawRefresh,
            ExpiresInSeconds: expiresInSeconds,
            TokenType: "Bearer",
            Profile: MapPrivateProfile(user, profile));
    }

    public async Task LogoutAsync(
        AuthenticatedActor actor,
        LogoutRequest request,
        string correlationId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(actor);
        ArgumentNullException.ThrowIfNull(request);

        DateTimeOffset nowUtc = DateTimeOffset.UtcNow;
        if (!string.IsNullOrWhiteSpace(request.RefreshToken))
        {
            string hash = SecurityCryptoService.HashRefreshToken(request.RefreshToken);
            var session = await _refreshTokenRepository.FindByTokenHashAsync(hash, cancellationToken).ConfigureAwait(false);
            if (session is not null && session.UserId == actor.UserId)
            {
                await _refreshTokenRepository.RevokeFamilyAsync(session.TokenFamilyId, nowUtc, cancellationToken).ConfigureAwait(false);
            }
        }

        await _auditRepository.AppendAsync(
            new AuditEventEntity(
                Id: Guid.NewGuid(),
                ActorUserId: actor.UserId,
                EntityType: "AUTH_SESSION",
                EntityId: actor.UserId.ToString("D"),
                Action: "LOGOUT_SUCCEEDED",
                CorrelationId: correlationId,
                MetadataJson: "{}",
                CreatedAtUtc: nowUtc),
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<PrivateUserProfileResponse> GetPrivateProfileAsync(
        AuthenticatedActor actor,
        Guid targetUserId,
        string correlationId,
        CancellationToken cancellationToken)
    {
        await _authorization.EnsureCanAccessPrivateUserResourceAsync(
            actor,
            targetUserId,
            resourceName: "PrivateUserProfile",
            correlationId: correlationId,
            cancellationToken: cancellationToken).ConfigureAwait(false);

        var entry = await _userRepository.FindByIdAsync(targetUserId, cancellationToken).ConfigureAwait(false)
            ?? throw new DomainRuleViolationException(
                "USER_NOT_FOUND",
                "Perfil de usuário não encontrado.",
                StatusCodes.Status404NotFound);

        return MapPrivateProfile(entry.User, entry.Profile);
    }

    public async Task<PrivateUserProfileResponse> UpdatePrivateProfileAsync(
        AuthenticatedActor actor,
        Guid targetUserId,
        UpdateProfileRequest request,
        string correlationId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        await _authorization.EnsureCanAccessPrivateUserResourceAsync(
            actor,
            targetUserId,
            resourceName: "UpdatePrivateUserProfile",
            correlationId: correlationId,
            cancellationToken: cancellationToken).ConfigureAwait(false);

        var entry = await _userRepository.FindByIdAsync(targetUserId, cancellationToken).ConfigureAwait(false)
            ?? throw new DomainRuleViolationException(
                "USER_NOT_FOUND",
                "Perfil de usuário não encontrado.",
                StatusCodes.Status404NotFound);

        var (user, profile) = entry;
        DateTimeOffset nowUtc = DateTimeOffset.UtcNow;

        if (!string.IsNullOrWhiteSpace(request.DisplayName))
        {
            if (request.DisplayName.Trim().Length < 3)
            {
                throw new DomainRuleViolationException(
                    "INVALID_DISPLAY_NAME",
                    "O nome de exibição deve ter pelo menos 3 caracteres.",
                    StatusCodes.Status400BadRequest);
            }

            profile.DisplayName = request.DisplayName.Trim();
        }

        if (!string.IsNullOrWhiteSpace(request.Phone))
        {
            string digits = SecurityCryptoService.NormalizeDigits(request.Phone);
            if (digits.Length is < 10 or > 15)
            {
                throw new DomainRuleViolationException(
                    "INVALID_PHONE",
                    "Informe um número de telefone válido com DDD.",
                    StatusCodes.Status400BadRequest);
            }

            user.PhoneEncrypted = _crypto.EncryptPhone(digits);
            user.PhoneMasked = SecurityCryptoService.MaskPhone(digits);
        }

        if (!string.IsNullOrWhiteSpace(request.Cpf))
        {
            if (!SecurityCryptoService.IsValidCpf(request.Cpf))
            {
                throw new DomainRuleViolationException(
                    "INVALID_CPF",
                    "O CPF informado é inválido conforme os dígitos verificadores oficiais da Receita Federal.",
                    StatusCodes.Status400BadRequest);
            }

            string cpfDigits = SecurityCryptoService.NormalizeDigits(request.Cpf);

            string newCpfHash = _crypto.ComputeCpfHash(cpfDigits);
            bool duplicate = await _userRepository.ExistsByCpfHashAsync(newCpfHash, excludeUserId: user.Id, cancellationToken).ConfigureAwait(false);
            if (duplicate)
            {
                throw new DomainRuleViolationException(
                    "CPF_ALREADY_REGISTERED",
                    "O CPF informado já está vinculado a outra conta.",
                    StatusCodes.Status409Conflict);
            }

            profile.CpfHash = newCpfHash;
            profile.CpfMasked = SecurityCryptoService.MaskCpf(cpfDigits);
        }

        if (!string.IsNullOrWhiteSpace(request.City))
        {
            profile.City = request.City.Trim();
        }

        if (!string.IsNullOrWhiteSpace(request.StateUf))
        {
            profile.StateUf = request.StateUf.Trim().ToUpperInvariant();
        }

        if (request.Roles is not null && request.Roles.Count > 0)
        {
            var updatedRoles = ParseAndValidateSelfAssignableRoles(request.Roles);
            profile.Roles.Clear();
            foreach (var role in updatedRoles)
            {
                profile.Roles.Add(role);
            }
        }

        if (request.VehicleType is not null) profile.VehicleType = request.VehicleType;
        if (request.VehicleModel is not null) profile.VehicleModel = request.VehicleModel;
        if (request.VehiclePlate is not null) profile.VehiclePlate = request.VehiclePlate;
        if (request.VehicleYear is not null) profile.VehicleYear = request.VehicleYear;
        if (request.Renavam is not null) profile.Renavam = request.Renavam;
        if (request.CnhCategory is not null) profile.CnhCategory = request.CnhCategory;
        if (request.CnhNumber is not null) profile.CnhNumber = request.CnhNumber;
        if (request.AcceptCarrierTerms.HasValue) profile.CarrierTermsAccepted = request.AcceptCarrierTerms.Value;
        if (request.PixKeyType is not null) profile.PixKeyType = request.PixKeyType;
        if (request.PixKey is not null) profile.PixKey = request.PixKey;
        if (request.BankName is not null) profile.BankName = request.BankName;
        if (request.MpAccountEmail is not null) profile.MpAccountEmail = request.MpAccountEmail;
        if (request.CnhDocumentName is not null) profile.CnhDocumentName = request.CnhDocumentName;
        if (request.CnhDocumentData is not null) profile.CnhDocumentData = request.CnhDocumentData;
        if (request.CrlvDocumentName is not null) profile.CrlvDocumentName = request.CrlvDocumentName;
        if (request.CrlvDocumentData is not null) profile.CrlvDocumentData = request.CrlvDocumentData;
        if (request.IdentityDocumentName is not null) profile.IdentityDocumentName = request.IdentityDocumentName;
        if (request.IdentityDocumentData is not null) profile.IdentityDocumentData = request.IdentityDocumentData;
        if (request.PostalCode is not null) profile.PostalCode = string.IsNullOrWhiteSpace(request.PostalCode) ? null : request.PostalCode.Trim();
        if (request.Street is not null) profile.Street = string.IsNullOrWhiteSpace(request.Street) ? null : request.Street.Trim();
        if (request.Number is not null) profile.Number = string.IsNullOrWhiteSpace(request.Number) ? null : request.Number.Trim();
        if (request.Neighborhood is not null) profile.Neighborhood = string.IsNullOrWhiteSpace(request.Neighborhood) ? null : request.Neighborhood.Trim();
        if (request.Complement is not null) profile.Complement = string.IsNullOrWhiteSpace(request.Complement) ? null : request.Complement.Trim();

        user.UpdatedAtUtc = nowUtc;
        profile.UpdatedAtUtc = nowUtc;
        ApplyAutoVerificationIfComplete(user, profile);
        await _userRepository.UpdateAsync(user, profile, cancellationToken).ConfigureAwait(false);

        await _auditRepository.AppendAsync(
            new AuditEventEntity(
                Id: Guid.NewGuid(),
                ActorUserId: actor.UserId,
                EntityType: "PROFILE",
                EntityId: user.Id.ToString("D"),
                Action: "PROFILE_UPDATED",
                CorrelationId: correlationId,
                MetadataJson: JsonSerializer.Serialize(new
                {
                    roles = profile.Roles.Select(r => r.ToString()).ToArray(),
                    city = profile.City,
                    stateUf = profile.StateUf
                }),
                CreatedAtUtc: nowUtc),
            cancellationToken).ConfigureAwait(false);

        return MapPrivateProfile(user, profile);
    }

    public async Task<PublicUserCardResponse> GetPublicCardAsync(
        Guid targetUserId,
        CancellationToken cancellationToken)
    {
        var entry = await _userRepository.FindByIdAsync(targetUserId, cancellationToken).ConfigureAwait(false)
            ?? throw new DomainRuleViolationException(
                "USER_NOT_FOUND",
                "Usuário não encontrado.",
                StatusCodes.Status404NotFound);

        var (user, profile) = entry;
        return new PublicUserCardResponse(
            UserId: user.Id,
            AbbreviatedDisplayName: AbbreviateDisplayName(profile.DisplayName),
            City: profile.City,
            StateUf: profile.StateUf,
            PublicRoles: profile.Roles
                .Where(SelfAssignableRoles.Contains)
                .Select(r => r.ToString())
                .OrderBy(r => r, StringComparer.Ordinal)
                .ToArray(),
            IsKycVerified: profile.KycStatus == KycStatus.VERIFIED,
            RatingAvg: profile.RatingAvg,
            RatingCount: profile.RatingCount);
    }

    private async Task<AuthSessionResponse> IssueSessionTokensAsync(
        UserEntity user,
        UserProfileEntity profile,
        Guid tokenFamilyId,
        DateTimeOffset nowUtc,
        CancellationToken cancellationToken)
    {
        var (accessToken, expiresInSeconds, _) = _crypto.CreateAccessToken(user, profile, nowUtc);
        var (rawRefresh, refreshHash) = SecurityCryptoService.CreateRefreshTokenPair();

        var session = new RefreshTokenSessionEntity
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = refreshHash,
            TokenFamilyId = tokenFamilyId,
            ExpiresAtUtc = nowUtc.AddDays(_securityOptions.RefreshTokenLifetimeDays),
            CreatedAtUtc = nowUtc
        };

        await _refreshTokenRepository.SaveAsync(session, cancellationToken).ConfigureAwait(false);

        return new AuthSessionResponse(
            AccessToken: accessToken,
            RefreshToken: rawRefresh,
            ExpiresInSeconds: expiresInSeconds,
            TokenType: "Bearer",
            Profile: MapPrivateProfile(user, profile));
    }

    public static bool HasAllRequiredVerificationData(UserEntity user, UserProfileEntity profile)
    {
        ArgumentNullException.ThrowIfNull(user);
        ArgumentNullException.ThrowIfNull(profile);

        bool hasBasicIdentity =
            !string.IsNullOrWhiteSpace(profile.DisplayName)
            && profile.DisplayName.Trim().Length >= 3
            && !string.IsNullOrWhiteSpace(user.Email)
            && !string.IsNullOrWhiteSpace(user.PhoneEncrypted)
            && !string.IsNullOrWhiteSpace(profile.CpfHash);

        bool hasCompleteAddress =
            !string.IsNullOrWhiteSpace(profile.City)
            && !string.IsNullOrWhiteSpace(profile.StateUf)
            && !string.IsNullOrWhiteSpace(profile.PostalCode)
            && !string.IsNullOrWhiteSpace(profile.Street)
            && !string.IsNullOrWhiteSpace(profile.Number)
            && !string.IsNullOrWhiteSpace(profile.Neighborhood);

        if (!hasBasicIdentity || !hasCompleteAddress)
        {
            return false;
        }

        if (profile.Roles.Contains(UserRole.CARRIER))
        {
            bool hasCarrierData =
                !string.IsNullOrWhiteSpace(profile.VehicleType)
                && !string.IsNullOrWhiteSpace(profile.VehicleModel)
                && !string.IsNullOrWhiteSpace(profile.VehiclePlate)
                && !string.IsNullOrWhiteSpace(profile.Renavam)
                && !string.IsNullOrWhiteSpace(profile.CnhNumber)
                && profile.CarrierTermsAccepted;

            if (!hasCarrierData)
            {
                return false;
            }
        }

        return true;
    }

    public static bool ApplyAutoVerificationIfComplete(UserEntity user, UserProfileEntity profile)
    {
        ArgumentNullException.ThrowIfNull(user);
        ArgumentNullException.ThrowIfNull(profile);

        if (profile.KycStatus != KycStatus.REJECTED
            && profile.KycStatus != KycStatus.VERIFIED
            && HasAllRequiredVerificationData(user, profile))
        {
            profile.KycStatus = KycStatus.VERIFIED;
            return true;
        }

        return false;
    }

    public static PrivateUserProfileResponse MapPrivateProfile(UserEntity user, UserProfileEntity profile)
    {
        ArgumentNullException.ThrowIfNull(user);
        ArgumentNullException.ThrowIfNull(profile);

        return new PrivateUserProfileResponse(
            UserId: user.Id,
            Email: user.Email,
            DisplayName: profile.DisplayName,
            PhoneMasked: user.PhoneMasked,
            CpfMasked: profile.CpfMasked,
            City: profile.City,
            StateUf: profile.StateUf,
            Roles: profile.Roles.Select(r => r.ToString()).OrderBy(r => r, StringComparer.Ordinal).ToArray(),
            KycStatus: profile.KycStatus.ToString(),
            CanNavigatePlatform: user.Status == UserAccountStatus.ACTIVE,
            CanContractDelivery: profile.KycStatus == KycStatus.VERIFIED,
            TermsAcceptedVersion: profile.TermsAcceptedVersion,
            TermsAcceptedAtUtc: profile.TermsAcceptedAtUtc,
            RatingAvg: profile.RatingAvg,
            RatingCount: profile.RatingCount,
            CreatedAtUtc: user.CreatedAtUtc,
            UpdatedAtUtc: profile.UpdatedAtUtc,
            VehicleType: profile.VehicleType,
            VehicleModel: profile.VehicleModel,
            VehiclePlate: profile.VehiclePlate,
            VehicleYear: profile.VehicleYear,
            Renavam: profile.Renavam,
            CnhCategory: profile.CnhCategory,
            CnhNumber: profile.CnhNumber,
            CarrierTermsAccepted: profile.CarrierTermsAccepted,
            PixKeyType: profile.PixKeyType,
            PixKey: profile.PixKey,
            BankName: profile.BankName,
            MpAccountEmail: profile.MpAccountEmail,
            CnhDocumentName: profile.CnhDocumentName,
            CnhDocumentData: profile.CnhDocumentData,
            crlvDocumentName: profile.CrlvDocumentName,
            crlvDocumentData: profile.CrlvDocumentData,
            IdentityDocumentName: profile.IdentityDocumentName,
            IdentityDocumentData: profile.IdentityDocumentData,
            PostalCode: profile.PostalCode,
            Street: profile.Street,
            Number: profile.Number,
            Neighborhood: profile.Neighborhood,
            Complement: profile.Complement);
    }

    public async Task ChangePasswordAsync(
        AuthenticatedActor actor,
        ChangePasswordRequest request,
        string correlationId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(actor);
        ArgumentNullException.ThrowIfNull(request);

        var entry = await _userRepository.FindByIdAsync(actor.UserId, cancellationToken).ConfigureAwait(false)
            ?? throw new DomainRuleViolationException(
                "USER_NOT_FOUND",
                "Conta de usuário não encontrada.",
                StatusCodes.Status404NotFound);

        var (user, profile) = entry;

        if (!SecurityCryptoService.VerifyPassword(request.CurrentPassword, user.PasswordHash))
        {
            throw new DomainRuleViolationException(
                "AUTH_INVALID_CREDENTIALS",
                "A senha atual informada está incorreta.",
                StatusCodes.Status400BadRequest);
        }

        ValidatePasswordStrength(request.NewPassword);

        if (string.Equals(request.CurrentPassword, request.NewPassword, StringComparison.Ordinal))
        {
            throw new DomainRuleViolationException(
                "PASSWORD_SAME_AS_CURRENT",
                "A nova senha deve ser diferente da senha atual.",
                StatusCodes.Status400BadRequest);
        }

        DateTimeOffset nowUtc = DateTimeOffset.UtcNow;
        user.PasswordHash = _crypto.HashPassword(request.NewPassword);
        user.UpdatedAtUtc = nowUtc;
        await _userRepository.UpdateAsync(user, profile, cancellationToken).ConfigureAwait(false);

        await _auditRepository.AppendAsync(
            new AuditEventEntity(
                Id: Guid.NewGuid(),
                ActorUserId: actor.UserId,
                EntityType: "AUTH_SECURITY",
                EntityId: actor.UserId.ToString("D"),
                Action: "PASSWORD_CHANGED",
                CorrelationId: correlationId,
                MetadataJson: "{}",
                CreatedAtUtc: nowUtc),
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<ForgotPasswordResponse> RequestPasswordResetAsync(
        ForgotPasswordRequest request,
        string correlationId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!_emailService.IsConfigured)
        {
            throw new DomainRuleViolationException(
                "EMAIL_SERVICE_NOT_CONFIGURED",
                "O serviço de envio de e-mail ainda não está configurado no servidor (email_settings.json). Configure a Senha de App do Gmail no arquivo local.",
                StatusCodes.Status503ServiceUnavailable);
        }

        string normalizedEmail = NormalizeAndValidateEmail(request.Email);
        const string neutralMessage = "Se o e-mail informado estiver cadastrado, enviaremos em instantes um código de 6 dígitos válido por 15 minutos.";

        var entry = await _userRepository.FindByEmailAsync(normalizedEmail, cancellationToken).ConfigureAwait(false);
        if (entry is null)
        {
            return new ForgotPasswordResponse(true, neutralMessage, PasswordResetCodeExpirationMinutes);
        }

        var (user, profile) = entry.Value;
        DateTimeOffset nowUtc = DateTimeOffset.UtcNow;

        var existingActive = await _passwordResetRepository.FindLatestActiveByEmailAsync(normalizedEmail, cancellationToken).ConfigureAwait(false);
        if (existingActive is not null
            && existingActive.ExpiresAtUtc > nowUtc
            && (nowUtc - existingActive.CreatedAtUtc).TotalSeconds < PasswordResetResendCooldownSeconds)
        {
            return new ForgotPasswordResponse(true, neutralMessage, PasswordResetCodeExpirationMinutes);
        }

        string code = RandomNumberGenerator.GetInt32(100_000, 1_000_000).ToString("D6", CultureInfo.InvariantCulture);
        var tokenEntity = new PasswordResetTokenEntity
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            NormalizedEmail = normalizedEmail,
            CodeHash = _crypto.ComputePasswordResetCodeHash(normalizedEmail, code),
            ExpiresAtUtc = nowUtc.AddMinutes(PasswordResetCodeExpirationMinutes),
            Attempts = 0,
            MaxAttempts = 5,
            CreatedAtUtc = nowUtc,
            ConsumedAtUtc = null
        };

        await _passwordResetRepository.SaveAndInvalidatePreviousAsync(tokenEntity, cancellationToken).ConfigureAwait(false);

        try
        {
            await _emailService.SendPasswordResetCodeAsync(
                user.Email,
                profile.DisplayName,
                code,
                PasswordResetCodeExpirationMinutes,
                cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            tokenEntity.ConsumedAtUtc = DateTimeOffset.UtcNow;
            await _passwordResetRepository.UpdateAsync(tokenEntity, cancellationToken).ConfigureAwait(false);

            await _auditRepository.AppendAsync(
                new AuditEventEntity(
                    Id: Guid.NewGuid(),
                    ActorUserId: user.Id,
                    EntityType: "AUTH_SECURITY",
                    EntityId: user.Id.ToString("D"),
                    Action: "PASSWORD_RESET_EMAIL_FAILED",
                    CorrelationId: correlationId,
                    MetadataJson: "{}",
                    CreatedAtUtc: DateTimeOffset.UtcNow),
                cancellationToken).ConfigureAwait(false);

            Console.WriteLine($"[TopicLog.Email] Falha ao enviar código de recuperação: {ex.Message}");
            throw new DomainRuleViolationException(
                "EMAIL_DELIVERY_FAILED",
                "Não foi possível enviar o e-mail de recuperação agora. Verifique as credenciais SMTP no servidor e tente novamente.",
                StatusCodes.Status502BadGateway);
        }

        await _auditRepository.AppendAsync(
            new AuditEventEntity(
                Id: Guid.NewGuid(),
                ActorUserId: user.Id,
                EntityType: "AUTH_SECURITY",
                EntityId: user.Id.ToString("D"),
                Action: "PASSWORD_RESET_REQUESTED",
                CorrelationId: correlationId,
                MetadataJson: "{}",
                CreatedAtUtc: nowUtc),
            cancellationToken).ConfigureAwait(false);

        return new ForgotPasswordResponse(true, neutralMessage, PasswordResetCodeExpirationMinutes);
    }

    public async Task ConfirmPasswordResetAsync(
        ResetPasswordRequest request,
        string correlationId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        string normalizedEmail = NormalizeAndValidateEmail(request.Email);
        string cleanCode = SecurityCryptoService.NormalizeDigits(request.Code ?? string.Empty);
        if (cleanCode.Length != 6)
        {
            throw new DomainRuleViolationException(
                "INVALID_RESET_CODE",
                "Informe o código numérico de 6 dígitos enviado para o seu e-mail.",
                StatusCodes.Status400BadRequest);
        }

        ValidatePasswordStrength(request.NewPassword);

        var entry = await _userRepository.FindByEmailAsync(normalizedEmail, cancellationToken).ConfigureAwait(false);
        var tokenEntity = await _passwordResetRepository.FindLatestActiveByEmailAsync(normalizedEmail, cancellationToken).ConfigureAwait(false);
        DateTimeOffset nowUtc = DateTimeOffset.UtcNow;

        if (entry is null || tokenEntity is null || tokenEntity.ConsumedAtUtc is not null)
        {
            throw new DomainRuleViolationException(
                "INVALID_RESET_CODE",
                "Código de recuperação inválido, já utilizado ou inexistente. Solicite um novo código.",
                StatusCodes.Status400BadRequest);
        }

        if (nowUtc > tokenEntity.ExpiresAtUtc)
        {
            tokenEntity.ConsumedAtUtc = nowUtc;
            await _passwordResetRepository.UpdateAsync(tokenEntity, cancellationToken).ConfigureAwait(false);

            throw new DomainRuleViolationException(
                "RESET_CODE_EXPIRED",
                "Este código expirou (limite de 15 minutos). Solicite um novo código por e-mail.",
                StatusCodes.Status400BadRequest);
        }

        if (tokenEntity.Attempts >= tokenEntity.MaxAttempts)
        {
            tokenEntity.ConsumedAtUtc = nowUtc;
            await _passwordResetRepository.UpdateAsync(tokenEntity, cancellationToken).ConfigureAwait(false);

            throw new DomainRuleViolationException(
                "RESET_CODE_MAX_ATTEMPTS",
                "Limite de tentativas excedido para este código. Solicite um novo código por e-mail.",
                StatusCodes.Status429TooManyRequests);
        }

        var (user, profile) = entry.Value;
        if (!_crypto.VerifyPasswordResetCodeHash(normalizedEmail, cleanCode, tokenEntity.CodeHash))
        {
            tokenEntity.Attempts += 1;
            if (tokenEntity.Attempts >= tokenEntity.MaxAttempts)
            {
                tokenEntity.ConsumedAtUtc = nowUtc;
            }
            await _passwordResetRepository.UpdateAsync(tokenEntity, cancellationToken).ConfigureAwait(false);

            await _auditRepository.AppendAsync(
                new AuditEventEntity(
                    Id: Guid.NewGuid(),
                    ActorUserId: user.Id,
                    EntityType: "AUTH_SECURITY",
                    EntityId: user.Id.ToString("D"),
                    Action: "PASSWORD_RESET_INVALID_CODE",
                    CorrelationId: correlationId,
                    MetadataJson: $"{{\"attempts\":{tokenEntity.Attempts}}}",
                    CreatedAtUtc: nowUtc),
                cancellationToken).ConfigureAwait(false);

            int remaining = Math.Max(0, tokenEntity.MaxAttempts - tokenEntity.Attempts);
            throw new DomainRuleViolationException(
                "INVALID_RESET_CODE",
                remaining > 0
                    ? $"Código incorreto. Você ainda tem {remaining} tentativa(s) antes de precisar solicitar outro código."
                    : "Limite de tentativas atingido. Solicite um novo código por e-mail.",
                StatusCodes.Status400BadRequest);
        }

        user.PasswordHash = _crypto.HashPassword(request.NewPassword);
        user.FailedLoginAttempts = 0;
        user.LockoutUntilUtc = null;
        if (user.Status == UserAccountStatus.LOCKED)
        {
            user.Status = UserAccountStatus.ACTIVE;
        }
        user.UpdatedAtUtc = nowUtc;
        await _userRepository.UpdateAsync(user, profile, cancellationToken).ConfigureAwait(false);

        tokenEntity.ConsumedAtUtc = nowUtc;
        await _passwordResetRepository.UpdateAsync(tokenEntity, cancellationToken).ConfigureAwait(false);

        await _auditRepository.AppendAsync(
            new AuditEventEntity(
                Id: Guid.NewGuid(),
                ActorUserId: user.Id,
                EntityType: "AUTH_SECURITY",
                EntityId: user.Id.ToString("D"),
                Action: "PASSWORD_RESET_COMPLETED",
                CorrelationId: correlationId,
                MetadataJson: "{}",
                CreatedAtUtc: nowUtc),
            cancellationToken).ConfigureAwait(false);
    }

    private static string NormalizeAndValidateEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            throw new DomainRuleViolationException(
                "INVALID_EMAIL",
                "O endereço de e-mail é obrigatório.",
                StatusCodes.Status400BadRequest);
        }

        string trimmed = email.Trim().ToLowerInvariant();
        int atIndex = trimmed.IndexOf('@', StringComparison.Ordinal);
        if (atIndex <= 0 || atIndex == trimmed.Length - 1 || !trimmed[(atIndex + 1)..].Contains('.', StringComparison.Ordinal))
        {
            throw new DomainRuleViolationException(
                "INVALID_EMAIL",
                "Informe um endereço de e-mail válido.",
                StatusCodes.Status400BadRequest);
        }

        return trimmed;
    }

    private static void ValidatePasswordStrength(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8)
        {
            throw new DomainRuleViolationException(
                "WEAK_PASSWORD",
                "A senha deve conter no mínimo 8 caracteres, incluindo letras e números.",
                StatusCodes.Status400BadRequest);
        }

        bool hasLetter = password.Any(char.IsLetter);
        bool hasDigit = password.Any(char.IsDigit);
        if (!hasLetter || !hasDigit)
        {
            throw new DomainRuleViolationException(
                "WEAK_PASSWORD",
                "A senha deve combinar letras e números.",
                StatusCodes.Status400BadRequest);
        }
    }

    private static HashSet<UserRole> ParseAndValidateSelfAssignableRoles(IReadOnlyList<string>? requestedRoles)
    {
        if (requestedRoles is null || requestedRoles.Count == 0)
        {
            return [UserRole.SENDER];
        }

        var result = new HashSet<UserRole>();
        foreach (string rawRole in requestedRoles)
        {
            if (!Enum.TryParse<UserRole>(rawRole?.Trim(), ignoreCase: true, out var role))
            {
                throw new DomainRuleViolationException(
                    "INVALID_ROLE",
                    $"Papel de usuário '{rawRole}' desconhecido.",
                    StatusCodes.Status400BadRequest);
            }

            if (!SelfAssignableRoles.Contains(role))
            {
                throw new DomainRuleViolationException(
                    "ROLE_SELF_ASSIGNMENT_FORBIDDEN",
                    $"O papel '{role}' é restrito à administração interna e não pode ser autoatribuído.",
                    StatusCodes.Status403Forbidden);
            }

            result.Add(role);
        }

        if (result.Count == 0)
        {
            result.Add(UserRole.SENDER);
        }

        if (result.Contains(UserRole.SENDER) && result.Contains(UserRole.CARRIER))
        {
            throw new DomainRuleViolationException(
                "DUAL_ROLE_FORBIDDEN",
                "O cadastro deve ser realizado exclusivamente como Remetente ou como Transportador. Uma mesma conta não pode acumular os dois papéis simultaneamente.",
                StatusCodes.Status400BadRequest);
        }

        return result;
    }

    private static string AbbreviateDisplayName(string fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName))
        {
            return "Usuário Topic Log";
        }

        string[] parts = fullName.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 1)
        {
            return parts[0];
        }

        return $"{parts[0]} {char.ToUpperInvariant(parts[^1][0])}.";
    }
}
