using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Common.Options;
using TopicLog.Api.Infrastructure.Providers;
using TopicLog.Api.Modules;
using TopicLog.Api.Modules.Identity;

var tests = new List<(string Name, Action Execute)>
{
    ("D01/D02: TopicLogOptions valida nome Topic Log, UF MG e João Monlevade (3136207) como prioridade 1", () =>
    {
        var options = new TopicLogOptions();
        var validator = new TopicLogOptionsValidator();
        var result = validator.Validate(null, options);
        Assert(result.Succeeded, "Configuração padrão TopicLogOptions deve ser válida.");
        Assert(options.PilotMunicipalities[0].IbgeCode == "3136207", "João Monlevade deve ser prioridade 1.");
        Assert(options.PilotMunicipalities[1].IbgeCode == "3106200", "Belo Horizonte deve ser prioridade 2.");
    }),

    ("D03/D04: Limites de peso 5 kg (5000g) para bicicleta e 20 kg (20000g) para moto e carro", () =>
    {
        var bikeOk = TopicLogRules.ValidateVehicleWeight(VehicleType.BICYCLE, 5000);
        Assert(bikeOk.IsValid, "5000 g deve ser permitido para BICYCLE.");

        var bikeBlocked = TopicLogRules.ValidateVehicleWeight(VehicleType.BICYCLE, 5001);
        Assert(!bikeBlocked.IsValid && bikeBlocked.ErrorCode == "VEHICLE_WEIGHT_LIMIT_EXCEEDED", "5001 g deve bloquear BICYCLE.");

        var motoOk = TopicLogRules.ValidateVehicleWeight(VehicleType.MOTORCYCLE, 20000);
        Assert(motoOk.IsValid, "20000 g deve ser permitido para MOTORCYCLE.");

        var motoBlocked = TopicLogRules.ValidateVehicleWeight(VehicleType.MOTORCYCLE, 20001);
        Assert(!motoBlocked.IsValid && motoBlocked.ErrorCode == "VEHICLE_WEIGHT_LIMIT_EXCEEDED", "20001 g deve bloquear MOTORCYCLE.");

        var carOk = TopicLogRules.ValidateVehicleWeight(VehicleType.CAR, 20000);
        Assert(carOk.IsValid, "20000 g deve ser permitido para CAR.");

        var carBlocked = TopicLogRules.ValidateVehicleWeight(VehicleType.CAR, 20001);
        Assert(!carBlocked.IsValid && carBlocked.ErrorCode == "VEHICLE_WEIGHT_LIMIT_EXCEEDED", "20001 g deve bloquear CAR.");
    }),

    ("D04: Limites alterados pelo administrador e capacidade real do transportador prevalecem", () =>
    {
        var customLimits = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["BICYCLE"] = 6000
        };
        var customBikeOk = TopicLogRules.ValidateVehicleWeight(VehicleType.BICYCLE, 5500, customLimits);
        Assert(customBikeOk.IsValid, "Limite customizado pelo admin (6000 g) deve aceitar 5500 g.");

        var carrierCapacityBlocked = TopicLogRules.ValidateVehicleWeight(
            VehicleType.CAR,
            weightGrams: 15000,
            configuredLimits: null,
            declaredCarrierCapacityGrams: 12000);
        Assert(!carrierCapacityBlocked.IsValid, "Capacidade real declarada menor (12000 g) deve bloquear encomenda de 15000 g.");
    }),

    ("D05: Contratação exige KYC bilateral válido (VERIFIED para remetente e transportador)", () =>
    {
        Assert(TopicLogRules.CanContractWithBilateralKyc(KycStatus.VERIFIED, KycStatus.VERIFIED), "Ambos VERIFIED deve permitir contratação.");
        Assert(!TopicLogRules.CanContractWithBilateralKyc(KycStatus.PENDING, KycStatus.VERIFIED), "Remetente PENDING deve bloquear contratação.");
        Assert(!TopicLogRules.CanContractWithBilateralKyc(KycStatus.VERIFIED, KycStatus.NOT_STARTED), "Transportador NOT_STARTED deve bloquear contratação.");
        Assert(!TopicLogRules.CanContractWithBilateralKyc(KycStatus.VERIFIED, KycStatus.EXPIRED), "Transportador EXPIRED deve bloquear contratação.");
    }),

    ("D06: Seguro no MVP registra apenas manifestação de interesse sem cobrança nem cobertura", () =>
    {
        var interest = TopicLogRules.CreateInsuranceInterestManifestation(interested: true);
        Assert(interest.Interested, "Deve registrar interesse.");
        Assert(interest.ChargedAmountCents == 0, "Não deve cobrar nenhum valor pelo interesse em seguro.");
        Assert(!interest.HasActivePolicy && !interest.GuaranteesCoverage, "Não deve criar apólice nem prometer cobertura.");
        Assert(
            interest.MandatoryDisclaimer == "Esta manifestação não contrata seguro e não garante cobertura",
            "Texto de disclaimer obrigatório deve ser exato.");
    }),

    ("D10/D11/D12: Snapshot de comissão 13% (Free) e 7% (Premium) em centavos inteiros e absorção de taxa", () =>
    {
        // Exemplo R$ 100,00 (10000 centavos) no plano gratuito (13%)
        var freeSnapshot = TopicLogRules.CalculateCommissionSnapshot(10000, 0.130000m, "pol_free_v1", "FREE");
        Assert(freeSnapshot.CommissionCents == 1300, "Comissão de 13% sobre 10000 centavos deve ser 1300 centavos.");
        Assert(freeSnapshot.CarrierDueCents == 8700, "Valor líquido do transportador deve ser 8700 centavos.");
        Assert(freeSnapshot.SenderTotalCents == 10000, "Remetente paga exatamente 10000 centavos (sem sobretaxa).");
        Assert(freeSnapshot.GatewayFeesAbsorbedByPlatform, "Plataforma deve absorver taxas de gateway.");

        // Exemplo R$ 100,00 (10000 centavos) no plano Premium (7%)
        var premiumSnapshot = TopicLogRules.CalculateCommissionSnapshot(10000, 0.070000m, "pol_prem_v1", "PREMIUM");
        Assert(premiumSnapshot.CommissionCents == 700, "Comissão de 7% sobre 10000 centavos deve ser 700 centavos.");
        Assert(premiumSnapshot.CarrierDueCents == 9300, "Valor líquido do transportador Premium deve ser 9300 centavos.");
        Assert(premiumSnapshot.CommissionCents + premiumSnapshot.CarrierDueCents == premiumSnapshot.TransportAmountCents, "Invariante de centavos preservada.");
    }),

    ("D12: Provedor Asaas Sandbox cobra exatamente o mesmo valor do remetente em Pix, Débito e Crédito", () =>
    {
        var flags = Options.Create(new FeatureFlagsOptions
        {
            EnvironmentMode = "Testing",
            RealPaymentsEnabled = false,
            AsaasSandboxEnabled = true
        });
        var provider = new SandboxAsaasPaymentProvider(flags);
        var orderId = Guid.NewGuid();

        var pix = provider.CreateChargeAsync(new CreateSandboxChargeRequest(orderId, 5000, PaymentMethodKind.PIX, 1, "idem-1"), CancellationToken.None).GetAwaiter().GetResult();
        var debit = provider.CreateChargeAsync(new CreateSandboxChargeRequest(orderId, 5000, PaymentMethodKind.DEBIT_CARD, 1, "idem-2"), CancellationToken.None).GetAwaiter().GetResult();
        var credit = provider.CreateChargeAsync(new CreateSandboxChargeRequest(orderId, 5000, PaymentMethodKind.CREDIT_CARD, 3, "idem-3"), CancellationToken.None).GetAwaiter().GetResult();

        Assert(pix.ChargedToSenderCents == 5000 && debit.ChargedToSenderCents == 5000 && credit.ChargedToSenderCents == 5000,
            "Valor cobrado ao remetente deve ser idêntico em todas as modalidades.");
    }),

    ("D07/D14: FeatureFlagsOptionsValidator bloqueia pagamentos reais em ambiente Testing", () =>
    {
        var validator = new FeatureFlagsOptionsValidator();
        var unsafeFlags = new FeatureFlagsOptions
        {
            EnvironmentMode = "Testing",
            RealPaymentsEnabled = true
        };
        var result = validator.Validate(null, unsafeFlags);
        Assert(result.Failed, "Validador deve bloquear RealPaymentsEnabled=true em ambiente Testing.");
    }),

    ("D16/D17: Entrega exige código válido + foto (ou exceção humana) e bloqueia ato unilateral ou disputa", () =>
    {
        // Ato unilateral do transportador
        var unilateral = TopicLogRules.EvaluateDeliveryAndTransferEligibility(new DeliveryAndTransferEligibilityInput(
            HasValidSecurityCode: true,
            HasDeliveryPhoto: true,
            HasApprovedHumanException: false,
            IsCarrierUnilateralClaimOnly: true,
            PaymentStatus: PaymentStatus.CONFIRMED,
            HasOpenDispute: false,
            HasHoldOrFraudFlag: false));
        Assert(!unilateral.IsDeliveryVerified && !unilateral.IsTransferEligible, "Ato unilateral nunca libera repasse.");

        // Código sem foto
        var codeWithoutPhoto = TopicLogRules.EvaluateDeliveryAndTransferEligibility(new DeliveryAndTransferEligibilityInput(
            HasValidSecurityCode: true,
            HasDeliveryPhoto: false,
            HasApprovedHumanException: false,
            IsCarrierUnilateralClaimOnly: false,
            PaymentStatus: PaymentStatus.CONFIRMED,
            HasOpenDispute: false,
            HasHoldOrFraudFlag: false));
        Assert(!codeWithoutPhoto.IsDeliveryVerified && !codeWithoutPhoto.IsTransferEligible, "Código sem foto não confirma entrega normal.");

        // Código + Foto, porém com disputa aberta
        var withDispute = TopicLogRules.EvaluateDeliveryAndTransferEligibility(new DeliveryAndTransferEligibilityInput(
            HasValidSecurityCode: true,
            HasDeliveryPhoto: true,
            HasApprovedHumanException: false,
            IsCarrierUnilateralClaimOnly: false,
            PaymentStatus: PaymentStatus.CONFIRMED,
            HasOpenDispute: true,
            HasHoldOrFraudFlag: false));
        Assert(withDispute.IsDeliveryVerified && !withDispute.IsTransferEligible && withDispute.RecommendedTransferStatus == TransferStatus.BLOCKED,
            "Disputa aberta deve bloquear transferência.");

        // Cenário completo elegível
        var eligible = TopicLogRules.EvaluateDeliveryAndTransferEligibility(new DeliveryAndTransferEligibilityInput(
            HasValidSecurityCode: true,
            HasDeliveryPhoto: true,
            HasApprovedHumanException: false,
            IsCarrierUnilateralClaimOnly: false,
            PaymentStatus: PaymentStatus.CONFIRMED,
            HasOpenDispute: false,
            HasHoldOrFraudFlag: false));
        Assert(eligible.IsDeliveryVerified && eligible.IsTransferEligible && eligible.RecommendedTransferStatus == TransferStatus.ELIGIBLE,
            "Código + Foto + Pagamento confirmado + Sem disputa deve tornar transferência elegível.");
    }),

    ("TRD Seção 1: Catálogo do Monólito Modular contém exatamente os 19 módulos previstos", () =>
    {
        Assert(ModuleCatalog.All.Count == 19, $"Esperados 19 módulos, encontrados {ModuleCatalog.All.Count}.");
    }),

    ("DEC-02.1/02.2/02.3: PBKDF2-HMAC-SHA256 gera salt aleatório único por senha, verifica em tempo constante e suporta NeedsRehash", () =>
    {
        var secOptions = Options.Create(new SecurityOptions { Pbkdf2Iterations = 210_000 });
        var keyProvider = new RuntimeKeyMaterialProvider(secOptions);
        var crypto = new SecurityCryptoService(secOptions, keyProvider);

        string hash1 = crypto.HashPassword("SenhaSintetica#2026");
        string hash2 = crypto.HashPassword("SenhaSintetica#2026");

        Assert(hash1 != hash2, "Duas execuções para a mesma senha devem produzir hashes diferentes (salt aleatório individual).");
        Assert(hash1.StartsWith("v1$pbkdf2-sha256$210000$", StringComparison.Ordinal), "Formato do hash deve ser versionado.");
        Assert(SecurityCryptoService.VerifyPassword("SenhaSintetica#2026", hash1), "Senha correta deve validar positivamente.");
        Assert(!SecurityCryptoService.VerifyPassword("SenhaIncorreta#2026", hash1), "Senha incorreta deve falhar.");
        Assert(!crypto.NeedsRehash(hash1), "Hash com 210.000 iterações não deve exigir rehash.");

        string legacyIterationsHash = crypto.HashPassword("SenhaSintetica#2026", iterationsOverride: 100_000);
        Assert(crypto.NeedsRehash(legacyIterationsHash), "Hash com menos iterações que a política atual deve sinalizar NeedsRehash=true.");
    }),

    ("DEC-02.1: AES-256-GCM criptografa/descriptografa telefone com nonce único e rejeita payload adulterado", () =>
    {
        var secOptions = Options.Create(new SecurityOptions());
        var keyProvider = new RuntimeKeyMaterialProvider(secOptions);
        var crypto = new SecurityCryptoService(secOptions, keyProvider);

        string encrypted1 = crypto.EncryptPhone("(31) 90000-0001");
        string encrypted2 = crypto.EncryptPhone("(31) 90000-0001");

        Assert(encrypted1 != encrypted2, "AES-GCM deve utilizar nonce aleatório distinto em cada operação.");
        Assert(!encrypted1.Contains("900000001", StringComparison.Ordinal), "Texto cifrado não pode conter o telefone em claro.");
        Assert(crypto.DecryptPhone(encrypted1) == "31900000001", "Descriptografia deve recuperar exatamente os dígitos originais.");
        Assert(SecurityCryptoService.MaskPhone("(31) 90000-0001") == "(**) *****-0001", "Máscara de telefone incorreta.");

        // Adulteração da tag de autenticação deve lançar CryptographicException
        string[] parts = encrypted1.Split('$');
        byte[] tamperedCiphertext = Convert.FromBase64String(parts[4]);
        tamperedCiphertext[0] ^= 0xFF;
        string tamperedPayload = $"{parts[0]}${parts[1]}${parts[2]}${parts[3]}${Convert.ToBase64String(tamperedCiphertext)}";

        bool threwAuthError = false;
        try
        {
            _ = crypto.DecryptPhone(tamperedPayload);
        }
        catch (CryptographicException)
        {
            threwAuthError = true;
        }
        Assert(threwAuthError, "AES-GCM deve rejeitar ciphertext adulterado com CryptographicException.");
    }),

    ("DEC-02.4: JWT HS256 valida assinatura, expiração (exp), emissor (iss), audiência (aud) e rejeita alg:none", () =>
    {
        var secOptions = Options.Create(new SecurityOptions
        {
            Issuer = "https://api.topiclog.com.br",
            Audience = "https://app.topiclog.com.br",
            AccessTokenLifetimeMinutes = 15,
            ClockSkewSeconds = 0
        });
        var keyProvider = new RuntimeKeyMaterialProvider(secOptions);
        var crypto = new SecurityCryptoService(secOptions, keyProvider);

        var user = new UserEntity
        {
            Id = Guid.NewGuid(),
            Email = "sintetico.jwt@example.test",
            PhoneEncrypted = "enc",
            PhoneMasked = "(**) *****-0001",
            PasswordHash = "hash"
        };
        var profile = new UserProfileEntity
        {
            UserId = user.Id,
            DisplayName = "Titular Sintético",
            Roles = [UserRole.SENDER, UserRole.CARRIER],
            KycStatus = KycStatus.NOT_STARTED,
            TermsAcceptedVersion = "2026.1-D08-DRAFT",
            TermsAcceptedAtUtc = DateTimeOffset.UtcNow
        };

        DateTimeOffset issuedAt = DateTimeOffset.UtcNow;
        var (token, _, _) = crypto.CreateAccessToken(user, profile, issuedAt);

        Assert(crypto.TryValidateAccessToken(token, out var actor, out string? err, issuedAt) && actor is not null,
            $"Token íntegro deve ser aceito (erro: {err}).");
        Assert(actor!.UserId == user.Id && actor.Roles.Contains(UserRole.CARRIER), "Claims do ator autenticado devem corresponder.");

        // 1. Token expirado
        Assert(!crypto.TryValidateAccessToken(token, out _, out string? expErr, issuedAt.AddMinutes(16))
            && expErr == "TOKEN_EXPIRED", "Token expirado deve ser rejeitado com TOKEN_EXPIRED.");

        // 2. Emissor (iss) divergente
        var wrongIssuerCrypto = new SecurityCryptoService(
            Options.Create(new SecurityOptions { Issuer = "https://outro.emissor.test", Audience = "https://app.topiclog.com.br" }),
            keyProvider);
        var (wrongIssToken, _, _) = wrongIssuerCrypto.CreateAccessToken(user, profile, issuedAt);
        Assert(!crypto.TryValidateAccessToken(wrongIssToken, out _, out string? issErr, issuedAt)
            && issErr == "INVALID_TOKEN_ISSUER", "Token com emissor incorreto deve ser rejeitado.");

        // 3. Audiência (aud) divergente
        var wrongAudCrypto = new SecurityCryptoService(
            Options.Create(new SecurityOptions { Issuer = "https://api.topiclog.com.br", Audience = "https://outra.audiencia.test" }),
            keyProvider);
        var (wrongAudToken, _, _) = wrongAudCrypto.CreateAccessToken(user, profile, issuedAt);
        Assert(!crypto.TryValidateAccessToken(wrongAudToken, out _, out string? audErr, issuedAt)
            && audErr == "INVALID_TOKEN_AUDIENCE", "Token com audiência incorreta deve ser rejeitado.");

        // 4. Ataque alg:none
        string noneHeader = Convert.ToBase64String(Encoding.UTF8.GetBytes("{\"alg\":\"none\",\"typ\":\"JWT\"}")).TrimEnd('=');
        string[] validParts = token.Split('.');
        string algNoneToken = $"{noneHeader}.{validParts[1]}.{validParts[2]}";
        Assert(!crypto.TryValidateAccessToken(algNoneToken, out _, out string? algErr, issuedAt)
            && algErr == "INVALID_TOKEN_ALGORITHM", "Token com alg:none deve ser bloqueado imediatamente.");
    }),

    ("DEC-02.5: SecurityOptionsValidator bloqueia Production sem chaves injetadas e não há segredos hardcoded", () =>
    {
        var defaultOpts = new SecurityOptions();
        Assert(string.IsNullOrEmpty(defaultOpts.JwtSigningKeyBase64) && string.IsNullOrEmpty(defaultOpts.PiiEncryptionKeyBase64),
            "SecurityOptions não pode conter chaves gravadas no código-fonte.");

        var prodFlags = Options.Create(new FeatureFlagsOptions { EnvironmentMode = "Production" });
        var validator = new SecurityOptionsValidator(prodFlags);
        var validation = validator.Validate(null, defaultOpts);
        Assert(validation.Failed, "Em Production, ausência de chaves injetadas por ambiente deve bloquear inicialização.");
    }),

    ("DEC-01.3: Script DDL INFRA/sql/001_identity_kyc_audit.sql existe e declara as tabelas do modelo aprovado", () =>
    {
        string sqlPath = Path.Combine(Directory.GetCurrentDirectory(), "INFRA", "sql", "001_identity_kyc_audit.sql");
        Assert(File.Exists(sqlPath), $"Script SQL não encontrado em {sqlPath}.");

        string ddl = File.ReadAllText(sqlPath);
        Assert(ddl.Contains("CREATE TABLE IF NOT EXISTS users", StringComparison.Ordinal), "Tabela users ausente no DDL.");
        Assert(ddl.Contains("CREATE TABLE IF NOT EXISTS profiles", StringComparison.Ordinal), "Tabela profiles ausente no DDL.");
        Assert(ddl.Contains("CREATE TABLE IF NOT EXISTS refresh_tokens", StringComparison.Ordinal), "Tabela refresh_tokens ausente no DDL.");
        Assert(ddl.Contains("CREATE TABLE IF NOT EXISTS kyc_cases", StringComparison.Ordinal), "Tabela kyc_cases ausente no DDL.");
        Assert(ddl.Contains("CREATE TABLE IF NOT EXISTS kyc_checks", StringComparison.Ordinal), "Tabela kyc_checks ausente no DDL.");
        Assert(ddl.Contains("CREATE TABLE IF NOT EXISTS audit_events", StringComparison.Ordinal), "Tabela audit_events ausente no DDL.");
    })
};

