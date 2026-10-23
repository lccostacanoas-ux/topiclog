// ============================================================================
// TOPIC LOG — ROTAS HTTP E REGISTRO DE DEPENDÊNCIAS JURÍDICAS (PR-LEG-01)
// ============================================================================

using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Modules.Identity;

namespace TopicLog.Api.Modules.Legal;

public static class LegalEndpoints
{
    public static IServiceCollection AddTopicLogLegalModule(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddSingleton<ILegalDocumentRepository, InMemoryLegalDocumentRepository>();
        services.AddSingleton<ILegalAcceptanceRepository, InMemoryLegalAcceptanceRepository>();
        services.AddSingleton<LegalApplicationService>();

        return services;
    }

    public static WebApplication MapTopicLogLegalEndpoints(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        // --------------------------------------------------------------------
        // ENDPOINTS ADMINISTRATIVOS (/api/v1/admin/legal/*)
        // --------------------------------------------------------------------

        var adminLegalGroup = app.MapGroup("/api/v1/admin/legal");

        // 1. Listagem de modelos de documentos e termos
        adminLegalGroup.MapGet("/templates", async (
            [FromQuery] string? category,
            [FromQuery] string? status,
            [FromQuery] string? scopeType,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            LegalApplicationService legalService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            EnsureAnyAdminRole(actor);

            var list = await legalService.ListTemplatesAsync(category, status, scopeType, cancellationToken);
            return Results.Ok(list);
        });

        // 2. Obter modelo por Id
        adminLegalGroup.MapGet("/templates/{id:guid}", async (
            Guid id,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            LegalApplicationService legalService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            EnsureAnyAdminRole(actor);

            var template = await legalService.GetTemplateByIdAsync(id, cancellationToken);
            return Results.Ok(template);
        });

        // 3. Cadastrar nova minuta de modelo
        adminLegalGroup.MapPost("/templates", async (
            CreateLegalTemplateRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            LegalApplicationService legalService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            string primaryRole = GetPrimaryRole(actor, "GENERAL_ADMIN");

            var created = await legalService.CreateTemplateAsync(actor.UserId, primaryRole, request, cancellationToken);
            return Results.Created($"/api/v1/admin/legal/templates/{created.Id}", created);
        });

        // 4. Editar minuta de modelo existente
        adminLegalGroup.MapPut("/templates/{id:guid}", async (
            Guid id,
            UpdateLegalTemplateRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            LegalApplicationService legalService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            string primaryRole = GetPrimaryRole(actor, "GENERAL_ADMIN");

            var updated = await legalService.UpdateTemplateAsync(id, actor.UserId, primaryRole, request, cancellationToken);
            return Results.Ok(updated);
        });

        // 5. Aprovação jurídica formal (LEGAL_OPERATOR ou GENERAL_ADMIN)
        adminLegalGroup.MapPost("/templates/{id:guid}/approve", async (
            Guid id,
            ApproveLegalTemplateRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            LegalApplicationService legalService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            string primaryRole = GetPrimaryRole(actor, "LEGAL_OPERATOR");

            var approved = await legalService.ApproveTemplateAsync(id, actor.UserId, primaryRole, request, cancellationToken);
            return Results.Ok(approved);
        });

        // 6. Publicação do modelo com vigência agendada
        adminLegalGroup.MapPost("/templates/{id:guid}/publish", async (
            Guid id,
            PublishLegalTemplateRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            LegalApplicationService legalService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            string primaryRole = GetPrimaryRole(actor, "LEGAL_OPERATOR");

            var published = await legalService.PublishTemplateAsync(id, actor.UserId, primaryRole, request, cancellationToken);
            return Results.Ok(published);
        });

        // 7. Desativação / arquivamento de modelo
        adminLegalGroup.MapPost("/templates/{id:guid}/deactivate", async (
            Guid id,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            LegalApplicationService legalService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            string primaryRole = GetPrimaryRole(actor, "GENERAL_ADMIN");

            var deactivated = await legalService.DeactivateTemplateAsync(id, actor.UserId, primaryRole, cancellationToken);
            return Results.Ok(deactivated);
        });

        // 8. Pré-visualização com campos dinâmicos preenchidos
        adminLegalGroup.MapPost("/templates/preview", async (
            PreviewLegalTemplateRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            LegalApplicationService legalService) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            EnsureAnyAdminRole(actor);

            var preview = await legalService.PreviewTemplateAsync(request);
            return Results.Ok(preview);
        });

        // 9. Comparação estruturada entre versões (diff)
        adminLegalGroup.MapGet("/templates/{id:guid}/compare/{targetVersion}", async (
            Guid id,
            string targetVersion,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            LegalApplicationService legalService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            EnsureAnyAdminRole(actor);

            var comparison = await legalService.CompareVersionsAsync(id, targetVersion, cancellationToken);
            return Results.Ok(comparison);
        });

