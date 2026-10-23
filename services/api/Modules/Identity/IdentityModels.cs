using System.Diagnostics.CodeAnalysis;
using TopicLog.Api.Common.Contracts;

namespace TopicLog.Api.Modules.Identity;

/// <summary>
/// Papéis de conta previstos no PRD Seção 2 e TRD Seção 3 (RBAC).
/// Uma mesma conta pode acumular SENDER, CARRIER e RECIPIENT.
/// </summary>
[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica definida nos documentos da Topic Log")]
public enum UserRole
{
    SENDER = 0,
    CARRIER = 1,
    RECIPIENT = 2,
    SUPPORT = 3,
    FINANCE_ADMIN = 4,
    GENERAL_ADMIN = 5,
    FINANCIAL_ADMIN = 6,
    LEGAL_OPERATOR = 7,
    COMPLIANCE_AUDITOR = 8,
    SUPPORT_OPERATOR = 9
}

public enum UserAccountStatus
{
    ACTIVE = 0,
    LOCKED = 1,
    SUSPENDED = 2
}

/// <summary>
/// Entidade de domínio correspondente à tabela users (05-Banco-de-Dados.md).
/// </summary>
public sealed class UserEntity
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public required string Email { get; init; }

    public required string PhoneEncrypted { get; set; }

    public required string PhoneMasked { get; set; }

    public required string PasswordHash { get; set; }

    public UserAccountStatus Status { get; set; } = UserAccountStatus.ACTIVE;

    public int FailedLoginAttempts { get; set; }

    public DateTimeOffset? LockoutUntilUtc { get; set; }

    public DateTimeOffset CreatedAtUtc { get; init; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Entidade de domínio correspondente à tabela profiles (05-Banco-de-Dados.md, D05, D08).
/// </summary>
public sealed class UserProfileEntity
{
    public required Guid UserId { get; init; }

    public required string DisplayName { get; set; }

    public string? CpfHash { get; set; }

    public string? CpfMasked { get; set; }

    public string City { get; set; } = "João Monlevade";

    public string StateUf { get; set; } = "MG";

    public HashSet<UserRole> Roles { get; init; } = [UserRole.SENDER];

    public KycStatus KycStatus { get; set; } = KycStatus.NOT_STARTED;

    public required string TermsAcceptedVersion { get; set; }

    public required DateTimeOffset TermsAcceptedAtUtc { get; set; }

    public decimal RatingAvg { get; set; } = 5.00m;

    public int RatingCount { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Entidade de sessão de Refresh Token rotativo (tabela refresh_tokens).
/// </summary>
public sealed class RefreshTokenSessionEntity
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public required Guid UserId { get; init; }

    public required string TokenHash { get; init; }

    public required Guid TokenFamilyId { get; init; }

    public required DateTimeOffset ExpiresAtUtc { get; init; }

    public DateTimeOffset? RevokedAtUtc { get; set; }

    public string? ReplacedByTokenHash { get; set; }

    public DateTimeOffset CreatedAtUtc { get; init; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Evento imutável de auditoria (tabela audit_events — Append-Only).
/// </summary>
public sealed record AuditEventEntity(
    Guid Id,
    Guid? ActorUserId,
    string EntityType,
    string EntityId,
    string Action,
    string CorrelationId,
    string MetadataJson,
    DateTimeOffset CreatedAtUtc);

/// <summary>
/// Contexto autenticado extraído e validado do token JWT para decisões RBAC/ABAC.
/// </summary>
public sealed record AuthenticatedActor(
    Guid UserId,
    string Email,
    IReadOnlyList<UserRole> Roles,
    KycStatus KycStatus,
    string TokenId);

public sealed record RegisterUserRequest(
    string Email,
    string Password,
    string DisplayName,
    string Phone,
    string? Cpf,
    string? City,
    string? StateUf,
    IReadOnlyList<string>? InitialRoles,
    bool AcceptTerms,
    string? TermsVersion);

public sealed record LoginRequest(
    string Email,
    string Password);

public sealed record RefreshTokenRequest(
    string RefreshToken);

public sealed record LogoutRequest(
    string RefreshToken);

public sealed record UpdateProfileRequest(
    string? DisplayName,
    string? Phone,
    string? Cpf,
    string? City,
    string? StateUf,
    IReadOnlyList<string>? Roles);

public sealed record AuthSessionResponse(
    string AccessToken,
    string RefreshToken,
    int ExpiresInSeconds,
    string TokenType,
    PrivateUserProfileResponse Profile);

/// <summary>
/// Visão privada completa do perfil do usuário (protegida por ABAC: apenas titular ou SUPPORT/GENERAL_ADMIN).
/// </summary>
public sealed record PrivateUserProfileResponse(
    Guid UserId,
    string Email,
    string DisplayName,
    string PhoneMasked,
    string? CpfMasked,
    string City,
    string StateUf,
    IReadOnlyList<string> Roles,
    string KycStatus,
    bool CanNavigatePlatform,
    bool CanContractDelivery,
    string TermsAcceptedVersion,
    DateTimeOffset TermsAcceptedAtUtc,
    decimal RatingAvg,
    int RatingCount,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc);

/// <summary>
/// Cartão público mínimo exibido para contrapartes na plataforma (LGPD / Minimização).
/// Não inclui e-mail, telefone ou CPF.
/// </summary>
public sealed record PublicUserCardResponse(
    Guid UserId,
    string AbbreviatedDisplayName,
    string City,
    string StateUf,
    IReadOnlyList<string> PublicRoles,
    bool IsKycVerified,
    decimal RatingAvg,
    int RatingCount);

/// <summary>
/// Solicitação de emissão de token de teste para o ambiente Sandbox local (Testing).
/// </summary>
public sealed record SandboxTokenRequest(string? Role);

