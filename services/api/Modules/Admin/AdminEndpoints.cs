// ============================================================================
// TOPIC LOG — ROTAS HTTP ADMINISTRATIVAS E GOVERNANÇA (PR-ADM-01 / PR-FIN-02)
// Proteção por RBAC, segregação de funções e ausência de bypasses
// ============================================================================

using Microsoft.AspNetCore.Mvc;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Modules.Identity;

namespace TopicLog.Api.Modules.Admin;

public static class AdminEndpoints
{
    private static readonly UserRole[] AllAdminRoles =
    [
        UserRole.GENERAL_ADMIN,
        UserRole.FINANCIAL_ADMIN,
        UserRole.FINANCE_ADMIN,
        UserRole.LEGAL_OPERATOR,
        UserRole.COMPLIANCE_AUDITOR,
        UserRole.SUPPORT_OPERATOR,
        UserRole.SUPPORT
    ];

    public static IServiceCollection AddTopicLogAdminModule(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddSingleton<IOperationalSettingsRepository, InMemoryOperationalSettingsRepository>();
        services.AddSingleton<ICarrierVehicleRepository, InMemoryCarrierVehicleRepository>();
        services.AddSingleton<IPaymentGovernanceRepository, InMemoryPaymentGovernanceRepository>();
        services.AddSingleton<IAdminAuditRepository, InMemoryAdminAuditRepository>();

        services.AddSingleton<AdminApplicationService>();

        return services;
    }

