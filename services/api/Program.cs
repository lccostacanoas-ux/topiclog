using System.Diagnostics;
using Microsoft.Extensions.Options;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Common.Middleware;
using TopicLog.Api.Common.Options;
using TopicLog.Api.Infrastructure.Providers;
using TopicLog.Api.Modules;
using TopicLog.Api.Modules.Admin;
using TopicLog.Api.Modules.Finance;
using TopicLog.Api.Modules.Fulfillment;
using TopicLog.Api.Modules.Identity;
using TopicLog.Api.Modules.Legal;
using TopicLog.Api.Modules.Matching;
using TopicLog.Api.Modules.Proposals;
using TopicLog.Api.Modules.Regions;
using TopicLog.Api.Modules.Shipments;
using TopicLog.Api.Modules.Trips;
using TopicLog.Api.Modules.Verification;
using TopicLog.Worker;
using TopicLog.Worker.Services;

namespace TopicLog.Api
{
    public static class Program
    {
        public static async Task Main(string[] args)
        {
            var app = TopicLogApplicationFactory.CreateApplication(args);
            await app.RunAsync().ConfigureAwait(false);
        }
    }

    public sealed record ValidateWeightRequest(string VehicleType, int WeightGrams, int? DeclaredCarrierCapacityGrams);

    /// <summary>
    /// Fábrica de inicialização do WebApplication para execução normal e testes de integração.
    /// </summary>
    public static class TopicLogApplicationFactory
    {
        public static WebApplication CreateApplication(string[] args, bool? overrideRunWorkerInProcess = null)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Suporte transparente a enums em formato texto (ex: "CAR", "BICYCLE", "DOCUMENTOS")
            builder.Services.ConfigureHttpJsonOptions(options =>
            {
                options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
            });

            // 1. Configurações tipadas e validadores de inicialização (D01–D17)
            builder.Services
                .AddOptions<FeatureFlagsOptions>()
                .Bind(builder.Configuration.GetSection(FeatureFlagsOptions.SectionName))
                .ValidateOnStart();
            builder.Services.AddSingleton<IValidateOptions<FeatureFlagsOptions>, FeatureFlagsOptionsValidator>();

            builder.Services
                .AddOptions<TopicLogOptions>()
                .Bind(builder.Configuration.GetSection(TopicLogOptions.SectionName))
                .ValidateOnStart();
            builder.Services.AddSingleton<IValidateOptions<TopicLogOptions>, TopicLogOptionsValidator>();

            // 2. Provedores desacoplados em modo Sandbox / Local (Sem pagamentos reais)
            builder.Services.AddSingleton<IPaymentProvider, SandboxAsaasPaymentProvider>();
            builder.Services.AddSingleton<IKycProvider, SandboxKycProvider>();
            builder.Services.AddSingleton<IMapsProvider, LocalFreeMapsProvider>();
            builder.Services.AddSingleton<IObjectStorageProvider, LocalDiskObjectStorageProvider>();

            // 3. Módulos de Identidade (PR-01.1), Verificação KYC (PR-01.2), Encomendas e Viagens (PR-02), Matching (PR-03), Propostas e Negociação (PR-04)
            builder.Services.AddTopicLogIdentityModule(builder.Configuration);
            builder.Services.AddTopicLogVerificationModule();
            builder.Services.AddTopicLogShipmentsModule();
            builder.Services.AddTopicLogTripsModule();
            builder.Services.AddTopicLogMatchingModule();
            builder.Services.AddTopicLogFinanceModule();
            builder.Services.AddTopicLogProposalsModule();
            builder.Services.AddTopicLogFulfillmentModule();
            builder.Services.AddTopicLogAdminModule();
            builder.Services.AddTopicLogLegalModule();

            // 4. Worker assíncrono acoplado In-Process para otimizar uso de RAM (~8 GB)
            bool runWorkerInProcess = overrideRunWorkerInProcess
                ?? builder.Configuration.GetValue<bool>("FeatureFlags:RunWorkerInProcess", true);
            builder.Services.AddTopicLogWorker(registerHostedService: runWorkerInProcess);

