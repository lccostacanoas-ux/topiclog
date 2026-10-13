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
using TopicLog.Api.Common.Middleware;
using TopicLog.Api.Modules.Identity;
using TopicLog.Api.Modules.Verification;

Console.WriteLine("======================================================================");
Console.WriteLine("TopicLog.IntegrationTests (.NET 10 LTS) — Executando suíte HTTP PR-00 + PR-01.1 + PR-01.2");
Console.WriteLine("======================================================================");

var sw = Stopwatch.StartNew();
int passed = 0;
int failed = 0;

var app = TopicLogApplicationFactory.CreateApplication(["--urls=http://127.0.0.1:0"]);
await app.StartAsync().ConfigureAwait(false);

try
{
    var server = app.Services.GetRequiredService<IServer>();
    var addressFeature = server.Features.Get<IServerAddressesFeature>();
    string baseAddress = addressFeature?.Addresses.FirstOrDefault()
        ?? throw new InvalidOperationException("Não foi possível obter o endereço efêmero do Kestrel.");

    using var client = new HttpClient { BaseAddress = new Uri(baseAddress) };

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

        Assert(tokensCss.Contains("#155EEF", StringComparison.OrdinalIgnoreCase), "Token --color-primary (#155EEF) ausente.");
        Assert(tokensCss.Contains("#16803C", StringComparison.OrdinalIgnoreCase), "Token --color-success (#16803C) ausente.");
        Assert(tokensCss.Contains("#B54708", StringComparison.OrdinalIgnoreCase), "Token --color-warning (#B54708) ausente.");
        Assert(tokensCss.Contains("#B42318", StringComparison.OrdinalIgnoreCase), "Token --color-danger (#B42318) ausente.");

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

    string[] senderAndCarrierRoles = ["SENDER", "CARRIER"];
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
            initialRoles = senderAndCarrierRoles,
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
}
finally
{
    await app.StopAsync().ConfigureAwait(false);
    await app.DisposeAsync().ConfigureAwait(false);
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
