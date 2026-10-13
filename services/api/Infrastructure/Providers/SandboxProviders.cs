using Microsoft.Extensions.Options;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Common.Options;

namespace TopicLog.Api.Infrastructure.Providers;

/// <summary>
/// Adaptador Asaas estritamente em modo Sandbox (D07, D12, D14, D17).
/// Nenhuma chamada externa real ou transação financeira ativa é executada na PR-00.
/// </summary>
public sealed class SandboxAsaasPaymentProvider : IPaymentProvider
{
    private readonly IOptions<FeatureFlagsOptions> _featureFlags;

    public SandboxAsaasPaymentProvider(IOptions<FeatureFlagsOptions> featureFlags)
    {
        _featureFlags = featureFlags;
    }

    public string ProviderName => "Asaas";

    public bool IsSandboxMode => !_featureFlags.Value.RealPaymentsEnabled && _featureFlags.Value.AsaasSandboxEnabled;

    public Task<SandboxChargeResult> CreateChargeAsync(
        CreateSandboxChargeRequest request,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        EnsureSandboxOnly();

        if (request.TransportAmountCents <= 0)
        {
            throw new DomainRuleViolationException(
                "INVALID_CHARGE_AMOUNT",
                "Valor da cobrança deve ser positivo em centavos.");
        }

        // Estimativa ilustrativa de taxa absorvida pela Topic Log (D12): remetente sempre paga exatamente TransportAmountCents
        long estimatedGatewayFeeCents = request.Method switch
        {
            PaymentMethodKind.PIX => 199,
            PaymentMethodKind.DEBIT_CARD => (long)decimal.Round(request.TransportAmountCents * 0.0199m, 0, MidpointRounding.AwayFromZero),
            PaymentMethodKind.CREDIT_CARD => (long)decimal.Round(request.TransportAmountCents * 0.0299m, 0, MidpointRounding.AwayFromZero) + 49,
            _ => 199
        };

        return Task.FromResult(new SandboxChargeResult(
            ProviderName: ProviderName,
            ProviderPaymentId: $"pay_sandbox_{Guid.NewGuid():N}",
            Status: PaymentStatus.PENDING,
            ChargedToSenderCents: request.TransportAmountCents,
            EstimatedGatewayFeeCentsAbsorbedByPlatform: estimatedGatewayFeeCents,
            IsSandbox: true));
    }

    public Task<TransferResult> RequestEligibleTransferAsync(
        RequestTransferCommand command,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        EnsureSandboxOnly();

        return Task.FromResult(new TransferResult(
            ProviderName: ProviderName,
            ProviderTransferId: $"trf_sandbox_{command.IdempotencyKey}",
            Status: TransferStatus.REQUESTED,
            IsBankPayoutSettled: false,
            StatusDisplayMessage: "Transferência solicitada (Crédito bancário pendente — D17)"));
    }

    public bool VerifyWebhookSignature(string rawPayload, string? signatureHeader) =>
        !string.IsNullOrWhiteSpace(rawPayload) && !string.IsNullOrWhiteSpace(signatureHeader);

    private void EnsureSandboxOnly()
    {
        var flags = _featureFlags.Value;
        if (flags.RealPaymentsEnabled || !flags.AsaasSandboxEnabled)
        {
            throw new DomainRuleViolationException(
                "REAL_PAYMENTS_BLOCKED",
                "Transações reais estão bloqueadas até a homologação completa do Gate G5 (D07/D14).",
                httpStatusCode: 403);
        }
    }
}

/// <summary>
/// Adaptador Sandbox de KYC (D05) — Sem armazenamento de biometria facial bruta.
/// </summary>
public sealed class SandboxKycProvider : IKycProvider
{
    public string ProviderName => "TopicLog.SandboxKyc";