            // 5. CORS restrito ao Frontend Next.js local com exposição de X-Correlation-Id
            builder.Services.AddCors(options =>
            {
                options.AddPolicy("LocalWebFrontend", policy =>
                {
                    policy.WithOrigins("http://localhost:3000", "http://127.0.0.1:3000")
                          .WithMethods("GET", "POST", "PATCH", "OPTIONS")
                          .WithHeaders("Content-Type", "Accept", "Authorization", CorrelationIdMiddleware.HeaderName, "Idempotency-Key")
                          .WithExposedHeaders(CorrelationIdMiddleware.HeaderName);
                });
            });

            var app = builder.Build();

            // 6. Pipeline de Middlewares (Correlação + ProblemDetails RFC 9457 + CORS)
            app.UseMiddleware<CorrelationIdMiddleware>();
            app.UseMiddleware<GlobalExceptionMiddleware>();
            app.UseCors("LocalWebFrontend");

            MapSystemAndHealthEndpoints(app);
            app.MapTopicLogIdentityEndpoints();
            app.MapTopicLogVerificationEndpoints();
            app.MapTopicLogShipmentsEndpoints();
            app.MapTopicLogTripsEndpoints();
            app.MapTopicLogRegionsEndpoints();
            app.MapTopicLogMatchingEndpoints();
            app.MapTopicLogFinanceEndpoints();
            app.MapTopicLogProposalsEndpoints();
            app.MapTopicLogFulfillmentEndpoints();
            app.MapTopicLogAdminEndpoints();
            app.MapTopicLogLegalEndpoints();

            // Acesso temporário assinado a objetos privados de mídia (D16 / ADR-0006)
            app.MapGet("/api/v1/private-media", (
                string key,
                long expires) =>
            {
                long nowUnix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                if (expires < nowUnix)
                {
                    return Results.Problem(
                        title: "Link temporário expirado",
                        detail: "A URL temporária de acesso à foto privada expirou.",
                        statusCode: StatusCodes.Status410Gone);
                }

                return Results.Ok(new
                {
                    storageKey = key,
                    validUntilUtc = DateTimeOffset.FromUnixTimeSeconds(expires),
                    status = "AUTHORIZED_TEMPORARY"
                });
            });

            return app;
        }

