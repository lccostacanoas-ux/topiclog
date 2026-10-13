using TopicLog.Api.Modules.Identity;

namespace TopicLog.Api.Modules.Verification;

/// <summary>
/// Registro de dependências e mapeamento de rotas HTTP do módulo Verification (PR-01.2).
/// </summary>
public static class VerificationEndpoints
{
    public static IServiceCollection AddTopicLogVerificationModule(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        // DEC-01: Interface independente da implementação; repositório em memória
        // registrado temporariamente para desenvolvimento local e testes iniciais.
        services.AddSingleton<IKycRepository, InMemoryKycRepository>();
        services.AddSingleton<VerificationApplicationService>();

        return services;
    }

    public static WebApplication MapTopicLogVerificationEndpoints(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        app.MapGet("/api/v1/kyc/me", async (
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            VerificationApplicationService verificationService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var dossier = await verificationService.GetUserKycDossierAsync(
                actor,
                actor.UserId,
                httpContext.TraceIdentifier,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(dossier);
        });

        // Endpoint protegido por ABAC (DEC-02.6): apenas o próprio dono ou SUPPORT/GENERAL_ADMIN
        app.MapGet("/api/v1/kyc/users/{userId:guid}", async (
            Guid userId,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            VerificationApplicationService verificationService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var dossier = await verificationService.GetUserKycDossierAsync(
                actor,
                userId,
                httpContext.TraceIdentifier,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(dossier);
        });

        app.MapPost("/api/v1/kyc/cases/submit", async (
            SubmitKycCaseRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            VerificationApplicationService verificationService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var dossier = await verificationService.SubmitKycCaseAsync(
                actor,
                request,
                httpContext.TraceIdentifier,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(dossier);
        });

        // Endpoint protegido por RBAC (exclusivo SUPPORT / GENERAL_ADMIN) e Segregação de Funções (proibida autoaprovação)
        app.MapPost("/api/v1/kyc/cases/{caseId:guid}/review-decision", async (
            Guid caseId,
            ReviewKycDecisionRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            VerificationApplicationService verificationService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var dossier = await verificationService.ReviewKycDecisionAsync(
                actor,
                caseId,
                request,
                httpContext.TraceIdentifier,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(dossier);
        });

        // Endpoint protegido por ABAC: apenas o próprio titular do caso REJECTED/EXPIRED pode solicitar reanálise
        app.MapPost("/api/v1/kyc/cases/{caseId:guid}/reanalysis", async (
            Guid caseId,
            ReanalyzeKycCaseRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            VerificationApplicationService verificationService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var dossier = await verificationService.RequestReanalysisAsync(
                actor,
                caseId,
                request,
                httpContext.TraceIdentifier,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(dossier);
        });

        // Endpoint de Elegibilidade Bilateral (D05): verifica Remetente e Transportador de forma independente no backend
        app.MapPost("/api/v1/kyc/evaluate-bilateral", async (
            EvaluateBilateralKycRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            VerificationApplicationService verificationService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var evaluation = await verificationService.EvaluateBilateralEligibilityAsync(
                actor,
                request,
                httpContext.TraceIdentifier,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(evaluation);
        });

        // Manifesto público dos Termos de Uso vigentes com distribuição legal de responsabilidades (D08)
        app.MapGet("/api/v1/terms/current", (VerificationApplicationService verificationService) =>
            Results.Ok(verificationService.GetCurrentTermsManifest()));

        return app;
    }
}
