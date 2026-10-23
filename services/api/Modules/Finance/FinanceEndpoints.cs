// ============================================================================
// TOPIC LOG — ENDPOINTS DO MÓDULO FINANCEIRO (PR-FIN-01)
// ============================================================================

using Microsoft.AspNetCore.Mvc;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Modules.Identity;

namespace TopicLog.Api.Modules.Finance;

public static class FinanceEndpoints
{
    public static IServiceCollection AddTopicLogFinanceModule(this IServiceCollection services)
    {
        services.AddSingleton<IFinancialPolicyRepository, InMemoryFinancialPolicyRepository>();
        services.AddSingleton<ISubscriptionRepository, InMemorySubscriptionRepository>();
        services.AddSingleton<IFinancialSnapshotRepository, InMemoryFinancialSnapshotRepository>();
        services.AddSingleton<IFinancialAuditRepository, InMemoryFinancialAuditRepository>();
        services.AddSingleton<IFinancialPolicyProvider, FinancialApplicationService>();
        return services;
    }

    public static IEndpointRouteBuilder MapTopicLogFinanceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/finance");

        // GET /api/v1/finance/policies/current
        group.MapGet("/policies/current", async (
            IFinancialPolicyProvider financeService,
            CancellationToken cancellationToken) =>
        {
            var policy = await financeService.GetEffectivePolicyAsync(DateTimeOffset.UtcNow, cancellationToken);
            var response = new CommercialPolicyResponse(
                policy.Id,
                policy.Version,
                policy.Name,
                policy.FreePlanCommissionPercent,
                policy.PremiumPlanCommissionPercent,
                policy.PremiumMonthlyFeeCents,
                policy.CancellationPenaltyPercent,
                policy.CancellationMinFeeCents,
                policy.CancellationInjuredPartySharePercent,
                policy.ValidFrom,
                policy.ValidUntil,
                policy.IsActive,
                policy.Justification,
                policy.CreatedAtUtc,
                FinancialApplicationService.DeterminePolicyStatus(policy));

            return Results.Ok(response);
        });

        // GET /api/v1/finance/policies/history
        group.MapGet("/policies/history", async (
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFinancialPolicyProvider financeService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            if (!actor.Roles.Contains(UserRole.GENERAL_ADMIN) && !actor.Roles.Contains(UserRole.SUPPORT))
            {
                throw new DomainRuleViolationException(
                    "AUTH_FORBIDDEN_INSUFFICIENT_ROLE",
                    "Acesso restrito à administração financeira da plataforma.",
                    403);
            }

            var history = await financeService.GetPolicyHistoryAsync(cancellationToken);
            return Results.Ok(history);
        });

        // POST /api/v1/finance/policies
        group.MapPost("/policies", async (
            [FromBody] CreateCommercialPolicyRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFinancialPolicyProvider financeService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            string roleStr = actor.Roles.Contains(UserRole.GENERAL_ADMIN)
                ? "GENERAL_ADMIN"
                : (actor.Roles.Count > 0 ? actor.Roles[0].ToString() : "CLIENT");

            var result = await financeService.CreatePolicyVersionAsync(
                actor.UserId,
                roleStr,
                request,
                cancellationToken);

            return Results.Created($"/api/v1/finance/policies/{result.Version}", result);
        });

        // POST /api/v1/finance/policies/{id}/revoke
        group.MapPost("/policies/{id:guid}/revoke", async (
            Guid id,
            [FromBody] RevokeCommercialPolicyRequest? request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFinancialPolicyProvider financeService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            string roleStr = actor.Roles.Contains(UserRole.GENERAL_ADMIN)
                ? "GENERAL_ADMIN"
                : (actor.Roles.Count > 0 ? actor.Roles[0].ToString() : "CLIENT");

            var result = await financeService.RevokePolicyAsync(
                id,
                actor.UserId,
                roleStr,
                request?.Reason,
                cancellationToken);

            return Results.Ok(result);
        });