Console.WriteLine("======================================================================");
Console.WriteLine("TopicLog.UnitTests (.NET 10 LTS) — Executando suíte PR-00.2 + PR-01.1");
Console.WriteLine("======================================================================");

int passed = 0;
int failed = 0;
var sw = Stopwatch.StartNew();

foreach (var (name, execute) in tests)
{
    try
    {
        execute();
        passed++;
        Console.WriteLine($"[PASS] {name}");
    }
    catch (Exception ex)
    {
        failed++;
        Console.WriteLine($"[FAIL] {name} -> {ex.Message}");
    }
}

sw.Stop();
using var proc = Process.GetCurrentProcess();
double ramMb = Math.Round(proc.WorkingSet64 / (1024.0 * 1024.0), 2);
double peakRamMb = Math.Round(proc.PeakWorkingSet64 / (1024.0 * 1024.0), 2);

Console.WriteLine("----------------------------------------------------------------------");
Console.WriteLine($"Resultado UnitTests: {passed} aprovados, {failed} falharam | Tempo: {sw.ElapsedMilliseconds} ms | WorkingSet: {ramMb} MB | PeakWorkingSet: {peakRamMb} MB");
Console.WriteLine("----------------------------------------------------------------------");

return failed == 0 ? 0 : 1;

static void Assert(bool condition, string message)
{
    if (!condition)
    {
        throw new InvalidOperationException(message);
    }
}
