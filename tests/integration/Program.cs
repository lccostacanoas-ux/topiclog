using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using TopicLog.Api;
using TopicLog.Api.Common.Middleware;
using TopicLog.Api.Modules.Identity;

Console.WriteLine("======================================================================");
Console.WriteLine("TopicLog.IntegrationTests (.NET 10 LTS) — Executando suíte HTTP PR-00 + PR-01.1");
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