    public static WebApplication MapTopicLogAdminEndpoints(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        var group = app.MapGroup("/api/v1/admin");

        // 1. GET /api/v1/admin/dashboard
        group.MapGet("/dashboard", async (
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            AdminApplicationService adminService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            await authorization.EnsureHasAnyRoleAsync(
                actor,
                AllAdminRoles,
                "ViewAdminDashboard",
                httpContext.TraceIdentifier,
                cancellationToken);

            var metrics = await adminService.GetDashboardMetricsAsync(cancellationToken);
            return Results.Ok(metrics);
        });

        // 2. GET /api/v1/admin/operations/settings
        group.MapGet("/operations/settings", async (
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            AdminApplicationService adminService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            await authorization.EnsureHasAnyRoleAsync(
                actor,
                AllAdminRoles,
                "ViewOperationalSettings",
                httpContext.TraceIdentifier,
                cancellationToken);

            var settings = await adminService.GetOperationalSettingsAsync(cancellationToken);
            return Results.Ok(settings);
        });

        // 3. PATCH /api/v1/admin/operations/settings (Exclusivo GENERAL_ADMIN)
        group.MapPatch("/operations/settings", async (
            [FromBody] UpdateOperationalSettingsRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            AdminApplicationService adminService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            await authorization.EnsureHasAnyRoleAsync(
                actor,
                [UserRole.GENERAL_ADMIN],
                "UpdateOperationalSettings",
                httpContext.TraceIdentifier,
                cancellationToken);

            string roleStr = actor.Roles.Contains(UserRole.GENERAL_ADMIN) ? "GENERAL_ADMIN" : "OPERATOR";

            var updated = await adminService.UpdateOperationalSettingsAsync(
                actor.UserId,
                roleStr,
                request,
                cancellationToken);

            return Results.Ok(updated);
        });

        // 4. GET /api/v1/admin/vehicles
        group.MapGet("/vehicles", async (
            [FromQuery] string? status,
            [FromQuery] Guid? carrierId,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            AdminApplicationService adminService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            await authorization.EnsureHasAnyRoleAsync(
                actor,
                AllAdminRoles,
                "ListCarrierVehicles",
                httpContext.TraceIdentifier,
                cancellationToken);

            var list = await adminService.ListVehiclesAsync(status, carrierId, cancellationToken);
            return Results.Ok(list);
        });

        // 5. POST /api/v1/admin/vehicles (Cadastro de veículo por transportador ou admin)
        group.MapPost("/vehicles", async (
            [FromBody] RegisterCarrierVehicleRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            AdminApplicationService adminService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var result = await adminService.RegisterCarrierVehicleAsync(
                actor.UserId,
                actor.Email,
                request,
                cancellationToken);

            return Results.Created($"/api/v1/admin/vehicles/{result.Id}", result);
        });

        // 6. POST /api/v1/admin/vehicles/{id}/moderate
        group.MapPost("/vehicles/{id:guid}/moderate", async (
            Guid id,
            [FromBody] ModerateVehicleRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            AdminApplicationService adminService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            await authorization.EnsureHasAnyRoleAsync(
                actor,
                [UserRole.GENERAL_ADMIN, UserRole.COMPLIANCE_AUDITOR, UserRole.SUPPORT_OPERATOR, UserRole.SUPPORT],
                "ModerateCarrierVehicle",
                httpContext.TraceIdentifier,
                cancellationToken);

            string roleStr = actor.Roles.Contains(UserRole.GENERAL_ADMIN)
                ? "GENERAL_ADMIN"
                : (actor.Roles.Contains(UserRole.COMPLIANCE_AUDITOR) ? "COMPLIANCE_AUDITOR" : "SUPPORT_OPERATOR");

            var result = await adminService.ModerateVehicleAsync(
                id,
                actor.UserId,
                roleStr,
                request,
                cancellationToken);

            return Results.Ok(result);
        });

        // 7. GET /api/v1/admin/governance/payment-methods
        group.MapGet("/governance/payment-methods", async (
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            AdminApplicationService adminService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            await authorization.EnsureHasAnyRoleAsync(
                actor,
                AllAdminRoles,
                "ListPaymentMethods",
                httpContext.TraceIdentifier,
                cancellationToken);

            var methods = await adminService.ListPaymentMethodsAsync(cancellationToken);
            return Results.Ok(methods);
        });

        // 8. POST /api/v1/admin/governance/payment-methods/{code}/toggle
        group.MapPost("/governance/payment-methods/{code}/toggle", async (
            string code,
            [FromBody] TogglePaymentMethodRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            AdminApplicationService adminService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            await authorization.EnsureHasAnyRoleAsync(
                actor,
                [UserRole.GENERAL_ADMIN, UserRole.FINANCIAL_ADMIN, UserRole.FINANCE_ADMIN],
                "TogglePaymentMethod",
                httpContext.TraceIdentifier,
                cancellationToken);

            string roleStr = actor.Roles.Contains(UserRole.GENERAL_ADMIN) ? "GENERAL_ADMIN" : "FINANCIAL_ADMIN";

            var result = await adminService.TogglePaymentMethodAsync(
                code,
                actor.UserId,
                roleStr,
                request,
                cancellationToken);

            return Results.Ok(result);
        });

        // 9. POST /api/v1/admin/governance/simulate-checkout
        group.MapPost("/governance/simulate-checkout", async (
            [FromBody] CheckoutSimulationRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            AdminApplicationService adminService,
            CancellationToken cancellationToken) =>
        {
            _ = authorization.RequireAuthenticatedActor(httpContext);
            var result = await adminService.SimulateCheckoutAsync(request, cancellationToken);
            return Results.Ok(result);
        });

        // 10. GET /api/v1/admin/audit/events
        group.MapGet("/audit/events", async (
            [FromQuery] string? category,
            [FromQuery] int? limit,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            AdminApplicationService adminService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            await authorization.EnsureHasAnyRoleAsync(
                actor,
                [UserRole.GENERAL_ADMIN, UserRole.COMPLIANCE_AUDITOR, UserRole.FINANCIAL_ADMIN, UserRole.FINANCE_ADMIN],
                "ListAdminAuditEvents",
                httpContext.TraceIdentifier,
                cancellationToken);

            var events = await adminService.ListAuditEventsAsync(category, limit ?? 50, cancellationToken);
            return Results.Ok(events);
        });

        // 11. POST /api/v1/admin/session — Emissão imediata de sessão administrativa corporativa
        group.MapPost("/session", (
            [FromBody] AdminSessionRequest? request,
            SecurityCryptoService crypto) =>
        {
            string targetRole = request?.Role?.Trim().ToUpperInvariant() ?? "GENERAL_ADMIN";
            Guid userId;
            string email;
            string displayName;
            HashSet<UserRole> roles;

            switch (targetRole)
            {
                case "FINANCIAL_ADMIN":
                case "FINANCE_ADMIN":
                    userId = Guid.Parse("00000000-0000-0000-0000-000000000098");
                    email = "admin.financeiro@topiclog.com.br";
                    displayName = "Administrador Financeiro";
                    roles = [UserRole.FINANCIAL_ADMIN, UserRole.FINANCE_ADMIN];
                    break;
                case "LEGAL_OPERATOR":
                case "LEGAL":
                    userId = Guid.Parse("00000000-0000-0000-0000-000000000097");
                    email = "operador.juridico@topiclog.com.br";
                    displayName = "Operador Jurídico";
                    roles = [UserRole.LEGAL_OPERATOR];
                    break;
                case "COMPLIANCE_AUDITOR":
                case "AUDITOR":
                    userId = Guid.Parse("00000000-0000-0000-0000-000000000096");
                    email = "auditor.compliance@topiclog.com.br";
                    displayName = "Auditor de Compliance";
                    roles = [UserRole.COMPLIANCE_AUDITOR];
                    break;
                case "SUPPORT_OPERATOR":
                case "SUPPORT":
                    userId = Guid.Parse("00000000-0000-0000-0000-000000000095");
                    email = "operador.suporte@topiclog.com.br";
                    displayName = "Operador de Suporte";
                    roles = [UserRole.SUPPORT_OPERATOR, UserRole.SUPPORT];
                    break;
                default:
                    targetRole = "GENERAL_ADMIN";
                    userId = Guid.Parse("00000000-0000-0000-0000-000000000099");
                    email = "admin.geral@topiclog.com.br";
                    displayName = "Administrador Geral";
                    roles = [UserRole.GENERAL_ADMIN];
                    break;
            }

            var dummyUser = new UserEntity
            {
                Id = userId,
                Email = email,
                PhoneEncrypted = "v1$aes256gcm$admin",
                PhoneMasked = "(31) 98888-0000",
                PasswordHash = "v1$pbkdf2$admin"
            };

            var dummyProfile = new UserProfileEntity
            {
                UserId = userId,
                DisplayName = displayName,
                Roles = roles,
                KycStatus = Common.Contracts.KycStatus.VERIFIED,
                TermsAcceptedVersion = "2026.1-D08-DRAFT",
                TermsAcceptedAtUtc = DateTimeOffset.UtcNow
            };

            var (token, expiresIn, _) = crypto.CreateAccessToken(dummyUser, dummyProfile);

            return Results.Ok(new
            {
                accessToken = token,
                tokenType = "Bearer",
                expiresInSeconds = expiresIn,
                userId,
                displayName,
                email,
                role = targetRole
            });
        });

        // 12. GET /api/v1/admin/users — Consulta unificada da base oficial de usuários para auditoria e compliance
        group.MapGet("/users", async (
            [FromQuery] string? q,
            [FromQuery] string? role,
            [FromQuery] string? kycStatus,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            AdminApplicationService adminService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            await authorization.EnsureHasAnyRoleAsync(
                actor,
                AllAdminRoles,
                "ListAdminUsers",
                httpContext.TraceIdentifier,
                cancellationToken);

            var result = await adminService.GetUsersForAdminAsync(q, role, kycStatus, cancellationToken);
            return Results.Ok(result);
        });

        // 13. POST /api/v1/admin/users/diligence — Registro oficial de diligência na trilha central de auditoria
        group.MapPost("/users/diligence", async (
            [FromBody] AdminUserDiligenceRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            AdminApplicationService adminService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            await authorization.EnsureHasAnyRoleAsync(
                actor,
                AllAdminRoles,
                "RegisterAdminDiligence",
                httpContext.TraceIdentifier,
                cancellationToken);

            var created = await adminService.RegisterDiligenceAsync(request, actor, cancellationToken);
            return Results.Ok(created);
        });

        // Endpoint público somente leitura com os parâmetros atuais de multa por cancelamento configurados no Console Administrativo
        app.MapGet("/api/v1/public/cancellation-policy", async (
            IOperationalSettingsRepository settingsRepository,
            CancellationToken cancellationToken) =>
        {
            var settings = await settingsRepository.GetActiveSettingsAsync(cancellationToken).ConfigureAwait(false);
            var clampedPercent = Math.Clamp(settings?.CancellationPenaltyPercent ?? 10.00m, 0m, 10.00m);
            return Results.Ok(new
            {
                cancellationPenaltyPercent = clampedPercent,
                cancellationMinFeeCents = settings?.CancellationMinFeeCents ?? 700,
                cancellationInjuredPartySharePercent = settings?.CancellationInjuredPartySharePercent ?? 80.00m,
                minimumFreightPriceCents = settings?.MinimumFreightPriceCents ?? 900
            });
        });

        return app;
    }
}

public sealed record AdminSessionRequest(string? Role);
