using Microsoft.Extensions.Options;
using TopicLog.Api.Common.Options;

namespace TopicLog.Api.Modules.Identity;

/// <summary>
/// Registro de dependências e mapeamento de rotas HTTP do módulo Identity (PR-01.1).
/// </summary>
public static class IdentityEndpoints
{
    public static IServiceCollection AddTopicLogIdentityModule(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        services
            .AddOptions<SecurityOptions>()
            .Bind(configuration.GetSection(SecurityOptions.SectionName))
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<SecurityOptions>, SecurityOptionsValidator>();

        services.AddSingleton<RuntimeKeyMaterialProvider>();
        services.AddSingleton<SecurityCryptoService>();

        // DEC-01: Interfaces independentes da implementação; repositórios em memória
        // registrados temporariamente para desenvolvimento local e testes iniciais.
        services.AddSingleton<IUserRepository, InMemoryUserRepository>();
        services.AddSingleton<IRefreshTokenRepository, InMemoryRefreshTokenRepository>();
        services.AddSingleton<IPasswordResetRepository, InMemoryPasswordResetRepository>();
        services.AddSingleton<IAuditRepository, InMemoryAuditRepository>();
        services.AddSingleton<IEmailDeliveryService, SmtpEmailDeliveryService>();

        services.AddSingleton<ResourceAuthorizationService>();
        services.AddSingleton<IdentityApplicationService>();

        return services;
    }

