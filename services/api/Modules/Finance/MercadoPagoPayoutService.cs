using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace TopicLog.Api.Modules.Finance;

public sealed record MercadoPagoPixPayoutRequest(
    Guid OrderId,
    Guid ContractId,
    Guid CarrierId,
    string CarrierName,
    string? PixKeyType,
    string? PixKey,
    long NetAmountCents,
    string IdempotencyKey);

public sealed record MercadoPagoPixPayoutResult(
    string Status,
    long AmountCents,
    string? ProviderTransferId,
    string Message);

public interface IMercadoPagoPayoutService
{
    Task<MercadoPagoPixPayoutResult> ExecutePixPayoutAsync(
        MercadoPagoPixPayoutRequest request,
        CancellationToken cancellationToken = default);
}

public sealed class MercadoPagoPayoutService : IMercadoPagoPayoutService
{
    private static readonly HttpClient SharedHttpClient = new()
    {
        Timeout = TimeSpan.FromSeconds(15)
    };

    private readonly IConfiguration _configuration;

    public MercadoPagoPayoutService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public async Task<MercadoPagoPixPayoutResult> ExecutePixPayoutAsync(
        MercadoPagoPixPayoutRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request.NetAmountCents <= 0)
        {
            return new MercadoPagoPixPayoutResult(
                Status: "PENDING_MANUAL",
                AmountCents: 0,
                ProviderTransferId: null,
                Message: "Valor líquido do repasse zerado.");
        }

        if (string.IsNullOrWhiteSpace(request.PixKey))
        {
            return new MercadoPagoPixPayoutResult(
                Status: "PENDING_PIX_KEY",
                AmountCents: request.NetAmountCents,
                ProviderTransferId: null,
                Message: "Chave Pix não cadastrada no perfil do transportador. Cadastre sua chave Pix em Minha Conta para receber o repasse.");
        }

        string? accessToken =
            _configuration["MercadoPago:AccessToken"]
            ?? Environment.GetEnvironmentVariable("MERCADO_PAGO_ACCESS_TOKEN");

        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return new MercadoPagoPixPayoutResult(
                Status: "PENDING_MANUAL",
                AmountCents: request.NetAmountCents,
                ProviderTransferId: null,
                Message: $"Repasse líquido de R$ {(request.NetAmountCents / 100m):N2} liberado em custódia; aguardando transferência para a chave Pix cadastrada.");
        }

        var (normalizedType, normalizedKey) = NormalizePixKey(request.PixKeyType, request.PixKey);
        decimal amountBrl = Math.Round(request.NetAmountCents / 100m, 2, MidpointRounding.AwayFromZero);

        var payload = new
        {
            amount = amountBrl,
            description = $"Repasse TopicLog #{request.OrderId.ToString()[..8]}",
            external_reference = request.OrderId.ToString(),
            receiver = new
            {
                pix_key_type = normalizedType,
                pix_key = normalizedKey
            }
        };

        try
        {
            using var httpReq = new HttpRequestMessage(HttpMethod.Post, "https://api.mercadopago.com/v1/transfers");
            httpReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken.Trim());
            httpReq.Headers.TryAddWithoutValidation("X-Idempotency-Key", request.IdempotencyKey);
            httpReq.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

            using var resp = await SharedHttpClient.SendAsync(httpReq, cancellationToken).ConfigureAwait(false);
            string body = await resp.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);

            if (resp.IsSuccessStatusCode)
            {
                string? transferId = null;
                try
                {
                    using var doc = JsonDocument.Parse(body);
                    if (doc.RootElement.TryGetProperty("id", out var idProp))
                    {
                        transferId = idProp.ToString();
                    }
                }
                catch
                {
                    // ignore parse edge case
                }

                return new MercadoPagoPixPayoutResult(
                    Status: "SUCCEEDED",
                    AmountCents: request.NetAmountCents,
                    ProviderTransferId: transferId ?? $"mp_{request.IdempotencyKey}",
                    Message: $"Transferência Pix de R$ {amountBrl:N2} enviada automaticamente via Mercado Pago.");
            }

            string detail = ExtractErrorMessage(body);
            return new MercadoPagoPixPayoutResult(
                Status: "PENDING_MANUAL",
                AmountCents: request.NetAmountCents,
                ProviderTransferId: null,
                Message: $"Repasse de R$ {amountBrl:N2} liberado, mas o Mercado Pago retornou HTTP {(int)resp.StatusCode} ({detail}). Realize a transferência via painel Mercado Pago ou habilite a API de Payouts.");
        }
        catch (Exception ex)
        {
            return new MercadoPagoPixPayoutResult(
                Status: "PENDING_MANUAL",
                AmountCents: request.NetAmountCents,
                ProviderTransferId: null,
                Message: $"Repasse de R$ {amountBrl:N2} liberado; falha de comunicação com Mercado Pago ({ex.Message}).");
        }
    }

    private static (string Type, string Key) NormalizePixKey(string? rawType, string rawKey)
    {
        string key = rawKey.Trim();
        string t = (rawType ?? "CPF").Trim().ToUpperInvariant();

        return t switch
        {
            "CPF" => ("CPF", new string(key.Where(char.IsDigit).ToArray())),
            "CNPJ" => ("CNPJ", new string(key.Where(char.IsDigit).ToArray())),
            "TELEFONE" or "PHONE" => ("PHONE", FormatBrazilianPhone(key)),
            "EMAIL" => ("EMAIL", key.ToLowerInvariant()),
            _ => ("EVP", key)
        };
    }

    private static string FormatBrazilianPhone(string raw)
    {
        string digits = new(raw.Where(char.IsDigit).ToArray());
        if (digits.Length is 10 or 11)
        {
            return $"+55{digits}";
        }
        return raw.StartsWith('+') ? raw : $"+{digits}";
    }

    private static string ExtractErrorMessage(string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return "sem detalhes";
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("message", out var msg))
            {
                return msg.GetString() ?? "erro na API";
            }
        }
        catch
        {
            // ignore
        }
        return body.Length > 120 ? body[..120] : body;
    }
}
