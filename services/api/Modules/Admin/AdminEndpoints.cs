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

        return app;
    }
}
