using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using TopicLog.Api;
using TopicLog.Api.Common.Middleware;

Console.WriteLine("======================================================================");
Console.WriteLine("TopicLog.IntegrationTests (.NET 10 LTS) — Executando suíte HTTP PR-00.2");
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
}
finally
{
    await app.StopAsync().ConfigureAwait(false);
    await app.DisposeAsync().ConfigureAwait(false);
}

sw.Stop();
using var proc = Process.GetCurrentProcess();
double ramMb = Math.Round(proc.WorkingSet64 / (1024.0 * 1024.0), 2);

Console.WriteLine("----------------------------------------------------------------------");
Console.WriteLine($"Resultado IntegrationTests: {passed} aprovados, {failed} falharam | Tempo: {sw.ElapsedMilliseconds} ms | RAM: {ramMb} MB");
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
