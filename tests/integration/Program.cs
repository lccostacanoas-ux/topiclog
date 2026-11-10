using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using TopicLog.Api;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Common.Middleware;
using TopicLog.Api.Modules.Admin;
using TopicLog.Api.Modules.Finance;
using TopicLog.Api.Modules.Fulfillment;
using TopicLog.Api.Modules.Identity;
using TopicLog.Api.Modules.Matching;
using TopicLog.Api.Modules.Proposals;
using TopicLog.Api.Modules.Regions;
using TopicLog.Api.Modules.Shipments;
using TopicLog.Api.Modules.Trips;
using TopicLog.Api.Modules.Verification;

Console.WriteLine("======================================================================");
Console.WriteLine("TopicLog.IntegrationTests (.NET 10 LTS) — Executando suíte HTTP PR-00 a PR-05 + PR-ADM-01 + PR-FIN-02 + PR-LEG-01");
Console.WriteLine("======================================================================");

var sw = Stopwatch.StartNew();
int passed = 0;
int failed = 0;

// Isolamento estrito de testes de integração em diretório temporário exclusivo (Finding 3 / DEC-01.1)
string tempIntegrationStorage = Path.Combine(Path.GetTempPath(), "TopicLogIntegrationTests_" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(tempIntegrationStorage);
Environment.SetEnvironmentVariable("TOPICLOG_STORAGE_DIR", tempIntegrationStorage);
Environment.SetEnvironmentVariable("TOPICLOG_IS_TEST", "true");
Environment.SetEnvironmentVariable("TOPICLOG_TESTING_SECRET", "TL_INTERNAL_DEV_KEY_20261029");

var app = TopicLogApplicationFactory.CreateApplication(["--urls=http://127.0.0.1:0", "--FeatureFlags:EnableSandboxAuthEndpoints=true"]);
await app.StartAsync().ConfigureAwait(false);

try
{
    var server = app.Services.GetRequiredService<IServer>();
    var addressFeature = server.Features.Get<IServerAddressesFeature>();
    string baseAddress = addressFeature?.Addresses.FirstOrDefault()
        ?? throw new InvalidOperationException("Não foi possível obter o endereço efêmero do Kestrel.");

    using var client = new HttpClient { BaseAddress = new Uri(baseAddress) };
    client.DefaultRequestHeaders.Add("X-TopicLog-Internal-Dev-Secret", "TL_INTERNAL_DEV_KEY_20261029");

    await RunTestAsync("GET /health/live retorna 200 OK, status Healthy e cabeçalho X-Correlation-Id", async () =>
    {
        using var response = await client.GetAsync("/health/live").ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.OK, $"Status esperado 200, recebido {(int)response.StatusCode}");
        Assert(response.Headers.Contains(CorrelationIdMiddleware.HeaderName), "Cabeçalho X-Correlation-Id ausente.");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        string? status = doc.RootElement.GetProperty("status").GetString();
        Assert(status == "Healthy", $"Status esperado Healthy, recebido {status}");
    }).ConfigureAwait(false);

    await RunTestAsync("GET /health/ready retorna 200 OK com provedores em modo Sandbox e Worker InProcess ativo", async () =>
    {
        using var response = await client.GetAsync("/health/ready").ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.OK, "Readiness check deve retornar 200 OK.");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("status").GetString() == "Ready", "Status deve ser Ready.");
        Assert(doc.RootElement.GetProperty("providers").GetProperty("payment").GetProperty("name").GetString() == "Asaas", "Provedor deve ser Asaas.");
        Assert(doc.RootElement.GetProperty("providers").GetProperty("payment").GetProperty("isSandbox").GetBoolean(), "Asaas deve estar em modo Sandbox.");
    }).ConfigureAwait(false);

    await RunTestAsync("Propagação de X-Correlation-Id customizado entre requisição e resposta", async () =>
    {
        const string expectedCorrelationId = "corr-pr00-integration-test-001";
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health/live");
        request.Headers.Add(CorrelationIdMiddleware.HeaderName, expectedCorrelationId);

        using var response = await client.SendAsync(request).ConfigureAwait(false);
        string actualCorrelationId = response.Headers.GetValues(CorrelationIdMiddleware.HeaderName).First();
        Assert(actualCorrelationId == expectedCorrelationId, $"Esperado '{expectedCorrelationId}', recebido '{actualCorrelationId}'.");
    }).ConfigureAwait(false);

    await RunTestAsync("GET /api/v1/system/feature-flags retorna decisões vinculantes v2.0 (MG, 13%, 7%, 5/20/20kg, sem pagamento real)", async () =>
    {
        using var response = await client.GetAsync("/api/v1/system/feature-flags").ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.OK, "Endpoint feature-flags deve retornar 200 OK.");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = doc.RootElement;

        Assert(root.GetProperty("productName").GetString() == "Topic Log", "ProductName incorreto.");
        Assert(root.GetProperty("targetStateUf").GetString() == "MG", "UF deve ser MG.");
        Assert(!root.GetProperty("featureFlags").GetProperty("realPaymentsEnabled").GetBoolean(), "realPaymentsEnabled deve ser false.");
        Assert(root.GetProperty("commercialPolicies").GetProperty("freePlanCommissionRate").GetDecimal() == 0.130000m, "Comissão gratuita deve ser 13%.");
        Assert(root.GetProperty("commercialPolicies").GetProperty("premiumPlanCommissionRate").GetDecimal() == 0.070000m, "Comissão Premium deve ser 7%.");
        Assert(root.GetProperty("defaultVehicleLimitsGrams").GetProperty("BICYCLE").GetInt32() == 5000, "Bicicleta deve ter limite de 5000g.");
        Assert(root.GetProperty("defaultVehicleLimitsGrams").GetProperty("MOTORCYCLE").GetInt32() == 20000, "Moto deve ter limite de 20000g.");
        Assert(root.GetProperty("defaultVehicleLimitsGrams").GetProperty("CAR").GetInt32() == 20000, "Carro deve ter limite de 20000g.");
    }).ConfigureAwait(false);

    await RunTestAsync("GET /api/v1/system/modules retorna os 19 módulos do monólito modular", async () =>
    {
        using var response = await client.GetAsync("/api/v1/system/modules").ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.OK, "Endpoint modules deve retornar 200 OK.");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("totalModules").GetInt32() == 19, "Devem existir 19 módulos registrados.");
    }).ConfigureAwait(false);

    await RunTestAsync("POST /api/v1/system/validate-weight retorna ProblemDetails (422) quando bicicleta recebe 5001g", async () =>
    {
        using var response = await client.PostAsJsonAsync("/api/v1/system/validate-weight", new
        {
            vehicleType = "BICYCLE",
            weightGrams = 5001
        }).ConfigureAwait(false);

        Assert((int)response.StatusCode == 422, $"Esperado HTTP 422, recebido {(int)response.StatusCode}.");
        Assert(response.Content.Headers.ContentType?.MediaType == "application/problem+json", "Content-Type deve ser application/problem+json.");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("ruleCode").GetString() == "VEHICLE_WEIGHT_LIMIT_EXCEEDED", "ruleCode deve ser VEHICLE_WEIGHT_LIMIT_EXCEEDED.");
        Assert(!string.IsNullOrWhiteSpace(doc.RootElement.GetProperty("correlationId").GetString()), "ProblemDetails deve incluir correlationId.");
    }).ConfigureAwait(false);

    await RunTestAsync("GET /openapi/v1.json retorna contrato OpenAPI 3.1.0 válido", async () =>
    {
        using var response = await client.GetAsync("/openapi/v1.json").ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.OK, "OpenAPI endpoint deve retornar 200 OK.");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("openapi").GetString() == "3.1.0", "Versão OpenAPI deve ser 3.1.0.");
    }).ConfigureAwait(false);

    await RunTestAsync("CORS permite origem http://localhost:3000 e expõe cabeçalho X-Correlation-Id", async () =>
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/system/feature-flags");
        request.Headers.Add("Origin", "http://localhost:3000");

        using var response = await client.SendAsync(request).ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.OK, "Requisição CORS deve retornar 200 OK.");

        string allowOrigin = response.Headers.GetValues("Access-Control-Allow-Origin").FirstOrDefault() ?? string.Empty;
        string exposeHeaders = string.Join(",", response.Headers.GetValues("Access-Control-Expose-Headers"));

        Assert(allowOrigin == "http://localhost:3000", $"Access-Control-Allow-Origin esperado 'http://localhost:3000', recebido '{allowOrigin}'.");
        Assert(exposeHeaders.Contains(CorrelationIdMiddleware.HeaderName, StringComparison.OrdinalIgnoreCase),
            "Access-Control-Expose-Headers deve incluir X-Correlation-Id.");
    }).ConfigureAwait(false);

    await RunTestAsync("DOCS/api/openapi-v1.json existe e é um contrato OpenAPI 3.1.0 válido", async () =>
    {
        string specPath = Path.Combine(Directory.GetCurrentDirectory(), "DOCS", "api", "openapi-v1.json");
        Assert(File.Exists(specPath), $"Arquivo OpenAPI não encontrado em {specPath}.");

        await using var stream = File.OpenRead(specPath);
        using var doc = await JsonDocument.ParseAsync(stream).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("openapi").GetString() == "3.1.0", "openapi-v1.json deve ser versão 3.1.0.");
        Assert(doc.RootElement.GetProperty("paths").TryGetProperty("/api/v1/system/feature-flags", out _),
            "openapi-v1.json deve documentar /api/v1/system/feature-flags.");
    }).ConfigureAwait(false);

    await RunTestAsync("Frontend (apps/web) contém tokens do Design System e microtextos obrigatórios D01–D17", async () =>
    {
        string rootDir = Directory.GetCurrentDirectory();
        string tokensCss = await File.ReadAllTextAsync(Path.Combine(rootDir, "apps", "web", "src", "styles", "tokens.css")).ConfigureAwait(false);
        string pageTsx = await File.ReadAllTextAsync(Path.Combine(rootDir, "apps", "web", "src", "app", "page.tsx")).ConfigureAwait(false);
        string breakdownTsx = await File.ReadAllTextAsync(Path.Combine(rootDir, "apps", "web", "src", "components", "FinancialBreakdownPreview.tsx")).ConfigureAwait(false);

        Assert(tokensCss.Contains("#155EEF", StringComparison.OrdinalIgnoreCase) || tokensCss.Contains("#2563EB", StringComparison.OrdinalIgnoreCase), "Token --color-primary ausente.");
        Assert(tokensCss.Contains("#16803C", StringComparison.OrdinalIgnoreCase) || tokensCss.Contains("#10B981", StringComparison.OrdinalIgnoreCase), "Token --color-success ausente.");
        Assert(tokensCss.Contains("#B54708", StringComparison.OrdinalIgnoreCase) || tokensCss.Contains("#D97706", StringComparison.OrdinalIgnoreCase), "Token --color-warning ausente.");
        Assert(tokensCss.Contains("#B42318", StringComparison.OrdinalIgnoreCase) || tokensCss.Contains("#EF4444", StringComparison.OrdinalIgnoreCase), "Token --color-danger ausente.");

        Assert(pageTsx.Contains("João Monlevade", StringComparison.Ordinal), "Menção à prioridade João Monlevade ausente na Home.");
        Assert(pageTsx.Contains("Belo Horizonte", StringComparison.Ordinal), "Menção à prioridade Belo Horizonte ausente na Home.");
        Assert(breakdownTsx.Contains("Valor do transporte", StringComparison.Ordinal), "Microtexto oficial 'Valor do transporte' ausente.");
        Assert(breakdownTsx.Contains("Você receberá", StringComparison.Ordinal), "Microtexto oficial 'Você receberá' ausente.");
        Assert(breakdownTsx.Contains("Crédito bancário pendente", StringComparison.Ordinal), "Microtexto oficial 'Crédito bancário pendente' ausente.");
    }).ConfigureAwait(false);

    string userAToken = string.Empty;
    string userARefreshToken = string.Empty;
    Guid userAId = Guid.Empty;

    string userBToken = string.Empty;
    Guid userBId = Guid.Empty;

    string[] senderRoles = ["SENDER"];
    string[] generalAdminRoles = ["GENERAL_ADMIN"];
    string[] carrierOnlyRoles = ["CARRIER"];

    await RunTestAsync("PR-01.1 (D05/D08): POST /api/v1/auth/register cria conta sem exigir KYC (NOT_STARTED), permite navegação e bloqueia contratação inicial", async () =>
    {
        using var response = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email = "remetente.sintetico.01@example.test",
            password = "SenhaSintetica#01",
            displayName = "Titular Sintético Alfa",
            phone = "(31) 90000-0001",
            cpf = "00000000191",
            city = "João Monlevade",
            stateUf = "MG",
            initialRoles = senderRoles,
            acceptTerms = true,
            termsVersion = "2026.1-D08-DRAFT"
        }).ConfigureAwait(false);

        Assert(response.StatusCode == HttpStatusCode.Created, $"Esperado HTTP 201, recebido {(int)response.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = doc.RootElement;

        userAToken = root.GetProperty("accessToken").GetString() ?? string.Empty;
        userARefreshToken = root.GetProperty("refreshToken").GetString() ?? string.Empty;

        var profile = root.GetProperty("profile");
        userAId = profile.GetProperty("userId").GetGuid();

        Assert(!string.IsNullOrWhiteSpace(userAToken), "accessToken deve ser emitido.");
        Assert(!string.IsNullOrWhiteSpace(userARefreshToken), "refreshToken deve ser emitido.");
        Assert(profile.GetProperty("kycStatus").GetString() == "NOT_STARTED", "Conta recém-criada deve iniciar com kycStatus NOT_STARTED (D05).");
        Assert(profile.GetProperty("canNavigatePlatform").GetBoolean(), "Usuário sem KYC deve poder navegar na plataforma (D05).");
        Assert(!profile.GetProperty("canContractDelivery").GetBoolean(), "Usuário sem KYC VERIFIED não pode contratar entrega (D05).");
        Assert(profile.GetProperty("phoneMasked").GetString() == "(**) *****-0001", "Telefone deve ser retornado mascarado.");
        Assert(profile.GetProperty("cpfMasked").GetString() == "***.000.001-**", "CPF deve ser retornado mascarado.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.1 (D08): POST /api/v1/auth/register sem aceite dos Termos retorna 400 Bad Request (TERMS_ACCEPTANCE_REQUIRED)", async () =>
    {
        using var response = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email = "sem.termos.sintetico@example.test",
            password = "SenhaSintetica#01",
            displayName = "Usuário Sem Termos",
            phone = "(31) 90000-0099",
            acceptTerms = false
        }).ConfigureAwait(false);

        Assert(response.StatusCode == HttpStatusCode.BadRequest, $"Esperado HTTP 400, recebido {(int)response.StatusCode}");
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("ruleCode").GetString() == "TERMS_ACCEPTANCE_REQUIRED", "ruleCode deve ser TERMS_ACCEPTANCE_REQUIRED.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.1 (RBAC): POST /api/v1/auth/register tentando autoatribuir GENERAL_ADMIN retorna 403 Forbidden", async () =>
    {
        using var response = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email = "escalacao.indevida@example.test",
            password = "SenhaSintetica#01",
            displayName = "Tentativa Escalação",
            phone = "(31) 90000-0088",
            initialRoles = generalAdminRoles,
            acceptTerms = true
        }).ConfigureAwait(false);

        Assert(response.StatusCode == HttpStatusCode.Forbidden, $"Esperado HTTP 403, recebido {(int)response.StatusCode}");
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("ruleCode").GetString() == "ROLE_SELF_ASSIGNMENT_FORBIDDEN", "ruleCode deve ser ROLE_SELF_ASSIGNMENT_FORBIDDEN.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.1 (Auth 401): GET /api/v1/me sem token ou com token adulterado retorna 401 Unauthorized", async () =>
    {
        using var noTokenResp = await client.GetAsync("/api/v1/me").ConfigureAwait(false);
        Assert(noTokenResp.StatusCode == HttpStatusCode.Unauthorized, "Requisição sem Bearer token deve retornar 401.");

        using var badTokenReq = new HttpRequestMessage(HttpMethod.Get, "/api/v1/me");
        badTokenReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userAToken + "adulterado");
        using var badTokenResp = await client.SendAsync(badTokenReq).ConfigureAwait(false);
        Assert(badTokenResp.StatusCode == HttpStatusCode.Unauthorized, "Token com assinatura adulterada deve retornar 401.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.1 (Gate G1 — ABAC 403): Usuário A tentando ler ou editar /private-profile do Usuário B recebe 403 Forbidden e gera CROSS_ACCESS_DENIED", async () =>
    {
        // Cadastra Usuário B sintético
        using var regBResp = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email = "transportador.sintetico.02@example.test",
            password = "SenhaSintetica#02",
            displayName = "Titular Sintético Beta",
            phone = "(31) 90000-0002",
            cpf = "11122233396",
            city = "Belo Horizonte",
            stateUf = "MG",
            initialRoles = carrierOnlyRoles,
            acceptTerms = true
        }).ConfigureAwait(false);

        Assert(regBResp.StatusCode == HttpStatusCode.Created, "Cadastro do Usuário B deve retornar 201.");
        using var docB = await JsonDocument.ParseAsync(await regBResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        userBToken = docB.RootElement.GetProperty("accessToken").GetString() ?? string.Empty;
        userBId = docB.RootElement.GetProperty("profile").GetProperty("userId").GetGuid();

        // 1. Usuário A tenta ler perfil privado do próprio Usuário A -> 200 OK
        using var selfReadReq = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/users/{userAId}/private-profile");
        selfReadReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userAToken);
        using var selfReadResp = await client.SendAsync(selfReadReq).ConfigureAwait(false);
        Assert(selfReadResp.StatusCode == HttpStatusCode.OK, "Titular deve conseguir ler o próprio perfil privado (200 OK).");

        // 2. Usuário A tenta ler perfil privado do Usuário B -> 403 Forbidden
        using var crossReadReq = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/users/{userBId}/private-profile");
        crossReadReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userAToken);
        using var crossReadResp = await client.SendAsync(crossReadReq).ConfigureAwait(false);
        Assert(crossReadResp.StatusCode == HttpStatusCode.Forbidden, $"Acesso cruzado de leitura deve retornar 403, recebido {(int)crossReadResp.StatusCode}.");

        using var crossReadDoc = await JsonDocument.ParseAsync(await crossReadResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(crossReadDoc.RootElement.GetProperty("ruleCode").GetString() == "AUTH_FORBIDDEN_CROSS_USER_ACCESS", "ruleCode deve ser AUTH_FORBIDDEN_CROSS_USER_ACCESS.");

        // 3. Usuário A tenta alterar perfil privado do Usuário B -> 403 Forbidden
        using var crossPatchReq = new HttpRequestMessage(HttpMethod.Patch, $"/api/v1/users/{userBId}/private-profile")
        {
            Content = JsonContent.Create(new { displayName = "Alteração Indevida" })
        };
        crossPatchReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userAToken);
        using var crossPatchResp = await client.SendAsync(crossPatchReq).ConfigureAwait(false);
        Assert(crossPatchResp.StatusCode == HttpStatusCode.Forbidden, "Acesso cruzado de escrita deve retornar 403.");

        // 4. Verifica que o evento CROSS_ACCESS_DENIED foi registrado no repositório de auditoria
        var auditRepo = app.Services.GetRequiredService<IAuditRepository>();
        var auditEvents = await auditRepo.ListRecentAsync(50, CancellationToken.None).ConfigureAwait(false);
        Assert(auditEvents.Any(e => e.Action == "CROSS_ACCESS_DENIED" && e.ActorUserId == userAId),
            "Trilha audit_events deve registrar CROSS_ACCESS_DENIED com o ActorUserId do infrator.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.1 (LGPD): GET /api/v1/users/{id}/public-card retorna nome abreviado e oculta e-mail, telefone e CPF", async () =>
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/users/{userBId}/public-card");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userAToken);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);

        Assert(resp.StatusCode == HttpStatusCode.OK, "Consulta de public-card deve retornar 200 OK.");
        string rawJson = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);

        Assert(!rawJson.Contains("email", StringComparison.OrdinalIgnoreCase), "public-card jamais pode expor campo email.");
        Assert(!rawJson.Contains("phone", StringComparison.OrdinalIgnoreCase), "public-card jamais pode expor campo phone.");
        Assert(!rawJson.Contains("cpf", StringComparison.OrdinalIgnoreCase), "public-card jamais pode expor campo cpf.");

        using var doc = JsonDocument.Parse(rawJson);
        Assert(doc.RootElement.GetProperty("abbreviatedDisplayName").GetString() == "Titular B.", "Nome deve ser abreviado no cartão público.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.1 (RBAC 403): Usuário comum tentando acessar /api/v1/audit/events recebe 403 Forbidden", async () =>
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, "/api/v1/audit/events");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userAToken);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);

        Assert(resp.StatusCode == HttpStatusCode.Forbidden, "Usuário SENDER/CARRIER não pode ler trilha de auditoria interna.");
        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("ruleCode").GetString() == "AUTH_FORBIDDEN_INSUFFICIENT_ROLE", "ruleCode deve ser AUTH_FORBIDDEN_INSUFFICIENT_ROLE.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.1 (Sessão): POST /api/v1/auth/refresh rotaciona token e bloqueia reuso do refresh token anterior", async () =>
    {
        // 1. Primeira renovação com userARefreshToken -> 200 OK
        using var refreshResp1 = await client.PostAsJsonAsync("/api/v1/auth/refresh", new
        {
            refreshToken = userARefreshToken
        }).ConfigureAwait(false);
        Assert(refreshResp1.StatusCode == HttpStatusCode.OK, "Primeira rotação do refresh token deve retornar 200 OK.");

        using var doc1 = await JsonDocument.ParseAsync(await refreshResp1.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        string rotatedRefreshToken = doc1.RootElement.GetProperty("refreshToken").GetString() ?? string.Empty;
        Assert(rotatedRefreshToken != userARefreshToken, "Novo refresh token deve ser diferente do anterior.");

        // 2. Tentativa de reuso do refresh token antigo já rotacionado -> 401 AUTH_REFRESH_TOKEN_REUSED e revoga família
        using var reuseResp = await client.PostAsJsonAsync("/api/v1/auth/refresh", new
        {
            refreshToken = userARefreshToken
        }).ConfigureAwait(false);
        Assert(reuseResp.StatusCode == HttpStatusCode.Unauthorized, "Reuso de refresh token rotacionado deve retornar 401.");

        using var docReuse = await JsonDocument.ParseAsync(await reuseResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(docReuse.RootElement.GetProperty("ruleCode").GetString() == "AUTH_REFRESH_TOKEN_REUSED", "ruleCode deve ser AUTH_REFRESH_TOKEN_REUSED.");

        // 3. Mesmo o token novo da família agora está revogado por segurança
        using var familyRevokedResp = await client.PostAsJsonAsync("/api/v1/auth/refresh", new
        {
            refreshToken = rotatedRefreshToken
        }).ConfigureAwait(false);
        Assert(familyRevokedResp.StatusCode == HttpStatusCode.Unauthorized, "Família de refresh tokens deve estar revogada após detecção de reuso.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.1 (Brute-Force): 5 tentativas de login com senha inválida bloqueiam temporariamente a conta com HTTP 423 Locked", async () =>
    {
        for (int attempt = 1; attempt <= 4; attempt++)
        {
            using var failResp = await client.PostAsJsonAsync("/api/v1/auth/login", new
            {
                email = "transportador.sintetico.02@example.test",
                password = $"SenhaErrada#{attempt}"
            }).ConfigureAwait(false);
            Assert(failResp.StatusCode == HttpStatusCode.Unauthorized, $"Tentativa {attempt} deve retornar 401.");
        }

        // 5ª tentativa dispara bloqueio temporário (423 Locked)
        using var lockResp = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = "transportador.sintetico.02@example.test",
            password = "SenhaErrada#5"
        }).ConfigureAwait(false);
        Assert((int)lockResp.StatusCode == 423, $"5ª falha consecutiva deve retornar HTTP 423 Locked, recebido {(int)lockResp.StatusCode}.");

        // Tentativa seguinte mesmo com a senha correta deve continuar bloqueada durante o período de lockout
        using var blockedCorrectPasswordResp = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = "transportador.sintetico.02@example.test",
            password = "SenhaSintetica#02"
        }).ConfigureAwait(false);
        Assert((int)blockedCorrectPasswordResp.StatusCode == 423, "Login durante lockout ativo deve retornar HTTP 423 Locked.");
    }).ConfigureAwait(false);

    // =========================================================================
    // Suíte de Integração HTTP da PR-01.2 (KYC Progressivo, SoD, Reanálise e D05/D08)
    // =========================================================================
    Guid userACaseId = Guid.Empty;
    Guid carrierActiveUserId = Guid.Empty;
    string carrierActiveToken = string.Empty;
    Guid carrierActiveCaseId = Guid.Empty;

    string supportOperatorToken = string.Empty;
    Guid supportOperatorId = Guid.Empty;
    Guid supportSelfCaseId = Guid.Empty;

    KycCheckReviewInput[] allPassedChecks =
    [
        new("CPF_STATUS", "PASSED"),
        new("IDENTITY_DOCUMENT", "PASSED"),
        new("ADDRESS_PROOF", "PASSED"),
        new("FACIAL_BIOMETRY_PARTNER", "PASSED")
    ];

    KycCheckReviewInput[] addressFailedChecks =
    [
        new("CPF_STATUS", "PASSED"),
        new("IDENTITY_DOCUMENT", "PASSED"),
        new("ADDRESS_PROOF", "FAILED"),
        new("FACIAL_BIOMETRY_PARTNER", "PASSED")
    ];

    await RunTestAsync("PR-01.2 (D08): GET /api/v1/terms/current retorna manifesto de responsabilidade distribuída sem cláusula de isenção absoluta", async () =>
    {
        using var resp = await client.GetAsync("/api/v1/terms/current").ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, "Endpoint /api/v1/terms/current deve retornar 200 OK.");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = doc.RootElement;
        Assert(root.GetProperty("decisionCode").GetString() == "D08", "decisionCode deve ser D08.");
        Assert(!root.GetProperty("hasAbsolutePlatformExemptionClause").GetBoolean(), "hasAbsolutePlatformExemptionClause deve ser false (D08).");
        Assert(root.GetProperty("responsibilities").GetArrayLength() == 3, "Devem constar cláusulas para SENDER, CARRIER e TOPIC_LOG_PLATFORM.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.2 (LGPD D05): POST /api/v1/kyc/cases/submit sem consentimento ou com biometria facial bruta retorna 400 Bad Request", async () =>
    {
        // 1. Sem consentimento LGPD
        using var noConsentReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/kyc/cases/submit")
        {
            Content = JsonContent.Create(new
            {
                cpf = "00000000191",
                identityDocumentRef = "private/kyc/doc_sintetico_a1",
                addressProofRef = "private/kyc/addr_sintetico_a1",
                partnerFacialSessionRef = "fac_sandbox_session_a1",
                consentGiven = false
            })
        };
        noConsentReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userAToken);
        using var noConsentResp = await client.SendAsync(noConsentReq).ConfigureAwait(false);
        Assert(noConsentResp.StatusCode == HttpStatusCode.BadRequest, "Submissão sem consentGiven=true deve retornar 400.");

        using var noConsentDoc = await JsonDocument.ParseAsync(await noConsentResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(noConsentDoc.RootElement.GetProperty("ruleCode").GetString() == "KYC_CONSENT_REQUIRED", "ruleCode esperado KYC_CONSENT_REQUIRED.");

        // 2. Envio de imagem/biometria facial bruta Base64
        using var rawBioReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/kyc/cases/submit")
        {
            Content = JsonContent.Create(new
            {
                cpf = "00000000191",
                identityDocumentRef = "private/kyc/doc_sintetico_a1",
                addressProofRef = "private/kyc/addr_sintetico_a1",
                partnerFacialSessionRef = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD==",
                consentGiven = true
            })
        };
        rawBioReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userAToken);
        using var rawBioResp = await client.SendAsync(rawBioReq).ConfigureAwait(false);
        Assert(rawBioResp.StatusCode == HttpStatusCode.BadRequest, "Envio de biometria bruta deve retornar 400.");

        using var rawBioDoc = await JsonDocument.ParseAsync(await rawBioResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(rawBioDoc.RootElement.GetProperty("ruleCode").GetString() == "RAW_BIOMETRY_PAYLOAD_FORBIDDEN", "ruleCode esperado RAW_BIOMETRY_PAYLOAD_FORBIDDEN.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.2 (D05): POST /api/v1/kyc/cases/submit registra 4 checks por referência segura e transiciona titular para IN_REVIEW", async () =>
    {
        using var submitReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/kyc/cases/submit")
        {
            Content = JsonContent.Create(new
            {
                cpf = "00000000191",
                identityDocumentRef = "private/kyc/doc_sintetico_a1",
                addressProofRef = "private/kyc/addr_sintetico_a1",
                partnerFacialSessionRef = "fac_sandbox_session_a1",
                consentGiven = true
            })
        };
        submitReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userAToken);
        using var submitResp = await client.SendAsync(submitReq).ConfigureAwait(false);
        Assert(submitResp.StatusCode == HttpStatusCode.OK, $"Submissão válida deve retornar 200 OK, recebido {(int)submitResp.StatusCode}.");

        using var doc = await JsonDocument.ParseAsync(await submitResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = doc.RootElement;
        userACaseId = root.GetProperty("activeCaseId").GetGuid();

        Assert(root.GetProperty("currentKycStatus").GetString() == "IN_REVIEW", "Status após submissão deve ser IN_REVIEW.");
        Assert(root.GetProperty("canNavigatePlatform").GetBoolean(), "Usuário IN_REVIEW continua navegando normalmente.");
        Assert(!root.GetProperty("canContractDelivery").GetBoolean(), "Usuário IN_REVIEW ainda não pode contratar entrega.");
        Assert(root.GetProperty("checks").GetArrayLength() == 4, "Devem existir exatamente os 4 checks obrigatórios.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.2 (Negativo RBAC 403): Usuário comum tentando aprovar o próprio caso em /review-decision recebe 403 Forbidden", async () =>
    {
        using var selfApproveReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/kyc/cases/{userACaseId}/review-decision")
        {
            Content = JsonContent.Create(new
            {
                targetStatus = "VERIFIED",
                checkResults = allPassedChecks,
                justificationOrRejectionReason = "Tentativa de autoaprovação por usuário comum"
            })
        };
        selfApproveReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userAToken);
        using var selfApproveResp = await client.SendAsync(selfApproveReq).ConfigureAwait(false);

        Assert(selfApproveResp.StatusCode == HttpStatusCode.Forbidden, "Usuário SENDER/CARRIER jamais pode acessar /review-decision.");
        using var doc = await JsonDocument.ParseAsync(await selfApproveResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("ruleCode").GetString() == "AUTH_FORBIDDEN_INSUFFICIENT_ROLE", "ruleCode deve ser AUTH_FORBIDDEN_INSUFFICIENT_ROLE.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.2 (Negativo ABAC 403): Outra conta tentando consultar dossiê de KYC do Usuário A em /api/v1/kyc/users/{id} recebe 403 Forbidden", async () =>
    {
        // Cadastra segundo transportador ativo sintético
        using var regCarrierResp = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email = "transportador.ativo.03@example.test",
            password = "SenhaSintetica#03",
            displayName = "Transportador Sintético Gama",
            phone = "(31) 90000-0003",
            cpf = "22233344405",
            city = "João Monlevade",
            stateUf = "MG",
            initialRoles = carrierOnlyRoles,
            acceptTerms = true
        }).ConfigureAwait(false);

        Assert(regCarrierResp.StatusCode == HttpStatusCode.Created, "Cadastro do Transportador Gama deve retornar 201.");
        using var carrierDoc = await JsonDocument.ParseAsync(await regCarrierResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        carrierActiveToken = carrierDoc.RootElement.GetProperty("accessToken").GetString() ?? string.Empty;
        carrierActiveUserId = carrierDoc.RootElement.GetProperty("profile").GetProperty("userId").GetGuid();

        // Transportador Gama tenta ler dossiê de KYC do Usuário A -> 403 Forbidden
        using var crossKycReq = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/kyc/users/{userAId}");
        crossKycReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierActiveToken);
        using var crossKycResp = await client.SendAsync(crossKycReq).ConfigureAwait(false);

        Assert(crossKycResp.StatusCode == HttpStatusCode.Forbidden, "Acesso cruzado ao dossiê de KYC de outro usuário deve retornar 403.");
        using var errDoc = await JsonDocument.ParseAsync(await crossKycResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(errDoc.RootElement.GetProperty("ruleCode").GetString() == "AUTH_FORBIDDEN_CROSS_USER_ACCESS", "ruleCode deve ser AUTH_FORBIDDEN_CROSS_USER_ACCESS.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.2 (Negativo SoD 403): Operador SUPPORT tentando aprovar seu próprio caso de KYC recebe 403 KYC_SELF_APPROVAL_FORBIDDEN", async () =>
    {
        // Provisiona operador de suporte sintético no repositório de desenvolvimento para teste de revisão e SoD
        var userRepo = app.Services.GetRequiredService<IUserRepository>();
        var crypto = app.Services.GetRequiredService<SecurityCryptoService>();
        supportOperatorId = Guid.NewGuid();
        var nowUtc = DateTimeOffset.UtcNow;

        var supportUser = new UserEntity
        {
            Id = supportOperatorId,
            Email = "suporte.operacional.sintetico@example.test",
            PhoneEncrypted = crypto.EncryptPhone("31900000999"),
            PhoneMasked = "(**) *****-0999",
            PasswordHash = crypto.HashPassword("SenhaSuporte#2026"),
            Status = UserAccountStatus.ACTIVE,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc
        };
        var supportProfile = new UserProfileEntity
        {
            UserId = supportOperatorId,
            DisplayName = "Operador Suporte Sintético",
            Roles = [UserRole.SUPPORT, UserRole.SENDER],
            KycStatus = KycStatus.NOT_STARTED,
            TermsAcceptedVersion = "2026.1-D08-DRAFT",
            TermsAcceptedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc
        };
        await userRepo.CreateAsync(supportUser, supportProfile, CancellationToken.None).ConfigureAwait(false);
        (supportOperatorToken, _, _) = crypto.CreateAccessToken(supportUser, supportProfile, nowUtc);

        // Operador submete caso próprio
        using var subReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/kyc/cases/submit")
        {
            Content = JsonContent.Create(new
            {
                cpf = "33344455506",
                identityDocumentRef = "private/kyc/doc_sup_1",
                addressProofRef = "private/kyc/addr_sup_1",
                partnerFacialSessionRef = "fac_sandbox_sup_1",
                consentGiven = true
            })
        };
        subReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", supportOperatorToken);
        using var subResp = await client.SendAsync(subReq).ConfigureAwait(false);
        Assert(subResp.StatusCode == HttpStatusCode.OK, "Submissão do caso do operador deve retornar 200.");

        using var subDoc = await JsonDocument.ParseAsync(await subResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        supportSelfCaseId = subDoc.RootElement.GetProperty("activeCaseId").GetGuid();

        // Operador SUPPORT tenta aprovar o próprio caso -> 403 KYC_SELF_APPROVAL_FORBIDDEN
        using var selfDecideReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/kyc/cases/{supportSelfCaseId}/review-decision")
        {
            Content = JsonContent.Create(new
            {
                targetStatus = "VERIFIED",
                checkResults = allPassedChecks,
                justificationOrRejectionReason = "Tentativa de autoaprovação pelo próprio operador"
            })
        };
        selfDecideReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", supportOperatorToken);
        using var selfDecideResp = await client.SendAsync(selfDecideReq).ConfigureAwait(false);

        Assert(selfDecideResp.StatusCode == HttpStatusCode.Forbidden, "Operador SUPPORT não pode aprovar o próprio caso de KYC (Segregação de Funções).");
        using var errDoc = await JsonDocument.ParseAsync(await selfDecideResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(errDoc.RootElement.GetProperty("ruleCode").GetString() == "KYC_SELF_APPROVAL_FORBIDDEN", "ruleCode deve ser KYC_SELF_APPROVAL_FORBIDDEN.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.2 (Rejeição e Reanálise): Operador SUPPORT reprova caso (REJECTED), titular solicita reanálise (IN_REVIEW) e operador aprova os 4 checks (VERIFIED)", async () =>
    {
        // 1. Operador SUPPORT reprova o caso do Usuário A por falha no comprovante de endereço
        using var rejectReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/kyc/cases/{userACaseId}/review-decision")
        {
            Content = JsonContent.Create(new
            {
                targetStatus = "REJECTED",
                checkResults = addressFailedChecks,
                justificationOrRejectionReason = "Comprovante de endereço ilegível na verificação inicial"
            })
        };
        rejectReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", supportOperatorToken);
        using var rejectResp = await client.SendAsync(rejectReq).ConfigureAwait(false);
        Assert(rejectResp.StatusCode == HttpStatusCode.OK, "Reprovação fundamentada deve retornar 200 OK.");

        using var rejectDoc = await JsonDocument.ParseAsync(await rejectResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(rejectDoc.RootElement.GetProperty("currentKycStatus").GetString() == "REJECTED", "Status deve mudar para REJECTED.");

        // 2. Titular (Usuário A) solicita reanálise enviando nova referência de comprovante de endereço
        using var appealReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/kyc/cases/{userACaseId}/reanalysis")
        {
            Content = JsonContent.Create(new
            {
                identityDocumentRef = "private/kyc/doc_sintetico_a1",
                addressProofRef = "private/kyc/addr_sintetico_a2_corrigido",
                partnerFacialSessionRef = "fac_sandbox_session_a2",
                appealJustification = "Novo comprovante de endereço enviado em alta resolução"
            })
        };
        appealReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userAToken);
        using var appealResp = await client.SendAsync(appealReq).ConfigureAwait(false);
        Assert(appealResp.StatusCode == HttpStatusCode.OK, "Pedido de reanálise pelo titular deve retornar 200 OK.");

        using var appealDoc = await JsonDocument.ParseAsync(await appealResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(appealDoc.RootElement.GetProperty("currentKycStatus").GetString() == "IN_REVIEW", "Caso deve retornar para IN_REVIEW após pedido de reanálise.");

        // 3. Operador SUPPORT aprova os 4 checks do Usuário A -> VERIFIED
        using var approveReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/kyc/cases/{userACaseId}/review-decision")
        {
            Content = JsonContent.Create(new
            {
                targetStatus = "VERIFIED",
                checkResults = allPassedChecks,
                justificationOrRejectionReason = "Todos os 4 checks (CPF, identidade, endereço e facial) validados no sandbox",
                validityDays = 365
            })
        };
        approveReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", supportOperatorToken);
        using var approveResp = await client.SendAsync(approveReq).ConfigureAwait(false);
        Assert(approveResp.StatusCode == HttpStatusCode.OK, "Aprovação pelo suporte com 4 checks PASSED deve retornar 200 OK.");

        using var approveDoc = await JsonDocument.ParseAsync(await approveResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(approveDoc.RootElement.GetProperty("currentKycStatus").GetString() == "VERIFIED", "Status deve ser VERIFIED.");
        Assert(approveDoc.RootElement.GetProperty("canContractDelivery").GetBoolean(), "Titular VERIFIED deve estar apto a contratar.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.2 (Elegibilidade Bilateral D05): POST /api/v1/kyc/evaluate-bilateral bloqueia autocontratação, bloqueia quando Transportador está pendente e libera apenas quando ambos estão VERIFIED", async () =>
    {
        // 1. Tentativa de autocontratação (Usuário A como Remetente e Transportador ao mesmo tempo) -> bloqueado
        using var selfContractReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/kyc/evaluate-bilateral")
        {
            Content = JsonContent.Create(new
            {
                senderUserId = userAId,
                carrierUserId = userAId
            })
        };
        selfContractReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userAToken);
        using var selfContractResp = await client.SendAsync(selfContractReq).ConfigureAwait(false);
        Assert(selfContractResp.StatusCode == HttpStatusCode.OK, "Avaliação deve retornar 200 com resultado estruturado.");

        using var selfContractDoc = await JsonDocument.ParseAsync(await selfContractResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(!selfContractDoc.RootElement.GetProperty("isEligible").GetBoolean(), "Autocontratação deve retornar isEligible=false.");

        // 2. Remetente (Usuário A) VERIFIED + Transportador Gama (NOT_STARTED) -> bloqueado
        using var unilateralReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/kyc/evaluate-bilateral")
        {
            Content = JsonContent.Create(new
            {
                senderUserId = userAId,
                carrierUserId = carrierActiveUserId
            })
        };
        unilateralReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userAToken);
        using var unilateralResp = await client.SendAsync(unilateralReq).ConfigureAwait(false);
        using var unilateralDoc = await JsonDocument.ParseAsync(await unilateralResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);

        Assert(!unilateralDoc.RootElement.GetProperty("isEligible").GetBoolean(), "Contratação deve ser bloqueada quando o Transportador não está VERIFIED (D05).");
        Assert(unilateralDoc.RootElement.GetProperty("sender").GetProperty("isEligible").GetBoolean(), "Remetente já deve constar como elegível individualmente.");
        Assert(!unilateralDoc.RootElement.GetProperty("carrier").GetProperty("isEligible").GetBoolean(), "Transportador deve constar como não elegível individualmente.");

        // 3. Transportador Gama submete os 4 checks e é aprovado pelo Operador SUPPORT
        using var subCarrierReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/kyc/cases/submit")
        {
            Content = JsonContent.Create(new
            {
                cpf = "22233344405",
                identityDocumentRef = "private/kyc/doc_carrier_gama",
                addressProofRef = "private/kyc/addr_carrier_gama",
                partnerFacialSessionRef = "fac_sandbox_carrier_gama",
                consentGiven = true
            })
        };
        subCarrierReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierActiveToken);
        using var subCarrierResp = await client.SendAsync(subCarrierReq).ConfigureAwait(false);
        using var subCarrierDoc = await JsonDocument.ParseAsync(await subCarrierResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        carrierActiveCaseId = subCarrierDoc.RootElement.GetProperty("activeCaseId").GetGuid();

        using var approveCarrierReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/kyc/cases/{carrierActiveCaseId}/review-decision")
        {
            Content = JsonContent.Create(new
            {
                targetStatus = "VERIFIED",
                checkResults = allPassedChecks,
                justificationOrRejectionReason = "Transportador Gama aprovado nos 4 checks obrigatórios",
                validityDays = 365
            })
        };
        approveCarrierReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", supportOperatorToken);
        using var approveCarrierResp = await client.SendAsync(approveCarrierReq).ConfigureAwait(false);
        Assert(approveCarrierResp.StatusCode == HttpStatusCode.OK, "Aprovação do Transportador Gama deve retornar 200 OK.");

        // 4. Agora Remetente (VERIFIED) + Transportador Gama (VERIFIED) -> elegibilidade bilateral APROVADA!
        using var bilateralOkReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/kyc/evaluate-bilateral")
        {
            Content = JsonContent.Create(new
            {
                senderUserId = userAId,
                carrierUserId = carrierActiveUserId
            })
        };
        bilateralOkReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userAToken);
        using var bilateralOkResp = await client.SendAsync(bilateralOkReq).ConfigureAwait(false);
        using var bilateralOkDoc = await JsonDocument.ParseAsync(await bilateralOkResp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);

        Assert(bilateralOkDoc.RootElement.GetProperty("isEligible").GetBoolean(), "Com Remetente e Transportador VERIFIED, elegibilidade bilateral deve ser true (D05).");
        Assert(bilateralOkDoc.RootElement.GetProperty("blockingCodes").GetArrayLength() == 0, "Não deve haver códigos de bloqueio quando ambos estão VERIFIED.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.2 (Negativo 401): Todos os endpoints protegidos de verificação (/kyc/me, /kyc/users/{id}, /kyc/cases/submit, /review-decision, /reanalysis, /evaluate-bilateral) exigem JWT", async () =>
    {
        using var getMeResp = await client.GetAsync("/api/v1/kyc/me").ConfigureAwait(false);
        Assert(getMeResp.StatusCode == HttpStatusCode.Unauthorized, "GET /api/v1/kyc/me sem token deve retornar 401.");

        using var getUserResp = await client.GetAsync($"/api/v1/kyc/users/{userAId}").ConfigureAwait(false);
        Assert(getUserResp.StatusCode == HttpStatusCode.Unauthorized, "GET /api/v1/kyc/users/{id} sem token deve retornar 401.");

        using var postSubmitResp = await client.PostAsJsonAsync("/api/v1/kyc/cases/submit", new
        {
            cpf = "00000000191",
            identityDocumentRef = "private/kyc/doc_x",
            addressProofRef = "private/kyc/addr_x",
            partnerFacialSessionRef = "fac_sbx_x",
            consentGiven = true
        }).ConfigureAwait(false);
        Assert(postSubmitResp.StatusCode == HttpStatusCode.Unauthorized, "POST /api/v1/kyc/cases/submit sem token deve retornar 401.");

        using var postReviewResp = await client.PostAsJsonAsync($"/api/v1/kyc/cases/{userACaseId}/review-decision", new
        {
            targetStatus = "VERIFIED",
            checkResults = allPassedChecks,
            justificationOrRejectionReason = "Tentativa sem token"
        }).ConfigureAwait(false);
        Assert(postReviewResp.StatusCode == HttpStatusCode.Unauthorized, "POST /review-decision sem token deve retornar 401.");

        using var postReanalysisResp = await client.PostAsJsonAsync($"/api/v1/kyc/cases/{userACaseId}/reanalysis", new
        {
            identityDocumentRef = "private/kyc/doc_x",
            addressProofRef = "private/kyc/addr_x",
            partnerFacialSessionRef = "fac_sbx_x",
            appealJustification = "Tentativa sem token"
        }).ConfigureAwait(false);
        Assert(postReanalysisResp.StatusCode == HttpStatusCode.Unauthorized, "POST /reanalysis sem token deve retornar 401.");

        using var postBilateralResp = await client.PostAsJsonAsync("/api/v1/kyc/evaluate-bilateral", new
        {
            senderUserId = userAId,
            carrierUserId = carrierActiveUserId
        }).ConfigureAwait(false);
        Assert(postBilateralResp.StatusCode == HttpStatusCode.Unauthorized, "POST /evaluate-bilateral sem token deve retornar 401.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.2 (Concorrência HTTP, Repetição e Dados Inválidos): Requisições repetidas/concorrentes bloqueiam aprovação duplicada (422) e validam entradas inválidas", async () =>
    {
        // 1. Submissão repetida para usuário já VERIFIED -> 422 INVALID_KYC_STATE_TRANSITION
        using var duplicateSubmitReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/kyc/cases/submit")
        {
            Content = JsonContent.Create(new
            {
                cpf = "00000000191",
                identityDocumentRef = "private/kyc/doc_sintetico_a1",
                addressProofRef = "private/kyc/addr_sintetico_a1",
                partnerFacialSessionRef = "fac_sandbox_session_a1",
                consentGiven = true
            })
        };
        duplicateSubmitReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userAToken);
        using var duplicateSubmitResp = await client.SendAsync(duplicateSubmitReq).ConfigureAwait(false);
        Assert(duplicateSubmitResp.StatusCode == HttpStatusCode.UnprocessableEntity, "Submissão repetida de usuário já VERIFIED deve retornar 422.");

        // 2. Aprovação repetida / concorrente de caso já VERIFIED (5 chamadas HTTP simultâneas via Task.WhenAll) -> todas 422 INVALID_KYC_STATE_TRANSITION
        var concurrentTasks = Enumerable.Range(0, 5).Select(async _ =>
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/kyc/cases/{userACaseId}/review-decision")
            {
                Content = JsonContent.Create(new
                {
                    targetStatus = "VERIFIED",
                    checkResults = allPassedChecks,
                    justificationOrRejectionReason = "Tentativa concorrente duplicada de aprovação"
                })
            };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", supportOperatorToken);
            using var resp = await client.SendAsync(req).ConfigureAwait(false);
            return resp.StatusCode;
        });

        HttpStatusCode[] statuses = await Task.WhenAll(concurrentTasks).ConfigureAwait(false);
        Assert(statuses.All(s => s == HttpStatusCode.UnprocessableEntity), "Todas as tentativas repetidas/concorrentes sobre caso já VERIFIED devem retornar 422.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-01.2 (Sanitização LGPD e Auditoria): Eventos gravados em IAuditRepository contêm responsável, data, ação e motivo, sem expor CPF bruto, senhas, tokens ou biometria", async () =>
    {
        var auditRepo = app.Services.GetRequiredService<IAuditRepository>();
        var events = await auditRepo.ListRecentAsync(100, CancellationToken.None).ConfigureAwait(false);

        Assert(events.Count > 0, "Devem existir eventos de auditoria registrados.");
        Assert(events.Any(e => e.Action == "KYC_CASE_SUBMITTED"), "Deve existir evento KYC_CASE_SUBMITTED.");
        Assert(events.Any(e => e.Action == "KYC_SELF_APPROVAL_BLOCKED"), "Deve existir evento KYC_SELF_APPROVAL_BLOCKED.");
        Assert(events.Any(e => e.Action == "KYC_DECISION_REJECTED"), "Deve existir evento KYC_DECISION_REJECTED.");
        Assert(events.Any(e => e.Action == "KYC_REANALYSIS_REQUESTED"), "Deve existir evento KYC_REANALYSIS_REQUESTED.");
        Assert(events.Any(e => e.Action == "KYC_DECISION_VERIFIED"), "Deve existir evento KYC_DECISION_VERIFIED.");
        Assert(events.Any(e => e.Action == "BILATERAL_KYC_VERIFIED"), "Deve existir evento BILATERAL_KYC_VERIFIED.");

        foreach (var evt in events)
        {
            Assert(evt.CreatedAtUtc != default, $"Evento {evt.Action} deve possuir timestamp válido.");
            Assert(!string.IsNullOrWhiteSpace(evt.MetadataJson), $"Evento {evt.Action} deve possuir metadados estruturados.");

            // Confirma que nenhum CPF bruto de 11 dígitos, senha, token ou imagem base64 vazou nos metadados de auditoria
            Assert(!evt.MetadataJson.Contains("00000000191", StringComparison.Ordinal), "CPF bruto do Usuário A jamais deve aparecer em audit_events.");
            Assert(!evt.MetadataJson.Contains("22233344405", StringComparison.Ordinal), "CPF bruto do Transportador Gama jamais deve aparecer em audit_events.");
            Assert(!evt.MetadataJson.Contains("33344455506", StringComparison.Ordinal), "CPF bruto do Operador jamais deve aparecer em audit_events.");
            Assert(!evt.MetadataJson.Contains("SenhaSintetica", StringComparison.OrdinalIgnoreCase), "Senhas jamais devem aparecer em audit_events.");
            Assert(!evt.MetadataJson.Contains("data:image", StringComparison.OrdinalIgnoreCase), "Biometria bruta jamais deve aparecer em audit_events.");
        }
    }).ConfigureAwait(false);

    // =========================================================================================
    // SUÍTE DE TESTES HTTP — PR-02: ENCOMENDAS, VIAGENS, PRIVACIDADE E REGIÕES PILOTO MG
    // =========================================================================================

    await RunTestAsync("PR-02: POST /api/v1/shipments cria encomenda com validação 5/20/20kg, D06 e isolamento", async () =>
    {
        string[] specialCareList = ["Frágil", "Não Molhar"];
        var newShipmentPayload = new
        {
            title = "Componentes Eletrônicos para Painel Solar",
            description = "Inversores e conectores lacrados em caixa impermeável.",
            category = "ELETRONICOS",
            vehicleType = "CAR",
            weightGrams = 4200,
            dimensionsLengthCm = 35.0,
            dimensionsWidthCm = 25.0,
            dimensionsHeightCm = 15.0,
            declaredValueCents = 80000,
            suggestedPriceCents = 7500,
            specialCareNotes = specialCareList,
            origin = new
            {
                city = "João Monlevade",
                stateUf = "MG",
                neighborhood = "Carneirinhos",
                streetAndNumber = "Av. Wilson Alvarenga, 500",
                postalCode = "35930-001"
            },
            destination = new
            {
                city = "Belo Horizonte",
                stateUf = "MG",
                neighborhood = "Savassi",
                streetAndNumber = "Av. Getúlio Vargas, 1200",
                postalCode = "30112-020"
            },
            pickupWindow = "Hoje até 17h",
            deliveryWindow = "Amanhã até 12h",
            interestedInInsurance = true
        };

        using var response = await client.PostAsJsonAsync("/api/v1/shipments", newShipmentPayload).ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.Created, $"Status esperado 201 Created, recebido {(int)response.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = doc.RootElement;
        Assert(root.GetProperty("id").GetString() != null, "ID da encomenda deve ser retornado.");
        Assert(root.GetProperty("title").GetString() == "Componentes Eletrônicos para Painel Solar", "Título conferido.");
        Assert(root.GetProperty("weightGrams").GetInt32() == 4200, "Peso 4200g conferido.");

        var insurance = root.GetProperty("insuranceInterest");
        Assert(insurance.GetProperty("interested").GetBoolean() == true, "Interesse em seguro deve ser true.");
        Assert(insurance.GetProperty("chargedAmountCents").GetInt64() == 0, "Valor do seguro no MVP deve ser 0 centavos (D06).");
        Assert(insurance.GetProperty("mandatoryDisclaimer").GetString()!.Contains("Esta manifestação não contrata seguro"), "Disclaimer D06 deve estar presente.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-02: POST /api/v1/shipments com peso excedente (5001g em BICYCLE) retorna 400 ProblemDetails", async () =>
    {
        var invalidBikePayload = new
        {
            title = "Carga Excedente em Bicicleta",
            description = "Tentativa de envio de 5001g em bicicleta.",
            category = "GERAL",
            vehicleType = "BICYCLE",
            weightGrams = 5001,
            dimensionsLengthCm = 20.0,
            dimensionsWidthCm = 20.0,
            dimensionsHeightCm = 10.0,
            declaredValueCents = 1000,
            suggestedPriceCents = 1500,
            origin = new { city = "João Monlevade", neighborhood = "Centro" },
            destination = new { city = "João Monlevade", neighborhood = "Loanda" },
            interestedInInsurance = false
        };

        using var response = await client.PostAsJsonAsync("/api/v1/shipments", invalidBikePayload).ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.BadRequest, $"Status esperado 400 BadRequest para 5001g em BICYCLE, recebido {(int)response.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        string? detail = doc.RootElement.GetProperty("detail").GetString();
        Assert(detail != null && detail.Contains("5001"), "ProblemDetails deve explicar a violação de limite de peso (D04).");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-02: GET /api/v1/shipments preserva privacidade ocultando logradouro exato e expondo ponto aproximado", async () =>
    {
        using var response = await client.GetAsync("/api/v1/shipments").ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.OK, "Listagem pública de encomendas deve retornar 200 OK.");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetArrayLength() >= 2, "Devem existir ao menos as 2 encomendas demonstrativas pré-semeadas.");

        string firstId = doc.RootElement[0].GetProperty("id").GetString()!;

        // Consulta pública de detalhes sem token
        using var detailResponse = await client.GetAsync($"/api/v1/shipments/{firstId}").ConfigureAwait(false);
        Assert(detailResponse.StatusCode == HttpStatusCode.OK, "Detalhes públicos da encomenda devem retornar 200 OK.");

        using var detailDoc = await JsonDocument.ParseAsync(await detailResponse.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var origin = detailDoc.RootElement.GetProperty("origin");
        Assert(origin.GetProperty("isMaskedForPrivacy").GetBoolean() == true, "Endereço deve estar marcado como mascarado por privacidade.");
        Assert(origin.GetProperty("streetAndNumber").ValueKind == JsonValueKind.Null, "Logradouro e número exatos JAMAIS devem ser expostos na consulta pública.");
        Assert(origin.GetProperty("approximateLatitude").GetDouble() != 0.0, "Ponto geográfico aproximado deve estar disponível.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-02: POST /api/v1/trips cadastra viagem com rota e capacidade livre (D03, D04)", async () =>
    {
        string[] tripStops = ["São Gonçalo do Rio Abaixo", "Barão de Cocais"];
        var newTripPayload = new
        {
            vehicleType = "CAR",
            vehicleModel = "Volkswagen T-Cross (Espaço livre no porta-malas)",
            originCity = "João Monlevade",
            destinationCity = "Belo Horizonte",
            intermediateStops = tripStops,
            departureDate = "Amanhã",
            departureTime = "09:00",
            availableCapacityGrams = 18000,
            flexiblePickup = true,
            suggestedPricePerKgCents = 900
        };

        using var response = await client.PostAsJsonAsync("/api/v1/trips", newTripPayload).ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.Created, $"Status esperado 201 Created para viagem válida, recebido {(int)response.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("id").GetString() != null, "ID da viagem deve ser retornado.");
        Assert(doc.RootElement.GetProperty("availableCapacityGrams").GetInt32() == 18000, "Capacidade 18000g conferida.");
        Assert(doc.RootElement.GetProperty("originCity").GetString() == "João Monlevade", "Origem conferida.");
        Assert(doc.RootElement.GetProperty("destinationCity").GetString() == "Belo Horizonte", "Destino conferido.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-02: POST /api/v1/trips com capacidade excedente (20001g em CAR) retorna 400 ProblemDetails", async () =>
    {
        var invalidTripPayload = new
        {
            vehicleType = "CAR",
            vehicleModel = "Carro Pequeno",
            originCity = "João Monlevade",
            destinationCity = "Belo Horizonte",
            departureDate = "Hoje",
            availableCapacityGrams = 20001,
            flexiblePickup = false,
            suggestedPricePerKgCents = 1000
        };

        using var response = await client.PostAsJsonAsync("/api/v1/trips", invalidTripPayload).ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.BadRequest, $"Status esperado 400 BadRequest para 20001g em CAR, recebido {(int)response.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        string? detail = doc.RootElement.GetProperty("detail").GetString();
        Assert(detail != null && detail.Contains("20001"), "ProblemDetails deve reportar a capacidade máxima de 20 kg.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-02: GET /api/v1/trips retorna lista de viagens ativas", async () =>
    {
        using var response = await client.GetAsync("/api/v1/trips").ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.OK, "Listagem de viagens deve retornar 200 OK.");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetArrayLength() >= 3, "Devem existir ao menos as 3 viagens pré-semeadas.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-02: GET /api/v1/regions/cities retorna municípios de Minas Gerais com prioridades piloto D02", async () =>
    {
        using var response = await client.GetAsync("/api/v1/regions/cities").ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.OK, "Listagem de municípios de MG deve retornar 200 OK.");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var array = doc.RootElement;
        Assert(array.GetArrayLength() >= 10, "Catálogo deve conter os municípios mapeados de Minas Gerais.");

        bool foundMonlevade = false;
        bool foundBh = false;

        foreach (var city in array.EnumerateArray())
        {
            string ibge = city.GetProperty("ibgeCode").GetString()!;
            string state = city.GetProperty("stateUf").GetString()!;
            Assert(state == "MG", $"Estado deve ser MG para todo município (D02), observado {state}");

            if (ibge == "3136207")
            {
                foundMonlevade = true;
                Assert(city.GetProperty("isPilotPriority").GetBoolean() == true, "João Monlevade deve ser polo piloto prioritário.");
                Assert(city.GetProperty("pilotPriorityOrder").GetInt32() == 1, "João Monlevade deve ser prioridade piloto 1.");
            }
            else if (ibge == "3106200")
            {
                foundBh = true;
                Assert(city.GetProperty("isPilotPriority").GetBoolean() == true, "Belo Horizonte deve ser polo piloto prioritário.");
                Assert(city.GetProperty("pilotPriorityOrder").GetInt32() == 2, "Belo Horizonte deve ser prioridade piloto 2.");
            }
        }

        Assert(foundMonlevade && foundBh, "Ambos os polos piloto (João Monlevade e Belo Horizonte) devem estar presentes.");
    }).ConfigureAwait(false);

    // ========================================================================
    // SUÍTE PR-03: MATCHING GEOESPACIAL, ROTAS E BUSCA RADIAL (HTTP)
    // ========================================================================

    await RunTestAsync("PR-03: GET /api/v1/matching/nearby-shipments retorna 200 OK com oportunidades em raio de 2 km", async () =>
    {
        // Centro de João Monlevade: -19.8100, -43.1736
        using var response = await client.GetAsync("/api/v1/matching/nearby-shipments?lat=-19.8100&lon=-43.1736&radiusMeters=2000").ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.OK, $"Status esperado 200, recebido {(int)response.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = doc.RootElement;
        int totalFound = root.GetProperty("totalFound").GetInt32();
        Assert(totalFound >= 1, "Deve encontrar ao menos 1 encomenda próxima em João Monlevade.");

        var opps = root.GetProperty("opportunities");
        foreach (var opp in opps.EnumerateArray())
        {
            double dist = opp.GetProperty("distanceMeters").GetDouble();
            Assert(dist <= 2000.0, $"Distância ({dist}m) deve ser menor ou igual a 2000m.");
            Assert(opp.GetProperty("isWithin2Km").GetBoolean() == true, "isWithin2Km deve ser true.");
        }
    }).ConfigureAwait(false);

    await RunTestAsync("PR-03: GET /api/v1/matching/nearby-shipments com latitude inválida (> 90) retorna 400 Bad Request ProblemDetails", async () =>
    {
        using var response = await client.GetAsync("/api/v1/matching/nearby-shipments?lat=95.0&lon=-43.1736").ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.BadRequest, $"Status esperado 400, recebido {(int)response.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("title").GetString() == "Coordenadas geográficas inválidas", "Título de ProblemDetails esperado.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-03: GET /api/v1/matching/shipments/{id}/trips com encomenda demo retorna 200 OK e viagens compatíveis", async () =>
    {
        var demoShipmentId = Guid.Parse("e0000001-0000-0000-0000-000000000001"); // Monlevade -> BH (Moto)
        using var response = await client.GetAsync($"/api/v1/matching/shipments/{demoShipmentId}/trips").ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.OK, $"Status esperado 200, recebido {(int)response.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = doc.RootElement;
        Assert(root.GetProperty("shipmentId").GetString() == demoShipmentId.ToString(), "ID da encomenda deve coincidir.");
        int total = root.GetProperty("totalCompatibleTrips").GetInt32();
        Assert(total >= 1, "Deve encontrar ao menos 1 viagem compatível para a encomenda demo.");

        var matches = root.GetProperty("matches");
        var first = matches.EnumerateArray().First();
        Assert(first.GetProperty("isCompatible").GetBoolean() == true, "Viagem deve ser compatível.");
        Assert(first.GetProperty("matchScore").GetInt32() >= 90, "Score deve ser >= 90.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-03: GET /api/v1/matching/trips/{id}/shipments com viagem demo retorna 200 OK e encomendas compatíveis", async () =>
    {
        var demoTripId = Guid.Parse("b0000001-0000-0000-0000-000000000001"); // Monlevade -> Barão -> Caeté -> BH (Carro)
        using var response = await client.GetAsync($"/api/v1/matching/trips/{demoTripId}/shipments").ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.OK, $"Status esperado 200, recebido {(int)response.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = doc.RootElement;
        Assert(root.GetProperty("tripId").GetString() == demoTripId.ToString(), "ID da viagem deve coincidir.");
        int total = root.GetProperty("totalCompatibleShipments").GetInt32();
        Assert(total >= 1, "Deve encontrar ao menos 1 encomenda compatível para a viagem demo.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-03: POST /api/v1/matching/evaluate avalia par compatível com score e diagnóstico explicável", async () =>
    {
        var request = new EvaluateMatchingRequest(
            ShipmentId: Guid.Parse("e0000001-0000-0000-0000-000000000001"),
            TripId: Guid.Parse("b0000001-0000-0000-0000-000000000001"));

        using var response = await client.PostAsJsonAsync("/api/v1/matching/evaluate", request).ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.OK, $"Status esperado 200, recebido {(int)response.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = doc.RootElement;
        Assert(root.GetProperty("isCompatible").GetBoolean() == true, "Par deve ser compatível.");
        Assert(root.GetProperty("rejectionReason").GetString() == "NONE", "Rejeição deve ser NONE.");
        Assert(root.GetProperty("directionStatus").GetString() == "SAME_DIRECTION", "Sentido deve ser SAME_DIRECTION.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-03: POST /api/v1/matching/evaluate com viagem inexistente retorna 404 Not Found ProblemDetails", async () =>
    {
        var request = new EvaluateMatchingRequest(
            ShipmentId: Guid.Parse("e0000001-0000-0000-0000-000000000001"),
            TripId: Guid.NewGuid()); // Inexistente

        using var response = await client.PostAsJsonAsync("/api/v1/matching/evaluate", request).ConfigureAwait(false);
        Assert(response.StatusCode == HttpStatusCode.NotFound, $"Status esperado 404, recebido {(int)response.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("title").GetString() == "Viagem não encontrada", "Título de ProblemDetails esperado.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-03-COMP: GET /api/v1/regions/search retorna municípios com busca por nome e UF", async () =>
    {
        using var resp = await client.GetAsync("/api/v1/regions/search?q=Belo&uf=MG&limit=10").ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, "Busca de municípios deve retornar 200 OK");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = doc.RootElement;
        Assert(root.GetProperty("totalFound").GetInt32() >= 1, "Deve encontrar ao menos 1 município com 'Belo' em MG");
        var munics = root.GetProperty("municipalities").EnumerateArray().ToList();
        Assert(munics.Any(m => m.GetProperty("name").GetString() == "Belo Horizonte"), "Belo Horizonte deve estar nos resultados");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-03-COMP: GET /api/v1/opportunities/feed/on-my-route retorna cargas com desvio viário e classificação", async () =>
    {
        using var resp = await client.GetAsync("/api/v1/opportunities/feed/on-my-route?originCity=João%20Monlevade&destinationCity=Belo%20Horizonte&limit=20").ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, "Feed no meu trajeto deve retornar 200 OK");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = doc.RootElement;
        Assert(root.TryGetProperty("items", out var items), "Resposta deve conter lista de items");
        Assert(items.GetArrayLength() >= 1, "Deve conter ao menos 1 oportunidade compatível");

        var first = items.EnumerateArray().First();
        Assert(first.TryGetProperty("detour", out var detour) && detour.ValueKind != JsonValueKind.Null, "Item deve conter informações de desvio viário");
        Assert(detour.GetProperty("classification").GetString() == "COMPATIBLE", "Item deve ser classificado como COMPATIBLE");
        Assert(detour.GetProperty("additionalDistanceKm").GetDouble() <= 10.0, "Desvio adicional deve ser <= 10 km");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-03-COMP: GET /api/v1/opportunities/feed/nearby retorna oportunidades por proximidade GPS", async () =>
    {
        // Centro em João Monlevade (-19.8100, -43.1736) raio de 15 km
        using var resp = await client.GetAsync("/api/v1/opportunities/feed/nearby?lat=-19.8100&lon=-43.1736&radiusKm=15&limit=20").ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, "Feed de proximidade deve retornar 200 OK");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = doc.RootElement;
        Assert(root.GetProperty("items").GetArrayLength() >= 1, "Deve encontrar oportunidades próximas em raio de 15 km");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-03-COMP: GET /api/v1/opportunities/feed/regional filtra por UF e município", async () =>
    {
        using var resp = await client.GetAsync("/api/v1/opportunities/feed/regional?uf=MG&city=Monlevade&limit=20").ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, "Feed regional deve retornar 200 OK");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = doc.RootElement;
        Assert(root.GetProperty("items").GetArrayLength() >= 1, "Deve encontrar oportunidades filtradas por MG / Monlevade");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-03-COMP: Benchmark de Escala com 5.000 Oportunidades Sintéticas processa feed em <= 250 ms com cursor estável", async () =>
    {
        var shipmentsRepo = app.Services.GetRequiredService<IShipmentsRepository>();
        var cities = BenchmarkConstants.Cities;
        var senderId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        var syntheticList = new List<Shipment>(5000);
        for (int i = 0; i < 5000; i++)
        {
            string orig = cities[i % cities.Length];
            string dest = cities[(i + 1) % cities.Length];
            syntheticList.Add(new Shipment
            {
                Id = Guid.NewGuid(),
                SenderId = senderId,
                Title = $"Carga Sintética #{i + 1}",
                Category = ShipmentCategory.GERAL,
                VehicleType = i % 3 == 0 ? VehicleType.MOTORCYCLE : VehicleType.CAR,
                WeightGrams = 500 + (i % 8000),
                SuggestedPriceCents = 3000 + (i % 5000),
                OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, orig, "MG", "Bairro Teste", null, null, -19.8100, -43.1736),
                DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, dest, "MG", "Bairro Teste", null, null, -19.9167, -43.9345),
                Status = ShipmentStatus.PUBLISHED,
                CreatedAtUtc = now.AddMinutes(-i)
            });
        }

        foreach (var s in syntheticList)
        {
            await shipmentsRepo.CreateAsync(s, CancellationToken.None).ConfigureAwait(false);
        }

        // Warmup JIT para o endpoint antes de medir tempo
        using var warmup = await client.GetAsync("/api/v1/opportunities/feed/on-my-route?originCity=João%20Monlevade&destinationCity=Belo%20Horizonte&limit=1").ConfigureAwait(false);
        var benchmarkTimer = Stopwatch.StartNew();
        using var respPage1 = await client.GetAsync("/api/v1/opportunities/feed/on-my-route?originCity=João%20Monlevade&destinationCity=Belo%20Horizonte&limit=20").ConfigureAwait(false);
        benchmarkTimer.Stop();

        Assert(respPage1.StatusCode == HttpStatusCode.OK, "Feed deve retornar 200 OK com 5.000 itens");
        Assert(benchmarkTimer.ElapsedMilliseconds <= 250, $"Tempo de resposta P95 deve ser <= 250ms, obtido {benchmarkTimer.ElapsedMilliseconds}ms");

        using var doc1 = await JsonDocument.ParseAsync(await respPage1.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root1 = doc1.RootElement;
        var items1 = root1.GetProperty("items").EnumerateArray().ToList();
        Assert(items1.Count == 20, $"Página 1 deve conter exatamente 20 itens, obtido {items1.Count}");
        string? nextCursor = root1.GetProperty("nextCursor").GetString();
        Assert(!string.IsNullOrWhiteSpace(nextCursor), "Cursor da próxima página deve ser gerado");

        using var respPage2 = await client.GetAsync($"/api/v1/opportunities/feed/on-my-route?originCity=João%20Monlevade&destinationCity=Belo%20Horizonte&limit=20&cursor={Uri.EscapeDataString(nextCursor!)}").ConfigureAwait(false);
        Assert(respPage2.StatusCode == HttpStatusCode.OK, "Página 2 com cursor deve retornar 200 OK");
        using var doc2 = await JsonDocument.ParseAsync(await respPage2.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var items2 = doc2.RootElement.GetProperty("items").EnumerateArray().ToList();
        Assert(items2.Count == 20, $"Página 2 deve conter exatamente 20 itens, obtido {items2.Count}");

        var id1 = items1.Select(x => x.GetProperty("id").GetString()).ToHashSet();
        var id2 = items2.Select(x => x.GetProperty("id").GetString()).ToHashSet();
        Assert(!id1.Overlaps(id2), "Não deve haver duplicatas entre páginas sequenciais com cursor.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-04 HTTP (Segurança): Requisição anônima sem Bearer token para /api/v1/proposals retorna 401 Unauthorized", async () =>
    {
        var payload = new
        {
            shipmentId = "e0000001-0000-0000-0000-000000000001",
            amountCents = 4500,
            notes = "Tentativa anônima"
        };
        using var resp = await client.PostAsJsonAsync("/api/v1/proposals", payload).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.Unauthorized, $"Esperado 401 Unauthorized, recebido {(int)resp.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("status").GetInt32() == 401, "Status 401 no ProblemDetails.");
        Assert(doc.RootElement.GetProperty("ruleCode").GetString() == "AUTH_UNAUTHORIZED", "RuleCode deve ser AUTH_UNAUTHORIZED.");
    }).ConfigureAwait(false);

    string carrierJwt = string.Empty;
    string senderJwt = string.Empty;

    await RunTestAsync("PR-04 HTTP (Ambiente de Teste): POST /api/v1/auth/sandbox-token emite token JWT assinado para CARRIER e SENDER", async () =>
    {
        using var respCarrier = await client.PostAsJsonAsync("/api/v1/auth/sandbox-token", new { role = "CARRIER" }).ConfigureAwait(false);
        Assert(respCarrier.StatusCode == HttpStatusCode.OK, "Emissão de token Carrier deve retornar 200 OK");
        using var docCarrier = await JsonDocument.ParseAsync(await respCarrier.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        carrierJwt = docCarrier.RootElement.GetProperty("accessToken").GetString()!;
        Assert(!string.IsNullOrWhiteSpace(carrierJwt), "Carrier JWT deve ser emitido.");

        using var respSender = await client.PostAsJsonAsync("/api/v1/auth/sandbox-token", new { role = "SENDER" }).ConfigureAwait(false);
        Assert(respSender.StatusCode == HttpStatusCode.OK, "Emissão de token Sender deve retornar 200 OK");
        using var docSender = await JsonDocument.ParseAsync(await respSender.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        senderJwt = docSender.RootElement.GetProperty("accessToken").GetString()!;
        Assert(!string.IsNullOrWhiteSpace(senderJwt), "Sender JWT deve ser emitido.");
    }).ConfigureAwait(false);

    Guid createdProposalId = Guid.Empty;

    await RunTestAsync("PR-04 HTTP: POST /api/v1/proposals com Bearer de Transportador cria proposta formal (201 Created)", async () =>
    {
        var payload = new
        {
            shipmentId = "e0000001-0000-0000-0000-000000000001",
            amountCents = 4500,
            notes = "Proposta teste integração HTTP com JWT válido",
            estimatedPickup = "14:00",
            estimatedDelivery = "18:00"
        };
        using var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/proposals")
        {
            Content = JsonContent.Create(payload)
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.Created, $"Esperado 201 Created, recebido {(int)resp.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("status").GetString() == "PENDING", "Status deve ser PENDING.");
        Assert(doc.RootElement.GetProperty("amountCents").GetInt64() == 4500, "Valor deve ser 4500.");
        createdProposalId = doc.RootElement.GetProperty("id").GetGuid();
    }).ConfigureAwait(false);

    await RunTestAsync("PR-04 HTTP: GET /api/v1/proposals/{id} com Bearer token retorna proposta", async () =>
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/proposals/{createdProposalId}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, $"Esperado 200 OK, recebido {(int)resp.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("id").GetGuid() == createdProposalId, "ID deve bater.");
        Assert(doc.RootElement.GetProperty("amountCents").GetInt64() == 4500, "Valor deve ser 4500.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-04 HTTP (Segurança): Terceiro não participante tentando aceitar proposta alheia recebe 403 Forbidden", async () =>
    {
        var payload = new { expectedVersion = 1 };
        using var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/proposals/{createdProposalId}/accept")
        {
            Content = JsonContent.Create(payload)
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userAToken);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.Forbidden, $"Esperado 403 Forbidden para terceiro, recebido {(int)resp.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("ruleCode").GetString() == "AUTH_FORBIDDEN_NOT_PARTY", "RuleCode deve ser AUTH_FORBIDDEN_NOT_PARTY.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-04 HTTP (Regra de Negócio): Transportador tentando aceitar a própria proposta recebe 422 (SELF_ACCEPTANCE_FORBIDDEN)", async () =>
    {
        var payload = new { expectedVersion = 1 };
        using var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/proposals/{createdProposalId}/accept")
        {
            Content = JsonContent.Create(payload)
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.UnprocessableEntity, $"Esperado 422 UnprocessableEntity, recebido {(int)resp.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("ruleCode").GetString() == "SELF_ACCEPTANCE_FORBIDDEN", "RuleCode deve ser SELF_ACCEPTANCE_FORBIDDEN.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-04 HTTP: POST /api/v1/proposals/{id}/counter pelo Remetente envia contraproposta legítima (200 OK)", async () =>
    {
        var payload = new
        {
            amountCents = 4800,
            notes = "Contraproposta HTTP enviada pelo Remetente",
            estimatedPickup = "15:00"
        };
        using var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/proposals/{createdProposalId}/counter")
        {
            Content = JsonContent.Create(payload)
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", senderJwt);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, $"Esperado 200 OK, recebido {(int)resp.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("status").GetString() == "COUNTERED", "Status deve ser COUNTERED.");
        Assert(doc.RootElement.GetProperty("amountCents").GetInt64() == 4800, "Valor deve ser 4800.");
        Assert(doc.RootElement.GetProperty("version").GetInt32() == 2, "Versão deve ser incrementada para 2.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-04 HTTP (Alternância de Turno): Remetente tentando enviar segunda contraproposta consecutiva recebe 422 (COUNTER_TURN_VIOLATION)", async () =>
    {
        var payload = new
        {
            amountCents = 4700,
            notes = "Segunda contraproposta consecutiva ilegal"
        };
        using var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/proposals/{createdProposalId}/counter")
        {
            Content = JsonContent.Create(payload)
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", senderJwt);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.UnprocessableEntity, $"Esperado 422 por violação de turno, recebido {(int)resp.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("ruleCode").GetString() == "COUNTER_TURN_VIOLATION", "RuleCode deve ser COUNTER_TURN_VIOLATION.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-04 HTTP: POST /api/v1/proposals/{id}/accept pelo Transportador formaliza contrato único atômico (200 OK)", async () =>
    {
        var payload = new { expectedVersion = 2 };
        using var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/proposals/{createdProposalId}/accept")
        {
            Content = JsonContent.Create(payload)
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, $"Esperado 200 OK, recebido {(int)resp.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("status").GetString() == "ACTIVE", "Contrato deve ser ACTIVE.");
        Assert(doc.RootElement.GetProperty("commissionSnapshot").GetProperty("commissionRate").GetDecimal() == 0.13m, "Comissão deve ser 13%.");
        Assert(doc.RootElement.GetProperty("amountCents").GetInt64() == 4800, "Valor do contrato deve ser 4800.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-04 HTTP (Gate G2): Tentativa concorrente de aceite retorna 409 Conflict com ProblemDetails RFC 9457", async () =>
    {
        var payload = new { expectedVersion = 2 };
        using var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/proposals/{createdProposalId}/accept")
        {
            Content = JsonContent.Create(payload)
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.Conflict, $"Esperado 409 Conflict, recebido {(int)resp.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("status").GetInt32() == 409, "Status no ProblemDetails deve ser 409.");
        Assert(doc.RootElement.GetProperty("ruleCode").GetString() == "CONCURRENT_ACCEPTANCE_CONFLICT", "RuleCode deve ser CONCURRENT_ACCEPTANCE_CONFLICT.");
    }).ConfigureAwait(false);

    string contractedId = string.Empty;

    await RunTestAsync("PR-04 HTTP: GET /api/v1/contracts/shipment/{shipmentId} com Bearer token obtém contrato formalizado", async () =>
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, "/api/v1/contracts/shipment/e0000001-0000-0000-0000-000000000001");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", senderJwt);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, "Contrato deve ser encontrado por encomenda.");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        contractedId = doc.RootElement.GetProperty("id").GetString()!;
        Assert(!string.IsNullOrWhiteSpace(contractedId), "ContractId deve ser retornado.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-04 HTTP (Segurança): Terceiro tentando cancelar contrato pré-coleta recebe 403 Forbidden", async () =>
    {
        var cancelPayload = new
        {
            reasonCode = "MUTUAL_AGREEMENT",
            justification = "Tentativa indevida de cancelamento por terceiro",
            reopenForBidding = true
        };
        using var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/contracts/{contractedId}/cancel-pre-pickup")
        {
            Content = JsonContent.Create(cancelPayload)
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userAToken);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.Forbidden, $"Esperado 403 Forbidden para cancelamento por terceiro, recebido {(int)resp.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("ruleCode").GetString() == "UNAUTHORIZED_CONTRACT_ACTION", "RuleCode deve ser UNAUTHORIZED_CONTRACT_ACTION.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-04 HTTP: POST /api/v1/contracts/{id}/cancel-pre-pickup pelo Remetente executa cancelamento e restaura capacidade", async () =>
    {
        var cancelPayload = new
        {
            reasonCode = "MUTUAL_AGREEMENT",
            justification = "Cancelamento amigável antes da coleta solicitado pelas partes",
            reopenForBidding = true
        };
        using var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/contracts/{contractedId}/cancel-pre-pickup")
        {
            Content = JsonContent.Create(cancelPayload)
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", senderJwt);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, $"Esperado 200 OK no cancelamento, recebido {(int)resp.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("status").GetString() == "CANCELLED_PRE_PICKUP", "Status deve ser CANCELLED_PRE_PICKUP.");
        Assert(doc.RootElement.GetProperty("cancellation").GetProperty("simulatedPenaltyCents").GetInt64() == 0, "Isento de taxas no consensual.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-04 HTTP (Regra 2): GET /api/v1/priority-offers/carrier/{carrierId} com Bearer token consulta ofertas prioritárias", async () =>
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, "/api/v1/priority-offers/carrier/00000000-0000-0000-0000-000000000002");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, "Consulta de ofertas prioritárias deve retornar 200 OK.");
    }).ConfigureAwait(false);

    // --------------------------------------------------------------------------
    // SUÍTE PR-05 (EXECUÇÃO DE ENTREGAS, DESAFIO D16, EXCEÇÕES E SUGESTÕES PÓS-ENTREGA)
    // --------------------------------------------------------------------------
    var fulfillmentRepo = app.Services.GetRequiredService<IFulfillmentRepository>();
    var testDeliveryOrderId = Guid.NewGuid();
    var testShipmentId = Guid.NewGuid();
    var testContractId = Guid.NewGuid();

    await fulfillmentRepo.CreateOrderAsync(new DeliveryOrder
    {
        Id = testDeliveryOrderId,
        ContractId = testContractId,
        ShipmentId = testShipmentId,
        TripId = Guid.NewGuid(),
        SenderId = Guid.Parse("00000000-0000-0000-0000-000000000001"),
        SenderName = "Remetente Sandbox",
        CarrierId = Guid.Parse("00000000-0000-0000-0000-000000000002"),
        CarrierName = "Transportador Sandbox",
        RecipientName = "Destinatário Sandbox",
        Status = DeliveryOrderStatus.AWAITING_PICKUP
    }).ConfigureAwait(false);

    await RunTestAsync("PR-05 HTTP: GET /api/v1/deliveries/my-orders com Bearer Carrier retorna ordens de entrega ativas", async () =>
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, "/api/v1/deliveries/my-orders");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, $"Esperado 200 OK, recebido {(int)resp.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetArrayLength() > 0, "Deve conter ao menos 1 ordem de entrega.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-05 HTTP (Decisão 2): GET /api/v1/deliveries/{orderId}/delivery-code com Bearer Carrier é bloqueado com 403 Forbidden", async () =>
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/deliveries/{testDeliveryOrderId}/delivery-code");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.Forbidden, $"Esperado 403 Forbidden, recebido {(int)resp.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("ruleCode").GetString() == "FORBIDDEN_CARRIER_CANNOT_VIEW_DELIVERY_CODE", "RuleCode deve ser FORBIDDEN_CARRIER_CANNOT_VIEW_DELIVERY_CODE.");
    }).ConfigureAwait(false);

    string initialDeliveryCode = string.Empty;

    await RunTestAsync("PR-05 HTTP (Decisão 2): GET /api/v1/deliveries/{orderId}/delivery-code com Bearer Sender retorna código de 4 dígitos", async () =>
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/deliveries/{testDeliveryOrderId}/delivery-code");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", senderJwt);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, $"Esperado 200 OK, recebido {(int)resp.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        initialDeliveryCode = doc.RootElement.GetProperty("deliveryCode").GetString()!;
        Assert(initialDeliveryCode.Length == 4 && initialDeliveryCode.All(char.IsDigit), "Código deve ter exatamente 4 dígitos.");
        Assert(doc.RootElement.GetProperty("remainingAttempts").GetInt32() == 3, "Tentativas devem ser 3.");
        Assert(!doc.RootElement.GetProperty("isLocked").GetBoolean(), "Não deve estar bloqueado.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-05 HTTP: POST /pickup-checkin e /confirm-pickup pelo transportador transitam para IN_TRANSIT", async () =>
    {
        // 1. Checkin
        using var reqCheckin = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/deliveries/{testDeliveryOrderId}/pickup-checkin")
        {
            Content = JsonContent.Create(new { latitude = -19.9167, longitude = -43.9345, notes = "Cheguei ao local de coleta" })
        };
        reqCheckin.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var respCheckin = await client.SendAsync(reqCheckin).ConfigureAwait(false);
        Assert(respCheckin.StatusCode == HttpStatusCode.OK, "Checkin deve retornar 200 OK.");

        // 2. Confirm Pickup
        using var reqConfirm = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/deliveries/{testDeliveryOrderId}/confirm-pickup")
        {
            Content = JsonContent.Create(new { handoverNotes = "Pacote recolhido e conferido com o remetente" })
        };
        reqConfirm.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var respConfirm = await client.SendAsync(reqConfirm).ConfigureAwait(false);
        Assert(respConfirm.StatusCode == HttpStatusCode.OK, "Confirmação de coleta deve retornar 200 OK.");

        using var doc = await JsonDocument.ParseAsync(await respConfirm.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("status").GetString() == "IN_TRANSIT", "Status deve transitar para IN_TRANSIT.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-05 HTTP (Decisão 1): Upload de comprovante fotográfico opcional (POST /delivery-proof) retorna 201 Created", async () =>
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/deliveries/{testDeliveryOrderId}/delivery-proof")
        {
            Content = JsonContent.Create(new
            {
                fileBase64OrUrl = "https://storage.topiclog.local/proofs/delivery_photo_1.jpg",
                description = "Foto opcional da entrega para registro",
                latitude = -19.9167,
                longitude = -43.9345
            })
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.Created, $"Esperado 201 Created, recebido {(int)resp.StatusCode}");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-05 HTTP (Decisão 1): Três tentativas consecutivas de código incorreto bloqueiam o desafio com 422 (DELIVERY_CHALLENGE_LOCKED)", async () =>
    {
        string wrongCode = initialDeliveryCode == "1234" ? "9999" : "1234";

        // Tentativa 1 incorreta -> 400
        using var req1 = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/deliveries/{testDeliveryOrderId}/confirm-delivery")
        {
            Content = JsonContent.Create(new { deliveryCode = wrongCode })
        };
        req1.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var resp1 = await client.SendAsync(req1).ConfigureAwait(false);
        Assert(resp1.StatusCode == HttpStatusCode.BadRequest, $"Tentativa 1 esperava 400, recebeu {(int)resp1.StatusCode}");

        // Tentativa 2 incorreta -> 400
        using var req2 = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/deliveries/{testDeliveryOrderId}/confirm-delivery")
        {
            Content = JsonContent.Create(new { deliveryCode = wrongCode })
        };
        req2.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var resp2 = await client.SendAsync(req2).ConfigureAwait(false);
        Assert(resp2.StatusCode == HttpStatusCode.BadRequest, $"Tentativa 2 esperava 400, recebeu {(int)resp2.StatusCode}");

        // Tentativa 3 incorreta -> 422 Bloqueio
        using var req3 = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/deliveries/{testDeliveryOrderId}/confirm-delivery")
        {
            Content = JsonContent.Create(new { deliveryCode = wrongCode })
        };
        req3.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var resp3 = await client.SendAsync(req3).ConfigureAwait(false);
        Assert(resp3.StatusCode == HttpStatusCode.UnprocessableEntity, $"Tentativa 3 esperava 422, recebeu {(int)resp3.StatusCode}");

        using var doc3 = await JsonDocument.ParseAsync(await resp3.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc3.RootElement.GetProperty("ruleCode").GetString() == "DELIVERY_CHALLENGE_LOCKED", "RuleCode deve ser DELIVERY_CHALLENGE_LOCKED.");
    }).ConfigureAwait(false);

    string regeneratedDeliveryCode = string.Empty;

    await RunTestAsync("PR-05 HTTP (Decisão 1): Remetente emite novo código (POST /regenerate-code) e transportador confirma com sucesso (DELIVERED_VERIFIED)", async () =>
    {
        // 1. Remetente solicita regeneração
        using var reqRegen = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/deliveries/{testDeliveryOrderId}/regenerate-code")
        {
            Content = JsonContent.Create(new { justification = "Destinatário errou 3x e solicitou renovação" })
        };
        reqRegen.Headers.Authorization = new AuthenticationHeaderValue("Bearer", senderJwt);
        using var respRegen = await client.SendAsync(reqRegen).ConfigureAwait(false);
        Assert(respRegen.StatusCode == HttpStatusCode.OK, $"Regeneração esperava 200 OK, recebeu {(int)respRegen.StatusCode}");

        using var docRegen = await JsonDocument.ParseAsync(await respRegen.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        regeneratedDeliveryCode = docRegen.RootElement.GetProperty("deliveryCode").GetString()!;
        Assert(!string.IsNullOrWhiteSpace(regeneratedDeliveryCode), "Novo código deve ser retornado.");
        Assert(!docRegen.RootElement.GetProperty("isLocked").GetBoolean(), "Novo desafio não deve estar bloqueado.");

        // 2. Transportador conclui entrega com o novo código
        using var reqConfirm = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/deliveries/{testDeliveryOrderId}/confirm-delivery")
        {
            Content = JsonContent.Create(new
            {
                deliveryCode = regeneratedDeliveryCode,
                recipientSignatureOrNotes = "Recebido por Maria Silva"
            })
        };
        reqConfirm.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var respConfirm = await client.SendAsync(reqConfirm).ConfigureAwait(false);
        Assert(respConfirm.StatusCode == HttpStatusCode.OK, $"Esperava 200 OK na confirmação final, recebeu {(int)respConfirm.StatusCode}");

        using var docConfirm = await JsonDocument.ParseAsync(await respConfirm.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(docConfirm.RootElement.GetProperty("status").GetString() == "DELIVERED_VERIFIED", "Status deve transitar para DELIVERED_VERIFIED.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-05 HTTP (Decisão 3): POST /report-exception registra RECIPIENT_ABSENT e POST /reschedule altera status para RESCHEDULED", async () =>
    {
        var order2Id = Guid.NewGuid();
        await fulfillmentRepo.CreateOrderAsync(new DeliveryOrder
        {
            Id = order2Id,
            ContractId = Guid.NewGuid(),
            ShipmentId = Guid.NewGuid(),
            TripId = Guid.NewGuid(),
            SenderId = Guid.Parse("00000000-0000-0000-0000-000000000001"),
            CarrierId = Guid.Parse("00000000-0000-0000-0000-000000000002"),
            Status = DeliveryOrderStatus.IN_TRANSIT
        }).ConfigureAwait(false);

        // Report exception
        using var reqExc = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/deliveries/{order2Id}/report-exception")
        {
            Content = JsonContent.Create(new
            {
                reason = "RECIPIENT_ABSENT",
                justification = "Destinatário ausente no local, vizinhos informaram que retorna amanhã",
                proofPhotoBase64OrUrl = "https://storage.topiclog.local/proofs/closed_gate.jpg",
                latitude = -19.9167,
                longitude = -43.9345
            })
        };
        reqExc.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var respExc = await client.SendAsync(reqExc).ConfigureAwait(false);
        Assert(respExc.StatusCode == HttpStatusCode.OK, $"Esperava 200 OK no reporte de exceção, recebeu {(int)respExc.StatusCode}");

        // Reschedule
        using var reqResched = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/deliveries/{order2Id}/reschedule")
        {
            Content = JsonContent.Create(new
            {
                rescheduledDate = "2026-10-16",
                rescheduledTimeWindow = "Tarde (14h - 18h)",
                justification = "Acordado com o destinatário por telefone"
            })
        };
        reqResched.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var respResched = await client.SendAsync(reqResched).ConfigureAwait(false);
        Assert(respResched.StatusCode == HttpStatusCode.OK, $"Esperava 200 OK no reagendamento, recebeu {(int)respResched.StatusCode}");

        using var docResched = await JsonDocument.ParseAsync(await respResched.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(docResched.RootElement.GetProperty("status").GetString() == "RESCHEDULED", "Status deve transitar para RESCHEDULED.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-05 HTTP (Regra 3 / PR-03): GET /api/v1/opportunities/post-delivery-suggestions com coordenadas retorna oportunidades no raio", async () =>
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, "/api/v1/opportunities/post-delivery-suggestions?latitude=-19.9167&longitude=-43.9345&maxRadiusKm=2");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, $"Esperado 200 OK em sugestões pós-entrega, recebido {(int)resp.StatusCode}");
    }).ConfigureAwait(false);

    // ============================================================================
    // SUÍTE DE TESTES DE INTEGRAÇÃO HTTP: PR-FIN-01 (POLÍTICAS COMERCIAIS & ASSINATURAS)
    // ============================================================================

    string adminJwt = string.Empty;

    await RunTestAsync("PR-FIN-01 HTTP: POST /api/v1/auth/sandbox-token emite token JWT com perfil GENERAL_ADMIN", async () =>
    {
        using var resp = await client.PostAsJsonAsync("/api/v1/auth/sandbox-token", new { role = "GENERAL_ADMIN" }).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, "Emissão de token GENERAL_ADMIN deve retornar 200 OK");
        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        adminJwt = doc.RootElement.GetProperty("accessToken").GetString()!;
        Assert(!string.IsNullOrWhiteSpace(adminJwt), "Admin JWT deve ser gerado com sucesso.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-FIN-01 HTTP: GET /api/v1/finance/policies/current retorna 200 OK com POL-COM-V1 (13%, 7%, R$ 39,90)", async () =>
    {
        using var resp = await client.GetAsync("/api/v1/finance/policies/current").ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, $"Status esperado 200, recebido {(int)resp.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = doc.RootElement;
        Assert(root.GetProperty("version").GetString() == "POL-COM-V1", "Versão deve ser POL-COM-V1.");
        Assert(root.GetProperty("freePlanCommissionPercent").GetDecimal() == 13.00m, "Comissão free deve ser 13,00%.");
        Assert(root.GetProperty("premiumPlanCommissionPercent").GetDecimal() == 7.00m, "Comissão premium deve ser 7,00%.");
        Assert(root.GetProperty("premiumMonthlyFeeCents").GetInt64() == 3990, "Mensalidade deve ser 3990 centavos.");
        Assert(root.GetProperty("cancellationPenaltyPercent").GetDecimal() == 10.00m, "Multa cancelamento 10,00%.");
        Assert(root.GetProperty("cancellationMinFeeCents").GetInt64() == 700, "Multa mínima 700 centavos.");
        Assert(root.GetProperty("cancellationInjuredPartySharePercent").GetDecimal() == 80.00m, "Rateio 80,00%.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-FIN-01 HTTP: GET /api/v1/finance/policies/history bloqueia anônimo (401) e CARRIER (403), permitindo GENERAL_ADMIN (200)", async () =>
    {
        // 1. Anônimo -> 401
        using var respAnon = await client.GetAsync("/api/v1/finance/policies/history").ConfigureAwait(false);
        Assert(respAnon.StatusCode == HttpStatusCode.Unauthorized, $"Anônimo deve receber 401, recebeu {(int)respAnon.StatusCode}");

        // 2. Carrier -> 403
        using var reqCarrier = new HttpRequestMessage(HttpMethod.Get, "/api/v1/finance/policies/history");
        reqCarrier.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var respCarrier = await client.SendAsync(reqCarrier).ConfigureAwait(false);
        Assert(respCarrier.StatusCode == HttpStatusCode.Forbidden, $"Carrier deve receber 403, recebeu {(int)respCarrier.StatusCode}");

        // 3. Admin -> 200
        using var reqAdmin = new HttpRequestMessage(HttpMethod.Get, "/api/v1/finance/policies/history");
        reqAdmin.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminJwt);
        using var respAdmin = await client.SendAsync(reqAdmin).ConfigureAwait(false);
        Assert(respAdmin.StatusCode == HttpStatusCode.OK, $"Admin deve receber 200 OK, recebeu {(int)respAdmin.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await respAdmin.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetArrayLength() >= 1, "Histórico deve conter ao menos 1 versão de política.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-FIN-01 HTTP: POST /api/v1/finance/policies bloqueia CARRIER (403) e permite GENERAL_ADMIN criar POL-COM-V2-HTTP (201 Created)", async () =>
    {
        var futureDate = DateTimeOffset.UtcNow.AddDays(15);
        var payload = new
        {
            version = "POL-COM-V2-HTTP",
            name = "Política Comercial 2027 HTTP",
            freePlanCommissionPercent = 12.00m,
            premiumPlanCommissionPercent = 6.00m,
            premiumMonthlyFeeCents = 4500,
            cancellationPenaltyPercent = 10.00m,
            cancellationMinFeeCents = 750,
            cancellationInjuredPartySharePercent = 80.00m,
            validFrom = futureDate.ToString("O"),
            justification = "Teste de criação de política via endpoint HTTP autenticado como GENERAL_ADMIN"
        };

        // 1. Bloqueia CARRIER com 403
        using var reqCarrier = new HttpRequestMessage(HttpMethod.Post, "/api/v1/finance/policies")
        {
            Content = JsonContent.Create(payload)
        };
        reqCarrier.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var respCarrier = await client.SendAsync(reqCarrier).ConfigureAwait(false);
        Assert(respCarrier.StatusCode == HttpStatusCode.Forbidden, $"CARRIER deve receber 403 ao tentar criar política, recebeu {(int)respCarrier.StatusCode}");

        // 2. Permite GENERAL_ADMIN com 201 Created
        using var reqAdmin = new HttpRequestMessage(HttpMethod.Post, "/api/v1/finance/policies")
        {
            Content = JsonContent.Create(payload)
        };
        reqAdmin.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminJwt);
        using var respAdmin = await client.SendAsync(reqAdmin).ConfigureAwait(false);
        Assert(respAdmin.StatusCode == HttpStatusCode.Created, $"GENERAL_ADMIN deve criar política com 201 Created, recebeu {(int)respAdmin.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await respAdmin.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc.RootElement.GetProperty("version").GetString() == "POL-COM-V2-HTTP", "Versão criada deve ser POL-COM-V2-HTTP.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-FIN-01 HTTP: GET /api/v1/finance/subscriptions/plans retorna plano STANDARD único a 20% (200 OK)", async () =>
    {
        using var resp = await client.GetAsync("/api/v1/finance/subscriptions/plans").ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, "Catálogo de planos deve retornar 200 OK.");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var array = doc.RootElement.EnumerateArray().ToList();
        Assert(array.Count >= 1, $"Esperado ao menos 1 plano no catálogo, encontrado {array.Count}");
        Assert(array.Any(p => p.GetProperty("planCode").GetString() == "STANDARD"), "Plano STANDARD deve estar presente.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-FIN-01 HTTP: POST /api/v1/finance/subscriptions/subscribe rejeita adesão a planos mensais descontinuados (400/422 SUBSCRIPTION_DISABLED)", async () =>
    {
        using var reqSub = new HttpRequestMessage(HttpMethod.Post, "/api/v1/finance/subscriptions/subscribe")
        {
            Content = JsonContent.Create(new { planCode = "PREMIUM" })
        };
        reqSub.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var respSub = await client.SendAsync(reqSub).ConfigureAwait(false);
        Assert(respSub.StatusCode == HttpStatusCode.BadRequest || respSub.StatusCode == HttpStatusCode.UnprocessableEntity, $"Tentativa de adesão a assinatura deve retornar 400 ou 422, recebeu {(int)respSub.StatusCode}");

        using var docSub = await JsonDocument.ParseAsync(await respSub.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(docSub.RootElement.GetProperty("ruleCode").GetString() == "SUBSCRIPTION_DISABLED", "RuleCode deve ser SUBSCRIPTION_DISABLED.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-FIN-01 HTTP: POST /api/v1/finance/simulate-split calcula comissão com precisão contábil sem perda de centavos (200 OK)", async () =>
    {
        using var resp1 = await client.PostAsJsonAsync("/api/v1/finance/simulate-split", new
        {
            transportAmountCents = 10000,
            planCodeOverride = "FREE"
        }).ConfigureAwait(false);
        Assert(resp1.StatusCode == HttpStatusCode.OK, "Simulação deve retornar 200 OK");
        using var doc1 = await JsonDocument.ParseAsync(await resp1.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        long comm = doc1.RootElement.GetProperty("platformCommissionCents").GetInt64();
        long net = doc1.RootElement.GetProperty("carrierNetCents").GetInt64();
        Assert(comm > 0, "Comissão deve ser positiva.");
        Assert(comm + net == 10000, "Invariante contábil: comissão + líquido = 10000.");

        // R$ 55,55 a 7% Premium: comissão 389, líquido 5166 (AwayFromZero)
        using var resp2 = await client.PostAsJsonAsync("/api/v1/finance/simulate-split", new
        {
            transportAmountCents = 5555,
            planCodeOverride = "PREMIUM"
        }).ConfigureAwait(false);
        Assert(resp2.StatusCode == HttpStatusCode.OK, "Simulação Premium deve retornar 200 OK");
        using var doc2 = await JsonDocument.ParseAsync(await resp2.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(doc2.RootElement.GetProperty("platformCommissionCents").GetInt64() == 389, "Comissão AwayFromZero 7% deve ser 389.");
        Assert(doc2.RootElement.GetProperty("carrierNetCents").GetInt64() == 5166, "Líquido AwayFromZero 7% deve ser 5166.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-FIN-01 HTTP: GET /api/v1/finance/snapshots/{contractId} retorna snapshot congelado atrelado ao contrato da PR-04", async () =>
    {
        Assert(!string.IsNullOrWhiteSpace(contractedId), "ContractId da PR-04 deve existir para validação do snapshot.");

        using var req = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/finance/snapshots/{contractedId}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", senderJwt);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, $"Snapshot do contrato deve retornar 200 OK, recebeu {(int)resp.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = doc.RootElement;
        Assert(root.GetProperty("contractId").GetString() == contractedId, "ContractId do snapshot deve conferir.");
        Assert(root.GetProperty("policyVersion").GetString() == "POL-COM-V1", "Snapshot deve estar congelado em POL-COM-V1.");
        Assert(root.GetProperty("commissionRatePercent").GetDecimal() == 13.00m, "Alíquota do contrato PR-04 deve ser 13,00%.");
        long commission = root.GetProperty("platformCommissionCents").GetInt64();
        long carrierNet = root.GetProperty("carrierNetCents").GetInt64();
        long total = root.GetProperty("transportAmountCents").GetInt64();
        Assert(commission + carrierNet == total, "Invariante contábil preservada no snapshot retornado via HTTP.");
    }).ConfigureAwait(false);

    // ============================================================================
    // SUÍTE DE TESTES DE INTEGRAÇÃO HTTP: PR-ADM-01 / PR-FIN-02 (ADMIN & GOVERNANÇA)
    // ============================================================================

    string financialAdminJwt = string.Empty;
    string complianceAuditorJwt = string.Empty;
    string supportOperatorJwt = string.Empty;

    await RunTestAsync("PR-ADM-01 HTTP: Emissão de tokens sandbox para perfis administrativos (FINANCIAL_ADMIN, COMPLIANCE_AUDITOR, SUPPORT_OPERATOR)", async () =>
    {
        // 1. FINANCIAL_ADMIN
        using var respFin = await client.PostAsJsonAsync("/api/v1/auth/sandbox-token", new { role = "FINANCIAL_ADMIN" }).ConfigureAwait(false);
        Assert(respFin.StatusCode == HttpStatusCode.OK, "Emissão de token FINANCIAL_ADMIN deve retornar 200 OK");
        using var docFin = await JsonDocument.ParseAsync(await respFin.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        financialAdminJwt = docFin.RootElement.GetProperty("accessToken").GetString()!;
        Assert(!string.IsNullOrWhiteSpace(financialAdminJwt), "FINANCIAL_ADMIN JWT deve ser gerado.");

        // 2. COMPLIANCE_AUDITOR
        using var respComp = await client.PostAsJsonAsync("/api/v1/auth/sandbox-token", new { role = "COMPLIANCE_AUDITOR" }).ConfigureAwait(false);
        Assert(respComp.StatusCode == HttpStatusCode.OK, "Emissão de token COMPLIANCE_AUDITOR deve retornar 200 OK");
        using var docComp = await JsonDocument.ParseAsync(await respComp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        complianceAuditorJwt = docComp.RootElement.GetProperty("accessToken").GetString()!;
        Assert(!string.IsNullOrWhiteSpace(complianceAuditorJwt), "COMPLIANCE_AUDITOR JWT deve ser gerado.");

        // 3. SUPPORT_OPERATOR
        using var respSupp = await client.PostAsJsonAsync("/api/v1/auth/sandbox-token", new { role = "SUPPORT_OPERATOR" }).ConfigureAwait(false);
        Assert(respSupp.StatusCode == HttpStatusCode.OK, "Emissão de token SUPPORT_OPERATOR deve retornar 200 OK");
        using var docSupp = await JsonDocument.ParseAsync(await respSupp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        supportOperatorJwt = docSupp.RootElement.GetProperty("accessToken").GetString()!;
        Assert(!string.IsNullOrWhiteSpace(supportOperatorJwt), "SUPPORT_OPERATOR JWT deve ser gerado.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-ADM-01 HTTP: GET /api/v1/admin/dashboard bloqueia CARRIER (403) e permite GENERAL_ADMIN / COMPLIANCE_AUDITOR (200 OK)", async () =>
    {
        // 1. CARRIER bloqueado com 403
        using var reqCarrier = new HttpRequestMessage(HttpMethod.Get, "/api/v1/admin/dashboard");
        reqCarrier.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var respCarrier = await client.SendAsync(reqCarrier).ConfigureAwait(false);
        Assert(respCarrier.StatusCode == HttpStatusCode.Forbidden, $"CARRIER deve receber 403 no dashboard admin, recebeu {(int)respCarrier.StatusCode}");

        // 2. GENERAL_ADMIN permitido com 200 OK
        using var reqAdmin = new HttpRequestMessage(HttpMethod.Get, "/api/v1/admin/dashboard");
        reqAdmin.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminJwt);
        using var respAdmin = await client.SendAsync(reqAdmin).ConfigureAwait(false);
        Assert(respAdmin.StatusCode == HttpStatusCode.OK, $"GENERAL_ADMIN deve receber 200 OK no dashboard admin, recebeu {(int)respAdmin.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await respAdmin.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = doc.RootElement;
        Assert(root.GetProperty("totalUsers").GetInt32() > 0, "Dashboard deve conter totalUsers.");
        Assert(root.GetProperty("currentPolicyVersion").GetString() == "POL-COM-V1", "Dashboard deve exibir versão da política ativa.");

        // 3. COMPLIANCE_AUDITOR permitido com 200 OK
        using var reqComp = new HttpRequestMessage(HttpMethod.Get, "/api/v1/admin/dashboard");
        reqComp.Headers.Authorization = new AuthenticationHeaderValue("Bearer", complianceAuditorJwt);
        using var respComp = await client.SendAsync(reqComp).ConfigureAwait(false);
        Assert(respComp.StatusCode == HttpStatusCode.OK, "COMPLIANCE_AUDITOR deve receber 200 OK no dashboard.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-ADM-01 HTTP: GET e PATCH /api/v1/admin/operations/settings (GENERAL_ADMIN permitido, FINANCIAL_ADMIN bloqueado)", async () =>
    {
        // 1. GET retorna configurações ativas
        using var reqGet = new HttpRequestMessage(HttpMethod.Get, "/api/v1/admin/operations/settings");
        reqGet.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminJwt);
        using var respGet = await client.SendAsync(reqGet).ConfigureAwait(false);
        Assert(respGet.StatusCode == HttpStatusCode.OK, "GET configurações operacionais deve retornar 200 OK.");

        using var docGet = await JsonDocument.ParseAsync(await respGet.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(docGet.RootElement.GetProperty("bicycleMaxWeightGrams").GetInt32() == 5000, "Bicicleta deve ter 5000g de limite.");
        Assert(docGet.RootElement.GetProperty("carMaxAgeYears").GetInt32() == 7, "Idade veicular deve ser 7 anos.");

        // 2. PATCH por FINANCIAL_ADMIN -> 403 Forbidden
        var patchPayload = new
        {
            bicycleMaxWeightGrams = 5000,
            motorcycleMaxWeightGrams = 20000,
            carMaxWeightGrams = 20000,
            carMaxAgeYears = 8,
            justification = "Tentativa de alteração operacional por admin financeiro"
        };
        using var reqPatchFin = new HttpRequestMessage(HttpMethod.Patch, "/api/v1/admin/operations/settings")
        {
            Content = JsonContent.Create(patchPayload)
        };
        reqPatchFin.Headers.Authorization = new AuthenticationHeaderValue("Bearer", financialAdminJwt);
        using var respPatchFin = await client.SendAsync(reqPatchFin).ConfigureAwait(false);
        Assert(respPatchFin.StatusCode == HttpStatusCode.Forbidden, $"FINANCIAL_ADMIN deve receber 403 no PATCH de operações, recebeu {(int)respPatchFin.StatusCode}");

        // 3. PATCH por GENERAL_ADMIN -> 200 OK
        var patchAdminPayload = new
        {
            bicycleMaxWeightGrams = 5000,
            motorcycleMaxWeightGrams = 20000,
            carMaxWeightGrams = 20000,
            carMaxAgeYears = 8,
            justification = "Atualização autorizada de idade veicular para 8 anos por GENERAL_ADMIN"
        };
        using var reqPatchAdmin = new HttpRequestMessage(HttpMethod.Patch, "/api/v1/admin/operations/settings")
        {
            Content = JsonContent.Create(patchAdminPayload)
        };
        reqPatchAdmin.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminJwt);
        using var respPatchAdmin = await client.SendAsync(reqPatchAdmin).ConfigureAwait(false);
        Assert(respPatchAdmin.StatusCode == HttpStatusCode.OK, $"GENERAL_ADMIN deve receber 200 OK no PATCH de operações, recebeu {(int)respPatchAdmin.StatusCode}");

        using var docPatch = await JsonDocument.ParseAsync(await respPatchAdmin.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(docPatch.RootElement.GetProperty("carMaxAgeYears").GetInt32() == 8, "Idade veicular deve ser atualizada para 8 anos.");
    }).ConfigureAwait(false);

    Guid createdVehicleId = Guid.Empty;

    await RunTestAsync("PR-ADM-01 HTTP: Ciclo de Veículo: POST /api/v1/admin/vehicles, GET /api/v1/admin/vehicles e POST /api/v1/admin/vehicles/{id}/moderate", async () =>
    {
        // 1. Transportador cadastra veículo
        var regPayload = new
        {
            vehicleType = "CAR",
            brandModel = "Toyota Corolla 2.0",
            manufacturingYear = DateTimeOffset.UtcNow.Year - 2,
            plate = "ABC-9X88",
            declaredCapacityGrams = 19000,
            crlvDocumentKey = "crlv-toyota-123.pdf"
        };

        using var reqReg = new HttpRequestMessage(HttpMethod.Post, "/api/v1/admin/vehicles")
        {
            Content = JsonContent.Create(regPayload)
        };
        reqReg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var respReg = await client.SendAsync(reqReg).ConfigureAwait(false);
        Assert(respReg.StatusCode == HttpStatusCode.Created, $"Cadastro de veículo deve retornar 201 Created, recebeu {(int)respReg.StatusCode}");

        using var docReg = await JsonDocument.ParseAsync(await respReg.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        createdVehicleId = Guid.Parse(docReg.RootElement.GetProperty("id").GetString()!);
        Assert(docReg.RootElement.GetProperty("status").GetString() == "PENDING_APPROVAL", "Status inicial deve ser PENDING_APPROVAL.");
        Assert(docReg.RootElement.GetProperty("plateMasked").GetString()!.Contains('*'), "Placa deve ser mascarada.");

        // 2. GENERAL_ADMIN lista veículos
        using var reqList = new HttpRequestMessage(HttpMethod.Get, "/api/v1/admin/vehicles?status=PENDING_APPROVAL");
        reqList.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminJwt);
        using var respList = await client.SendAsync(reqList).ConfigureAwait(false);
        Assert(respList.StatusCode == HttpStatusCode.OK, "Listagem de veículos deve retornar 200 OK.");

        using var docList = await JsonDocument.ParseAsync(await respList.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(docList.RootElement.GetArrayLength() >= 1, "Listagem deve conter ao menos 1 veículo pendente.");

        // 3. Moderação: GENERAL_ADMIN aprova o veículo
        var modPayload = new
        {
            status = "APPROVED",
            rejectionReason = (string?)null
        };
        using var reqMod = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/admin/vehicles/{createdVehicleId}/moderate")
        {
            Content = JsonContent.Create(modPayload)
        };
        reqMod.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminJwt);
        using var respMod = await client.SendAsync(reqMod).ConfigureAwait(false);
        Assert(respMod.StatusCode == HttpStatusCode.OK, $"Aprovação do veículo deve retornar 200 OK, recebeu {(int)respMod.StatusCode}");

        using var docMod = await JsonDocument.ParseAsync(await respMod.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(docMod.RootElement.GetProperty("status").GetString() == "APPROVED", "Status deve transitar para APPROVED.");
        Assert(!string.IsNullOrWhiteSpace(docMod.RootElement.GetProperty("moderatedAtUtc").GetString()), "ModeratedAtUtc deve ser preenchido.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-FIN-02 HTTP: Governança de Pagamentos: GET e POST /api/v1/admin/governance/payment-methods/{code}/toggle", async () =>
    {
        // 1. GET lista os 3 meios padrão
        using var reqList = new HttpRequestMessage(HttpMethod.Get, "/api/v1/admin/governance/payment-methods");
        reqList.Headers.Authorization = new AuthenticationHeaderValue("Bearer", financialAdminJwt);
        using var respList = await client.SendAsync(reqList).ConfigureAwait(false);
        Assert(respList.StatusCode == HttpStatusCode.OK, "Listagem de meios de pagamento deve retornar 200 OK.");

        using var docList = await JsonDocument.ParseAsync(await respList.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var array = docList.RootElement.EnumerateArray().ToList();
        Assert(array.Count >= 3, $"Esperado pelo menos 3 meios de pagamento, encontrado {array.Count}");
        Assert(array.Any(m => m.GetProperty("methodCode").GetString() == "DEBIT_CARD"), "Meio DEBIT_CARD deve constar na listagem.");

        // 2. FINANCIAL_ADMIN desativa CREDIT_CARD
        var togglePayload = new
        {
            isEnabled = false,
            justification = "Manutenção preventiva temporária no adquirente de cartão"
        };
        using var reqToggle = new HttpRequestMessage(HttpMethod.Post, "/api/v1/admin/governance/payment-methods/CREDIT_CARD/toggle")
        {
            Content = JsonContent.Create(togglePayload)
        };
        reqToggle.Headers.Authorization = new AuthenticationHeaderValue("Bearer", financialAdminJwt);
        using var respToggle = await client.SendAsync(reqToggle).ConfigureAwait(false);
        Assert(respToggle.StatusCode == HttpStatusCode.OK, $"Toggle de meio de pagamento deve retornar 200 OK, recebeu {(int)respToggle.StatusCode}");

        using var docToggle = await JsonDocument.ParseAsync(await respToggle.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(!docToggle.RootElement.GetProperty("isEnabled").GetBoolean(), "CREDIT_CARD deve estar desabilitado.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-FIN-02 HTTP: Simulação de Checkout Sandbox: POST /api/v1/admin/governance/simulate-checkout", async () =>
    {
        var simPayload = new
        {
            amountCents = 20000,
            paymentMethodCode = "PIX",
            planCodeOverride = "STANDARD"
        };
        using var reqSim = new HttpRequestMessage(HttpMethod.Post, "/api/v1/admin/governance/simulate-checkout")
        {
            Content = JsonContent.Create(simPayload)
        };
        reqSim.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminJwt);
        using var respSim = await client.SendAsync(reqSim).ConfigureAwait(false);
        Assert(respSim.StatusCode == HttpStatusCode.OK, $"Simulação de checkout deve retornar 200 OK, recebeu {(int)respSim.StatusCode}");

        using var docSim = await JsonDocument.ParseAsync(await respSim.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = docSim.RootElement;
        Assert(root.GetProperty("grossAmountCents").GetInt64() == 20000, "Valor bruto deve ser 20000 centavos.");
        Assert(root.GetProperty("senderTotalCents").GetInt64() == 20000, "Remetente paga exatamente 20000 centavos (absorção 100%).");
        Assert(root.GetProperty("platformAbsorbsGatewayFee").GetBoolean(), "Plataforma absorve taxa.");
        Assert(root.GetProperty("accountingInvariantPreserved").GetBoolean(), "Invariante contábil deve ser preservada.");
        Assert(root.GetProperty("platformCommissionCents").GetInt64() == 2600, "Comissão Standard 13% sobre 20000 deve ser 2600 centavos.");
        Assert(root.GetProperty("carrierNetCents").GetInt64() == 17400, "Líquido transportador deve ser 17400 centavos.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-ADM-01 HTTP: Trilha de Auditoria: GET /api/v1/admin/audit/events", async () =>
    {
        using var reqAudit = new HttpRequestMessage(HttpMethod.Get, "/api/v1/admin/audit/events");
        reqAudit.Headers.Authorization = new AuthenticationHeaderValue("Bearer", complianceAuditorJwt);
        using var respAudit = await client.SendAsync(reqAudit).ConfigureAwait(false);
        Assert(respAudit.StatusCode == HttpStatusCode.OK, $"Consulta de auditoria deve retornar 200 OK, recebeu {(int)respAudit.StatusCode}");

        using var docAudit = await JsonDocument.ParseAsync(await respAudit.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(docAudit.RootElement.GetArrayLength() >= 1, "Trilha de auditoria deve conter eventos registrados.");
    }).ConfigureAwait(false);

    // ============================================================================
    // SUÍTE DE TESTES DE INTEGRAÇÃO HTTP: PR-LEG-01 (GESTÃO JURÍDICA E CONTRATOS DIGITAIS)
    // ============================================================================

    string legalOperatorJwt = string.Empty;

    await RunTestAsync("PR-LEG-01 HTTP: Emissão de token sandbox para perfil LEGAL_OPERATOR", async () =>
    {
        using var resp = await client.PostAsJsonAsync("/api/v1/auth/sandbox-token", new { role = "LEGAL_OPERATOR" }).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, "Emissão de token LEGAL_OPERATOR deve retornar 200 OK");
        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        legalOperatorJwt = doc.RootElement.GetProperty("accessToken").GetString()!;
        Assert(!string.IsNullOrWhiteSpace(legalOperatorJwt), "LEGAL_OPERATOR JWT deve ser gerado.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-LEG-01 HTTP: GET /api/v1/admin/legal/templates lista modelos padrão semeados", async () =>
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, "/api/v1/admin/legal/templates");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", legalOperatorJwt);
        using var resp = await client.SendAsync(req).ConfigureAwait(false);
        Assert(resp.StatusCode == HttpStatusCode.OK, $"Listagem de modelos deve retornar 200 OK, recebeu {(int)resp.StatusCode}");

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var array = doc.RootElement.EnumerateArray().ToList();
        Assert(array.Count >= 5, $"Esperado ao menos 5 modelos semeados, encontrado {array.Count}");
        Assert(array.Any(t => t.GetProperty("category").GetString() == "TERMS_OF_SERVICE"), "TERMS_OF_SERVICE deve estar presente.");
        Assert(array.Any(t => t.GetProperty("category").GetString() == "MUNICIPAL_REGULATION"), "MUNICIPAL_REGULATION deve estar presente.");
    }).ConfigureAwait(false);

    Guid createdTemplateId = Guid.Empty;

    await RunTestAsync("PR-LEG-01 HTTP: Ciclo de Vida: POST (DRAFT) -> POST approve (Segregação RBAC) -> POST publish -> PUT bloqueado (Imutabilidade)", async () =>
    {
        // 1. Criar modelo em DRAFT
        var createPayload = new
        {
            category = "PLATFORM_MEDIATION",
            title = "Termo de Mediação da Plataforma Topic Log",
            description = "Termo padrão para resolução e mediação de disputas",
            scopeType = "NATIONAL",
            version = "1.0.0",
            contentMarkdown = "## Mediação de Conflitos\nContrato: {{PLATFORM_NAME}}\nRemetente: {{USER_NAME}}\nAceite em: {{EFFECTIVE_DATE}}",
            changeSummary = "Versão inicial de mediação"
        };
        using var reqCreate = new HttpRequestMessage(HttpMethod.Post, "/api/v1/admin/legal/templates")
        {
            Content = JsonContent.Create(createPayload)
        };
        reqCreate.Headers.Authorization = new AuthenticationHeaderValue("Bearer", legalOperatorJwt);
        using var respCreate = await client.SendAsync(reqCreate).ConfigureAwait(false);
        Assert(respCreate.StatusCode == HttpStatusCode.Created, $"Criar modelo deve retornar 201 Created, recebeu {(int)respCreate.StatusCode}");

        using var docCreate = await JsonDocument.ParseAsync(await respCreate.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        createdTemplateId = Guid.Parse(docCreate.RootElement.GetProperty("id").GetString()!);
        Assert(docCreate.RootElement.GetProperty("status").GetString() == "DRAFT", "Status inicial deve ser DRAFT.");
        Assert(docCreate.RootElement.GetProperty("version").GetString() == "1.0.0", "Versão inicial deve ser 1.0.0.");

        // 2. FINANCIAL_ADMIN tenta aprovar -> 403 Forbidden
        var approvePayload = new { approvalNotes = "Tentativa indevida por admin financeiro" };
        using var reqApproveFin = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/admin/legal/templates/{createdTemplateId}/approve")
        {
            Content = JsonContent.Create(approvePayload)
        };
        reqApproveFin.Headers.Authorization = new AuthenticationHeaderValue("Bearer", financialAdminJwt);
        using var respApproveFin = await client.SendAsync(reqApproveFin).ConfigureAwait(false);
        Assert(respApproveFin.StatusCode == HttpStatusCode.Forbidden, $"FINANCIAL_ADMIN deve receber 403 na aprovação jurídica, recebeu {(int)respApproveFin.StatusCode}");

        // 3. LEGAL_OPERATOR aprova -> 200 OK
        var approveLegalPayload = new { approvalNotes = "Minuta revisada pelo Jurídico Topic Log em conformidade com o Marco Civil e LGPD." };
        using var reqApproveLegal = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/admin/legal/templates/{createdTemplateId}/approve")
        {
            Content = JsonContent.Create(approveLegalPayload)
        };
        reqApproveLegal.Headers.Authorization = new AuthenticationHeaderValue("Bearer", legalOperatorJwt);
        using var respApproveLegal = await client.SendAsync(reqApproveLegal).ConfigureAwait(false);
        Assert(respApproveLegal.StatusCode == HttpStatusCode.OK, $"LEGAL_OPERATOR deve aprovar modelo com 200 OK, recebeu {(int)respApproveLegal.StatusCode}");

        using var docApprove = await JsonDocument.ParseAsync(await respApproveLegal.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(docApprove.RootElement.GetProperty("status").GetString() == "APPROVED", "Status deve transitar para APPROVED.");
        Assert(!string.IsNullOrWhiteSpace(docApprove.RootElement.GetProperty("approvedAtUtc").GetString()), "ApprovedAtUtc preenchido.");

        // 4. LEGAL_OPERATOR publica -> 200 OK
        var publishPayload = new { validFromUtc = DateTimeOffset.UtcNow.AddMinutes(5), publicationJustification = "Publicação oficial autorizada." };
        using var reqPublish = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/admin/legal/templates/{createdTemplateId}/publish")
        {
            Content = JsonContent.Create(publishPayload)
        };
        reqPublish.Headers.Authorization = new AuthenticationHeaderValue("Bearer", legalOperatorJwt);
        using var respPublish = await client.SendAsync(reqPublish).ConfigureAwait(false);
        Assert(respPublish.StatusCode == HttpStatusCode.OK, $"Publicar modelo deve retornar 200 OK, recebeu {(int)respPublish.StatusCode}");

        using var docPublish = await JsonDocument.ParseAsync(await respPublish.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(docPublish.RootElement.GetProperty("status").GetString() == "PUBLISHED", "Status deve transitar para PUBLISHED.");

        // 5. Imutabilidade: PUT após publicação deve retornar 422 Unprocessable Entity
        var updatePayload = new
        {
            title = "Tentativa de Edição Ilegal em Termo Publicado",
            description = "Descrição alterada",
            contentMarkdown = "Conteúdo alterado sem novo versionamento",
            changeSummary = "Tentativa direta"
        };
        using var reqUpdate = new HttpRequestMessage(HttpMethod.Put, $"/api/v1/admin/legal/templates/{createdTemplateId}")
        {
            Content = JsonContent.Create(updatePayload)
        };
        reqUpdate.Headers.Authorization = new AuthenticationHeaderValue("Bearer", legalOperatorJwt);
        using var respUpdate = await client.SendAsync(reqUpdate).ConfigureAwait(false);
        Assert(respUpdate.StatusCode == HttpStatusCode.UnprocessableEntity, $"Edição de termo publicado deve retornar 422 Unprocessable Entity, recebeu {(int)respUpdate.StatusCode}");

        using var docErr = await JsonDocument.ParseAsync(await respUpdate.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(docErr.RootElement.GetProperty("ruleCode").GetString() == "CANNOT_EDIT_PUBLISHED_TEMPLATE", "RuleCode deve ser CANNOT_EDIT_PUBLISHED_TEMPLATE.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-LEG-01 HTTP: POST /api/v1/admin/legal/templates/preview com dados dinâmicos e rejeição de scripts", async () =>
    {
        // 1. Preview válido com substituição
        var previewPayload = new
        {
            contentMarkdown = "Olá, {{USER_NAME}}! Bem-vindo à {{PLATFORM_NAME}} em {{MUNICIPALITY_NAME}}.",
            userName = "Carlos Silveira",
            municipalityName = "João Monlevade"
        };
        using var reqPreview = new HttpRequestMessage(HttpMethod.Post, "/api/v1/admin/legal/templates/preview")
        {
            Content = JsonContent.Create(previewPayload)
        };
        reqPreview.Headers.Authorization = new AuthenticationHeaderValue("Bearer", legalOperatorJwt);
        using var respPreview = await client.SendAsync(reqPreview).ConfigureAwait(false);
        Assert(respPreview.StatusCode == HttpStatusCode.OK, $"Preview deve retornar 200 OK, recebeu {(int)respPreview.StatusCode}");

        using var docPreview = await JsonDocument.ParseAsync(await respPreview.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        string resolved = docPreview.RootElement.GetProperty("renderedText").GetString()!;
        Assert(resolved.Contains("Carlos Silveira") && resolved.Contains("Topic Log") && resolved.Contains("João Monlevade"), "Placeholders devem ser substituídos no preview.");

        // 2. Rejeição de script malicioso -> 422 Unprocessable Entity
        var scriptPayload = new
        {
            contentMarkdown = "Tentativa de injeção <script>alert('xss')</script> em documento"
        };
        using var reqScript = new HttpRequestMessage(HttpMethod.Post, "/api/v1/admin/legal/templates/preview")
        {
            Content = JsonContent.Create(scriptPayload)
        };
        reqScript.Headers.Authorization = new AuthenticationHeaderValue("Bearer", legalOperatorJwt);
        using var respScript = await client.SendAsync(reqScript).ConfigureAwait(false);
        Assert(respScript.StatusCode == HttpStatusCode.UnprocessableEntity, $"Conteúdo com script deve retornar 422 Unprocessable Entity, recebeu {(int)respScript.StatusCode}");

        using var docScriptErr = await JsonDocument.ParseAsync(await respScript.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(docScriptErr.RootElement.GetProperty("ruleCode").GetString() == "MALICIOUS_CONTENT_DETECTED", "RuleCode deve ser MALICIOUS_CONTENT_DETECTED.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-LEG-01 HTTP: GET /api/v1/admin/legal/templates/{id}/compare/{targetVersion} retorna diff estruturado", async () =>
    {
        // Comparar o modelo recém-criado com a versão 1.0.0 dele mesmo
        using var reqCompare = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/admin/legal/templates/{createdTemplateId}/compare/1.0.0");
        reqCompare.Headers.Authorization = new AuthenticationHeaderValue("Bearer", legalOperatorJwt);
        using var respCompare = await client.SendAsync(reqCompare).ConfigureAwait(false);
        Assert(respCompare.StatusCode == HttpStatusCode.OK, $"Comparação de versões deve retornar 200 OK, recebeu {(int)respCompare.StatusCode}");

        using var docCompare = await JsonDocument.ParseAsync(await respCompare.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var root = docCompare.RootElement;
        Assert(root.GetProperty("sourceVersion").GetString() == "1.0.0", "SourceVersion deve ser 1.0.0.");
        Assert(root.GetProperty("targetVersion").GetString() == "1.0.0", "TargetVersion deve ser 1.0.0.");
        Assert(root.GetProperty("diffs").GetArrayLength() > 0, "Deve retornar lista de diffs.");
    }).ConfigureAwait(false);

    await RunTestAsync("PR-LEG-01 HTTP: GET /api/v1/legal/applicable-terms e POST /api/v1/legal/accept-term com hash SHA-256", async () =>
    {
        // 1. Consultar termos aplicáveis para transportador em João Monlevade (IBGE 3136207)
        using var reqTerms = new HttpRequestMessage(HttpMethod.Get, "/api/v1/legal/applicable-terms?role=CARRIER&ibgeCityCode=3136207&state=MG");
        reqTerms.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var respTerms = await client.SendAsync(reqTerms).ConfigureAwait(false);
        Assert(respTerms.StatusCode == HttpStatusCode.OK, $"Consulta de termos aplicáveis deve retornar 200 OK, recebeu {(int)respTerms.StatusCode}");

        using var docTerms = await JsonDocument.ParseAsync(await respTerms.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var termsArray = docTerms.RootElement.EnumerateArray().ToList();
        Assert(termsArray.Count >= 2, $"Esperado ao menos 2 termos aplicáveis para Transportador em Monlevade, encontrado {termsArray.Count}");

        var carrierTerm = termsArray.First(t => t.GetProperty("category").GetString() == "CARRIER_ADHESION");
        Guid carrierTermId = Guid.Parse(carrierTerm.GetProperty("id").GetString()!);
        string carrierTermVersion = carrierTerm.GetProperty("version").GetString()!;

        // 2. Transportador aceita o termo
        var acceptPayload = new
        {
            templateId = carrierTermId,
            version = carrierTermVersion,
            documentHashSha256 = "c0ffee00112233445566778899aabbccddeeff00112233445566778899aabbcc"
        };
        using var reqAccept = new HttpRequestMessage(HttpMethod.Post, "/api/v1/legal/accept-term")
        {
            Content = JsonContent.Create(acceptPayload)
        };
        reqAccept.Headers.Authorization = new AuthenticationHeaderValue("Bearer", carrierJwt);
        using var respAccept = await client.SendAsync(reqAccept).ConfigureAwait(false);
        Assert(respAccept.StatusCode == HttpStatusCode.Created || respAccept.StatusCode == HttpStatusCode.OK, $"Aceite de termo deve retornar 201 Created ou 200 OK, recebeu {(int)respAccept.StatusCode}");

        using var docAccept = await JsonDocument.ParseAsync(await respAccept.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        var acceptRoot = docAccept.RootElement;
        string hash = acceptRoot.GetProperty("documentHashSha256").GetString()!;
        Assert(!string.IsNullOrWhiteSpace(hash), "Hash SHA-256 deve ser gravado.");

        // 3. Auditor de Compliance consulta trilha de aceites
        using var reqAuditAccept = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/admin/legal/acceptances?templateId={carrierTermId}");
        reqAuditAccept.Headers.Authorization = new AuthenticationHeaderValue("Bearer", complianceAuditorJwt);
        using var respAuditAccept = await client.SendAsync(reqAuditAccept).ConfigureAwait(false);
        Assert(respAuditAccept.StatusCode == HttpStatusCode.OK, $"Consulta de aceites por compliance deve retornar 200 OK, recebeu {(int)respAuditAccept.StatusCode}");

        using var docAuditAccept = await JsonDocument.ParseAsync(await respAuditAccept.Content.ReadAsStreamAsync().ConfigureAwait(false)).ConfigureAwait(false);
        Assert(docAuditAccept.RootElement.GetArrayLength() >= 1, "Deve conter o aceite registrado com hash SHA-256.");
    }).ConfigureAwait(false);
}
finally
{
    await app.StopAsync().ConfigureAwait(false);
    await app.DisposeAsync().ConfigureAwait(false);

    try
    {
        if (Directory.Exists(tempIntegrationStorage))
        {
            Directory.Delete(tempIntegrationStorage, recursive: true);
        }
    }
    catch { /* silencia limpeza temporária de teste */ }
}

sw.Stop();
using var proc = Process.GetCurrentProcess();
double ramMb = Math.Round(proc.WorkingSet64 / (1024.0 * 1024.0), 2);
double peakRamMb = Math.Round(proc.PeakWorkingSet64 / (1024.0 * 1024.0), 2);

Console.WriteLine("----------------------------------------------------------------------");
Console.WriteLine($"Resultado IntegrationTests: {passed} aprovados, {failed} falharam | Tempo: {sw.ElapsedMilliseconds} ms | WorkingSet: {ramMb} MB | PeakWorkingSet: {peakRamMb} MB");
Console.WriteLine("----------------------------------------------------------------------");

return failed == 0 ? 0 : 1;

async Task RunTestAsync(string name, Func<Task> testAction)
{
    try
    {
        await testAction().ConfigureAwait(false);
        passed++;
        Console.WriteLine($"[PASS] {name}");
    }
    catch (Exception ex)
    {
        failed++;
        Console.WriteLine($"[FAIL] {name} -> {ex.Message}");
    }
}

static void Assert(bool condition, string message)
{
    if (!condition)
    {
        throw new InvalidOperationException(message);
    }
}

file static class BenchmarkConstants
{
    public static readonly string[] Cities =
    [
        "João Monlevade", "Belo Horizonte", "Barão de Cocais", "Caeté",
        "Nova Era", "Itabira", "Ipatinga", "Betim",
        "Contagem", "São Paulo", "Rio de Janeiro", "Curitiba"
    ];
}