        // 10. Importação DOCX sanitizada (Upload multipart ou base64)
        adminLegalGroup.MapPost("/templates/import-docx", async (
            HttpRequest httpRequest,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            LegalApplicationService legalService) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            string primaryRole = GetPrimaryRole(actor, "GENERAL_ADMIN");

            if (!primaryRole.Equals("GENERAL_ADMIN", StringComparison.OrdinalIgnoreCase) &&
                !primaryRole.Equals("LEGAL_OPERATOR", StringComparison.OrdinalIgnoreCase) &&
                !primaryRole.Equals("LEGAL", StringComparison.OrdinalIgnoreCase))
            {
                throw new DomainRuleViolationException("AUTH_FORBIDDEN_INSUFFICIENT_ROLE", "Apenas operadores jurídicos podem importar minutas DOCX.", 403);
            }

            if (!httpRequest.HasFormContentType || httpRequest.Form.Files.Count == 0)
            {
                throw new DomainRuleViolationException("FILE_REQUIRED", "Envio de arquivo DOCX no formulário é obrigatório (multipart/form-data).", 400);
            }

            var file = httpRequest.Form.Files[0];
            if (!file.FileName.EndsWith(".docx", StringComparison.OrdinalIgnoreCase))
            {
                throw new DomainRuleViolationException("INVALID_FILE_EXTENSION", "Apenas arquivos com extensão .docx são permitidos.", 400);
            }

            using var stream = file.OpenReadStream();
            var result = legalService.ImportDocxStream(stream);
            return Results.Ok(result);
        });

        // 11. Trilha de aceites eletrônicos por template
        adminLegalGroup.MapGet("/acceptances", async (
            [FromQuery] Guid? templateId,
            [FromQuery] string? version,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            LegalApplicationService legalService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            EnsureAnyAdminRole(actor);

            if (templateId.HasValue)
            {
                var list = await legalService.ListTemplateAcceptancesAsync(templateId.Value, version, cancellationToken);
                return Results.Ok(list);
            }

            return Results.Ok(Array.Empty<LegalAcceptanceResponse>());
        });

        // --------------------------------------------------------------------
        // ENDPOINTS PÚBLICOS E DO USUÁRIO (/api/v1/legal/*)
        // --------------------------------------------------------------------

        var legalGroup = app.MapGroup("/api/v1/legal");

        // Termos vigentes aplicáveis conforme perfil e município
        legalGroup.MapGet("/applicable-terms", async (
            [FromQuery] string? role,
            [FromQuery] string? stateUf,
            [FromQuery] string? municipalityIbge,
            LegalApplicationService legalService,
            CancellationToken cancellationToken) =>
        {
            var applicable = await legalService.GetApplicableTermsAsync(role ?? "SENDER", stateUf, municipalityIbge, cancellationToken);
            return Results.Ok(applicable);
        });

        // Registro de aceite formal de termo pelo usuário autenticado
        legalGroup.MapPost("/accept-term", async (
            RegisterLegalAcceptanceRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            LegalApplicationService legalService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);

            string ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";
            string userAgent = httpContext.Request.Headers.UserAgent.ToString();

            var response = await legalService.RegisterAcceptanceAsync(
                actor.UserId,
                "000.000.000-00", // CPF do usuário da sessão
                ip,
                userAgent,
                request,
                cancellationToken);

            return Results.Created($"/api/v1/legal/acceptances/{response.Id}", response);
        });

        // Histórico de aceites do próprio usuário autenticado
        legalGroup.MapGet("/my-acceptances", async (
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            LegalApplicationService legalService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var acceptances = await legalService.ListUserAcceptancesAsync(actor.UserId, cancellationToken);
            return Results.Ok(acceptances);
        });

        return app;
    }

    private static void EnsureAnyAdminRole(AuthenticatedActor actor)
    {
        bool isAdmin = actor.Roles.Any(r =>
            r == UserRole.GENERAL_ADMIN ||
            r == UserRole.FINANCIAL_ADMIN ||
            r == UserRole.FINANCE_ADMIN ||
            r == UserRole.LEGAL_OPERATOR ||
            r == UserRole.COMPLIANCE_AUDITOR ||
            r == UserRole.SUPPORT_OPERATOR ||
            r == UserRole.SUPPORT);

        if (!isAdmin)
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN_INSUFFICIENT_ROLE",
                "Acesso exclusivo para perfis administrativos autorizados da Topic Log.",
                403);
        }
    }

    private static string GetPrimaryRole(AuthenticatedActor actor, string defaultRole)
    {
        return actor.Roles.Count > 0 ? actor.Roles[0].ToString() : defaultRole;
    }
}