        private static void MapSystemAndHealthEndpoints(WebApplication app)
        {
            // Liveness Probe
            app.MapGet("/health/live", (IOptions<FeatureFlagsOptions> flags) =>
            {
                using var currentProcess = Process.GetCurrentProcess();
                double workingSetMb = Math.Round(currentProcess.WorkingSet64 / (1024.0 * 1024.0), 2);

                return Results.Ok(new
                {
                    status = "Healthy",
                    service = "TopicLog.Api",
                    framework = Environment.Version.ToString(),
                    environmentMode = flags.Value.EnvironmentMode,
                    memoryWorkingSetMb = workingSetMb,
                    timestampUtc = DateTimeOffset.UtcNow
                });
            });

            // Readiness Probe
            app.MapGet("/health/ready", (
                IOptions<FeatureFlagsOptions> flags,
                IOptions<TopicLogOptions> topicLogOptions,
                IPaymentProvider paymentProvider,
                IKycProvider kycProvider,
                IMapsProvider mapsProvider,
                IObjectStorageProvider storageProvider,
                WorkerStatusTracker workerTracker) =>
            {
                var f = flags.Value;
                var t = topicLogOptions.Value;
                bool isReady = !f.RealPaymentsEnabled
                    && f.AsaasSandboxEnabled
                    && f.BilateralKycRequiredOnContract
                    && !f.InsuranceCommercializationEnabled
                    && f.RequireCodeAndPhotoForDelivery;

                return Results.Ok(new
                {
                    status = isReady ? "Ready" : "Degraded",
                    productName = t.ProductName,
                    targetStateUf = t.TargetStateUf,
                    providers = new
                    {
                        payment = new { name = paymentProvider.ProviderName, isSandbox = paymentProvider.IsSandboxMode },
                        kyc = kycProvider.ProviderName,
                        maps = new { name = mapsProvider.ProviderName, license = mapsProvider.LicenseAttribution },
                        storage = storageProvider.ProviderName
                    },
                    worker = workerTracker.GetSnapshot(),
                    timestampUtc = DateTimeOffset.UtcNow
                });
            });

            // Feature Flags & Políticas Vigentes para o Frontend (PR-00)
            app.MapGet("/api/v1/system/feature-flags", (
                IOptions<FeatureFlagsOptions> flags,
                IOptions<TopicLogOptions> topicLog) =>
            {
                var f = flags.Value;
                var t = topicLog.Value;

                return Results.Ok(new
                {
                    productName = t.ProductName,
                    intendedDomain = t.IntendedDomain,
                    targetStateUf = t.TargetStateUf,
                    pilotMunicipalities = t.PilotMunicipalities.OrderBy(m => m.PriorityOrder),
                    defaultVehicleLimitsGrams = t.DefaultVehicleLimits,
                    commercialPolicies = new
                    {
                        freePlanCommissionRate = t.DefaultCommercialPolicies.FreePlanCommissionRate,
                        premiumPlanMonthlyPriceCents = t.DefaultCommercialPolicies.PremiumPlanMonthlyPriceCents,
                        premiumPlanCommissionRate = t.DefaultCommercialPolicies.PremiumPlanCommissionRate,
                        platformAbsorbsGatewayFees = t.DefaultCommercialPolicies.PlatformAbsorbsGatewayFees
                    },
                    insurance = new
                    {
                        commercializationEnabled = f.InsuranceCommercializationEnabled,
                        mandatoryDisclaimer = TopicLogOptions.MandatoryInsuranceDisclaimer
                    },
                    featureFlags = new
                    {
                        environmentMode = f.EnvironmentMode,
                        realPaymentsEnabled = f.RealPaymentsEnabled,
                        asaasSandboxEnabled = f.AsaasSandboxEnabled,
                        bilateralKycRequiredOnContract = f.BilateralKycRequiredOnContract,
                        requireCodeAndPhotoForDelivery = f.RequireCodeAndPhotoForDelivery,
                        runWorkerInProcess = f.RunWorkerInProcess
                    }
                });
            });

            // Catálogo dos 19 Módulos do Monólito Modular
            app.MapGet("/api/v1/system/modules", () => Results.Ok(new
            {
                architecture = "Modular Monolith (.NET 10 LTS)",
                totalModules = ModuleCatalog.All.Count,
                modules = ModuleCatalog.All
            }));

            // Endpoint de validação de limite de peso por veículo (D03, D04) e teste de ProblemDetails
            app.MapPost("/api/v1/system/validate-weight", (
                ValidateWeightRequest request,
                IOptions<TopicLogOptions> options) =>
            {
                if (!Enum.TryParse<VehicleType>(request.VehicleType, ignoreCase: true, out var vehicleType))
                {
                    throw new DomainRuleViolationException(
                        "UNSUPPORTED_VEHICLE_TYPE",
                        $"Modal '{request.VehicleType}' inválido. Modais suportados: BICYCLE, MOTORCYCLE, CAR.");
                }

                var validation = TopicLogRules.ValidateVehicleWeight(
                    vehicleType,
                    request.WeightGrams,
                    options.Value.DefaultVehicleLimits,
                    request.DeclaredCarrierCapacityGrams);

                if (!validation.IsValid)
                {
                    throw new DomainRuleViolationException(
                        validation.ErrorCode ?? "VEHICLE_WEIGHT_LIMIT_EXCEEDED",
                        validation.ErrorMessage ?? "Peso acima do limite permitido.",
                        httpStatusCode: StatusCodes.Status422UnprocessableEntity);
                }

                return Results.Ok(validation);
            });

            // Especificação OpenAPI 3.1.0 (PR-00 + PR-01.1 + PR-01.2)
            app.MapGet("/openapi/v1.json", () => Results.Ok(new
            {
                openapi = "3.1.0",
                info = new
                {
                    title = "Topic Log API — Monólito Modular",
                    version = "1.2.0-pr01.2",
                    description = "API REST da plataforma Topic Log (Minas Gerais — Piloto João Monlevade e Belo Horizonte). Ambiente de Testes / Sandbox."
                },
                paths = new Dictionary<string, object>
                {
                    ["/health/live"] = new { get = new { summary = "Liveness probe e uso de memória", responses = new { _200 = new { description = "API viva" } } } },
                    ["/health/ready"] = new { get = new { summary = "Readiness probe, provedores sandbox e estado do worker", responses = new { _200 = new { description = "API pronta" } } } },
                    ["/api/v1/system/feature-flags"] = new { get = new { summary = "Retorna feature flags e regras vinculantes v2.0 (D01-D17)", responses = new { _200 = new { description = "Configurações ativas" } } } },
                    ["/api/v1/system/modules"] = new { get = new { summary = "Lista os 19 módulos do monólito modular", responses = new { _200 = new { description = "Lista de módulos" } } } },
                    ["/api/v1/system/validate-weight"] = new { post = new { summary = "Valida peso em gramas por modal (5kg bicicleta, 20kg moto/carro)", responses = new { _200 = new { description = "Peso válido" }, _422 = new { description = "ProblemDetails — Peso excedido" } } } },
                    ["/api/v1/auth/register"] = new { post = new { summary = "Cadastro de conta multipapel sem exigência imediata de KYC (D05) e aceite de termos (D08)", responses = new { _201 = new { description = "Conta criada" }, _400 = new { description = "ProblemDetails — Regra violada" } } } },
                    ["/api/v1/auth/login"] = new { post = new { summary = "Autenticação com PBKDF2-HMAC-SHA256 e proteção contra força bruta", responses = new { _200 = new { description = "Sessão iniciada" }, _401 = new { description = "Credenciais inválidas" }, _423 = new { description = "Conta temporariamente bloqueada" } } } },
                    ["/api/v1/auth/refresh"] = new { post = new { summary = "Rotação de Refresh Token com detecção de reuso", responses = new { _200 = new { description = "Sessão renovada" }, _401 = new { description = "Token inválido ou reutilizado" } } } },
                    ["/api/v1/auth/logout"] = new { post = new { summary = "Revogação da sessão atual", responses = new { _204 = new { description = "Sessão encerrada" } } } },
                    ["/api/v1/me"] = new { get = new { summary = "Perfil privado do próprio usuário autenticado" }, patch = new { summary = "Atualização do próprio perfil e papéis SENDER/CARRIER/RECIPIENT" } },
                    ["/api/v1/users/{userId}/private-profile"] = new { get = new { summary = "Perfil privado protegido por ABAC (403 em acesso cruzado)" }, patch = new { summary = "Edição protegida por ABAC (403 em acesso cruzado)" } },
                    ["/api/v1/users/{userId}/public-card"] = new { get = new { summary = "Cartão público mínimo para contraparte sem exposição de PII (LGPD)" } },
                    ["/api/v1/audit/events"] = new { get = new { summary = "Trilha de auditoria protegida por RBAC (exclusivo SUPPORT / GENERAL_ADMIN)" } },
                    ["/api/v1/kyc/me"] = new { get = new { summary = "Dossiê de KYC progressivo do próprio titular autenticado" } },
                    ["/api/v1/kyc/users/{userId}"] = new { get = new { summary = "Dossiê de KYC protegido por ABAC (titular ou SUPPORT/GENERAL_ADMIN)" } },
                    ["/api/v1/kyc/cases/submit"] = new { post = new { summary = "Submissão dos 4 checks obrigatórios por referência segura sem biometria bruta (D05)" } },
                    ["/api/v1/kyc/cases/{caseId}/review-decision"] = new { post = new { summary = "Decisão de revisão protegida por RBAC e segregação de funções (bloqueia autoaprovação)" } },
                    ["/api/v1/kyc/cases/{caseId}/reanalysis"] = new { post = new { summary = "Solicitação de reanálise pelo titular de caso REJECTED/EXPIRED" } },
                    ["/api/v1/kyc/evaluate-bilateral"] = new { post = new { summary = "Validação independente de elegibilidade bilateral Remetente + Transportador (D05)" } },
                    ["/api/v1/terms/current"] = new { get = new { summary = "Manifesto vigente dos Termos de Uso com distribuição legal de responsabilidades (D08)" } }
                }
            }));
        }
    }
}