        // GET /api/v1/finance/subscriptions/plans
        group.MapGet("/subscriptions/plans", (IFinancialPolicyProvider financeService) =>
        {
            var plans = financeService.GetAvailablePlans();
            return Results.Ok(plans);
        });

        // GET /api/v1/finance/subscriptions/me
        group.MapGet("/subscriptions/me", async (
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFinancialPolicyProvider financeService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var sub = await financeService.GetCarrierSubscriptionAsync(actor.UserId, cancellationToken);
            if (sub is null)
            {
                // Retorna representação padrão do plano gratuito
                return Results.Ok(new SubscriptionResponse(
                    Id: Guid.Empty,
                    CarrierId: actor.UserId,
                    PlanCode: "FREE",
                    Status: "ACTIVE",
                    MonthlyFeeCents: 0,
                    CommissionRatePercent: 13.00m,
                    CurrentPeriodStartUtc: DateTimeOffset.UtcNow,
                    CurrentPeriodEndUtc: DateTimeOffset.UtcNow.AddYears(1),
                    CanceledAtUtc: null));
            }

            return Results.Ok(sub);
        });

        // POST /api/v1/finance/subscriptions/subscribe
        group.MapPost("/subscriptions/subscribe", async (
            [FromBody] SubscribePlanRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFinancialPolicyProvider financeService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var result = await financeService.SubscribePlanAsync(actor.UserId, request.PlanCode, cancellationToken);
            return Results.Ok(result);
        });

        // POST /api/v1/finance/subscriptions/cancel
        group.MapPost("/subscriptions/cancel", async (
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFinancialPolicyProvider financeService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var result = await financeService.CancelSubscriptionAsync(actor.UserId, cancellationToken);
            return Results.Ok(result);
        });

        // POST /api/v1/finance/simulate-split
        group.MapPost("/simulate-split", async (
            [FromBody] SimulateSplitRequest request,
            IFinancialPolicyProvider financeService,
            CancellationToken cancellationToken) =>
        {
            var result = await financeService.SimulateSplitAsync(
                request.TransportAmountCents,
                request.CarrierId,
                request.PlanCodeOverride,
                null,
                cancellationToken);

            return Results.Ok(result);
        });

        // GET /api/v1/finance/snapshots/{contractId}
        group.MapGet("/snapshots/{contractId:guid}", async (
            Guid contractId,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFinancialPolicyProvider financeService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var snapshot = await financeService.GetSnapshotByContractIdAsync(contractId, cancellationToken);
            if (snapshot is null)
            {
                throw new DomainRuleViolationException("SNAPSHOT_NOT_FOUND", "Snapshot financeiro não encontrado para o contrato informado.", 404);
            }

            // Autorização: Remetente, Transportador ou Admin
            if (actor.UserId != snapshot.SenderId &&
                actor.UserId != snapshot.CarrierId &&
                !actor.Roles.Contains(UserRole.GENERAL_ADMIN) &&
                !actor.Roles.Contains(UserRole.SUPPORT))
            {
                throw new DomainRuleViolationException(
                    "AUTH_FORBIDDEN_NOT_PARTY",
                    "Acesso negado: apenas as partes do contrato ou a administração podem consultar o snapshot financeiro.",
                    403);
            }

            var response = new FinancialSnapshotResponse(
                snapshot.Id,
                snapshot.ContractId,
                snapshot.ProposalId,
                snapshot.ShipmentId,
                snapshot.CarrierId,
                snapshot.SenderId,
                snapshot.PolicyVersion,
                snapshot.PlanCode,
                snapshot.CommissionRatePercent,
                snapshot.TransportAmountCents,
                snapshot.PlatformCommissionCents,
                snapshot.CarrierNetCents,
                snapshot.GatewayFeesAbsorbedByPlatform,
                snapshot.SnapshottedAtUtc);

            return Results.Ok(response);
        });

        return app;
    }
}
