using System.Diagnostics;
using Microsoft.Extensions.Options;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Common.Middleware;
using TopicLog.Api.Common.Options;
using TopicLog.Api.Infrastructure.Providers;
using TopicLog.Api.Modules;
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

            // 3. Worker assíncrono acoplado In-Process para otimizar uso de RAM (~8 GB)
            bool runWorkerInProcess = overrideRunWorkerInProcess
                ?? builder.Configuration.GetValue<bool>("FeatureFlags:RunWorkerInProcess", true);
            builder.Services.AddTopicLogWorker(registerHostedService: runWorkerInProcess);

            var app = builder.Build();

            // 4. Pipeline de Middlewares (Correlação + ProblemDetails RFC 9457)
            app.UseMiddleware<CorrelationIdMiddleware>();
            app.UseMiddleware<GlobalExceptionMiddleware>();

            MapSystemAndHealthEndpoints(app);

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

            // Especificação OpenAPI 3.1.0 (PR-00)
            app.MapGet("/openapi/v1.json", () => Results.Ok(new
            {
                openapi = "3.1.0",
                info = new
                {
                    title = "Topic Log API — Monólito Modular",
                    version = "1.0.0-pr00",
                    description = "API REST da plataforma Topic Log (Minas Gerais — Piloto João Monlevade e Belo Horizonte). Ambiente de Testes / Sandbox."
                },
                paths = new Dictionary<string, object>
                {
                    ["/health/live"] = new { get = new { summary = "Liveness probe e uso de memória", responses = new { _200 = new { description = "API viva" } } } },
                    ["/health/ready"] = new { get = new { summary = "Readiness probe, provedores sandbox e estado do worker", responses = new { _200 = new { description = "API pronta" } } } },
                    ["/api/v1/system/feature-flags"] = new { get = new { summary = "Retorna feature flags e regras vinculantes v2.0 (D01-D17)", responses = new { _200 = new { description = "Configurações ativas" } } } },
                    ["/api/v1/system/modules"] = new { get = new { summary = "Lista os 19 módulos do monólito modular", responses = new { _200 = new { description = "Lista de módulos" } } } },
                    ["/api/v1/system/validate-weight"] = new { post = new { summary = "Valida peso em gramas por modal (5kg bicicleta, 20kg moto/carro)", responses = new { _200 = new { description = "Peso válido" }, _422 = new { description = "ProblemDetails — Peso excedido" } } } }
                }
            }));
        }
    }
}