    public Task<KycVerificationStatusResult> GetVerificationStatusAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return Task.FromResult(new KycVerificationStatusResult(
            UserId: userId,
            ProviderName: ProviderName,
            Status: KycStatus.NOT_STARTED,
            HasVerifiedCpf: false,
            HasVerifiedIdentityDocument: false,
            HasVerifiedAddress: false,
            HasVerifiedFacialMatch: false,
            VerifiedAtUtc: null,
            ExpiresAtUtc: null));
    }
}

/// <summary>
/// Adaptador gratuito de mapas para o protótipo em Minas Gerais (D02, D15).
/// </summary>
public sealed class LocalFreeMapsProvider : IMapsProvider
{
    private static readonly Dictionary<string, MunicipalityGeoInfo> KnownMunicipalities =
        new(StringComparer.Ordinal)
        {
            ["3136207"] = new(
                IbgeCode: "3136207",
                Name: "João Monlevade",
                StateUf: "MG",
                ApproximateCenter: new GeoApproximatePoint(-19.8100, -43.1736),
                IsPilotPriority: true,
                PilotPriorityOrder: 1),
            ["3106200"] = new(
                IbgeCode: "3106200",
                Name: "Belo Horizonte",
                StateUf: "MG",
                ApproximateCenter: new GeoApproximatePoint(-19.9167, -43.9345),
                IsPilotPriority: true,
                PilotPriorityOrder: 2)
        };

    public string ProviderName => "OpenStreetMap/Nominatim-Compatible (Prototype)";

    public string LicenseAttribution => "© OpenStreetMap contributors (ODbL)";

    public Task<MunicipalityGeoInfo?> GetMunicipalityByIbgeAsync(
        string ibgeCode,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        KnownMunicipalities.TryGetValue(ibgeCode, out var info);
        return Task.FromResult(info);
    }

    public double CalculateApproximateDistanceKm(
        GeoApproximatePoint origin,
        GeoApproximatePoint destination)
    {
        const double EarthRadiusKm = 6371.0;

        double dLat = DegreesToRadians(destination.Latitude - origin.Latitude);
        double dLon = DegreesToRadians(destination.Longitude - origin.Longitude);

        double lat1 = DegreesToRadians(origin.Latitude);
        double lat2 = DegreesToRadians(destination.Latitude);

        double a = Math.Pow(Math.Sin(dLat / 2), 2) +
                   Math.Cos(lat1) * Math.Cos(lat2) * Math.Pow(Math.Sin(dLon / 2), 2);

        double c = 2 * Math.Asin(Math.Sqrt(a));
        return Math.Round(EarthRadiusKm * c, 2, MidpointRounding.AwayFromZero);
    }

    private static double DegreesToRadians(double degrees) => degrees * (Math.PI / 180.0);
}

/// <summary>
/// Armazenamento privado local para desenvolvimento sem Docker/MinIO em máquina de 8 GB de RAM.
/// </summary>
public sealed class LocalDiskObjectStorageProvider : IObjectStorageProvider
{
    public string ProviderName => "LocalDiskPrivateStorage";

    public Task<PrivateObjectReference> StorePrivateObjectAsync(
        string category,
        string fileName,
        Stream content,
        string contentType,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        string safeCategory = string.IsNullOrWhiteSpace(category) ? "general" : category.Trim().ToLowerInvariant();
        string storageKey = $"private/{safeCategory}/{Guid.NewGuid():N}_{Path.GetFileName(fileName)}";
        long length = content.CanSeek ? content.Length : 0;

        return Task.FromResult(new PrivateObjectReference(
            StorageKey: storageKey,
            ContentType: contentType,
            SizeBytes: length,
            StoredAtUtc: DateTimeOffset.UtcNow));
    }

    public string GenerateTemporarySignedPath(string storageKey, TimeSpan validityWindow)
    {
        long expiresUnix = DateTimeOffset.UtcNow.Add(validityWindow).ToUnixTimeSeconds();
        return $"/api/v1/private-media?key={Uri.EscapeDataString(storageKey)}&expires={expiresUnix}";
    }
}
