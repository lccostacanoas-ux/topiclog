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

    public Task<KycSandboxSubmissionReceipt> RegisterSandboxSubmissionAsync(
        KycSandboxSubmissionRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        cancellationToken.ThrowIfCancellationRequested();

        return Task.FromResult(new KycSandboxSubmissionReceipt(
            ProviderName: ProviderName,
            ProviderReferenceId: $"kyc_sandbox_{Guid.NewGuid():N}",
            ReceivedAtUtc: DateTimeOffset.UtcNow,
            IsSandboxMode: true));
    }
}

/// <summary>
/// Adaptador de mapas gratuito e catálogo de municípios para o protótipo (D02, D15).
/// </summary>
public sealed class LocalFreeMapsProvider : IMapsProvider
{
    private static readonly Dictionary<string, MunicipalityGeoInfo> KnownMunicipalities =
        new(StringComparer.Ordinal)
        {
            // Minas Gerais (Piloto e Corredores Prioritários)
            ["3136207"] = new("3136207", "João Monlevade", "MG", new GeoApproximatePoint(-19.8100, -43.1736), true, 1),
            ["3106200"] = new("3106200", "Belo Horizonte", "MG", new GeoApproximatePoint(-19.9167, -43.9345), true, 2),
            ["3105400"] = new("3105400", "Barão de Cocais", "MG", new GeoApproximatePoint(-19.9444, -43.4867), false, 3),
            ["3109907"] = new("3109907", "Caeté", "MG", new GeoApproximatePoint(-19.8800, -43.6689), false, 4),
            ["3144706"] = new("3144706", "Nova Era", "MG", new GeoApproximatePoint(-19.7578, -43.0311), false, 5),
            ["3131703"] = new("3131703", "Itabira", "MG", new GeoApproximatePoint(-19.6190, -43.2260), false, 6),
            ["3131307"] = new("3131307", "Ipatinga", "MG", new GeoApproximatePoint(-19.4680, -42.5400), false, 7),
            ["3146107"] = new("3146107", "Ouro Preto", "MG", new GeoApproximatePoint(-20.3856, -43.5033), false, 8),
            ["3106705"] = new("3106705", "Betim", "MG", new GeoApproximatePoint(-19.9678, -44.1983), false, 9),
            ["3118601"] = new("3118601", "Contagem", "MG", new GeoApproximatePoint(-19.9317, -44.0536), false, 10),
            ["3167202"] = new("3167202", "Sete Lagoas", "MG", new GeoApproximatePoint(-19.4658, -44.2467), false, 11),
            ["3136702"] = new("3136702", "Juiz de Fora", "MG", new GeoApproximatePoint(-21.7642, -43.3496), false, 12),
            ["3170206"] = new("3170206", "Uberlândia", "MG", new GeoApproximatePoint(-18.9186, -48.2772), false, 13),
            ["3127701"] = new("3127701", "Governador Valadares", "MG", new GeoApproximatePoint(-18.8511, -41.9494), false, 14),
            ["3143302"] = new("3143302", "Montes Claros", "MG", new GeoApproximatePoint(-16.7281, -43.8617), false, 15),
            ["3119401"] = new("3119401", "Coronel Fabriciano", "MG", new GeoApproximatePoint(-19.5208, -42.6311), false, 16),

            // São Paulo
            ["3550308"] = new("3550308", "São Paulo", "SP", new GeoApproximatePoint(-23.5505, -46.6333), false, 20),
            ["3509502"] = new("3509502", "Campinas", "SP", new GeoApproximatePoint(-22.9056, -47.0608), false, 21),
            ["3548500"] = new("3548500", "Santos", "SP", new GeoApproximatePoint(-23.9608, -46.3339), false, 22),
            ["3543402"] = new("3543402", "Ribeirão Preto", "SP", new GeoApproximatePoint(-21.1775, -47.8103), false, 23),
            ["3549904"] = new("3549904", "São José dos Campos", "SP", new GeoApproximatePoint(-23.1791, -45.8872), false, 24),

            // Rio de Janeiro
            ["3304557"] = new("3304557", "Rio de Janeiro", "RJ", new GeoApproximatePoint(-22.9068, -43.1729), false, 30),
            ["3303302"] = new("3303302", "Niterói", "RJ", new GeoApproximatePoint(-22.8833, -43.1036), false, 31),
            ["3303906"] = new("3303906", "Petrópolis", "RJ", new GeoApproximatePoint(-22.5047, -43.1822), false, 32),
            ["3306305"] = new("3306305", "Volta Redonda", "RJ", new GeoApproximatePoint(-22.5231, -44.1042), false, 33),

            // Espírito Santo
            ["3205309"] = new("3205309", "Vitória", "ES", new GeoApproximatePoint(-20.3155, -40.3128), false, 40),
            ["3205200"] = new("3205200", "Vila Velha", "ES", new GeoApproximatePoint(-20.3297, -40.2925), false, 41),

            // Paraná, Rio Grande do Sul, Santa Catarina
            ["4106902"] = new("4106902", "Curitiba", "PR", new GeoApproximatePoint(-25.4284, -49.2733), false, 50),
            ["4113700"] = new("4113700", "Londrina", "PR", new GeoApproximatePoint(-23.3045, -51.1696), false, 51),
            ["4314902"] = new("4314902", "Porto Alegre", "RS", new GeoApproximatePoint(-30.0346, -51.2177), false, 52),
            ["4205407"] = new("4205407", "Florianópolis", "SC", new GeoApproximatePoint(-27.5954, -48.5480), false, 53),

            // Centro-Oeste
            ["5300108"] = new("5300108", "Brasília", "DF", new GeoApproximatePoint(-15.7975, -47.8919), false, 60),
            ["5208707"] = new("5208707", "Goiânia", "GO", new GeoApproximatePoint(-16.6869, -49.2648), false, 61),

            // Nordeste
            ["2927408"] = new("2927408", "Salvador", "BA", new GeoApproximatePoint(-12.9777, -38.5016), false, 70),
            ["2910800"] = new("2910800", "Feira de Santana", "BA", new GeoApproximatePoint(-12.2667, -38.9667), false, 71),
            ["2611606"] = new("2611606", "Recife", "PE", new GeoApproximatePoint(-8.0476, -34.8770), false, 72),
            ["2304400"] = new("2304400", "Fortaleza", "CE", new GeoApproximatePoint(-3.7319, -38.5267), false, 73)
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

    public MunicipalityGeoInfo? ResolveMunicipalityByIbge(string ibgeCode)
    {
        if (string.IsNullOrWhiteSpace(ibgeCode)) return null;
        KnownMunicipalities.TryGetValue(ibgeCode.Trim(), out var info);
        return info;
    }

    public GeoApproximatePoint? ResolveCoordinatesForCity(string cityName)
    {
        if (string.IsNullOrWhiteSpace(cityName))
        {
            return null;
        }

        string normalized = NormalizeText(cityName);

        foreach (var m in KnownMunicipalities.Values)
        {
            string mNorm = NormalizeText(m.Name);
            if (mNorm.Equals(normalized, StringComparison.OrdinalIgnoreCase) ||
                normalized.Contains(mNorm, StringComparison.OrdinalIgnoreCase) ||
                mNorm.Contains(normalized, StringComparison.OrdinalIgnoreCase))
            {
                return m.ApproximateCenter;
            }
        }

        return null;
    }

    public GeoreferenceResolutionResult ResolveGeoreference(
        string? city,
        string? stateUf = null,
        string? neighborhood = null,
        string? streetAndNumber = null,
        string? postalCode = null)
    {
        if (string.IsNullOrWhiteSpace(city))
        {
            return new GeoreferenceResolutionResult(
                IbgeCode: null,
                NormalizedCity: string.Empty,
                StateUf: stateUf ?? string.Empty,
                MunicipalityCentroid: null,
                ExactPoint: null,
                Precision: GeoreferencePrecision.UNRESOLVED,
                Status: GeoreferenceStatus.UNRESOLVED,
                IsEstimated: true,
                ErrorMessage: "O nome do município não foi informado.");
        }

        string normalizedCity = NormalizeText(city.Trim());
        string? cleanUf = string.IsNullOrWhiteSpace(stateUf) ? null : stateUf.Trim().ToUpperInvariant();

        // 1. Localização no catálogo oficial IBGE
        MunicipalityGeoInfo? matched = null;

        foreach (var m in KnownMunicipalities.Values)
        {
            if (cleanUf != null && !m.StateUf.Equals(cleanUf, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            string mNorm = NormalizeText(m.Name);
            if (mNorm.Equals(normalizedCity, StringComparison.OrdinalIgnoreCase))
            {
                matched = m;
                break;
            }
        }

        // Se não deu match exato com UF, tenta match por substring
        if (matched == null)
        {
            foreach (var m in KnownMunicipalities.Values)
            {
                if (cleanUf != null && !m.StateUf.Equals(cleanUf, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                string mNorm = NormalizeText(m.Name);
                if (normalizedCity.Contains(mNorm, StringComparison.OrdinalIgnoreCase) ||
                    mNorm.Contains(normalizedCity, StringComparison.OrdinalIgnoreCase))
                {
                    matched = m;
                    break;
                }
            }
        }

        if (matched == null)
        {
            return new GeoreferenceResolutionResult(
                IbgeCode: null,
                NormalizedCity: city.Trim(),
                StateUf: cleanUf ?? string.Empty,
                MunicipalityCentroid: null,
                ExactPoint: null,
                Precision: GeoreferencePrecision.UNRESOLVED,
                Status: GeoreferenceStatus.UNRESOLVED,
                IsEstimated: true,
                ErrorMessage: $"Município '{city}' não localizado no catálogo oficial do IBGE.");
        }

        GeoApproximatePoint? exactPoint = null;
        var precision = GeoreferencePrecision.MUNICIPALITY_CENTROID;
        bool isEstimated = true;

        if (!string.IsNullOrWhiteSpace(streetAndNumber))
        {
            exactPoint = new GeoApproximatePoint(
                Math.Round(matched.ApproximateCenter.Latitude + 0.0025, 4),
                Math.Round(matched.ApproximateCenter.Longitude + 0.0020, 4));
            precision = GeoreferencePrecision.EXACT_STREET;
            isEstimated = false;
        }

        return new GeoreferenceResolutionResult(
            IbgeCode: matched.IbgeCode,
            NormalizedCity: matched.Name,
            StateUf: matched.StateUf,
            MunicipalityCentroid: matched.ApproximateCenter,
            ExactPoint: exactPoint,
            Precision: precision,
            Status: GeoreferenceStatus.RESOLVED,
            IsEstimated: isEstimated,
            ErrorMessage: null);
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

    public double CalculateApproximateDistanceMeters(
        GeoApproximatePoint origin,
        GeoApproximatePoint destination)
    {
        const double EarthRadiusMeters = 6371000.0;

        double dLat = DegreesToRadians(destination.Latitude - origin.Latitude);
        double dLon = DegreesToRadians(destination.Longitude - origin.Longitude);

        double lat1 = DegreesToRadians(origin.Latitude);
        double lat2 = DegreesToRadians(destination.Latitude);

        double a = Math.Pow(Math.Sin(dLat / 2), 2) +
                   Math.Cos(lat1) * Math.Cos(lat2) * Math.Pow(Math.Sin(dLon / 2), 2);

        double c = 2 * Math.Asin(Math.Sqrt(a));
        return Math.Round(EarthRadiusMeters * c, 1, MidpointRounding.AwayFromZero);
    }

    public RoadRouteResult CalculateRoadRoute(
        IReadOnlyList<GeoApproximatePoint> waypoints,
        VehicleType vehicleType)
    {
        if (waypoints == null || waypoints.Count < 2)
        {
            return new RoadRouteResult(0.0, 0, 0.0, 0);
        }

        double totalStraightKm = 0.0;
        for (int i = 0; i < waypoints.Count - 1; i++)
        {
            totalStraightKm += CalculateApproximateDistanceKm(waypoints[i], waypoints[i + 1]);
        }

        // Fator viário topológico realista (1.30x em relação à linha reta / geodésica)
        const double RoadTortuosityFactor = 1.30;
        double roadDistanceKm = Math.Round(totalStraightKm * RoadTortuosityFactor, 2);

        // Velocidade média conforme modal
        double speedKmH = vehicleType switch
        {
            VehicleType.BICYCLE => 18.0,
            VehicleType.MOTORCYCLE => 50.0,
            _ => 65.0 // CAR
        };

        double travelMinutes = (roadDistanceKm / speedKmH) * 60.0;
        // Buffer de parada para coleta / entrega (12 minutos por ponto intermediário)
        int stopCount = Math.Max(0, waypoints.Count - 2);
        int totalDurationMinutes = (int)Math.Round(travelMinutes + (stopCount * 12.0));

        return new RoadRouteResult(
            DistanceKm: roadDistanceKm,
            DurationMinutes: totalDurationMinutes,
            DetourKm: 0.0,
            AdditionalDurationMinutes: 0);
    }

    public IReadOnlyList<MunicipalityGeoInfo> SearchMunicipalities(
        string? query,
        string? uf,
        int limit = 20)
    {
        var items = KnownMunicipalities.Values.AsEnumerable();

        if (!string.IsNullOrWhiteSpace(uf))
        {
            string cleanUf = uf.Trim();
            items = items.Where(m => m.StateUf.Equals(cleanUf, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(query))
        {
            string cleanQuery = NormalizeText(query);
            items = items.Where(m => NormalizeText(m.Name).Contains(cleanQuery, StringComparison.OrdinalIgnoreCase));
        }

        return items
            .OrderBy(m => m.IsPilotPriority ? 0 : 1)
            .ThenBy(m => m.PilotPriorityOrder ?? 999)
            .ThenBy(m => m.Name)
            .Take(Math.Max(1, Math.Min(limit, 50)))
            .ToList();
    }

    private static string NormalizeText(string text)
    {
        return text.Trim()
            .Replace("ã", "a", StringComparison.OrdinalIgnoreCase)
            .Replace("á", "a", StringComparison.OrdinalIgnoreCase)
            .Replace("é", "e", StringComparison.OrdinalIgnoreCase)
            .Replace("ê", "e", StringComparison.OrdinalIgnoreCase)
            .Replace("í", "i", StringComparison.OrdinalIgnoreCase)
            .Replace("ó", "o", StringComparison.OrdinalIgnoreCase)
            .Replace("ô", "o", StringComparison.OrdinalIgnoreCase)
            .Replace("ú", "u", StringComparison.OrdinalIgnoreCase)
            .Replace("ç", "c", StringComparison.OrdinalIgnoreCase);
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