    public static WebApplication MapTopicLogIdentityEndpoints(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        app.MapPost("/api/v1/auth/register", async (
            RegisterUserRequest request,
            HttpContext httpContext,
            IdentityApplicationService identityService,
            CancellationToken cancellationToken) =>
        {
            var session = await identityService.RegisterAsync(
                request,
                httpContext.TraceIdentifier,
                cancellationToken).ConfigureAwait(false);

            return Results.Created($"/api/v1/users/{session.Profile.UserId}/private-profile", session);
        });

        app.MapPost("/api/v1/auth/login", async (
            LoginRequest request,
            HttpContext httpContext,
            IdentityApplicationService identityService,
            CancellationToken cancellationToken) =>
        {
            var session = await identityService.LoginAsync(
                request,
                httpContext.TraceIdentifier,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(session);
        });

        app.MapPost("/api/v1/auth/refresh", async (
            RefreshTokenRequest request,
            HttpContext httpContext,
            IdentityApplicationService identityService,
            CancellationToken cancellationToken) =>
        {
            var session = await identityService.RefreshSessionAsync(
                request,
                httpContext.TraceIdentifier,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(session);
        });

        app.MapPost("/api/v1/auth/logout", async (
            LogoutRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IdentityApplicationService identityService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            await identityService.LogoutAsync(
                actor,
                request,
                httpContext.TraceIdentifier,
                cancellationToken).ConfigureAwait(false);

            return Results.NoContent();
        });

        app.MapPost("/api/v1/auth/change-password", async (
            ChangePasswordRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IdentityApplicationService identityService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            await identityService.ChangePasswordAsync(
                actor,
                request,
                httpContext.TraceIdentifier,
                cancellationToken).ConfigureAwait(false);

            return Results.NoContent();
        });

        app.MapPost("/api/v1/auth/forgot-password", async (
            ForgotPasswordRequest request,
            HttpContext httpContext,
            IdentityApplicationService identityService,
            CancellationToken cancellationToken) =>
        {
            var response = await identityService.RequestPasswordResetAsync(
                request,
                httpContext.TraceIdentifier,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(response);
        }).AllowAnonymous();

        app.MapPost("/api/v1/auth/reset-password", async (
            ResetPasswordRequest request,
            HttpContext httpContext,
            IdentityApplicationService identityService,
            CancellationToken cancellationToken) =>
        {
            await identityService.ConfirmPasswordResetAsync(
                request,
                httpContext.TraceIdentifier,
                cancellationToken).ConfigureAwait(false);

            return Results.NoContent();
        }).AllowAnonymous();

        // Endpoint restrito exclusivamente ao harness de testes automatizados (P0 - Auditoria 29/10/2026)
        // Requer flag explícita EnableSandboxAuthEndpoints=true, ambiente Testing, ausência de proxy reverso e chave interna.
        app.MapPost("/api/v1/auth/sandbox-token", (
            SandboxTokenRequest? request,
            HttpContext httpContext,
            IOptions<FeatureFlagsOptions> featureFlags,
            SecurityCryptoService crypto) =>
        {
            if (!featureFlags.Value.EnableSandboxAuthEndpoints ||
                !string.Equals(featureFlags.Value.EnvironmentMode, "Testing", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT"), "Production", StringComparison.OrdinalIgnoreCase))
            {
                return Results.NotFound();
            }

            // Elimina privilégios baseados apenas em IP loopback e rejeita chamadas via proxy reverso, Next.js ou túnel público
            if (httpContext.Request.Headers.ContainsKey("X-Forwarded-For") ||
                httpContext.Request.Headers.ContainsKey("X-Forwarded-Host") ||
                httpContext.Request.Headers.ContainsKey("X-Real-IP") ||
                httpContext.Request.Headers.ContainsKey("Forwarded"))
            {
                return Results.NotFound();
            }

            // Exige segredo interno transmitido apenas pelo executor de testes de integração
            const string TestingSecretHeader = "X-TopicLog-Internal-Dev-Secret";
            string expectedSecret = Environment.GetEnvironmentVariable("TOPICLOG_TESTING_SECRET") ?? "TL_INTERNAL_DEV_KEY_20261029";
            if (!httpContext.Request.Headers.TryGetValue(TestingSecretHeader, out var providedSecret) ||
                providedSecret != expectedSecret)
            {
                return Results.NotFound();
            }

            string role = request?.Role?.ToUpperInvariant() ?? "SENDER";
            Guid userId;
            string email;
            string displayName;
            HashSet<UserRole> roles;

            if (role == "CARRIER")
            {
                userId = Guid.Parse("00000000-0000-0000-0000-000000000002");
                email = "transportador@topiclog.com.br";
                displayName = "Transportador Parceiro";
                roles = [UserRole.CARRIER];
            }
            else if (role is "GENERAL_ADMIN" or "ADMIN")
            {
                userId = Guid.Parse("00000000-0000-0000-0000-000000000099");
                email = "admin.geral@topiclog.com.br";
                displayName = "Administrador Geral";
                roles = [UserRole.GENERAL_ADMIN];
            }
            else if (role is "FINANCIAL_ADMIN" or "FINANCE_ADMIN")
            {
                userId = Guid.Parse("00000000-0000-0000-0000-000000000098");
                email = "admin.financeiro@topiclog.com.br";
                displayName = "Administrador Financeiro";
                roles = [UserRole.FINANCIAL_ADMIN, UserRole.FINANCE_ADMIN];
            }
            else if (role is "LEGAL_OPERATOR" or "LEGAL")
            {
                userId = Guid.Parse("00000000-0000-0000-0000-000000000097");
                email = "operador.juridico@topiclog.com.br";
                displayName = "Operador Jurídico";
                roles = [UserRole.LEGAL_OPERATOR];
            }
            else if (role is "COMPLIANCE_AUDITOR" or "AUDITOR")
            {
                userId = Guid.Parse("00000000-0000-0000-0000-000000000096");
                email = "auditor.compliance@topiclog.com.br";
                displayName = "Auditor de Compliance";
                roles = [UserRole.COMPLIANCE_AUDITOR];
            }
            else if (role is "SUPPORT_OPERATOR" or "SUPPORT")
            {
                userId = Guid.Parse("00000000-0000-0000-0000-000000000095");
                email = "operador.suporte@topiclog.com.br";
                displayName = "Operador de Suporte";
                roles = [UserRole.SUPPORT_OPERATOR, UserRole.SUPPORT];
            }
            else
            {
                userId = Guid.Parse("00000000-0000-0000-0000-000000000001");
                email = "remetente@topiclog.com.br";
                displayName = "Remetente";
                roles = [UserRole.SENDER];
            }

            var dummyUser = new UserEntity
            {
                Id = userId,
                Email = email,
                PhoneEncrypted = "v1$aes256gcm$demo",
                PhoneMasked = "(31) 9****-0000",
                PasswordHash = "v1$pbkdf2$demo"
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
                role
            });
        });

        app.MapGet("/api/v1/me", async (
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IdentityApplicationService identityService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var profile = await identityService.GetPrivateProfileAsync(
                actor,
                actor.UserId,
                httpContext.TraceIdentifier,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(profile);
        });

        app.MapPatch("/api/v1/me", async (
            UpdateProfileRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IdentityApplicationService identityService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var updated = await identityService.UpdatePrivateProfileAsync(
                actor,
                actor.UserId,
                request,
                httpContext.TraceIdentifier,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(updated);
        });

        // Endpoint protegido por ABAC (DEC-02.6): apenas o próprio dono ou SUPPORT/GENERAL_ADMIN
        app.MapGet("/api/v1/users/{userId:guid}/private-profile", async (
            Guid userId,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IdentityApplicationService identityService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var profile = await identityService.GetPrivateProfileAsync(
                actor,
                userId,
                httpContext.TraceIdentifier,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(profile);
        });

        // Endpoint protegido por ABAC (DEC-02.6): bloqueia alteração de perfil de outro usuário (403 Forbidden)
        app.MapPatch("/api/v1/users/{userId:guid}/private-profile", async (
            Guid userId,
            UpdateProfileRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IdentityApplicationService identityService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var updated = await identityService.UpdatePrivateProfileAsync(
                actor,
                userId,
                request,
                httpContext.TraceIdentifier,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(updated);
        });

        // Cartão público mínimo para contraparte autenticada (LGPD: zero e-mail, zero CPF, zero telefone)
        app.MapGet("/api/v1/users/{userId:guid}/public-card", async (
            Guid userId,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IdentityApplicationService identityService,
            CancellationToken cancellationToken) =>
        {
            _ = authorization.RequireAuthenticatedActor(httpContext);
            var publicCard = await identityService.GetPublicCardAsync(userId, cancellationToken).ConfigureAwait(false);
            return Results.Ok(publicCard);
        });

        // Endpoint protegido por RBAC: somente SUPPORT ou GENERAL_ADMIN podem consultar trilha de auditoria
        app.MapGet("/api/v1/audit/events", async (
            int? limit,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IAuditRepository auditRepository,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            await authorization.EnsureHasAnyRoleAsync(
                actor,
                [UserRole.SUPPORT, UserRole.GENERAL_ADMIN],
                operationName: "ListAuditEvents",
                correlationId: httpContext.TraceIdentifier,
                cancellationToken: cancellationToken).ConfigureAwait(false);

            var events = await auditRepository.ListRecentAsync(limit ?? 50, cancellationToken).ConfigureAwait(false);
            return Results.Ok(new
            {
                count = events.Count,
                persistenceMode = "InMemoryTemporary_PendingPostgreSqlIntegration",
                items = events
            });
        });

        return app;
    }
}
