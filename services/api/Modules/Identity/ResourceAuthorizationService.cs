using System.Text.Json;
using TopicLog.Api.Common.Domain;

namespace TopicLog.Api.Modules.Identity;

/// <summary>
/// Motor de autorização por papel (RBAC) e por propriedade do recurso (ABAC) da PR-01.1 (DEC-02.6).
/// Garante que um usuário autenticado jamais acesse dados privados de outro usuário (Gate G1).
/// </summary>
public sealed class ResourceAuthorizationService
{
    private const string BearerPrefix = "Bearer ";

    private readonly SecurityCryptoService _crypto;
    private readonly IAuditRepository _auditRepository;

    public ResourceAuthorizationService(
        SecurityCryptoService crypto,
        IAuditRepository auditRepository)
    {
        ArgumentNullException.ThrowIfNull(crypto);
        ArgumentNullException.ThrowIfNull(auditRepository);

        _crypto = crypto;
        _auditRepository = auditRepository;
    }

    /// <summary>
    /// Extrai e valida o token Bearer do HttpContext. Lança HTTP 401 se ausente ou inválido.
    /// </summary>
    public AuthenticatedActor RequireAuthenticatedActor(HttpContext httpContext)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        string? authHeader = httpContext.Request.Headers.Authorization.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(authHeader)
            || !authHeader.StartsWith(BearerPrefix, StringComparison.OrdinalIgnoreCase))
        {
            throw new DomainRuleViolationException(
                "AUTH_UNAUTHORIZED",
                "Cabeçalho Authorization Bearer ausente ou malformado.",
                StatusCodes.Status401Unauthorized);
        }

        string rawToken = authHeader[BearerPrefix.Length..].Trim();
        if (!_crypto.TryValidateAccessToken(rawToken, out var actor, out string? failureCode) || actor is null)
        {
            throw new DomainRuleViolationException(
                $"AUTH_INVALID_TOKEN_{failureCode ?? "UNKNOWN"}",
                "Token de acesso inválido, expirado ou com assinatura/emissor/audiência incorretos.",
                StatusCodes.Status401Unauthorized);
        }

        return actor;
    }

    /// <summary>
    /// Autorização ABAC por titularidade do recurso: permite acesso somente ao próprio dono do recurso
    /// ou aos papéis administrativos/operacionais autorizados (SUPPORT, GENERAL_ADMIN).
    /// Qualquer tentativa cruzada por outro usuário gera evento CROSS_ACCESS_DENIED e retorna HTTP 403.
    /// </summary>
    public async Task EnsureCanAccessPrivateUserResourceAsync(
        AuthenticatedActor actor,
        Guid targetResourceOwnerUserId,
        string resourceName,
        string correlationId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(actor);
        ArgumentException.ThrowIfNullOrWhiteSpace(resourceName);

        bool isOwner = actor.UserId == targetResourceOwnerUserId;
        bool isPrivilegedOperator = actor.Roles.Contains(UserRole.SUPPORT)
            || actor.Roles.Contains(UserRole.GENERAL_ADMIN);

        if (isOwner || isPrivilegedOperator)
        {
            return;
        }

        string metadata = JsonSerializer.Serialize(new
        {
            resource = resourceName,
            actorUserId = actor.UserId,
            targetOwnerUserId = targetResourceOwnerUserId,
            actorRoles = actor.Roles.Select(r => r.ToString()).ToArray()
        });

        await _auditRepository.AppendAsync(
            new AuditEventEntity(
                Id: Guid.NewGuid(),
                ActorUserId: actor.UserId,
                EntityType: "USER_PRIVATE_RESOURCE",
                EntityId: targetResourceOwnerUserId.ToString("D"),
                Action: "CROSS_ACCESS_DENIED",
                CorrelationId: correlationId,
                MetadataJson: metadata,
                CreatedAtUtc: DateTimeOffset.UtcNow),
            cancellationToken).ConfigureAwait(false);

        throw new DomainRuleViolationException(
            "AUTH_FORBIDDEN_CROSS_USER_ACCESS",
            "Acesso negado (ABAC): um usuário não tem permissão para acessar ou modificar recursos privados de outro titular.",
            StatusCodes.Status403Forbidden);
    }

    /// <summary>
    /// Autorização RBAC: exige que o ator autenticado possua ao menos um dos papéis requeridos.
    /// </summary>
    public async Task EnsureHasAnyRoleAsync(
        AuthenticatedActor actor,
        IReadOnlyCollection<UserRole> allowedRoles,
        string operationName,
        string correlationId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(actor);
        ArgumentNullException.ThrowIfNull(allowedRoles);

        if (actor.Roles.Any(allowedRoles.Contains))
        {
            return;
        }

        string metadata = JsonSerializer.Serialize(new
        {
            operation = operationName,
            actorRoles = actor.Roles.Select(r => r.ToString()).ToArray(),
            requiredAnyOf = allowedRoles.Select(r => r.ToString()).ToArray()
        });

        await _auditRepository.AppendAsync(
            new AuditEventEntity(
                Id: Guid.NewGuid(),
                ActorUserId: actor.UserId,
                EntityType: "RBAC_POLICY",
                EntityId: operationName,
                Action: "RBAC_ACCESS_DENIED",
                CorrelationId: correlationId,
                MetadataJson: metadata,
                CreatedAtUtc: DateTimeOffset.UtcNow),
            cancellationToken).ConfigureAwait(false);

        throw new DomainRuleViolationException(
            "AUTH_FORBIDDEN_INSUFFICIENT_ROLE",
            $"Acesso negado (RBAC): a operação '{operationName}' exige perfil autorizado.",
            StatusCodes.Status403Forbidden);
    }
}
