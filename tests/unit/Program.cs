using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;
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
using TopicLog.Api.Modules.Shipments;
using TopicLog.Api.Modules.Trips;
using TopicLog.Api.Modules.Verification;

// Isolamento estrito de testes unitários em diretório temporário exclusivo (Finding 3 / DEC-01.1)
string tempUnitTestStorage = Path.Combine(Path.GetTempPath(), "TopicLogUnitTests_" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(tempUnitTestStorage);
Environment.SetEnvironmentVariable("TOPICLOG_STORAGE_DIR", tempUnitTestStorage);
Environment.SetEnvironmentVariable("TOPICLOG_IS_TEST", "true");
Environment.SetEnvironmentVariable("TOPICLOG_IS_UNIT_TEST", "true");
Environment.SetEnvironmentVariable("TOPICLOG_TESTING_SECRET", "TL_INTERNAL_DEV_KEY_20261029");

try
{
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

        // Código válido sem exigência de foto (validação exclusiva por senha / código PIN)
        var codeWithoutPhoto = TopicLogRules.EvaluateDeliveryAndTransferEligibility(new DeliveryAndTransferEligibilityInput(
            HasValidSecurityCode: true,
            HasDeliveryPhoto: false,
            HasApprovedHumanException: false,
            IsCarrierUnilateralClaimOnly: false,
            PaymentStatus: PaymentStatus.CONFIRMED,
            HasOpenDispute: false,
            HasHoldOrFraudFlag: false));
        Assert(codeWithoutPhoto.IsDeliveryVerified && codeWithoutPhoto.IsTransferEligible, "Entrega é validada e elegível para repasse exclusivamente via código/senha.");

        // Sem código válido não confirma entrega normal
        var withoutCode = TopicLogRules.EvaluateDeliveryAndTransferEligibility(new DeliveryAndTransferEligibilityInput(
            HasValidSecurityCode: false,
            HasDeliveryPhoto: false,
            HasApprovedHumanException: false,
            IsCarrierUnilateralClaimOnly: false,
            PaymentStatus: PaymentStatus.CONFIRMED,
            HasOpenDispute: false,
            HasHoldOrFraudFlag: false));
        Assert(!withoutCode.IsDeliveryVerified && !withoutCode.IsTransferEligible, "Sem código válido não confirma entrega normal.");

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
    }),

    ("PR-01.2 (Máquina de Estados KYC): Valida transições permitidas e bloqueia pulo de etapas (NOT_STARTED -> VERIFIED) ou aprovação pelo titular", () =>
    {
        // Transições válidas
        VerificationApplicationService.ValidateStateTransition(KycStatus.NOT_STARTED, KycStatus.IN_REVIEW, isOwnerSubmissionOrAppeal: true, isAuthorizedReviewerDecision: false);
        VerificationApplicationService.ValidateStateTransition(KycStatus.IN_REVIEW, KycStatus.VERIFIED, isOwnerSubmissionOrAppeal: false, isAuthorizedReviewerDecision: true);
        VerificationApplicationService.ValidateStateTransition(KycStatus.IN_REVIEW, KycStatus.REJECTED, isOwnerSubmissionOrAppeal: false, isAuthorizedReviewerDecision: true);
        VerificationApplicationService.ValidateStateTransition(KycStatus.REJECTED, KycStatus.IN_REVIEW, isOwnerSubmissionOrAppeal: true, isAuthorizedReviewerDecision: false);
        VerificationApplicationService.ValidateStateTransition(KycStatus.VERIFIED, KycStatus.EXPIRED, isOwnerSubmissionOrAppeal: false, isAuthorizedReviewerDecision: true);
        VerificationApplicationService.ValidateStateTransition(KycStatus.EXPIRED, KycStatus.IN_REVIEW, isOwnerSubmissionOrAppeal: true, isAuthorizedReviewerDecision: false);

        // Negativo 1: Pulo direto NOT_STARTED -> VERIFIED
        bool blockedSkip = false;
        try
        {
            VerificationApplicationService.ValidateStateTransition(KycStatus.NOT_STARTED, KycStatus.VERIFIED, isOwnerSubmissionOrAppeal: false, isAuthorizedReviewerDecision: true);
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "INVALID_KYC_STATE_TRANSITION")
        {
            blockedSkip = true;
        }
        Assert(blockedSkip, "Deve bloquear pulo direto de NOT_STARTED para VERIFIED.");

        // Negativo 2: Titular tentando aprovar IN_REVIEW -> VERIFIED
        bool blockedOwnerApprove = false;
        try
        {
            VerificationApplicationService.ValidateStateTransition(KycStatus.IN_REVIEW, KycStatus.VERIFIED, isOwnerSubmissionOrAppeal: true, isAuthorizedReviewerDecision: false);
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "INVALID_KYC_STATE_TRANSITION")
        {
            blockedOwnerApprove = true;
        }
        Assert(blockedOwnerApprove, "Titular jamais pode executar transição para VERIFIED.");
    }),

    ("PR-01.2 (LGPD D05): ValidateSafeEvidenceReference bloqueia payloads de biometria facial bruta (data:image, base64, templates)", () =>
    {
        string safeRef = VerificationApplicationService.ValidateSafeEvidenceReference("fac_partner_session_001", "PartnerFacialSessionRef");
        Assert(safeRef == "fac_partner_session_001", "Referência opaca curta deve ser aceita.");

        bool blockedDataUri = false;
        try
        {
            _ = VerificationApplicationService.ValidateSafeEvidenceReference("data:image/jpeg;base64,/9j/4AAQSkZJRg==", "PartnerFacialSessionRef");
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "RAW_BIOMETRY_PAYLOAD_FORBIDDEN")
        {
            blockedDataUri = true;
        }
        Assert(blockedDataUri, "Payload data:image Base64 deve ser bloqueado com RAW_BIOMETRY_PAYLOAD_FORBIDDEN.");
    }),

    ("PR-01.2 (4 Checks Obrigatórios D05): EnsureAllFourChecksPassed bloqueia aprovação se qualquer check estiver PENDING ou FAILED", () =>
    {
        Guid caseId = Guid.NewGuid();
        var incompleteChecks = new List<KycCheckEntity>
        {
            new() { KycCaseId = caseId, CheckType = KycCheckType.CPF_STATUS, Status = KycCheckStatus.PASSED, EvidenceReference = "ref1" },
            new() { KycCaseId = caseId, CheckType = KycCheckType.IDENTITY_DOCUMENT, Status = KycCheckStatus.PASSED, EvidenceReference = "ref2" },
            new() { KycCaseId = caseId, CheckType = KycCheckType.ADDRESS_PROOF, Status = KycCheckStatus.PASSED, EvidenceReference = "ref3" },
            new() { KycCaseId = caseId, CheckType = KycCheckType.FACIAL_BIOMETRY_PARTNER, Status = KycCheckStatus.PENDING, EvidenceReference = "ref4" }
        };

        bool blockedIncomplete = false;
        try
        {
            VerificationApplicationService.EnsureAllFourChecksPassed(incompleteChecks);
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "KYC_CHECKS_NOT_ALL_PASSED")
        {
            blockedIncomplete = true;
        }
        Assert(blockedIncomplete, "Aprovação deve ser bloqueada quando FACIAL_BIOMETRY_PARTNER ainda está PENDING.");

        incompleteChecks[3].Status = KycCheckStatus.PASSED;
        VerificationApplicationService.EnsureAllFourChecksPassed(incompleteChecks);
    }),

    ("PR-01.2 (D08): Manifesto de Termos vigentes distribui responsabilidades e proíbe cláusula de isenção absoluta", () =>
    {
        var secOpts = Options.Create(new SecurityOptions());
        var keyMat = new RuntimeKeyMaterialProvider(secOpts);
        var crypto = new SecurityCryptoService(secOpts, keyMat);
        var auditRepo = new InMemoryAuditRepository();
        var auth = new ResourceAuthorizationService(crypto, auditRepo);
        using var service = new VerificationApplicationService(
            new InMemoryUserRepository(),
            new InMemoryKycRepository(),
            auditRepo,
            new SandboxKycProvider(),
            crypto,
            auth,
            secOpts);

        var manifest = service.GetCurrentTermsManifest();
        Assert(!manifest.HasAbsolutePlatformExemptionClause, "D08 proíbe cláusula de isenção absoluta da plataforma.");
        Assert(manifest.Responsibilities.Count == 3, "Deve explicitar responsabilidades de SENDER, CARRIER e TOPIC_LOG_PLATFORM.");
    }),

    ("PR-01.2 (Concorrência e Idempotência): Chamadas concorrentes (Task.WhenAll) a ReviewKycDecisionAsync permitem apenas 1 aprovação e rejeitam duplicatas", () =>
    {
        var secOpts = Options.Create(new SecurityOptions());
        var keyMat = new RuntimeKeyMaterialProvider(secOpts);
        var crypto = new SecurityCryptoService(secOpts, keyMat);
        var userRepo = new InMemoryUserRepository();
        var kycRepo = new InMemoryKycRepository();
        var auditRepo = new InMemoryAuditRepository();
        var auth = new ResourceAuthorizationService(crypto, auditRepo);
        using var service = new VerificationApplicationService(
            userRepo,
            kycRepo,
            auditRepo,
            new SandboxKycProvider(),
            crypto,
            auth,
            secOpts);

        Guid ownerId = Guid.NewGuid();
        Guid reviewerId = Guid.NewGuid();
        var nowUtc = DateTimeOffset.UtcNow;

        userRepo.CreateAsync(
            new UserEntity
            {
                Id = ownerId,
                Email = "owner.conc@example.test",
                PhoneEncrypted = crypto.EncryptPhone("31900001111"),
                PhoneMasked = "(**) *****-1111",
                PasswordHash = crypto.HashPassword("SenhaConc#01"),
                Status = UserAccountStatus.ACTIVE,
                CreatedAtUtc = nowUtc,
                UpdatedAtUtc = nowUtc
            },
            new UserProfileEntity
            {
                UserId = ownerId,
                DisplayName = "Owner Concorrência",
                Roles = [UserRole.SENDER],
                KycStatus = KycStatus.NOT_STARTED,
                TermsAcceptedVersion = secOpts.Value.RequiredTermsVersion,
                TermsAcceptedAtUtc = nowUtc,
                UpdatedAtUtc = nowUtc
            },
            CancellationToken.None).GetAwaiter().GetResult();

        var ownerActor = new AuthenticatedActor(ownerId, "owner.conc@example.test", [UserRole.SENDER], KycStatus.NOT_STARTED, "jti-owner");
        var reviewerActor = new AuthenticatedActor(reviewerId, "rev.conc@example.test", [UserRole.SUPPORT], KycStatus.VERIFIED, "jti-rev");

        var submitted = service.SubmitKycCaseAsync(
            ownerActor,
            new SubmitKycCaseRequest(
                Cpf: "55566677720",
                IdentityDocumentRef: "private/kyc/doc_c1",
                AddressProofRef: "private/kyc/addr_c1",
                PartnerFacialSessionRef: "fac_sbx_c1",
                ConsentGiven: true),
            "corr-conc-submit",
            CancellationToken.None).GetAwaiter().GetResult();

        Guid caseId = submitted.ActiveCaseId ?? throw new InvalidOperationException("ActiveCaseId ausente.");

        KycCheckReviewInput[] checksPassed =
        [
            new("CPF_STATUS", "PASSED"),
            new("IDENTITY_DOCUMENT", "PASSED"),
            new("ADDRESS_PROOF", "PASSED"),
            new("FACIAL_BIOMETRY_PARTNER", "PASSED")
        ];

        var decisionReq = new ReviewKycDecisionRequest(
            TargetStatus: "VERIFIED",
            CheckResults: checksPassed,
            JustificationOrRejectionReason: "Aprovação concorrente controlada",
            ValidityDays: 365);

        int successCount = 0;
        int duplicateBlockedCount = 0;

        var tasks = Enumerable.Range(0, 5).Select(async idx =>
        {
            try
            {
                await Task.Yield();
                _ = await service.ReviewKycDecisionAsync(
                    reviewerActor,
                    caseId,
                    decisionReq,
                    $"corr-conc-{idx}",
                    CancellationToken.None).ConfigureAwait(false);
                Interlocked.Increment(ref successCount);
            }
            catch (DomainRuleViolationException ex) when (ex.RuleCode == "INVALID_KYC_STATE_TRANSITION")
            {
                Interlocked.Increment(ref duplicateBlockedCount);
            }
        });

        Task.WhenAll(tasks).GetAwaiter().GetResult();

        Assert(successCount == 1, $"Exatamente 1 aprovação concorrente deve ter sucesso, observado {successCount}.");
        Assert(duplicateBlockedCount == 4, $"As outras 4 requisições concorrentes devem ser bloqueadas com INVALID_KYC_STATE_TRANSITION, observado {duplicateBlockedCount}.");
    }),

    ("PR-02: Publicação de encomenda valida limites de peso por modal e bloqueia excedentes (D03, D04)", () =>
    {
        var repo = new InMemoryShipmentsRepository();
        var storage = new LocalDiskObjectStorageProvider();
        var service = new ShipmentsApplicationService(repo, storage);
        var senderId = Guid.NewGuid();

        // 5000g em BICYCLE é válido
        var validBikeRequest = new CreateShipmentRequest(
            Title: "Envelope de Plantas Arquitetônicas",
            Description: "Plantas e memoriais impressos em papel vegetal.",
            Category: ShipmentCategory.DOCUMENTOS,
            VehicleType: VehicleType.BICYCLE,
            WeightGrams: 5000,
            DimensionsLengthCm: 30,
            DimensionsWidthCm: 20,
            DimensionsHeightCm: 5,
            DeclaredValueCents: 5000,
            SuggestedPriceCents: 2500,
            SpecialCareNotes: ["Não dobrar"],
            Origin: new AddressInputDto("João Monlevade", "MG", "Carneirinhos", "Rua A, 10", "35930-000"),
            Destination: new AddressInputDto("Belo Horizonte", "MG", "Centro", "Av. Afonso Pena, 100", "30130-000"),
            PickupWindow: "Hoje até 12h",
            DeliveryWindow: "Hoje até 18h",
            InterestedInInsurance: false);

        var created = service.CreateShipmentAsync(senderId, "Arquiteto Demo", validBikeRequest).GetAwaiter().GetResult();
        Assert(created != null && created.WeightGrams == 5000, "5000g deve ser aceito para bicicleta.");

        // 5001g em BICYCLE deve falhar com VEHICLE_WEIGHT_LIMIT_EXCEEDED
        var invalidBikeRequest = validBikeRequest with { WeightGrams = 5001 };
        try
        {
            service.CreateShipmentAsync(senderId, "Arquiteto Demo", invalidBikeRequest).GetAwaiter().GetResult();
            throw new InvalidOperationException("5001g em BICYCLE deveria ter lançado exceção.");
        }
        catch (DomainRuleViolationException ex)
        {
            Assert(ex.RuleCode == "VEHICLE_WEIGHT_LIMIT_EXCEEDED", $"Código esperado VEHICLE_WEIGHT_LIMIT_EXCEEDED, obtido {ex.RuleCode}");
        }

        // 20001g em MOTORCYCLE e CAR deve falhar
        var invalidCarRequest = validBikeRequest with { VehicleType = VehicleType.CAR, WeightGrams = 20001 };
        try
        {
            service.CreateShipmentAsync(senderId, "Arquiteto Demo", invalidCarRequest).GetAwaiter().GetResult();
            throw new InvalidOperationException("20001g em CAR deveria ter lançado exceção.");
        }
        catch (DomainRuleViolationException ex)
        {
            Assert(ex.RuleCode == "VEHICLE_WEIGHT_LIMIT_EXCEEDED", $"Código esperado VEHICLE_WEIGHT_LIMIT_EXCEEDED, obtido {ex.RuleCode}");
        }
    }),

    ("PR-02: Privacidade de endereços: dono acessa endereço exato e terceiros recebem endereço mascarado (D08)", () =>
    {
        var repo = new InMemoryShipmentsRepository();
        var storage = new LocalDiskObjectStorageProvider();
        var service = new ShipmentsApplicationService(repo, storage);
        var ownerId = Guid.NewGuid();
        var strangerId = Guid.NewGuid();

        var request = new CreateShipmentRequest(
            Title: "Caixa de Ferramentas Técnicas",
            Description: "Ferramentas manuais para manutenção eletromecânica.",
            Category: ShipmentCategory.AUTOPECAS,
            VehicleType: VehicleType.CAR,
            WeightGrams: 8000,
            DimensionsLengthCm: 40,
            DimensionsWidthCm: 30,
            DimensionsHeightCm: 20,
            DeclaredValueCents: 45000,
            SuggestedPriceCents: 6000,
            SpecialCareNotes: ["Caixa pesada"],
            Origin: new AddressInputDto("João Monlevade", "MG", "Belmes", "Rua das Flores, 123", "35930-111"),
            Destination: new AddressInputDto("Belo Horizonte", "MG", "Savassi", "Rua Sergipe, 987", "30130-170"),
            PickupWindow: "Amanhã cedo",
            DeliveryWindow: "Amanhã tarde",
            InterestedInInsurance: true);

        var created = service.CreateShipmentAsync(ownerId, "Oficina Central", request).GetAwaiter().GetResult();

        // Consulta pelo próprio dono: logradouro e número presentes
        var ownerView = service.GetShipmentByIdAsync(created.Id, ownerId).GetAwaiter().GetResult();
        Assert(ownerView != null, "Dono deve encontrar a encomenda.");
        Assert(ownerView!.Origin.StreetAndNumber == "Rua das Flores, 123", "Dono deve ver o endereço exato de origem.");
        Assert(ownerView.Destination.StreetAndNumber == "Rua Sergipe, 987", "Dono deve ver o endereço exato de destino.");
        Assert(!ownerView.Origin.IsMaskedForPrivacy && !ownerView.Destination.IsMaskedForPrivacy, "Endereço não deve ser marcado como mascarado para o dono.");

        // Consulta por terceiro ou não autenticado: logradouro nulo e flag IsMaskedForPrivacy ativa
        var publicView = service.GetShipmentByIdAsync(created.Id, strangerId).GetAwaiter().GetResult();
        Assert(publicView != null, "Terceiro pode ver os detalhes gerais.");
        Assert(publicView!.Origin.StreetAndNumber == null, "Terceiro JAMAIS deve ver o endereço exato de origem.");
        Assert(publicView.Destination.StreetAndNumber == null, "Terceiro JAMAIS deve ver o endereço exato de destino.");
        Assert(publicView.Origin.IsMaskedForPrivacy && publicView.Destination.IsMaskedForPrivacy, "Endereço deve estar explicitamente marcado como mascarado para terceiro.");
        Assert(publicView.Origin.City == "João Monlevade" && publicView.Origin.Neighborhood == "Belmes", "Cidade e bairro permanecem públicos.");
    }),

    ("PR-02: Manifestação de seguro D06 registra interesse sem cobrança e com disclaimer legal", () =>
    {
        var repo = new InMemoryShipmentsRepository();
        var storage = new LocalDiskObjectStorageProvider();
        var service = new ShipmentsApplicationService(repo, storage);
        var senderId = Guid.NewGuid();

        var request = new CreateShipmentRequest(
            Title: "Lote de Dispositivos Eletrônicos",
            Description: "Tablets e leitores para treinamento corporativo.",
            Category: ShipmentCategory.ELETRONICOS,
            VehicleType: VehicleType.CAR,
            WeightGrams: 3000,
            DimensionsLengthCm: 35,
            DimensionsWidthCm: 25,
            DimensionsHeightCm: 15,
            DeclaredValueCents: 120000,
            SuggestedPriceCents: 5000,
            SpecialCareNotes: null,
            Origin: new AddressInputDto("João Monlevade", "MG", "Centro", "Av. Castelo Branco, 50", "35930-000"),
            Destination: new AddressInputDto("Belo Horizonte", "MG", "Funcionários", "Rua Bernardo Guimarães, 1200", "30140-081"),
            PickupWindow: "Hoje",
            DeliveryWindow: "Hoje",
            InterestedInInsurance: true);

        var created = service.CreateShipmentAsync(senderId, "Empresa Demo", request).GetAwaiter().GetResult();
        Assert(created.InsuranceInterest.Interested, "Interesse em seguro deve estar marcado.");
        Assert(created.InsuranceInterest.ChargedAmountCents == 0, "Valor cobrado por seguro deve ser estritamente zero.");
        Assert(!created.InsuranceInterest.HasActivePolicy && !created.InsuranceInterest.GuaranteesCoverage, "Não deve alegar cobertura ou apólice ativa.");
        Assert(created.InsuranceInterest.MandatoryDisclaimer.Contains("Esta manifestação não contrata seguro"), "Disclaimer legal deve estar presente.");
    }),

    ("PR-02: Cadastro de viagem valida capacidade ociosa contra limites vinculantes do modal (D03, D04)", () =>
    {
        var repo = new InMemoryTripsRepository();
        var service = new TripsApplicationService(repo);
        var carrierId = Guid.NewGuid();

        // 5000g em BICYCLE é válido
        var validBikeTrip = new CreateTripRequest(
            VehicleType: VehicleType.BICYCLE,
            VehicleModel: "Bicicleta Caloi com alforges",
            OriginCity: "João Monlevade",
            DestinationCity: "João Monlevade",
            IntermediateStops: ["Carneirinhos", "Loanda"],
            DepartureDate: "Amanhã",
            DepartureTime: "08:00",
            AvailableCapacityGrams: 5000,
            FlexiblePickup: true,
            SuggestedPricePerKgCents: 600);

        var created = service.CreateTripAsync(carrierId, "Ciclista Expresso", true, validBikeTrip).GetAwaiter().GetResult();
        Assert(created != null && created.AvailableCapacityGrams == 5000, "5000g deve ser aceito para bicicleta.");

        // 5001g em BICYCLE deve ser rejeitado com VEHICLE_WEIGHT_LIMIT_EXCEEDED
        var invalidBikeTrip = validBikeTrip with { AvailableCapacityGrams = 5001 };
        try
        {
            service.CreateTripAsync(carrierId, "Ciclista Expresso", true, invalidBikeTrip).GetAwaiter().GetResult();
            throw new InvalidOperationException("5001g em viagem de BICYCLE deveria ter falhado.");
        }
        catch (DomainRuleViolationException ex)
        {
            Assert(ex.RuleCode == "VEHICLE_WEIGHT_LIMIT_EXCEEDED", $"Código esperado VEHICLE_WEIGHT_LIMIT_EXCEEDED, obtido {ex.RuleCode}");
        }

        // 20000g em CAR é válido, 20001g deve ser rejeitado
        var validCarTrip = validBikeTrip with { VehicleType = VehicleType.CAR, AvailableCapacityGrams = 20000 };
        var createdCar = service.CreateTripAsync(carrierId, "Motorista Express", true, validCarTrip).GetAwaiter().GetResult();
        Assert(createdCar != null && createdCar.AvailableCapacityGrams == 20000, "20000g deve ser aceito para CAR.");

        var invalidCarTrip = validCarTrip with { AvailableCapacityGrams = 20001 };
        try
        {
            service.CreateTripAsync(carrierId, "Motorista Express", true, invalidCarTrip).GetAwaiter().GetResult();
            throw new InvalidOperationException("20001g em viagem de CAR deveria ter falhado.");
        }
        catch (DomainRuleViolationException ex)
        {
            Assert(ex.RuleCode == "VEHICLE_WEIGHT_LIMIT_EXCEEDED", $"Código esperado VEHICLE_WEIGHT_LIMIT_EXCEEDED, obtido {ex.RuleCode}");
        }
    }),

    ("PR-03: Rota Direta Compatível (Monlevade -> BH) obtém MatchScore 100 e tipo EXACT_ORIGIN_DESTINATION", () =>
    {
        var shipmentsRepo = new InMemoryShipmentsRepository();
        var tripsRepo = new InMemoryTripsRepository();
        var mapsProvider = new LocalFreeMapsProvider();
        var matchingService = new MatchingService(shipmentsRepo, tripsRepo, mapsProvider);

        var shipment = new Shipment
        {
            SenderId = Guid.NewGuid(),
            Title = "Peças Automotivas Urgentes",
            VehicleType = VehicleType.CAR,
            WeightGrams = 4000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Carneirinhos", null, null, -19.8100, -43.1736),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Belo Horizonte", "MG", "Centro", null, null, -19.9167, -43.9345)
        };

        var trip = new Trip
        {
            CarrierId = Guid.NewGuid(),
            CarrierName = "Transportador Carlos",
            VehicleType = VehicleType.CAR,
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            IntermediateStops = ["Barão de Cocais", "Caeté"],
            AvailableCapacityGrams = 15000,
            Status = TripStatus.SCHEDULED
        };

        var result = matchingService.EvaluateCompatibility(shipment, trip);
        Assert(result.IsCompatible, "Rota direta deve ser compatível.");
        Assert(result.MatchScore == 100, $"Score esperado 100, obtido {result.MatchScore}");
        Assert(result.MatchType == RouteMatchType.EXACT_ORIGIN_DESTINATION, "Tipo esperado EXACT_ORIGIN_DESTINATION");
        Assert(result.DirectionStatus == RouteDirectionStatus.SAME_DIRECTION, "Sentido deve ser SAME_DIRECTION");
        Assert(result.RejectionReason == MatchRejectionReason.NONE, "Motivo deve ser NONE");
    }),

    ("PR-03: Parada Intermediária Compatível (Barão de Cocais -> BH) obtém aprovação e tipo WAYPOINT_AND_DESTINATION", () =>
    {
        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), new LocalFreeMapsProvider());

        var shipment = new Shipment
        {
            SenderId = Guid.NewGuid(),
            Title = "Documentos Cartoriais",
            VehicleType = VehicleType.MOTORCYCLE,
            WeightGrams = 800,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "Barão de Cocais", "MG", "Centro", null, null, -19.9444, -43.4867),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Belo Horizonte", "MG", "Savassi", null, null, -19.9167, -43.9345)
        };

        var trip = new Trip
        {
            CarrierId = Guid.NewGuid(),
            CarrierName = "Marcos Moto",
            VehicleType = VehicleType.MOTORCYCLE,
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            IntermediateStops = ["Barão de Cocais", "Caeté"],
            AvailableCapacityGrams = 10000,
            Status = TripStatus.SCHEDULED
        };

        var result = matchingService.EvaluateCompatibility(shipment, trip);
        Assert(result.IsCompatible, "Coleta em parada intermediária deve ser compatível.");
        Assert(result.MatchType == RouteMatchType.WAYPOINT_AND_DESTINATION, "Tipo esperado WAYPOINT_AND_DESTINATION");
        Assert(result.DirectionStatus == RouteDirectionStatus.SAME_DIRECTION, "Sentido deve ser SAME_DIRECTION");
    }),

    ("PR-03: Paradas Intermediárias Sequenciais (Barão de Cocais -> Caeté) respeitam a ordem da viagem", () =>
    {
        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), new LocalFreeMapsProvider());

        var shipment = new Shipment
        {
            SenderId = Guid.NewGuid(),
            Title = "Amostras Laboratoriais",
            VehicleType = VehicleType.CAR,
            WeightGrams = 2000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "Barão de Cocais", "MG", "Centro", null, null, -19.9444, -43.4867),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Caeté", "MG", "Centro", null, null, -19.8800, -43.6689)
        };

        var trip = new Trip
        {
            CarrierId = Guid.NewGuid(),
            VehicleType = VehicleType.CAR,
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            IntermediateStops = ["Barão de Cocais", "Caeté"],
            AvailableCapacityGrams = 12000,
            Status = TripStatus.SCHEDULED
        };

        var result = matchingService.EvaluateCompatibility(shipment, trip);
        Assert(result.IsCompatible, "Trecho entre paradas intermediárias na ordem correta deve ser compatível.");
        Assert(result.MatchType == RouteMatchType.WAYPOINT_TO_WAYPOINT, "Tipo esperado WAYPOINT_TO_WAYPOINT");
        Assert(result.MatchScore >= 85, $"Score esperado >= 85, obtido {result.MatchScore}");
    }),

    ("PR-03: Sentido Invertido / Contramão Direta (BH -> Monlevade em viagem Monlevade -> BH) é rejeitado com REVERSED_ROUTE", () =>
    {
        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), new LocalFreeMapsProvider());

        var reversedShipment = new Shipment
        {
            SenderId = Guid.NewGuid(),
            Title = "Retorno de Contratos",
            VehicleType = VehicleType.CAR,
            WeightGrams = 1000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "Belo Horizonte", "MG", "Centro", null, null, -19.9167, -43.9345),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "João Monlevade", "MG", "Carneirinhos", null, null, -19.8100, -43.1736)
        };

        var trip = new Trip
        {
            CarrierId = Guid.NewGuid(),
            VehicleType = VehicleType.CAR,
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            IntermediateStops = [],
            AvailableCapacityGrams = 10000,
            Status = TripStatus.SCHEDULED
        };

        var result = matchingService.EvaluateCompatibility(reversedShipment, trip);
        Assert(!result.IsCompatible, "Contramão deve ser estritamente incompatível.");
        Assert(result.RejectionReason == MatchRejectionReason.REVERSED_ROUTE, $"Motivo esperado REVERSED_ROUTE, obtido {result.RejectionReason}");
        Assert(result.DirectionStatus == RouteDirectionStatus.REVERSED_ROUTE, "Sentido esperado REVERSED_ROUTE");
        Assert(result.MatchScore == 0, "Score de rota invertida deve ser zero.");
    }),

    ("PR-03: Sentido Invertido em Paradas Intermediárias (Caeté -> Barão de Cocais) é rejeitado com REVERSED_ROUTE", () =>
    {
        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), new LocalFreeMapsProvider());

        // A viagem passa por: Monlevade -> Barão de Cocais -> Caeté -> BH
        // A encomenda quer ir de Caeté para Barão de Cocais (sentido contrário ao do deslocamento)
        var reversedInterStopShipment = new Shipment
        {
            SenderId = Guid.NewGuid(),
            Title = "Envio Invertido",
            VehicleType = VehicleType.CAR,
            WeightGrams = 1500,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "Caeté", "MG", "Centro", null, null, -19.8800, -43.6689),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Barão de Cocais", "MG", "Centro", null, null, -19.9444, -43.4867)
        };

        var trip = new Trip
        {
            CarrierId = Guid.NewGuid(),
            VehicleType = VehicleType.CAR,
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            IntermediateStops = ["Barão de Cocais", "Caeté"],
            AvailableCapacityGrams = 15000,
            Status = TripStatus.SCHEDULED
        };

        var result = matchingService.EvaluateCompatibility(reversedInterStopShipment, trip);
        Assert(!result.IsCompatible, "Sentido invertido entre paradas intermediárias deve ser incompatível.");
        Assert(result.RejectionReason == MatchRejectionReason.REVERSED_ROUTE, $"Motivo esperado REVERSED_ROUTE, obtido {result.RejectionReason}");
    }),

    ("PR-03: Rota Incompatível (Ipatinga -> Itabira fora do trajeto Monlevade -> BH) é rejeitada com INCOMPATIBLE_ROUTE", () =>
    {
        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), new LocalFreeMapsProvider());

        var offRouteShipment = new Shipment
        {
            SenderId = Guid.NewGuid(),
            Title = "Carga Vale do Aço",
            VehicleType = VehicleType.CAR,
            WeightGrams = 5000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "Ipatinga", "MG", "Horto", null, null, -19.4680, -42.5400),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Itabira", "MG", "Centro", null, null, -19.6190, -43.2260)
        };

        var trip = new Trip
        {
            CarrierId = Guid.NewGuid(),
            VehicleType = VehicleType.CAR,
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            IntermediateStops = [],
            AvailableCapacityGrams = 10000,
            Status = TripStatus.SCHEDULED
        };

        var result = matchingService.EvaluateCompatibility(offRouteShipment, trip);
        Assert(!result.IsCompatible, "Rota fora do trajeto deve ser incompatível.");
        Assert(result.RejectionReason == MatchRejectionReason.INCOMPATIBLE_ROUTE, $"Motivo esperado INCOMPATIBLE_ROUTE, obtido {result.RejectionReason}");
    }),

    ("PR-03: Capacidade Insuficiente (Encomenda 15.000 g > Viagem com 10.000 g disponíveis) é rejeitada com INSUFFICIENT_CAPACITY", () =>
    {
        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), new LocalFreeMapsProvider());

        var heavyShipment = new Shipment
        {
            SenderId = Guid.NewGuid(),
            Title = "Caixa Pesada de Ferramentas",
            VehicleType = VehicleType.CAR,
            WeightGrams = 15000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Carneirinhos", null, null, -19.8100, -43.1736),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Belo Horizonte", "MG", "Centro", null, null, -19.9167, -43.9345)
        };

        var lowCapacityTrip = new Trip
        {
            CarrierId = Guid.NewGuid(),
            VehicleType = VehicleType.CAR,
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            AvailableCapacityGrams = 10000, // Menor que 15.000 g
            Status = TripStatus.SCHEDULED
        };

        var result = matchingService.EvaluateCompatibility(heavyShipment, lowCapacityTrip);
        Assert(!result.IsCompatible, "Capacidade insuficiente deve ser rejeitada.");
        Assert(result.RejectionReason == MatchRejectionReason.INSUFFICIENT_CAPACITY, $"Motivo esperado INSUFFICIENT_CAPACITY, obtido {result.RejectionReason}");
    }),

    ("PR-03: Incompatibilidade de Modal (Encomenda CAR vs Viagem MOTORCYCLE) é rejeitada com INCOMPATIBLE_MODAL", () =>
    {
        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), new LocalFreeMapsProvider());

        var carOnlyShipment = new Shipment
        {
            SenderId = Guid.NewGuid(),
            Title = "Equipamento Volumoso Automóvel",
            VehicleType = VehicleType.CAR,
            WeightGrams = 8000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Carneirinhos", null, null, -19.8100, -43.1736),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Belo Horizonte", "MG", "Centro", null, null, -19.9167, -43.9345)
        };

        var motoTrip = new Trip
        {
            CarrierId = Guid.NewGuid(),
            VehicleType = VehicleType.MOTORCYCLE,
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            AvailableCapacityGrams = 15000,
            Status = TripStatus.SCHEDULED
        };

        var result = matchingService.EvaluateCompatibility(carOnlyShipment, motoTrip);
        Assert(!result.IsCompatible, "Encomenda de CAR não pode ser transportada por MOTORCYCLE.");
        Assert(result.RejectionReason == MatchRejectionReason.INCOMPATIBLE_MODAL, $"Motivo esperado INCOMPATIBLE_MODAL, obtido {result.RejectionReason}");
    }),

    ("PR-03: Limite Regulatório de Peso Excedido (Encomenda 6.000 g vs Viagem BICYCLE de 5 kg máx D04) rejeita com MODAL_WEIGHT_EXCEEDED", () =>
    {
        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), new LocalFreeMapsProvider());

        var shipmentOverBikeLimit = new Shipment
        {
            SenderId = Guid.NewGuid(),
            Title = "Carga de 6kg",
            VehicleType = VehicleType.BICYCLE,
            WeightGrams = 6000, // Acima de 5.000 g
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Carneirinhos", null, null, -19.8100, -43.1736),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "João Monlevade", "MG", "Areia Preta", null, null, -19.8150, -43.1750)
        };

        var bikeTrip = new Trip
        {
            CarrierId = Guid.NewGuid(),
            VehicleType = VehicleType.BICYCLE,
            OriginCity = "João Monlevade",
            DestinationCity = "João Monlevade",
            AvailableCapacityGrams = 5000,
            Status = TripStatus.SCHEDULED
        };

        var result = matchingService.EvaluateCompatibility(shipmentOverBikeLimit, bikeTrip);
        Assert(!result.IsCompatible, "Encomenda > 5kg em BICYCLE deve violar D04.");
        Assert(result.RejectionReason == MatchRejectionReason.MODAL_WEIGHT_EXCEEDED, $"Motivo esperado MODAL_WEIGHT_EXCEEDED, obtido {result.RejectionReason}");
    }),

    ("PR-03: Localização inválida ou ausente (cidades vazias) é rejeitada defensivamente com INVALID_LOCATION", () =>
    {
        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), new LocalFreeMapsProvider());

        var emptyLocShipment = new Shipment
        {
            SenderId = Guid.NewGuid(),
            Title = "Sem Cidade",
            VehicleType = VehicleType.CAR,
            WeightGrams = 1000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "", "MG", "", null, null, 0, 0),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Belo Horizonte", "MG", "", null, null, -19.9167, -43.9345)
        };

        var trip = new Trip
        {
            CarrierId = Guid.NewGuid(),
            VehicleType = VehicleType.CAR,
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            AvailableCapacityGrams = 10000,
            Status = TripStatus.SCHEDULED
        };

        var result = matchingService.EvaluateCompatibility(emptyLocShipment, trip);
        Assert(!result.IsCompatible, "Localização vazia deve ser incompatível.");
        Assert(result.RejectionReason == MatchRejectionReason.INVALID_LOCATION, $"Motivo esperado INVALID_LOCATION, obtido {result.RejectionReason}");
    }),

    ("PR-03: Busca Espacial de Oportunidades em Raio de até 2 km (Regra 3) identifica encomendas dentro do raio e exclui distantes", () =>
    {
        var shipmentsRepo = new InMemoryShipmentsRepository();
        var matchingService = new MatchingService(shipmentsRepo, new InMemoryTripsRepository(), new LocalFreeMapsProvider());

        // Ponto central de entrega em João Monlevade: Centro (-19.8100, -43.1736)
        // Raio: 2000 metros (2.0 km)
        var nearbyList = matchingService.FindNearbyShipmentsAsync(
            latitude: -19.8100,
            longitude: -43.1736,
            radiusMeters: 2000).GetAwaiter().GetResult();

        // O seed padrão contém encomendas com origem em João Monlevade (Carneirinhos ~1.1 km de distância)
        Assert(nearbyList.Count > 0, "Deve encontrar oportunidades próximas em João Monlevade no raio de 2km.");
        foreach (var opp in nearbyList)
        {
            Assert(opp.DistanceMeters <= 2000.0, $"Oportunidade {opp.Title} deve estar a <= 2000m (obtido {opp.DistanceMeters}m)");
            Assert(opp.IsWithin2Km, "Flag IsWithin2Km deve ser true.");
        }

        // Teste de exclusão: busca em coordenada distante (ex: Ouro Preto) com raio de 2000 metros
        // não deve retornar encomendas de João Monlevade
        var farList = matchingService.FindNearbyShipmentsAsync(
            latitude: -20.3856,
            longitude: -43.5033, // Ouro Preto
            radiusMeters: 2000).GetAwaiter().GetResult();

        Assert(farList.Count == 0, "Nenhuma encomenda de Monlevade deve ser retornada em raio de 2km de Ouro Preto.");
    }),

    ("PR-03: Princípio de 1 Encomenda por Pedido (Regra 1) avalia cada encomenda individualmente de forma isolada", () =>
    {
        var shipmentsRepo = new InMemoryShipmentsRepository();
        var tripsRepo = new InMemoryTripsRepository();
        var matchingService = new MatchingService(shipmentsRepo, tripsRepo, new LocalFreeMapsProvider());

        var enc1 = new Shipment
        {
            Id = Guid.NewGuid(),
            SenderId = Guid.NewGuid(),
            Title = "Primeira Encomenda Independente",
            VehicleType = VehicleType.CAR,
            WeightGrams = 3000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Carneirinhos", null, null, -19.8100, -43.1736),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Belo Horizonte", "MG", "Centro", null, null, -19.9167, -43.9345)
        };

        var enc2 = new Shipment
        {
            Id = Guid.NewGuid(),
            SenderId = enc1.SenderId, // Mesmo remetente
            Title = "Segunda Encomenda Independente",
            VehicleType = VehicleType.CAR,
            WeightGrams = 5000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Carneirinhos", null, null, -19.8100, -43.1736),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Belo Horizonte", "MG", "Centro", null, null, -19.9167, -43.9345)
        };

        var trip = new Trip
        {
            Id = Guid.NewGuid(),
            CarrierId = Guid.NewGuid(),
            VehicleType = VehicleType.CAR,
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            AvailableCapacityGrams = 15000,
            Status = TripStatus.SCHEDULED
        };

        var match1 = matchingService.EvaluateCompatibility(enc1, trip);
        var match2 = matchingService.EvaluateCompatibility(enc2, trip);

        Assert(match1.IsCompatible && match2.IsCompatible, "Ambas devem ser compatíveis individualmente.");
        Assert(match1.ShipmentId == enc1.Id, "Match 1 deve preservar estritamente ID da Encomenda 1.");
        Assert(match2.ShipmentId == enc2.Id, "Match 2 deve preservar estritamente ID da Encomenda 2.");
        Assert(match1.ShipmentId != match2.ShipmentId, "Os identificadores de match devem ser totalmente distintos (Regra 1:1).");
    }),

    ("PR-03-COMP: Desvio viário <= 10 km é classificado como COMPATIBLE", () =>
    {
        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), new LocalFreeMapsProvider());

        var trip = new Trip
        {
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            AvailableCapacityGrams = 15000,
            VehicleType = VehicleType.CAR,
            Status = TripStatus.SCHEDULED
        };

        // Encomenda com origem e destino no mesmo corredor (Monlevade -> Caeté)
        var shipment = new Shipment
        {
            Title = "Carga no Corredor",
            VehicleType = VehicleType.CAR,
            WeightGrams = 2000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Carneirinhos", null, null, -19.8100, -43.1736),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Caeté", "MG", "Centro", null, null, -19.8800, -43.6689),
            Status = ShipmentStatus.PUBLISHED
        };

        var detour = matchingService.CalculateRoadDetour(trip, shipment);
        Assert(detour.Classification == DetourClassification.COMPATIBLE, $"Esperado COMPATIBLE, recebido {detour.Classification}");
        Assert(detour.AdditionalDistanceKm <= 10.0, $"Desvio deve ser <= 10km, obtido {detour.AdditionalDistanceKm}");
        Assert(detour.BadgeLabel.Contains("Compatível") || detour.BadgeLabel.Contains("itinerário"), "Badge deve indicar compatibilidade");
    }),

    ("PR-03-COMP: Desvio viário entre 10 km e 20 km é classificado como REQUIRES_EVALUATION", () =>
    {
        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), new LocalFreeMapsProvider());

        var trip = new Trip
        {
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            AvailableCapacityGrams = 15000,
            VehicleType = VehicleType.CAR,
            Status = TripStatus.SCHEDULED
        };

        // Encomenda entregando em Contagem (desvio moderado de ~16 km a partir de BH)
        var shipment = new Shipment
        {
            Title = "Carga com Desvio Moderado",
            VehicleType = VehicleType.CAR,
            WeightGrams = 3000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Carneirinhos", null, null, -19.8100, -43.1736),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Contagem", "MG", "Centro", null, null, -19.9317, -44.0536),
            Status = ShipmentStatus.PUBLISHED
        };

        var detour = matchingService.CalculateRoadDetour(trip, shipment);
        Assert(detour.Classification == DetourClassification.REQUIRES_EVALUATION, $"Esperado REQUIRES_EVALUATION, recebido {detour.Classification}");
        Assert(detour.AdditionalDistanceKm > 10.0 && detour.AdditionalDistanceKm <= 20.0, $"Desvio deve estar entre 10 e 20 km, obtido {detour.AdditionalDistanceKm}");
        Assert(detour.BadgeLabel.Contains("Exige avaliação"), "Badge deve indicar exigência de avaliação");
    }),

    ("PR-03-COMP: Desvio viário > 20 km é classificado como EXCLUDED_BY_DEFAULT", () =>
    {
        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), new LocalFreeMapsProvider());

        var trip = new Trip
        {
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            AvailableCapacityGrams = 15000,
            VehicleType = VehicleType.CAR,
            Status = TripStatus.SCHEDULED
        };

        // Encomenda em Ouro Preto -> Juiz de Fora (totalmente fora da rota Monlevade -> BH)
        var shipment = new Shipment
        {
            Title = "Carga com Grande Desvio",
            VehicleType = VehicleType.CAR,
            WeightGrams = 3000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "Ouro Preto", "MG", "Centro", null, null, -20.3856, -43.5033),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Juiz de Fora", "MG", "Centro", null, null, -21.7642, -43.3496),
            Status = ShipmentStatus.PUBLISHED
        };

        var detour = matchingService.CalculateRoadDetour(trip, shipment);
        Assert(detour.Classification == DetourClassification.EXCLUDED_BY_DEFAULT, $"Esperado EXCLUDED_BY_DEFAULT, recebido {detour.Classification}");
        Assert(detour.AdditionalDistanceKm > 20.0, $"Desvio deve ser > 20 km, obtido {detour.AdditionalDistanceKm}");
    }),

    ("PR-03-COMP: Sentido inverso / contramão é rejeitado com EXCLUDED_BY_DEFAULT", () =>
    {
        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), new LocalFreeMapsProvider());

        var trip = new Trip
        {
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            AvailableCapacityGrams = 15000,
            VehicleType = VehicleType.CAR,
            Status = TripStatus.SCHEDULED
        };

        // Sentido BH -> Monlevade
        var shipment = new Shipment
        {
            Title = "Carga na Contramão",
            VehicleType = VehicleType.CAR,
            WeightGrams = 2000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "Belo Horizonte", "MG", "Centro", null, null, -19.9167, -43.9345),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "João Monlevade", "MG", "Carneirinhos", null, null, -19.8100, -43.1736),
            Status = ShipmentStatus.PUBLISHED
        };

        var detour = matchingService.CalculateRoadDetour(trip, shipment);
        Assert(detour.Classification == DetourClassification.EXCLUDED_BY_DEFAULT, "Contramão deve ser excluída por padrão");
        Assert(detour.BadgeLabel.Contains("Sentido Oposto"), "Badge deve indicar sentido oposto");
    }),

    ("PR-03-COMP: Busca de municípios por typeahead filtra por nome e UF", () =>
    {
        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), new LocalFreeMapsProvider());

        var mgResults = matchingService.SearchMunicipalities("Belo", "MG", 10);
        Assert(mgResults.Count >= 1, "Deve encontrar Belo Horizonte em MG");
        Assert(mgResults.Any(m => m.Name == "Belo Horizonte" && m.StateUf == "MG"), "Belo Horizonte deve estar presente");

        var spResults = matchingService.SearchMunicipalities("São", "SP", 10);
        Assert(spResults.Count >= 1, "Deve encontrar cidades em SP");
        Assert(spResults.All(m => m.StateUf == "SP"), "Todas as cidades devem ser de SP");
    }),

    ("GEO-FIX 1: Quatro polos-piloto resolvem códigos IBGE oficiais e centróides exatos", () =>
    {
        var maps = new LocalFreeMapsProvider();
        var monlevade = maps.ResolveGeoreference("João Monlevade", "MG");
        Assert(monlevade.Status == GeoreferenceStatus.RESOLVED && monlevade.IbgeCode == "3136207", "João Monlevade deve ter IBGE 3136207.");
        Assert(monlevade.MunicipalityCentroid != null && Math.Abs(monlevade.MunicipalityCentroid.Latitude - (-19.8105)) < 0.01, "Centróide de Monlevade válido.");

        var bh = maps.ResolveGeoreference("Belo Horizonte", "MG");
        Assert(bh.Status == GeoreferenceStatus.RESOLVED && bh.IbgeCode == "3106200", "BH deve ter IBGE 3106200.");

        var ipatinga = maps.ResolveGeoreference("Ipatinga", "MG");
        Assert(ipatinga.Status == GeoreferenceStatus.RESOLVED && ipatinga.IbgeCode == "3131307", "Ipatinga deve ter IBGE 3131307.");

        var fabriciano = maps.ResolveGeoreference("Coronel Fabriciano", "MG");
        Assert(fabriciano.Status == GeoreferenceStatus.RESOLVED && fabriciano.IbgeCode == "3119401", "Fabriciano deve ter IBGE 3119401.");
    }),

    ("GEO-FIX 2: Município fora dos polos (Contagem) resolve IBGE 3118601 e gera desvio Exige Avaliação", () =>
    {
        var maps = new LocalFreeMapsProvider();
        var contagem = maps.ResolveGeoreference("Contagem", "MG");
        Assert(contagem.Status == GeoreferenceStatus.RESOLVED && contagem.IbgeCode == "3118601", "Contagem deve resolver IBGE 3118601.");
        Assert(contagem.MunicipalityCentroid != null, "Contagem deve possuir coordenadas centróide.");

        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), maps);
        var trip = new Trip
        {
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            VehicleType = VehicleType.CAR,
            AvailableCapacityGrams = 20000,
            Status = TripStatus.SCHEDULED
        };
        var shipment = new Shipment
        {
            Title = "Carga para Contagem",
            VehicleType = VehicleType.CAR,
            WeightGrams = 2000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Centro", null, null, -19.8105, -43.1740, "3136207", Precision: GeoreferencePrecision.MUNICIPALITY_CENTROID, Status: GeoreferenceStatus.RESOLVED),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Contagem", "MG", "Eldorado", null, null, contagem.MunicipalityCentroid!.Latitude, contagem.MunicipalityCentroid!.Longitude, contagem.IbgeCode, Precision: GeoreferencePrecision.MUNICIPALITY_CENTROID, Status: GeoreferenceStatus.RESOLVED),
            Status = ShipmentStatus.PUBLISHED
        };

        var detour = matchingService.CalculateRoadDetour(trip, shipment);
        Assert(detour.Classification == DetourClassification.REQUIRES_EVALUATION, $"Contagem deve ser REQUIRES_EVALUATION, recebido {detour.Classification}");
        Assert(detour.IsDistanceEstimated, "Distância baseada em centróide municipal deve ser indicada como estimada.");
    }),

    ("GEO-FIX 3: Município inexistente ou ambíguo retorna UNRESOLVED sem coordenadas e sem aprovação silenciosa", () =>
    {
        var maps = new LocalFreeMapsProvider();
        var invalid = maps.ResolveGeoreference("Atlantida Perdida", "MG");
        Assert(invalid.Status == GeoreferenceStatus.UNRESOLVED, "Município inexistente deve retornar UNRESOLVED.");
        Assert(invalid.IbgeCode == null, "Código IBGE deve ser nulo.");
        Assert(invalid.MunicipalityCentroid == null, "Centróide deve ser nulo.");

        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), maps);
        var trip = new Trip
        {
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            VehicleType = VehicleType.CAR,
            AvailableCapacityGrams = 20000,
            Status = TripStatus.SCHEDULED
        };
        var shipment = new Shipment
        {
            Title = "Carga Fantasma",
            VehicleType = VehicleType.CAR,
            WeightGrams = 1000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Centro", null, null, -19.8105, -43.1740, "3136207", Status: GeoreferenceStatus.RESOLVED),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Atlantida Perdida", "MG", "Fundo", null, null, null, null, null, Status: GeoreferenceStatus.UNRESOLVED),
            Status = ShipmentStatus.PUBLISHED
        };

        var eval = matchingService.EvaluateCompatibility(shipment, trip);
        Assert(!eval.IsCompatible, "Encomenda com destino inexistente não pode ser compatível.");
        Assert(eval.RejectionReason == MatchRejectionReason.INVALID_LOCATION, $"Esperado INVALID_LOCATION, recebido {eval.RejectionReason}");
    }),

    ("GEO-FIX 4: Coordenadas ausentes (nulas) geram INSUFFICIENT_LOCATION e rejeição explícita", () =>
    {
        var maps = new LocalFreeMapsProvider();
        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), maps);

        var trip = new Trip
        {
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            VehicleType = VehicleType.CAR,
            AvailableCapacityGrams = 20000,
            Status = TripStatus.SCHEDULED
        };
        var shipment = new Shipment
        {
            Title = "Carga sem coordenadas",
            VehicleType = VehicleType.CAR,
            WeightGrams = 1500,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "Cidade X", "MG", "Bairro", null, null, null, null, Status: GeoreferenceStatus.UNRESOLVED),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Cidade Y", "MG", "Bairro", null, null, null, null, Status: GeoreferenceStatus.UNRESOLVED),
            Status = ShipmentStatus.PUBLISHED
        };

        var detour = matchingService.CalculateRoadDetour(trip, shipment);
        Assert(detour.Classification == DetourClassification.INSUFFICIENT_LOCATION, $"Esperado INSUFFICIENT_LOCATION, recebido {detour.Classification}");
        Assert(detour.BadgeLabel == "Localização Pendente", $"Badge esperado 'Localização Pendente', obtido '{detour.BadgeLabel}'");
    }),

    ("GEO-FIX 5: Coordenadas inválidas ou corrompidas não caem em fallback silencioso de Monlevade", () =>
    {
        var maps = new LocalFreeMapsProvider();
        var resolved = maps.ResolveCoordinatesForCity("NomeTotalmenteInventado12345");
        Assert(resolved == null, "Cidade inventada não deve retornar coordenadas de Monlevade.");
    }),

    ("GEO-FIX 6: Identificação explícita de cálculo estimado e centróide municipal", () =>
    {
        var maps = new LocalFreeMapsProvider();
        var matchingService = new MatchingService(new InMemoryShipmentsRepository(), new InMemoryTripsRepository(), maps);

        var trip = new Trip
        {
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            VehicleType = VehicleType.CAR,
            AvailableCapacityGrams = 20000,
            Status = TripStatus.SCHEDULED
        };
        var shipment = new Shipment
        {
            Title = "Carga com centróide",
            VehicleType = VehicleType.CAR,
            WeightGrams = 2000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Centro", null, null, -19.8105, -43.1740, "3136207", Precision: GeoreferencePrecision.MUNICIPALITY_CENTROID, Status: GeoreferenceStatus.RESOLVED),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Belo Horizonte", "MG", "Centro", null, null, -19.9167, -43.9345, "3106200", Precision: GeoreferencePrecision.MUNICIPALITY_CENTROID, Status: GeoreferenceStatus.RESOLVED),
            Status = ShipmentStatus.PUBLISHED
        };

        var detour = matchingService.CalculateRoadDetour(trip, shipment);
        Assert(detour.IsDistanceEstimated, "Carga com precisão centróide deve sinalizar IsDistanceEstimated = true.");
        Assert(detour.Classification == DetourClassification.COMPATIBLE, "Trajeto direto Monlevade -> BH deve ser COMPATIBLE.");
    }),

    ("GEO-FIX 7: Zero resultados falsos — nenhum município desconhecido mapeado para (-19.8, -43.0)", () =>
    {
        var maps = new LocalFreeMapsProvider();
        var fake1 = maps.ResolveGeoreference("XptoCity", "MG");
        Assert(fake1.MunicipalityCentroid == null, "XptoCity não deve ter centróide.");

        var fake2 = maps.ResolveGeoreference("NovaIorqueFake", "SP");
        Assert(fake2.Status == GeoreferenceStatus.UNRESOLVED, "Cidade fake deve ser UNRESOLVED.");

        var repo = new InMemoryShipmentsRepository();
        repo.RemediateLegacyGeoreferences(maps);
    }),

    ("PR-04: Criação de proposta comercial com cálculo correto de expiração padrão (24h) e mesma data (2h)", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var carrierId = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var shipmentId = Guid.Parse("e0000001-0000-0000-0000-000000000001");

        var prop24h = service.CreateProposalAsync(carrierId, "Transportador Demo", new CreateProposalRequest(
            ShipmentId: shipmentId,
            TripId: null,
            AmountCents: 5000,
            EstimatedPickup: "14:00",
            EstimatedDelivery: "18:00",
            Notes: "Entrega expressa",
            CustomExpirationHours: null)).GetAwaiter().GetResult();

        Assert(prop24h.Status == "PENDING", "Status deve ser PENDING.");
        Assert(prop24h.ExpiresAtUtc > DateTimeOffset.UtcNow.AddHours(23), "Expiração deve ser de aproximadamente 24h.");

        var sameDayTrip = tripRepo.CreateAsync(new Trip
        {
            Id = Guid.NewGuid(),
            CarrierId = carrierId,
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            DepartureDate = "Hoje às 16h",
            AvailableCapacityGrams = 10000
        }).GetAwaiter().GetResult();

        var prop2h = service.CreateProposalAsync(carrierId, "Transportador Demo", new CreateProposalRequest(
            ShipmentId: shipmentId,
            TripId: sameDayTrip.Id,
            AmountCents: 4500,
            EstimatedPickup: "Hoje às 15h",
            EstimatedDelivery: "Hoje às 18h",
            Notes: "Viagem hoje",
            CustomExpirationHours: null)).GetAwaiter().GetResult();

        Assert(prop2h.ExpiresAtUtc <= DateTimeOffset.UtcNow.AddHours(2).AddMinutes(1), "Expiração de viagem no mesmo dia deve ser de 2h.");
    }),

    ("PR-04: Contraproposta atualiza valor, notas, incrementa counterCount, version e status COUNTERED", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var carrierId = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var shipmentId = Guid.Parse("e0000001-0000-0000-0000-000000000001");

        var prop = service.CreateProposalAsync(carrierId, "Transportador Demo", new CreateProposalRequest(
            ShipmentId: shipmentId,
            TripId: null,
            AmountCents: 5000,
            EstimatedPickup: "14:00",
            EstimatedDelivery: "18:00",
            Notes: "Original",
            CustomExpirationHours: 24)).GetAwaiter().GetResult();

        var countered = service.CounterProposalAsync(senderId, ActorRole.SENDER, prop.Id, new CounterProposalRequest(
            AmountCents: 4200,
            EstimatedPickup: "15:00",
            EstimatedDelivery: "19:00",
            Notes: "Ofereço 42 reais",
            CustomExpirationHours: 12)).GetAwaiter().GetResult();

        Assert(countered.Status == "COUNTERED", "Status deve ser COUNTERED.");
        Assert(countered.AmountCents == 4200, "Valor deve ser atualizado para 4200.");
        Assert(countered.CounterCount == 1, "CounterCount deve ser 1.");
        Assert(countered.Version == 2, "Versão deve ser incrementada.");
    }),

    ("PR-04: Aceite único atômico com congelamento imutável de comissão 13% (D10, ADR-0002) e invariante contábil", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var carrierId = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var shipmentId = Guid.Parse("e0000001-0000-0000-0000-000000000001");

        var prop = service.CreateProposalAsync(carrierId, "Transportador Demo", new CreateProposalRequest(
            ShipmentId: shipmentId,
            TripId: null,
            AmountCents: 10000,
            EstimatedPickup: "14:00",
            EstimatedDelivery: "18:00",
            Notes: null,
            CustomExpirationHours: 24)).GetAwaiter().GetResult();

        var contract = service.AcceptProposalAsync(senderId, ActorRole.SENDER, prop.Id, expectedVersion: 1).GetAwaiter().GetResult();

        Assert(contract.Status == "ACTIVE", "Contrato deve ser ACTIVE.");
        Assert(contract.CommissionSnapshot.CommissionRate == 0.13m, "Taxa de comissão deve ser 13%.");
        Assert(contract.CommissionSnapshot.CommissionCents == 1300, "Comissão deve ser R$ 13,00 (1300 cents).");
        Assert(contract.CommissionSnapshot.CarrierDueCents == 8700, "Repasse do transportador deve ser R$ 87,00 (8700 cents).");
        Assert(contract.CommissionSnapshot.CommissionCents + contract.CommissionSnapshot.CarrierDueCents == contract.AmountCents, "Invariante contábil deve ser satisfeita.");

        var shipmentAfter = shipRepo.GetByIdAsync(shipmentId).GetAwaiter().GetResult()!;
        Assert(shipmentAfter.Status == ShipmentStatus.CONTRACTED, "Status da encomenda deve ser CONTRACTED.");
    }),

    ("PR-04 (Gate G2 Concorrência): Duas tentativas concorrentes de aceite (Task.WhenAll) resultam em exatamente 1 vencedor e 1 conflito 409", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var carrier1 = Guid.NewGuid();
        var carrier2 = Guid.NewGuid();
        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");

        var shipment = shipRepo.CreateAsync(new Shipment
        {
            Id = Guid.NewGuid(),
            SenderId = senderId,
            SenderName = "Remetente Concorrência",
            Title = "Carga Disputada",
            Category = ShipmentCategory.GERAL,
            WeightGrams = 1000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Centro", null, null, -19.81, -43.17),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Belo Horizonte", "MG", "Centro", null, null, -19.91, -43.93),
            Status = ShipmentStatus.PUBLISHED
        }).GetAwaiter().GetResult();

        var prop1 = service.CreateProposalAsync(carrier1, "Transportador 1", new CreateProposalRequest(
            ShipmentId: shipment.Id,
            TripId: null,
            AmountCents: 5000,
            EstimatedPickup: null,
            EstimatedDelivery: null,
            Notes: null,
            CustomExpirationHours: null)).GetAwaiter().GetResult();

        var prop2 = service.CreateProposalAsync(carrier2, "Transportador 2", new CreateProposalRequest(
            ShipmentId: shipment.Id,
            TripId: null,
            AmountCents: 4800,
            EstimatedPickup: null,
            EstimatedDelivery: null,
            Notes: null,
            CustomExpirationHours: null)).GetAwaiter().GetResult();

        int successes = 0;
        int conflicts = 0;

        var t1 = Task.Run(async () =>
        {
            try
            {
                await service.AcceptProposalAsync(senderId, ActorRole.SENDER, prop1.Id, prop1.Version);
                Interlocked.Increment(ref successes);
            }
            catch (DomainRuleViolationException ex) when (ex.RuleCode == "CONCURRENT_ACCEPTANCE_CONFLICT" && ex.HttpStatusCode == 409)
            {
                Interlocked.Increment(ref conflicts);
            }
        });

        var t2 = Task.Run(async () =>
        {
            try
            {
                await service.AcceptProposalAsync(senderId, ActorRole.SENDER, prop2.Id, prop2.Version);
                Interlocked.Increment(ref successes);
            }
            catch (DomainRuleViolationException ex) when (ex.RuleCode == "CONCURRENT_ACCEPTANCE_CONFLICT" && ex.HttpStatusCode == 409)
            {
                Interlocked.Increment(ref conflicts);
            }
        });

        Task.WhenAll(t1, t2).GetAwaiter().GetResult();

        Assert(successes == 1, $"Exatamente 1 proposta deve vencer a concorrência. Sucessos: {successes}");
        Assert(conflicts == 1, $"A proposta perdedora deve falhar com conflito 409. Conflitos: {conflicts}");
    }),

    ("PR-04: Proposta concorrente derrotada transita deterministicamente para SUPERSEDED com evento de auditoria", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var shipment = shipRepo.CreateAsync(new Shipment
        {
            Id = Guid.NewGuid(),
            SenderId = senderId,
            Title = "Carga Teste Superseded",
            WeightGrams = 500,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Centro", null, null, -19.81, -43.17),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Belo Horizonte", "MG", "Centro", null, null, -19.91, -43.93),
            Status = ShipmentStatus.PUBLISHED
        }).GetAwaiter().GetResult();

        var prop1 = service.CreateProposalAsync(Guid.NewGuid(), "Transportador A", new CreateProposalRequest(shipment.Id, null, 4000, null, null, null, null)).GetAwaiter().GetResult();
        var prop2 = service.CreateProposalAsync(Guid.NewGuid(), "Transportador B", new CreateProposalRequest(shipment.Id, null, 4200, null, null, null, null)).GetAwaiter().GetResult();

        service.AcceptProposalAsync(senderId, ActorRole.SENDER, prop1.Id, prop1.Version).GetAwaiter().GetResult();

        var prop2After = service.GetProposalByIdAsync(prop2.Id).GetAwaiter().GetResult()!;
        Assert(prop2After.Status == "SUPERSEDED", "Proposta não escolhida deve transitar para SUPERSEDED.");

        var events = service.GetProposalEventsAsync(prop2.Id).GetAwaiter().GetResult();
        Assert(events.Any(e => e.EventType == "PROPOSAL_SUPERSEDED"), "Deve conter evento auditável PROPOSAL_SUPERSEDED.");
    }),

    ("PR-04: Reserva de capacidade por trecho (legs) deduz peso nos trechos percorridos e rejeita trecho sem capacidade suficiente", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var carrierId = Guid.NewGuid();
        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");

        var trip = tripRepo.CreateAsync(new Trip
        {
            Id = Guid.NewGuid(),
            CarrierId = carrierId,
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            IntermediateStops = ["Barão de Cocais", "Caeté"],
            AvailableCapacityGrams = 5000,
            LegCapacities = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
            {
                ["leg_0_joão monlevade_barão de cocais"] = 5000,
                ["leg_1_barão de cocais_caeté"] = 5000,
                ["leg_2_caeté_belo horizonte"] = 5000
            }
        }).GetAwaiter().GetResult();

        var ship1 = shipRepo.CreateAsync(new Shipment
        {
            Id = Guid.NewGuid(),
            SenderId = senderId,
            Title = "Carga Monlevade até Caeté",
            WeightGrams = 4000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Centro", null, null, -19.81, -43.17),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Caeté", "MG", "Centro", null, null, -19.88, -43.67),
            Status = ShipmentStatus.PUBLISHED
        }).GetAwaiter().GetResult();

        var prop1 = service.CreateProposalAsync(carrierId, "Transportador Rota", new CreateProposalRequest(ship1.Id, trip.Id, 3000, null, null, null, null)).GetAwaiter().GetResult();
        var contract1 = service.AcceptProposalAsync(senderId, ActorRole.SENDER, prop1.Id, prop1.Version).GetAwaiter().GetResult();

        Assert(contract1.LegReservations.Count == 2, "Carga Monlevade -> Caeté deve reservar 2 trechos (0 e 1).");

        var tripUpdated = tripRepo.GetByIdAsync(trip.Id).GetAwaiter().GetResult()!;
        Assert(tripUpdated.LegCapacities["leg_0_joão monlevade_barão de cocais"] == 1000, "Trecho 0 deve ter 1000g restantes.");
        Assert(tripUpdated.LegCapacities["leg_1_barão de cocais_caeté"] == 1000, "Trecho 1 deve ter 1000g restantes.");
        Assert(tripUpdated.LegCapacities["leg_2_caeté_belo horizonte"] == 5000, "Trecho 2 (Caeté -> BH) deve continuar com 5000g intactos.");

        var ship2 = shipRepo.CreateAsync(new Shipment
        {
            Id = Guid.NewGuid(),
            SenderId = senderId,
            Title = "Carga Excessiva no Trecho 1",
            WeightGrams = 2000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "Barão de Cocais", "MG", "Centro", null, null, -19.94, -43.48),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Caeté", "MG", "Centro", null, null, -19.88, -43.67),
            Status = ShipmentStatus.PUBLISHED
        }).GetAwaiter().GetResult();

        var prop2 = service.CreateProposalAsync(carrierId, "Transportador Rota", new CreateProposalRequest(ship2.Id, trip.Id, 2000, null, null, null, null)).GetAwaiter().GetResult();

        bool rejected = false;
        try
        {
            service.AcceptProposalAsync(senderId, ActorRole.SENDER, prop2.Id, prop2.Version).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "INSUFFICIENT_LEG_CAPACITY")
        {
            rejected = true;
        }

        Assert(rejected, "Proposta deve ser rejeitada por INSUFFICIENT_LEG_CAPACITY.");
    }),

    ("PR-04: Cancelamento pré-coleta consensual e justificado restaura capacidade dos trechos e tem taxa simulada zero", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var carrierId = Guid.NewGuid();
        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");

        var trip = tripRepo.CreateAsync(new Trip
        {
            Id = Guid.NewGuid(),
            CarrierId = carrierId,
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            AvailableCapacityGrams = 10000
        }).GetAwaiter().GetResult();

        var shipment = shipRepo.CreateAsync(new Shipment
        {
            Id = Guid.NewGuid(),
            SenderId = senderId,
            Title = "Carga Pré-Coleta",
            WeightGrams = 3000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Centro", null, null, -19.81, -43.17),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Belo Horizonte", "MG", "Centro", null, null, -19.91, -43.93),
            Status = ShipmentStatus.PUBLISHED
        }).GetAwaiter().GetResult();

        var prop = service.CreateProposalAsync(carrierId, "Transportador Demo", new CreateProposalRequest(shipment.Id, trip.Id, 6000, null, null, null, null)).GetAwaiter().GetResult();
        var contract = service.AcceptProposalAsync(senderId, ActorRole.SENDER, prop.Id, prop.Version).GetAwaiter().GetResult();

        var tripMid = tripRepo.GetByIdAsync(trip.Id).GetAwaiter().GetResult()!;
        Assert(tripMid.AvailableCapacityGrams == 7000, "Capacidade deve ter sido deduzida para 7000g.");

        var cancelledContract = service.CancelContractPrePickupAsync(senderId, ActorRole.SENDER, contract.Id, new CancelContractRequest(
            ReasonCode: CancellationReasonCode.MUTUAL_AGREEMENT,
            Justification: "Acordo mútuo amigável",
            ReopenForBidding: true)).GetAwaiter().GetResult();

        Assert(cancelledContract.Status == "CANCELLED_PRE_PICKUP", "Status deve ser CANCELLED_PRE_PICKUP.");
        Assert(cancelledContract.Cancellation!.SimulatedPenaltyCents == 0, "Cancelamento amigável não possui taxa.");

        var tripRestored = tripRepo.GetByIdAsync(trip.Id).GetAwaiter().GetResult()!;
        Assert(tripRestored.AvailableCapacityGrams == 10000, "Capacidade deve ser restaurada para 10000g.");

        var shipRestored = shipRepo.GetByIdAsync(shipment.Id).GetAwaiter().GetResult()!;
        Assert(shipRestored.Status == ShipmentStatus.PUBLISHED, "Encomenda deve ser reaberta como PUBLISHED para novos lances.");
    }),

    ("PR-04: Cancelamento pré-coleta injustificado gera simulação de penalidade de 10% com piso de R$ 7,00 (rateio 80/20)", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var shipment = shipRepo.CreateAsync(new Shipment
        {
            Id = Guid.NewGuid(),
            SenderId = senderId,
            Title = "Carga Cancelamento Unilateral",
            WeightGrams = 1000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Centro", null, null, -19.81, -43.17),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Belo Horizonte", "MG", "Centro", null, null, -19.91, -43.93),
            Status = ShipmentStatus.PUBLISHED
        }).GetAwaiter().GetResult();

        var prop = service.CreateProposalAsync(Guid.NewGuid(), "Transportador Demo", new CreateProposalRequest(shipment.Id, null, 4000, null, null, null, null)).GetAwaiter().GetResult();
        var contract = service.AcceptProposalAsync(senderId, ActorRole.SENDER, prop.Id, prop.Version).GetAwaiter().GetResult();

        var cancelled = service.CancelContractPrePickupAsync(senderId, ActorRole.SENDER, contract.Id, new CancelContractRequest(
            ReasonCode: CancellationReasonCode.UNJUSTIFIED_CANCELLATION,
            Justification: "Cancelamento sem motivo plausível",
            ReopenForBidding: false)).GetAwaiter().GetResult();

        Assert(cancelled.Cancellation!.SimulatedPenaltyCents == 700, "Penalidade simulada deve respeitar o piso mínimo de R$ 7,00 (700 cents).");
        Assert(cancelled.Cancellation.PolicyDisclaimer.Contains("80% lesado / 20% plataforma"), "Disclaimer deve referenciar rateio 80/20.");
    }),

    ("PR-04 (Regra 2): Detecção de 2ª encomenda do mesmo remetente emite oferta prioritária com janela exclusiva de 10 minutos", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var carrierId = Guid.NewGuid();
        var senderId = Guid.NewGuid();

        var trip = tripRepo.CreateAsync(new Trip
        {
            Id = Guid.NewGuid(),
            CarrierId = carrierId,
            CarrierName = "Transportador Prioridade",
            OriginCity = "João Monlevade",
            DestinationCity = "Belo Horizonte",
            AvailableCapacityGrams = 10000
        }).GetAwaiter().GetResult();

        var ship1 = shipRepo.CreateAsync(new Shipment
        {
            Id = Guid.NewGuid(),
            SenderId = senderId,
            SenderName = "Cliente Duas Encomendas",
            Title = "Primeiro Pacote",
            WeightGrams = 2000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Centro", null, null, -19.81, -43.17),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Belo Horizonte", "MG", "Centro", null, null, -19.91, -43.93),
            Status = ShipmentStatus.PUBLISHED,
            CreatedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-5)
        }).GetAwaiter().GetResult();

        var ship2 = shipRepo.CreateAsync(new Shipment
        {
            Id = Guid.NewGuid(),
            SenderId = senderId,
            SenderName = "Cliente Duas Encomendas",
            Title = "Segundo Pacote Independente (Regra 1)",
            WeightGrams = 1500,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Centro", null, null, -19.81, -43.17),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Belo Horizonte", "MG", "Centro", null, null, -19.91, -43.93),
            Status = ShipmentStatus.PUBLISHED,
            CreatedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-2)
        }).GetAwaiter().GetResult();

        var prop1 = service.CreateProposalAsync(carrierId, "Transportador Prioridade", new CreateProposalRequest(ship1.Id, trip.Id, 5000, null, null, null, null)).GetAwaiter().GetResult();
        service.AcceptProposalAsync(senderId, ActorRole.SENDER, prop1.Id, prop1.Version).GetAwaiter().GetResult();

        var activeOffer = service.GetActivePriorityOfferAsync(ship2.Id).GetAwaiter().GetResult();
        Assert(activeOffer is not null, "Oferta prioritária para a 2ª encomenda deve ter sido emitida.");
        Assert(activeOffer!.EligibleCarrierId == carrierId, "Transportador da 1ª encomenda deve ser o beneficiário da prioridade.");
        Assert(activeOffer.ExpiresAtUtc > DateTimeOffset.UtcNow.AddMinutes(9), "Janela de exclusividade deve ser de 10 minutos.");

        var otherCarrierId = Guid.NewGuid();
        bool blocked = false;
        try
        {
            service.CreateProposalAsync(otherCarrierId, "Outro Transportador", new CreateProposalRequest(ship2.Id, null, 4000, null, null, null, null)).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "PRIORITY_OFFER_ACTIVE" && ex.HttpStatusCode == 409)
        {
            blocked = true;
        }

        Assert(blocked, "Outro transportador deve ser impedido de propor durante a janela de prioridade.");
    }),

    ("PR-04 (Regra 2): Recusa de oferta prioritária da 2ª encomenda não gera penalidade e abre encomenda para o feed geral", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var carrierId = Guid.NewGuid();
        var shipmentId = Guid.NewGuid();

        propRepo.SavePriorityOfferAsync(new PriorityOffer(
            ShipmentId: shipmentId,
            EligibleCarrierId: carrierId,
            FirstShipmentId: Guid.NewGuid(),
            TripId: Guid.NewGuid(),
            IssuedAtUtc: DateTimeOffset.UtcNow,
            ExpiresAtUtc: DateTimeOffset.UtcNow.AddMinutes(10),
            IsDeclined: false,
            IsAccepted: false,
            Notes: "Teste Prioridade")).GetAwaiter().GetResult();

        var declined = service.RespondPriorityOfferAsync(carrierId, shipmentId, accept: false).GetAwaiter().GetResult();
        Assert(declined.IsDeclined, "Oferta deve estar marcada como recusada.");

        var otherCarrier = Guid.NewGuid();
        shipRepo.CreateAsync(new Shipment
        {
            Id = shipmentId,
            SenderId = Guid.NewGuid(),
            Title = "2ª Encomenda Liberada",
            WeightGrams = 1000,
            OriginAddress = new ShipmentAddress(AddressKind.ORIGIN, "João Monlevade", "MG", "Centro", null, null, -19.81, -43.17),
            DestinationAddress = new ShipmentAddress(AddressKind.DESTINATION, "Belo Horizonte", "MG", "Centro", null, null, -19.91, -43.93),
            Status = ShipmentStatus.PUBLISHED
        }).GetAwaiter().GetResult();

        var prop = service.CreateProposalAsync(otherCarrier, "Outro Transportador", new CreateProposalRequest(shipmentId, null, 3500, null, null, null, null)).GetAwaiter().GetResult();
        Assert(prop.Status == "PENDING", "Após recusa, proposta de outro transportador deve ser aceita com sucesso.");
    }),

    ("PR-04: Proposta expirada não pode ser aceita nem contraposta (PROPOSAL_EXPIRED)", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var carrierId = Guid.NewGuid();
        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var shipmentId = Guid.Parse("e0000001-0000-0000-0000-000000000001");

        var expiredProposal = propRepo.CreateProposalAsync(new Proposal
        {
            Id = Guid.NewGuid(),
            ShipmentId = shipmentId,
            CarrierId = carrierId,
            SenderId = senderId,
            AmountCents = 5000,
            Status = ProposalStatus.PENDING,
            ExpiresAtUtc = DateTimeOffset.UtcNow.AddMinutes(-10),
            Version = 1
        }).GetAwaiter().GetResult();

        bool acceptRejected = false;
        try
        {
            service.AcceptProposalAsync(senderId, ActorRole.SENDER, expiredProposal.Id, 1).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "PROPOSAL_EXPIRED")
        {
            acceptRejected = true;
        }

        Assert(acceptRejected, "Aceite de proposta expirada deve falhar.");
    }),

    ("PR-04: Auto-proposta bloqueada (remetente não pode enviar proposta para sua própria encomenda - D05/D08)", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var shipmentId = Guid.Parse("e0000001-0000-0000-0000-000000000001");

        bool selfProposalBlocked = false;
        try
        {
            service.CreateProposalAsync(senderId, "Remetente Tentando Auto-Proposta", new CreateProposalRequest(
                ShipmentId: shipmentId,
                TripId: null,
                AmountCents: 4000,
                EstimatedPickup: null,
                EstimatedDelivery: null,
                Notes: null,
                CustomExpirationHours: null)).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "SELF_CONTRACTING_FORBIDDEN" && ex.HttpStatusCode == 403)
        {
            selfProposalBlocked = true;
        }

        Assert(selfProposalBlocked, "Remetente deve ser proibido de enviar proposta para sua própria encomenda.");
    }),

    ("PR-04-AUTH: Terceiro tentando aceitar proposta alheia é bloqueado com 403 (AUTH_FORBIDDEN_NOT_PARTY)", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var thirdPartyId = Guid.NewGuid();
        var proposalId = Guid.Parse("d0000001-0000-0000-0000-000000000001");

        bool blocked = false;
        try
        {
            service.AcceptProposalAsync(thirdPartyId, ActorRole.SENDER, proposalId, 1).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "AUTH_FORBIDDEN_NOT_PARTY" && ex.HttpStatusCode == 403)
        {
            blocked = true;
        }

        Assert(blocked, "Terceiro deve ser bloqueado ao tentar aceitar proposta alheia com 403.");
    }),

    ("PR-04-AUTH: Terceiro tentando enviar contraproposta é bloqueado com 403 (AUTH_FORBIDDEN_NOT_PARTY)", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var thirdPartyId = Guid.NewGuid();
        var proposalId = Guid.Parse("d0000001-0000-0000-0000-000000000001");

        bool blocked = false;
        try
        {
            service.CounterProposalAsync(thirdPartyId, ActorRole.CARRIER, proposalId, new CounterProposalRequest(4900, null, null, null, null)).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "AUTH_FORBIDDEN_NOT_PARTY" && ex.HttpStatusCode == 403)
        {
            blocked = true;
        }

        Assert(blocked, "Terceiro deve ser bloqueado ao tentar enviar contraproposta com 403.");
    }),

    ("PR-04-AUTH: Auto-aceite de proposta própria é bloqueado com 422 (SELF_ACCEPTANCE_FORBIDDEN)", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var carrierId = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var proposalId = Guid.Parse("d0000001-0000-0000-0000-000000000001");

        bool blocked = false;
        try
        {
            service.AcceptProposalAsync(carrierId, ActorRole.CARRIER, proposalId, 1).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "SELF_ACCEPTANCE_FORBIDDEN" && ex.HttpStatusCode == 422)
        {
            blocked = true;
        }

        Assert(blocked, "Criador da proposta pendente não pode aceitar a própria proposta (deve retornar 422).");
    }),

    ("PR-04-AUTH: Contraproposta fora de turno pelo mesmo autor é bloqueada com 422 (COUNTER_TURN_VIOLATION)", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var proposalId = Guid.Parse("d0000001-0000-0000-0000-000000000001");

        // 1. Remetente envia primeira contraproposta (Válida)
        var countered = service.CounterProposalAsync(senderId, ActorRole.SENDER, proposalId, new CounterProposalRequest(4500, null, null, "Primeira contraproposta", null)).GetAwaiter().GetResult();
        Assert(countered.Status == "COUNTERED", "Status deve ser COUNTERED.");

        // 2. Remetente tenta enviar uma SEGUNDA contraproposta consecutiva sem resposta do transportador
        bool blocked = false;
        try
        {
            service.CounterProposalAsync(senderId, ActorRole.SENDER, proposalId, new CounterProposalRequest(4400, null, null, "Segunda tentativa", null)).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "COUNTER_TURN_VIOLATION" && ex.HttpStatusCode == 422)
        {
            blocked = true;
        }

        Assert(blocked, "Contraproposta consecutiva pelo mesmo autor deve ser bloqueada com 422 por violação de turno.");
    }),

    ("PR-04-AUTH: Terceiro tentando cancelar contrato pré-coleta é bloqueado com 403 (UNAUTHORIZED_CONTRACT_ACTION)", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var proposalId = Guid.Parse("d0000001-0000-0000-0000-000000000001");

        // Sender aceita proposta original
        var contract = service.AcceptProposalAsync(senderId, ActorRole.SENDER, proposalId, 1).GetAwaiter().GetResult();
        Assert(contract.Status == "ACTIVE", "Contrato deve ser ativo.");

        // Terceiro tenta cancelar
        var thirdPartyId = Guid.NewGuid();
        bool blocked = false;
        try
        {
            service.CancelContractPrePickupAsync(thirdPartyId, ActorRole.SENDER, contract.Id, new CancelContractRequest(
                CancellationReasonCode.MUTUAL_AGREEMENT,
                "Tentativa indevida",
                false)).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "UNAUTHORIZED_CONTRACT_ACTION" && ex.HttpStatusCode == 403)
        {
            blocked = true;
        }

        Assert(blocked, "Terceiro deve ser bloqueado ao tentar cancelar contrato alheio com 403.");
    }),

    ("PR-04-AUTH: Privacidade comercial — Transportador vê apenas sua própria proposta na encomenda", () =>
    {
        var propRepo = new InMemoryProposalsRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var tripRepo = new InMemoryTripsRepository();
        var options = Microsoft.Extensions.Options.Options.Create(new TopicLogOptions
        {
            DefaultCommercialPolicies = new CommercialPolicyOptions { FreePlanCommissionRate = 0.130000m }
        });
        var service = new ProposalsApplicationService(propRepo, shipRepo, tripRepo, options);

        var shipmentId = Guid.Parse("e0000001-0000-0000-0000-000000000001");
        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var carrierAId = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var carrierBId = Guid.NewGuid();

        // Carrier B cria uma proposta concorrente
        var propB = service.CreateProposalAsync(carrierBId, "Transportador B", new CreateProposalRequest(
            ShipmentId: shipmentId,
            TripId: null,
            AmountCents: 4600,
            EstimatedPickup: null,
            EstimatedDelivery: null,
            Notes: "Proposta B",
            CustomExpirationHours: null)).GetAwaiter().GetResult();

        // 1. Remetente consulta e deve ver ambas as propostas
        var senderList = service.ListProposalsByShipmentIdAsync(shipmentId, senderId).GetAwaiter().GetResult();
        Assert(senderList.Count >= 2, "Remetente deve visualizar todas as propostas concorrentes.");

        // 2. Carrier A consulta e deve ver SOMENTE a sua própria proposta
        var carrierAList = service.ListProposalsByShipmentIdAsync(shipmentId, carrierAId).GetAwaiter().GetResult();
        Assert(carrierAList.All(p => p.CarrierId == carrierAId), "Carrier A deve visualizar apenas sua própria proposta.");

        // 3. Carrier B consulta e deve ver SOMENTE a sua proposta
        var carrierBList = service.ListProposalsByShipmentIdAsync(shipmentId, carrierBId).GetAwaiter().GetResult();
        Assert(carrierBList.Count == 1 && carrierBList[0].Id == propB.Id, "Carrier B deve visualizar apenas a sua própria proposta.");
    }),

    ("PR-05-D16: Código de entrega HMAC-SHA256 e FixedTimeEquals previnem timing attack e armazenam hash protegido", () =>
    {
        var (hash, salt) = InMemoryFulfillmentRepository.ComputeCodeHash("5821");
        Assert(hash.Length == 64, "Hash SHA-256 deve ter 64 caracteres hexadecimais.");
        Assert(salt.Length == 32, "Salt deve ter 32 caracteres hexadecimais.");

        var valid = InMemoryFulfillmentRepository.VerifyCodeHash("5821", hash, salt);
        Assert(valid, "Código correto deve ser verificado com sucesso.");

        var wrong = InMemoryFulfillmentRepository.VerifyCodeHash("0000", hash, salt);
        Assert(!wrong, "Código incorreto não deve ser aceito.");
    }),

    ("PR-05 (Decisão 2): Transportador tentando consultar código de entrega é bloqueado com 403 Forbidden", () =>
    {
        var fulfillmentRepo = new InMemoryFulfillmentRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var service = new FulfillmentApplicationService(fulfillmentRepo, shipRepo);

        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var carrierId = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var order = fulfillmentRepo.CreateOrderAsync(new DeliveryOrder
        {
            ContractId = Guid.NewGuid(),
            ShipmentId = Guid.NewGuid(),
            TripId = Guid.NewGuid(),
            SenderId = senderId,
            CarrierId = carrierId,
            SenderName = "Remetente Demo",
            CarrierName = "Transportador Demo",
            Status = DeliveryOrderStatus.IN_TRANSIT
        }).GetAwaiter().GetResult();

        bool blocked = false;
        try
        {
            service.GetDeliveryCodeAsync(carrierId, ActorRole.CARRIER, order.Id).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "FORBIDDEN_CARRIER_CANNOT_VIEW_DELIVERY_CODE" && ex.HttpStatusCode == 403)
        {
            blocked = true;
        }

        Assert(blocked, "Transportador deve ser bloqueado ao tentar consultar código de entrega com 403.");
    }),

    ("PR-05 (Decisão 2): Remetente autenticado consulta código de entrega com sucesso", () =>
    {
        var fulfillmentRepo = new InMemoryFulfillmentRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var service = new FulfillmentApplicationService(fulfillmentRepo, shipRepo);

        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var carrierId = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var order = fulfillmentRepo.CreateOrderAsync(new DeliveryOrder
        {
            ContractId = Guid.NewGuid(),
            ShipmentId = Guid.NewGuid(),
            TripId = Guid.NewGuid(),
            SenderId = senderId,
            CarrierId = carrierId,
            SenderName = "Remetente Demo",
            CarrierName = "Transportador Demo",
            Status = DeliveryOrderStatus.IN_TRANSIT
        }).GetAwaiter().GetResult();

        var codeResp = service.GetDeliveryCodeAsync(senderId, ActorRole.SENDER, order.Id).GetAwaiter().GetResult();
        Assert(!string.IsNullOrWhiteSpace(codeResp.DeliveryCode), "Código deve ser retornado ao remetente.");
        Assert(codeResp.DeliveryCode.Length == 4 && codeResp.DeliveryCode.All(char.IsDigit), "Código deve ter exatamente 4 dígitos.");
        Assert(codeResp.RemainingAttempts == 3, "Desafio novo deve ter 3 tentativas restantes.");
        Assert(!codeResp.IsLocked, "Desafio novo não deve estar bloqueado.");
    }),

    ("PR-05 (Decisão 1): Conclusão de entrega validada exclusivamente via código / senha sem exigência de foto", () =>
    {
        var fulfillmentRepo = new InMemoryFulfillmentRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var service = new FulfillmentApplicationService(fulfillmentRepo, shipRepo);

        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var carrierId = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var order = fulfillmentRepo.CreateOrderAsync(new DeliveryOrder
        {
            ContractId = Guid.NewGuid(),
            ShipmentId = Guid.NewGuid(),
            TripId = Guid.NewGuid(),
            SenderId = senderId,
            CarrierId = carrierId,
            Status = DeliveryOrderStatus.IN_TRANSIT
        }).GetAwaiter().GetResult();

        // Remetente gera o desafio
        var challenge = service.GetDeliveryCodeAsync(senderId, ActorRole.SENDER, order.Id).GetAwaiter().GetResult();

        // Conclusão de entrega diretamente com o código sem prévio upload de foto
        var confirmed = service.ConfirmDeliveryAsync(carrierId, ActorRole.CARRIER, order.Id, new ConfirmDeliveryRequest(challenge.DeliveryCode)).GetAwaiter().GetResult();

        Assert(confirmed.Status == "DELIVERED_VERIFIED", "Entrega deve ser confirmada diretamente com código/senha válido sem exigir foto.");
    }),

    ("PR-05 (Decisão 1): Código incorreto decrementa tentativas e 3 falhas consecutivas bloqueiam o desafio (422)", () =>
    {
        var fulfillmentRepo = new InMemoryFulfillmentRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var service = new FulfillmentApplicationService(fulfillmentRepo, shipRepo);

        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var carrierId = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var order = fulfillmentRepo.CreateOrderAsync(new DeliveryOrder
        {
            ContractId = Guid.NewGuid(),
            ShipmentId = Guid.NewGuid(),
            TripId = Guid.NewGuid(),
            SenderId = senderId,
            CarrierId = carrierId,
            Status = DeliveryOrderStatus.IN_TRANSIT
        }).GetAwaiter().GetResult();

        // 1. Remetente visualiza código
        var codeResp = service.GetDeliveryCodeAsync(senderId, ActorRole.SENDER, order.Id).GetAwaiter().GetResult();
        var validCode = codeResp.DeliveryCode;
        var wrongCode = validCode == "1234" ? "9999" : "1234";

        // 2. Transportador anexa evidência fotográfica
        service.UploadDeliveryProofAsync(carrierId, ActorRole.CARRIER, order.Id, new DeliveryProofUploadRequest("https://storage.topiclog.local/proofs/photo1.jpg")).GetAwaiter().GetResult();

        // Tentativa 1 incorreta
        bool failed1 = false;
        try
        {
            service.ConfirmDeliveryAsync(carrierId, ActorRole.CARRIER, order.Id, new ConfirmDeliveryRequest(wrongCode)).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "DELIVERY_CODE_MISMATCH" && ex.HttpStatusCode == 400)
        {
            failed1 = true;
        }
        Assert(failed1, "Tentativa 1 deve falhar com 400.");

        // Tentativa 2 incorreta
        bool failed2 = false;
        try
        {
            service.ConfirmDeliveryAsync(carrierId, ActorRole.CARRIER, order.Id, new ConfirmDeliveryRequest(wrongCode)).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "DELIVERY_CODE_MISMATCH" && ex.HttpStatusCode == 400)
        {
            failed2 = true;
        }
        Assert(failed2, "Tentativa 2 deve falhar com 400.");

        // Tentativa 3 incorreta -> Bloqueio definitivo (422 CHALLENGE_LOCKED)
        bool locked = false;
        try
        {
            service.ConfirmDeliveryAsync(carrierId, ActorRole.CARRIER, order.Id, new ConfirmDeliveryRequest(wrongCode)).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "DELIVERY_CHALLENGE_LOCKED" && ex.HttpStatusCode == 422)
        {
            locked = true;
        }
        Assert(locked, "3ª tentativa incorreta consecutiva deve bloquear o desafio com 422.");

        // Tentativa subsequente mesmo com código válido continua bloqueada
        bool blockedSubsequent = false;
        try
        {
            service.ConfirmDeliveryAsync(carrierId, ActorRole.CARRIER, order.Id, new ConfirmDeliveryRequest(validCode)).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "DELIVERY_CHALLENGE_LOCKED" && ex.HttpStatusCode == 422)
        {
            blockedSubsequent = true;
        }
        Assert(blockedSubsequent, "Tentativa após bloqueio deve ser recusada com 422.");
    }),

    ("PR-05 (Decisão 1): Remetente regenera código de entrega: novo código emitido, tentativas resetadas e conclusão permitida", () =>
    {
        var fulfillmentRepo = new InMemoryFulfillmentRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var service = new FulfillmentApplicationService(fulfillmentRepo, shipRepo);

        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var carrierId = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var order = fulfillmentRepo.CreateOrderAsync(new DeliveryOrder
        {
            ContractId = Guid.NewGuid(),
            ShipmentId = Guid.NewGuid(),
            TripId = Guid.NewGuid(),
            SenderId = senderId,
            CarrierId = carrierId,
            Status = DeliveryOrderStatus.IN_TRANSIT
        }).GetAwaiter().GetResult();

        // 1. Gera código inicial
        service.GetDeliveryCodeAsync(senderId, ActorRole.SENDER, order.Id).GetAwaiter().GetResult();
        service.UploadDeliveryProofAsync(carrierId, ActorRole.CARRIER, order.Id, new DeliveryProofUploadRequest("https://storage.topiclog.local/proofs/photo1.jpg")).GetAwaiter().GetResult();

        // Bloqueia com 3 falhas
        for (int i = 0; i < 3; i++)
        {
            try { service.ConfirmDeliveryAsync(carrierId, ActorRole.CARRIER, order.Id, new ConfirmDeliveryRequest("0000")).GetAwaiter().GetResult(); }
            catch { /* ignora */ }
        }

        // 2. Remetente solicita regeneração de código
        var newCodeResp = service.RegenerateDeliveryCodeAsync(senderId, ActorRole.SENDER, order.Id, new RegenerateDeliveryCodeRequest("Destinatário solicitou novo código")).GetAwaiter().GetResult();
        Assert(!newCodeResp.IsLocked, "Desafio novo deve estar desbloqueado.");
        Assert(newCodeResp.RemainingAttempts == 3, "Tentativas devem ser resetadas para 3.");
        Assert(!string.IsNullOrWhiteSpace(newCodeResp.DeliveryCode), "Novo código deve estar presente.");

        // 3. Conclusão da entrega com o novo código emitido
        var confirmed = service.ConfirmDeliveryAsync(carrierId, ActorRole.CARRIER, order.Id, new ConfirmDeliveryRequest(newCodeResp.DeliveryCode)).GetAwaiter().GetResult();
        Assert(confirmed.Status == "DELIVERED_VERIFIED", "Status deve transitar para DELIVERED_VERIFIED.");
        Assert(confirmed.DeliveredAtUtc.HasValue, "Data de conclusão de entrega deve ser preenchida.");
    }),

    ("PR-05 (Decisão 3): Destinatário ausente registrado como exceção (RECIPIENT_ABSENT) sem conclusão unilateral", () =>
    {
        var fulfillmentRepo = new InMemoryFulfillmentRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var service = new FulfillmentApplicationService(fulfillmentRepo, shipRepo);

        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var carrierId = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var order = fulfillmentRepo.CreateOrderAsync(new DeliveryOrder
        {
            ContractId = Guid.NewGuid(),
            ShipmentId = Guid.NewGuid(),
            TripId = Guid.NewGuid(),
            SenderId = senderId,
            CarrierId = carrierId,
            Status = DeliveryOrderStatus.IN_TRANSIT
        }).GetAwaiter().GetResult();

        var exc = service.ReportDeliveryExceptionAsync(carrierId, ActorRole.CARRIER, order.Id, new ReportDeliveryExceptionRequest(
            Reason: DeliveryExceptionReason.RECIPIENT_ABSENT,
            Justification: "Campainha tocada 3x sem resposta no endereço",
            ProofPhotoBase64OrUrl: "https://storage.topiclog.local/proofs/house_front.jpg",
            Latitude: -19.9167,
            Longitude: -43.9345)).GetAwaiter().GetResult();

        Assert(exc.ReasonCode == "RECIPIENT_ABSENT", "Motivo deve ser RECIPIENT_ABSENT.");
        Assert(exc.Status == "PENDING_RESOLUTION", "Status da ocorrência deve ser PENDING_RESOLUTION.");

        var updatedOrder = fulfillmentRepo.GetOrderByIdAsync(order.Id).GetAwaiter().GetResult()!;
        Assert(updatedOrder.Status == DeliveryOrderStatus.EXCEPTION_REPORTED, "Status da ordem deve ser EXCEPTION_REPORTED.");

        // Reagendamento formal
        var rescheduled = service.RescheduleDeliveryAsync(carrierId, ActorRole.CARRIER, order.Id, new RescheduleDeliveryRequest(
            RescheduledDate: "2026-10-16",
            RescheduledTimeWindow: "Manhã (08h - 12h)",
            Justification: "Combinado novo horário com o remetente")).GetAwaiter().GetResult();

        Assert(rescheduled.Status == "RESCHEDULED", "Status da ordem após reagendamento deve ser RESCHEDULED.");
    }),

    ("PR-05 (Decisão 3): Tentativa frustrada com devolução ao remetente iniciada (RETURN_TO_SENDER_INITIATED)", () =>
    {
        var fulfillmentRepo = new InMemoryFulfillmentRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var service = new FulfillmentApplicationService(fulfillmentRepo, shipRepo);

        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var carrierId = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var order = fulfillmentRepo.CreateOrderAsync(new DeliveryOrder
        {
            ContractId = Guid.NewGuid(),
            ShipmentId = Guid.NewGuid(),
            TripId = Guid.NewGuid(),
            SenderId = senderId,
            CarrierId = carrierId,
            Status = DeliveryOrderStatus.EXCEPTION_REPORTED
        }).GetAwaiter().GetResult();

        var returned = service.InitiateReturnToSenderAsync(carrierId, ActorRole.CARRIER, order.Id, new InitiateReturnRequest(
            Justification: "Destinatário recusou a mercadoria")).GetAwaiter().GetResult();

        Assert(returned.Status == "RETURN_TO_SENDER_INITIATED", "Status da ordem deve ser RETURN_TO_SENDER_INITIATED.");
    }),

    ("PR-05 (Regra 3 / PR-03): Sugestões pós-entrega retornam encomendas ativas no raio de 2 km", () =>
    {
        var fulfillmentRepo = new InMemoryFulfillmentRepository();
        var shipRepo = new InMemoryShipmentsRepository();
        var service = new FulfillmentApplicationService(fulfillmentRepo, shipRepo);

        // Publica uma encomenda em Belo Horizonte (lat: -19.9167, lng: -43.9345)
        var senderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        shipRepo.CreateAsync(new Shipment
        {
            SenderId = senderId,
            SenderName = "Remetente BH",
            Title = "Carga de Retorno BH -> Monlevade",
            WeightGrams = 3000,
            OriginAddress = new ShipmentAddress(
                Kind: AddressKind.ORIGIN,
                City: "Belo Horizonte",
                StateUf: "MG",
                Neighborhood: "Centro",
                StreetAndNumber: null,
                PostalCode: null,
                ApproximateLatitude: -19.9180,
                ApproximateLongitude: -43.9350,
                IbgeCode: "3106200",
                ExactLatitude: -19.9180,
                ExactLongitude: -43.9350),
            DestinationAddress = new ShipmentAddress(
                Kind: AddressKind.DESTINATION,
                City: "João Monlevade",
                StateUf: "MG",
                Neighborhood: "Carneirinhos",
                StreetAndNumber: null,
                PostalCode: null,
                ApproximateLatitude: -19.8103,
                ApproximateLongitude: -43.1742,
                IbgeCode: "3136207"),
            SuggestedPriceCents = 4500,
            Status = ShipmentStatus.PUBLISHED
        }).GetAwaiter().GetResult();

        // Consulta sugestões pós-entrega na Praça Sete em BH
        var suggestions = service.GetPostDeliverySuggestionsAsync(-19.9167, -43.9345, maxRadiusKm: 2).GetAwaiter().GetResult();
        Assert(suggestions.Count >= 1, "Deve sugerir ao menos 1 encomenda compatível no raio de 2 km.");
        Assert(suggestions[0].DistanceKm <= 2.0, "Distância deve estar dentro do raio de 2 km.");
    }),

    ("PR-FIN-01 (Aspecto 1): Leitura de política vigente e validação dos parâmetros padrão POL-COM-V1 (13%, 7%, R$ 39,90)", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var policy = service.GetEffectivePolicyAsync(DateTimeOffset.UtcNow).GetAwaiter().GetResult();
        Assert(policy.Version == "POL-COM-V1", "A versão inicial de política deve ser POL-COM-V1.");
        Assert(policy.FreePlanCommissionPercent == 13.00m, "Comissão do plano Free deve ser 13,00%.");
        Assert(policy.PremiumPlanCommissionPercent == 7.00m, "Comissão do plano Premium deve ser 7,00%.");
        Assert(policy.PremiumMonthlyFeeCents == 3990, "Mensalidade do plano Premium deve ser 3990 centavos (R$ 39,90).");
        Assert(policy.CancellationPenaltyPercent == 10.00m, "Multa de cancelamento deve ser 10,00%.");
        Assert(policy.CancellationMinFeeCents == 700, "Multa mínima de cancelamento deve ser 700 centavos (R$ 7,00).");
        Assert(policy.CancellationInjuredPartySharePercent == 80.00m, "Parte inocente deve receber 80,00% da multa.");
        Assert(policy.IsActive, "POL-COM-V1 deve estar ativa.");
        Assert(policy.ValidUntil == null, "POL-COM-V1 inicial deve ter vigência indeterminada (ValidUntil == null).");
    }),

    ("PR-FIN-01 (Aspecto 2): Precisão aritmética com arredondamento comercial (AwayFromZero) em centavos sem desvio ou perda", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        // Teste de arredondamento AwayFromZero:
        // R$ 55,55 (5555 centavos) a 13%: 5555 * 0.13 = 722.15 -> 722 centavos comissão, transportador 4833
        var sim1 = service.SimulateSplitAsync(5555, null, "FREE").GetAwaiter().GetResult();
        Assert(sim1.PlatformCommissionCents == 722, $"Comissão calculada: esperava 722 centavos, obteve {sim1.PlatformCommissionCents}");
        Assert(sim1.CarrierNetCents == 4833, $"Líquido transportador: esperava 4833 centavos, obteve {sim1.CarrierNetCents}");
        Assert(sim1.PlatformCommissionCents + sim1.CarrierNetCents == sim1.TransportAmountCents, "Invariante contábil violada para R$ 55,55");

        // R$ 33,50 (3350 centavos) a 13%: 3350 * 0.13 = 435.50 -> 436 centavos (metade arredonda para cima com AwayFromZero)
        var sim2 = service.SimulateSplitAsync(3350, null, "FREE").GetAwaiter().GetResult();
        Assert(sim2.PlatformCommissionCents == 436, $"Comissão calculada com .50: esperava 436 centavos, obteve {sim2.PlatformCommissionCents}");
        Assert(sim2.CarrierNetCents == 2914, $"Líquido transportador: esperava 2914 centavos, obteve {sim2.CarrierNetCents}");
        Assert(sim2.PlatformCommissionCents + sim2.CarrierNetCents == sim2.TransportAmountCents, "Invariante contábil violada para R$ 33,50");

        // R$ 55,55 a 7% (Premium): 5555 * 0.07 = 388.85 -> 389 centavos
        var sim3 = service.SimulateSplitAsync(5555, null, "PREMIUM").GetAwaiter().GetResult();
        Assert(sim3.PlatformCommissionCents == 389, $"Comissão Premium: esperava 389 centavos, obteve {sim3.PlatformCommissionCents}");
        Assert(sim3.CarrierNetCents == 5166, $"Líquido Premium: esperava 5166 centavos, obteve {sim3.CarrierNetCents}");
        Assert(sim3.PlatformCommissionCents + sim3.CarrierNetCents == sim3.TransportAmountCents, "Invariante contábil violada para R$ 55,55 Premium");
    }),

    ("PR-FIN-01 (Aspecto 3): Aplicação de alíquota diferenciada conforme plano do transportador (Standard 13% vs Premium 7%)", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var carrierStandardId = Guid.NewGuid();
        var carrierPremiumId = Guid.NewGuid();
        var senderId = Guid.NewGuid();
        var shipmentId = Guid.NewGuid();

        // Assina plano Premium para carrierPremiumId
        service.SubscribePlanAsync(carrierPremiumId, "PREMIUM").GetAwaiter().GetResult();

        // 1. Snapshot para transportador Standard (sem assinatura Premium)
        var contract1Id = Guid.NewGuid();
        var snapStandard = service.CreateOrGetSnapshotForContractAsync(
            contract1Id, Guid.NewGuid(), shipmentId, carrierStandardId, senderId, 10000, DateTimeOffset.UtcNow).GetAwaiter().GetResult();

        Assert(snapStandard.PlanCode == "FREE", "Plano do transportador padrão deve ser FREE.");
        Assert(snapStandard.CommissionRatePercent == 13.00m, "Taxa para transportador padrão deve ser 13,00%.");
        Assert(snapStandard.PlatformCommissionCents == 1300, "Comissão da plataforma deve ser 1300 centavos.");
        Assert(snapStandard.CarrierNetCents == 8700, "Líquido do transportador padrão deve ser 8700 centavos.");

        // 2. Snapshot para transportador Premium
        var contract2Id = Guid.NewGuid();
        var snapPremium = service.CreateOrGetSnapshotForContractAsync(
            contract2Id, Guid.NewGuid(), shipmentId, carrierPremiumId, senderId, 10000, DateTimeOffset.UtcNow).GetAwaiter().GetResult();

        Assert(snapPremium.PlanCode == "PREMIUM", "Plano do transportador com assinatura deve ser PREMIUM.");
        Assert(snapPremium.CommissionRatePercent == 7.00m, "Taxa para transportador Premium deve ser 7,00%.");
        Assert(snapPremium.PlatformCommissionCents == 700, "Comissão da plataforma deve ser 700 centavos.");
        Assert(snapPremium.CarrierNetCents == 9300, "Líquido do transportador Premium deve ser 9300 centavos.");
    }),

    ("PR-FIN-01 (Aspecto 4): Criação de nova versão de política (POL-COM-V2) com valid_from futuro e encerramento automático da anterior", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var adminId = Guid.NewGuid();
        var futureStart = DateTimeOffset.UtcNow.AddDays(7);

        var req = new CreateCommercialPolicyRequest(
            Version: "POL-COM-V2",
            Name: "Política Comercial 2027",
            FreePlanCommissionPercent: 12.00m,
            PremiumPlanCommissionPercent: 6.00m,
            PremiumMonthlyFeeCents: 4990,
            CancellationPenaltyPercent: 10.00m,
            CancellationMinFeeCents: 800,
            CancellationInjuredPartySharePercent: 80.00m,
            ValidFrom: futureStart,
            Justification: "Revisão tarifária anual programada com incentivo a modais sustentáveis");

        var created = service.CreatePolicyVersionAsync(adminId, "GENERAL_ADMIN", req).GetAwaiter().GetResult();
        Assert(created.Version == "POL-COM-V2", "Nova política criada deve ser POL-COM-V2.");

        // Verifica que a política anterior (POL-COM-V1) teve seu ValidUntil ajustado para futureStart
        var v1 = policyRepo.GetPolicyByVersionAsync("POL-COM-V1").GetAwaiter().GetResult();
        Assert(v1 != null && v1.ValidUntil == futureStart, "POL-COM-V1 deve ter ValidUntil igual a ValidFrom da V2.");

        // Consulta com data presente: ainda vigora POL-COM-V1
        var currentNow = service.GetEffectivePolicyAsync(DateTimeOffset.UtcNow).GetAwaiter().GetResult();
        Assert(currentNow.Version == "POL-COM-V1", "Na data atual ainda deve vigorar POL-COM-V1.");

        // Consulta com data posterior: vigora POL-COM-V2
        var futurePolicy = service.GetEffectivePolicyAsync(futureStart.AddDays(1)).GetAwaiter().GetResult();
        Assert(futurePolicy.Version == "POL-COM-V2", "Na data futura deve vigorar POL-COM-V2.");
        Assert(futurePolicy.FreePlanCommissionPercent == 12.00m, "Comissão da POL-COM-V2 deve ser 12,00%.");
    }),

    ("PR-FIN-01 (Aspecto 5): Bloqueio de criação de política por usuários sem perfil GENERAL_ADMIN (403 Forbidden)", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var req = new CreateCommercialPolicyRequest(
            Version: "POL-COM-HACK",
            Name: "Tentativa Não Autorizada",
            FreePlanCommissionPercent: 1.00m,
            PremiumPlanCommissionPercent: 1.00m,
            PremiumMonthlyFeeCents: 100,
            CancellationPenaltyPercent: 10.00m,
            CancellationMinFeeCents: 700,
            CancellationInjuredPartySharePercent: 80.00m,
            ValidFrom: DateTimeOffset.UtcNow.AddDays(1),
            Justification: "Injeção arbitrária sem privilégio administrativo");

        bool blocked = false;
        try
        {
            service.CreatePolicyVersionAsync(Guid.NewGuid(), "CARRIER", req).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "AUTH_FORBIDDEN_INSUFFICIENT_ROLE" && ex.HttpStatusCode == 403)
        {
            blocked = true;
        }

        Assert(blocked, "Usuário com papel CARRIER deve ser impedido de criar políticas comerciais com HTTP 403.");
    }),

    ("PR-FIN-01 (Aspecto 6): Garantia de não retroatividade: contratos sob POL-COM-V1 preservam 13% após publicação da POL-COM-V2", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var contractOldId = Guid.NewGuid();
        var carrierId = Guid.NewGuid();
        var senderId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        // Contrato 1 congelado sob POL-COM-V1
        var snapshotOld = service.CreateOrGetSnapshotForContractAsync(
            contractOldId, Guid.NewGuid(), Guid.NewGuid(), carrierId, senderId, 10000, now).GetAwaiter().GetResult();
        Assert(snapshotOld.PolicyVersion == "POL-COM-V1", "Snapshot original deve referenciar POL-COM-V1.");
        Assert(snapshotOld.CommissionRatePercent == 13.00m, "Taxa original deve ser 13,00%.");
        Assert(snapshotOld.PlatformCommissionCents == 1300, "Comissão deve ser 1300.");

        // Cria nova política V2 com alíquota menor (10%)
        var futureDate = now.AddDays(1);
        service.CreatePolicyVersionAsync(Guid.NewGuid(), "GENERAL_ADMIN", new CreateCommercialPolicyRequest(
            Version: "POL-COM-V2-NONRETRO",
            Name: "Política V2 Não Retroativa",
            FreePlanCommissionPercent: 10.00m,
            PremiumPlanCommissionPercent: 5.00m,
            PremiumMonthlyFeeCents: 2990,
            CancellationPenaltyPercent: 10.00m,
            CancellationMinFeeCents: 700,
            CancellationInjuredPartySharePercent: 80.00m,
            ValidFrom: futureDate,
            Justification: "Teste de não retroatividade imutável")).GetAwaiter().GetResult();

        // Consulta snapshot do contrato antigo: deve permanecer idêntico e imutável
        var retrievedSnapshot = service.GetSnapshotByContractIdAsync(contractOldId).GetAwaiter().GetResult();
        Assert(retrievedSnapshot != null, "Snapshot do contrato anterior deve existir.");
        Assert(retrievedSnapshot!.PolicyVersion == "POL-COM-V1", "Versão do snapshot imutável deve continuar POL-COM-V1.");
        Assert(retrievedSnapshot.CommissionRatePercent == 13.00m, "Alíquota do contrato antigo não pode ser retroativamente alterada para 10,00%.");
        Assert(retrievedSnapshot.PlatformCommissionCents == 1300, "Valor de comissão retido deve continuar 1300.");
    }),

    ("PR-FIN-01 (Aspecto 7): Ciclo de vida da assinatura Premium: adesão, cancelamento com benefício até o fim da vigência e expiração", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var carrierId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        // 1. Adesão ao Premium
        var sub = service.SubscribePlanAsync(carrierId, "PREMIUM").GetAwaiter().GetResult();
        Assert(sub.PlanCode == "PREMIUM", "Plano subscrito deve ser PREMIUM.");
        Assert(sub.Status == "ACTIVE", "Status inicial da assinatura deve ser ACTIVE.");
        Assert(sub.MonthlyFeeCents == 3990, "Mensalidade congelada deve ser 3990 centavos.");

        // 2. Cancelamento solicitado pelo transportador
        var canceled = service.CancelSubscriptionAsync(carrierId).GetAwaiter().GetResult();
        Assert(canceled.Status == "CANCELED", "Status deve transitar para CANCELED.");
        Assert(canceled.CanceledAtUtc != null, "Data de cancelamento deve ser preenchida.");

        // 3. Benefício mantido durante a vigência paga (queryTime <= CurrentPeriodEnd)
        var queryTime = DateTimeOffset.UtcNow;
        var entity = subRepo.GetActiveSubscriptionByCarrierIdAsync(carrierId, queryTime).GetAwaiter().GetResult();
        Assert(entity != null, "Durante a vigência paga, o plano continua ativo para cálculo de comissão reduzida.");
        Assert(entity!.CurrentPeriodEndUtc >= queryTime, "Transportador cancelado deve manter vigência paga ativa.");

        // 4. Após término do período pago (now + 35 dias), benefício expira
        var futureDate = now.AddDays(35);
        var expiredEntity = subRepo.GetActiveSubscriptionByCarrierIdAsync(carrierId, futureDate).GetAwaiter().GetResult();
        Assert(expiredEntity == null, "Não deve haver assinatura ativa para cálculo após o término da vigência.");
    }),

    ("PR-FIN-01 (Aspecto 8): Concorrência e idempotência na geração de snapshots com múltiplas chamadas simultâneas (Task.WhenAll)", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var contractId = Guid.NewGuid();
        var proposalId = Guid.NewGuid();
        var shipmentId = Guid.NewGuid();
        var carrierId = Guid.NewGuid();
        var senderId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        // 20 requisições simultâneas tentando criar snapshot para o mesmo contrato
        var tasks = Enumerable.Range(0, 20).Select(_ =>
            service.CreateOrGetSnapshotForContractAsync(
                contractId, proposalId, shipmentId, carrierId, senderId, 15000, now)
        ).ToArray();

        var results = Task.WhenAll(tasks).GetAwaiter().GetResult();

        // Todos os resultados devem apontar para exatamente a mesma instância/id de snapshot
        var firstId = results[0].Id;
        Assert(results.All(r => r.Id == firstId), "Todas as chamadas concorrentes devem retornar o mesmo ID de snapshot.");
        Assert(results.All(r => r.ContractId == contractId), "ContractId deve ser idêntico em todas as respostas.");
        Assert(results.All(r => r.PlatformCommissionCents == 1950), "Comissão de 13% sobre 15000 deve ser 1950 centavos em todas as chamadas.");
        Assert(results.All(r => r.CarrierNetCents == 13050), "Líquido do transportador deve ser 13050 centavos em todas as chamadas.");
    }),

    ("PR-FIN-01 (Aspecto 9): Validação de conflito de datas de vigência (rejeição de políticas com valid_from anterior ou concomitante)", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var adminId = Guid.NewGuid();
        var pastDate = DateTimeOffset.UtcNow.AddDays(-10);

        var pastReq = new CreateCommercialPolicyRequest(
            Version: "POL-COM-PAST",
            Name: "Política Retroativa Inválida",
            FreePlanCommissionPercent: 12.00m,
            PremiumPlanCommissionPercent: 6.00m,
            PremiumMonthlyFeeCents: 3990,
            CancellationPenaltyPercent: 10.00m,
            CancellationMinFeeCents: 700,
            CancellationInjuredPartySharePercent: 80.00m,
            ValidFrom: pastDate,
            Justification: "Tentativa de criar política com início retroativo no passado");

        bool rejectedConflict = false;
        try
        {
            service.CreatePolicyVersionAsync(adminId, "GENERAL_ADMIN", pastReq).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "CONFLICTING_POLICY_VALIDITY" && ex.HttpStatusCode == 422)
        {
            rejectedConflict = true;
        }

        Assert(rejectedConflict, "Política com valid_from anterior à data da política ativa deve ser rejeitada com CONFLICTING_POLICY_VALIDITY (422).");
    }),

    ("PR-FIN-01 (Aspecto 10): Auditoria financeira imutável: rastreamento de criação de políticas, assinaturas, cancelamentos e snapshots", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var adminId = Guid.NewGuid();
        var carrierId = Guid.NewGuid();
        var senderId = Guid.NewGuid();
        var contractId = Guid.NewGuid();

        // 1. Cria nova política
        service.CreatePolicyVersionAsync(adminId, "GENERAL_ADMIN", new CreateCommercialPolicyRequest(
            Version: "POL-COM-AUDIT",
            Name: "Política Auditoria",
            FreePlanCommissionPercent: 13.00m,
            PremiumPlanCommissionPercent: 7.00m,
            PremiumMonthlyFeeCents: 3990,
            CancellationPenaltyPercent: 10.00m,
            CancellationMinFeeCents: 700,
            CancellationInjuredPartySharePercent: 80.00m,
            ValidFrom: DateTimeOffset.UtcNow.AddDays(30),
            Justification: "Teste de auditoria contábil")).GetAwaiter().GetResult();

        // 2. Transportador assina Premium
        service.SubscribePlanAsync(carrierId, "PREMIUM").GetAwaiter().GetResult();

        // 3. Transportador cancela
        service.CancelSubscriptionAsync(carrierId).GetAwaiter().GetResult();

        // 4. Criação de snapshot de contrato
        service.CreateOrGetSnapshotForContractAsync(
            contractId, Guid.NewGuid(), Guid.NewGuid(), carrierId, senderId, 20000, DateTimeOffset.UtcNow).GetAwaiter().GetResult();

        // Verifica entradas no repositório de auditoria financeira
        var entries = auditRepo.GetAuditEntriesAsync().GetAwaiter().GetResult();
        Assert(entries.Count >= 4, $"Esperava ao menos 4 entradas de auditoria, obteve {entries.Count}");

        Assert(entries.Any(e => e.Operation == "POLICY_CREATED" && e.ActorRole == "GENERAL_ADMIN"), "Auditoria deve conter POLICY_CREATED.");
        Assert(entries.Any(e => (e.Operation == "SUBSCRIPTION_ACTIVATED" || e.Operation == "SUBSCRIPTION_CREATED") && e.ActorRole == "CARRIER"), "Auditoria deve conter SUBSCRIPTION_ACTIVATED/CREATED.");
        Assert(entries.Any(e => e.Operation == "SUBSCRIPTION_CANCELED" && e.ActorRole == "CARRIER"), "Auditoria deve conter SUBSCRIPTION_CANCELED.");
        Assert(entries.Any(e => e.Operation == "SNAPSHOT_FROZEN"), "Auditoria deve conter SNAPSHOT_FROZEN.");

        // Verifica que todas as entradas possuem Id e payload JSON preenchidos
        Assert(entries.All(e => e.Id != Guid.Empty), "Todas as entradas de auditoria devem possuir Id gerado.");
        Assert(entries.All(e => !string.IsNullOrWhiteSpace(e.PayloadAfter)), "Todas as entradas de auditoria devem possuir PayloadAfter registrado.");
    }),

    ("PR-ADM-01 (RBAC): Matriz dos 5 perfis administrativos (GENERAL_ADMIN, FINANCIAL_ADMIN, LEGAL_OPERATOR, COMPLIANCE_AUDITOR, SUPPORT_OPERATOR) e restrições granulares", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var finAuditRepo = new InMemoryFinancialAuditRepository();
        using var financeService = new FinancialApplicationService(policyRepo, subRepo, snapRepo, finAuditRepo);

        var settingsRepo = new InMemoryOperationalSettingsRepository();
        var vehicleRepo = new InMemoryCarrierVehicleRepository();
        var paymentRepo = new InMemoryPaymentGovernanceRepository();
        var adminAuditRepo = new InMemoryAdminAuditRepository();
        var adminService = new AdminApplicationService(settingsRepo, vehicleRepo, paymentRepo, adminAuditRepo, financeService);

        var adminId = Guid.NewGuid();
        var updateReq = new UpdateOperationalSettingsRequest(
            BicycleMaxWeightGrams: 5000,
            MotorcycleMaxWeightGrams: 20000,
            CarMaxWeightGrams: 20000,
            CarMaxAgeYears: 7,
            GeoDeviationCompatibleKm: 10.0m,
            GeoDeviationRequiresEvalKm: 20.0m,
            PostDeliveryRadiusKm: 2.0m,
            ProposalStandardValidityHours: 24,
            ProposalSameDayValidityHours: 2,
            PrioritySecondShipmentMinutes: 10,
            CancellationPenaltyPercent: 10.0m,
            CancellationMinFeeCents: 700,
            CancellationInjuredPartySharePercent: 80.0m,
            Justification: "Ajuste operacional de rotina por GENERAL_ADMIN");

        // 1. GENERAL_ADMIN possui autorização total para atualizar configurações
        var updated = adminService.UpdateOperationalSettingsAsync(adminId, "GENERAL_ADMIN", updateReq).GetAwaiter().GetResult();
        Assert(updated.Version == "OP-SET-V1", "GENERAL_ADMIN deve conseguir atualizar parâmetros operacionais (versão OP-SET-V1).");

        // 2. FINANCIAL_ADMIN tenta alterar configurações operacionais -> 403 Forbidden
        bool finBlocked = false;
        try
        {
            adminService.UpdateOperationalSettingsAsync(adminId, "FINANCIAL_ADMIN", updateReq).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.HttpStatusCode == 403 && ex.RuleCode == "AUTH_FORBIDDEN_INSUFFICIENT_ROLE")
        {
            finBlocked = true;
        }
        Assert(finBlocked, "FINANCIAL_ADMIN não pode alterar configurações operacionais (403 Forbidden).");

        // 3. LEGAL_OPERATOR tenta alterar configurações operacionais -> 403 Forbidden
        bool legalBlocked = false;
        try
        {
            adminService.UpdateOperationalSettingsAsync(adminId, "LEGAL_OPERATOR", updateReq).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.HttpStatusCode == 403 && ex.RuleCode == "AUTH_FORBIDDEN_INSUFFICIENT_ROLE")
        {
            legalBlocked = true;
        }
        Assert(legalBlocked, "LEGAL_OPERATOR não pode alterar configurações operacionais (403 Forbidden).");

        // 4. COMPLIANCE_AUDITOR tenta alterar configurações operacionais -> 403 Forbidden
        bool compBlocked = false;
        try
        {
            adminService.UpdateOperationalSettingsAsync(adminId, "COMPLIANCE_AUDITOR", updateReq).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.HttpStatusCode == 403 && ex.RuleCode == "AUTH_FORBIDDEN_INSUFFICIENT_ROLE")
        {
            compBlocked = true;
        }
        Assert(compBlocked, "COMPLIANCE_AUDITOR não pode alterar configurações operacionais (403 Forbidden).");

        // 5. SUPPORT_OPERATOR tenta alterar configurações operacionais -> 403 Forbidden
        bool suppBlocked = false;
        try
        {
            adminService.UpdateOperationalSettingsAsync(adminId, "SUPPORT_OPERATOR", updateReq).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.HttpStatusCode == 403 && ex.RuleCode == "AUTH_FORBIDDEN_INSUFFICIENT_ROLE")
        {
            suppBlocked = true;
        }
        Assert(suppBlocked, "SUPPORT_OPERATOR não pode alterar configurações operacionais (403 Forbidden).");

        // 6. Não-administrador (ex: CARRIER) -> 403 Forbidden
        bool carrierBlocked = false;
        try
        {
            adminService.UpdateOperationalSettingsAsync(adminId, "CARRIER", updateReq).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.HttpStatusCode == 403)
        {
            carrierBlocked = true;
        }
        Assert(carrierBlocked, "Usuário comum CARRIER deve ser sumariamente bloqueado com 403 Forbidden.");
    }),

    ("PR-ADM-01 (Configurações Operacionais): Validação de hierarquia de pesos (bicicleta <= moto/carro), desvios viários e versionamento", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var finAuditRepo = new InMemoryFinancialAuditRepository();
        using var financeService = new FinancialApplicationService(policyRepo, subRepo, snapRepo, finAuditRepo);

        var settingsRepo = new InMemoryOperationalSettingsRepository();
        var vehicleRepo = new InMemoryCarrierVehicleRepository();
        var paymentRepo = new InMemoryPaymentGovernanceRepository();
        var adminAuditRepo = new InMemoryAdminAuditRepository();
        var adminService = new AdminApplicationService(settingsRepo, vehicleRepo, paymentRepo, adminAuditRepo, financeService);

        var adminId = Guid.NewGuid();

        // 1. Hierarquia inválida: Bicicleta (25 kg) > Moto (20 kg)
        var invalidReq = new UpdateOperationalSettingsRequest(
            BicycleMaxWeightGrams: 25000,
            MotorcycleMaxWeightGrams: 20000,
            CarMaxWeightGrams: 20000,
            CarMaxAgeYears: 7,
            GeoDeviationCompatibleKm: 10.0m,
            GeoDeviationRequiresEvalKm: 20.0m,
            PostDeliveryRadiusKm: 2.0m,
            ProposalStandardValidityHours: 24,
            ProposalSameDayValidityHours: 2,
            PrioritySecondShipmentMinutes: 10,
            CancellationPenaltyPercent: 10.0m,
            CancellationMinFeeCents: 700,
            CancellationInjuredPartySharePercent: 80.0m,
            Justification: "Tentativa de configurar bicicleta com peso superior a moto");

        bool hierarchyBlocked = false;
        try
        {
            adminService.UpdateOperationalSettingsAsync(adminId, "GENERAL_ADMIN", invalidReq).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "INVALID_WEIGHT_HIERARCHY")
        {
            hierarchyBlocked = true;
        }
        Assert(hierarchyBlocked, "Configuração com Bicicleta > Moto deve ser rejeitada com INVALID_WEIGHT_HIERARCHY.");

        // 2. Idade de carro inválida: 0 anos ou negativa
        var invalidAgeReq = new UpdateOperationalSettingsRequest(
            BicycleMaxWeightGrams: 5000,
            MotorcycleMaxWeightGrams: 20000,
            CarMaxWeightGrams: 20000,
            CarMaxAgeYears: 0,
            GeoDeviationCompatibleKm: 10.0m,
            GeoDeviationRequiresEvalKm: 20.0m,
            PostDeliveryRadiusKm: 2.0m,
            ProposalStandardValidityHours: 24,
            ProposalSameDayValidityHours: 2,
            PrioritySecondShipmentMinutes: 10,
            CancellationPenaltyPercent: 10.0m,
            CancellationMinFeeCents: 700,
            CancellationInjuredPartySharePercent: 80.0m,
            Justification: "Idade veicular 0");

        bool ageBlocked = false;
        try
        {
            adminService.UpdateOperationalSettingsAsync(adminId, "GENERAL_ADMIN", invalidAgeReq).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "INVALID_CAR_MAX_AGE")
        {
            ageBlocked = true;
        }
        Assert(ageBlocked, "Idade veicular 0 deve ser rejeitada com INVALID_CAR_MAX_AGE.");

        // 3. Justificativa ausente
        var missingJustReq = new UpdateOperationalSettingsRequest(
            BicycleMaxWeightGrams: 5000,
            MotorcycleMaxWeightGrams: 20000,
            CarMaxWeightGrams: 20000,
            CarMaxAgeYears: 7,
            GeoDeviationCompatibleKm: 10.0m,
            GeoDeviationRequiresEvalKm: 20.0m,
            PostDeliveryRadiusKm: 2.0m,
            ProposalStandardValidityHours: 24,
            ProposalSameDayValidityHours: 2,
            PrioritySecondShipmentMinutes: 10,
            CancellationPenaltyPercent: 10.0m,
            CancellationMinFeeCents: 700,
            CancellationInjuredPartySharePercent: 80.0m,
            Justification: "");

        bool justBlocked = false;
        try
        {
            adminService.UpdateOperationalSettingsAsync(adminId, "GENERAL_ADMIN", missingJustReq).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "JUSTIFICATION_REQUIRED")
        {
            justBlocked = true;
        }
        Assert(justBlocked, "Atualização sem justificativa deve ser rejeitada com JUSTIFICATION_REQUIRED.");
    }),

    ("PR-ADM-01 (Moderação de Frotas): Registro de veículo, aprovação e exigência de justificativa para reprovação", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var finAuditRepo = new InMemoryFinancialAuditRepository();
        using var financeService = new FinancialApplicationService(policyRepo, subRepo, snapRepo, finAuditRepo);

        var settingsRepo = new InMemoryOperationalSettingsRepository();
        var vehicleRepo = new InMemoryCarrierVehicleRepository();
        var paymentRepo = new InMemoryPaymentGovernanceRepository();
        var adminAuditRepo = new InMemoryAdminAuditRepository();
        var adminService = new AdminApplicationService(settingsRepo, vehicleRepo, paymentRepo, adminAuditRepo, financeService);

        var carrierId = Guid.NewGuid();
        var adminId = Guid.NewGuid();

        // 1. Transportador cadastra veículo
        var regReq = new RegisterCarrierVehicleRequest(
            VehicleType: "CAR",
            BrandModel: "Chevrolet Onix 1.0",
            ManufacturingYear: DateTimeOffset.UtcNow.Year - 3,
            Plate: "ABC-1D23",
            DeclaredCapacityGrams: 18000,
            CrlvDocumentKey: "doc-crlv-123.pdf");

        var vehicle = adminService.RegisterCarrierVehicleAsync(carrierId, "Carlos Transportador", regReq).GetAwaiter().GetResult();
        Assert(vehicle.Status == "PENDING_APPROVAL", "Novo veículo deve iniciar com status PENDING_APPROVAL.");
        Assert(vehicle.PlateMasked.Contains('*'), "Placa deve ser mascarada para proteção de privacidade.");
        Assert(!vehicle.RegulatoryAgeWarning, "Veículo com 3 anos não deve apresentar aviso regulatório.");

        // 2. Admin reprova veículo sem informar justificativa -> 422 REJECTION_REASON_REQUIRED
        bool rejWithoutReasonBlocked = false;
        try
        {
            adminService.ModerateVehicleAsync(
                vehicle.Id,
                adminId,
                "GENERAL_ADMIN",
                new ModerateVehicleRequest(Status: "REJECTED", RejectionReason: "")).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "REJECTION_REASON_REQUIRED")
        {
            rejWithoutReasonBlocked = true;
        }
        Assert(rejWithoutReasonBlocked, "Reprovação sem justificativa deve falhar com REJECTION_REASON_REQUIRED.");

        // 3. Admin aprova o veículo com sucesso
        var approved = adminService.ModerateVehicleAsync(
            vehicle.Id,
            adminId,
            "GENERAL_ADMIN",
            new ModerateVehicleRequest(Status: "APPROVED", RejectionReason: null)).GetAwaiter().GetResult();

        Assert(approved.Status == "APPROVED", "Veículo deve transitar para APPROVED.");
        Assert(approved.ModeratedAtUtc.HasValue, "ModeratedAtUtc deve ser preenchido.");

        // 4. Auditoria registra o evento de aprovação
        var events = adminAuditRepo.ListEventsAsync("FLEET_MODERATION").GetAwaiter().GetResult();
        Assert(events.Any(e => e.Action == "VEHICLE_APPROVED" && e.EntityId == vehicle.Id.ToString()),
            "Evento VEHICLE_APPROVED deve constar na trilha de auditoria.");
    }),

    ("PR-ADM-01 (Conformidade Regulatória): Verificação da idade veicular máxima proposta (7 anos) e geração de flag", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var finAuditRepo = new InMemoryFinancialAuditRepository();
        using var financeService = new FinancialApplicationService(policyRepo, subRepo, snapRepo, finAuditRepo);

        var settingsRepo = new InMemoryOperationalSettingsRepository();
        var vehicleRepo = new InMemoryCarrierVehicleRepository();
        var paymentRepo = new InMemoryPaymentGovernanceRepository();
        var adminAuditRepo = new InMemoryAdminAuditRepository();
        var adminService = new AdminApplicationService(settingsRepo, vehicleRepo, paymentRepo, adminAuditRepo, financeService);

        var carrierId = Guid.NewGuid();
        int currentYear = DateTimeOffset.UtcNow.Year;

        // Veículo com 9 anos de uso (> 7 anos)
        var oldCarReq = new RegisterCarrierVehicleRequest(
            VehicleType: "CAR",
            BrandModel: "Fiat Palio 1.4",
            ManufacturingYear: currentYear - 9,
            Plate: "XYZ-9876",
            DeclaredCapacityGrams: 20000,
            CrlvDocumentKey: "crlv-palio-old.pdf");

        var oldCar = adminService.RegisterCarrierVehicleAsync(carrierId, "João Monlevade Express", oldCarReq).GetAwaiter().GetResult();
        Assert(oldCar.RegulatoryAgeWarning, "Veículo com 9 anos deve sinalizar RegulatoryAgeWarning = true (idade superior ao parâmetro de 7 anos).");
        Assert(oldCar.AgeYears == 9, "Idade calculada deve ser 9 anos.");
    }),

    ("PR-FIN-02 (Governança de Pagamentos): Habilitação/desabilitação de métodos e salvaguarda de método mínimo ativo", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var finAuditRepo = new InMemoryFinancialAuditRepository();
        using var financeService = new FinancialApplicationService(policyRepo, subRepo, snapRepo, finAuditRepo);

        var settingsRepo = new InMemoryOperationalSettingsRepository();
        var vehicleRepo = new InMemoryCarrierVehicleRepository();
        var paymentRepo = new InMemoryPaymentGovernanceRepository();
        var adminAuditRepo = new InMemoryAdminAuditRepository();
        var adminService = new AdminApplicationService(settingsRepo, vehicleRepo, paymentRepo, adminAuditRepo, financeService);

        var adminId = Guid.NewGuid();

        // 1. FINANCIAL_ADMIN desativa o método CREDIT_CARD
        var toggleCC = adminService.TogglePaymentMethodAsync(
            "CREDIT_CARD",
            adminId,
            "FINANCIAL_ADMIN",
            new TogglePaymentMethodRequest(IsEnabled: false, Justification: "Manutenção técnica temporária do gateway")).GetAwaiter().GetResult();

        Assert(!toggleCC.IsEnabled, "CREDIT_CARD deve estar desativado.");

        // 2. Desativa também DEBIT_CARD e BANK_SLIP
        adminService.TogglePaymentMethodAsync(
            "DEBIT_CARD",
            adminId,
            "FINANCIAL_ADMIN",
            new TogglePaymentMethodRequest(IsEnabled: false, Justification: "Desativação de teste")).GetAwaiter().GetResult();

        adminService.TogglePaymentMethodAsync(
            "BANK_SLIP",
            adminId,
            "FINANCIAL_ADMIN",
            new TogglePaymentMethodRequest(IsEnabled: false, Justification: "Desativação de boletos")).GetAwaiter().GetResult();

        // 3. Tenta desativar o último método restante (PIX) -> 422 CANNOT_DISABLE_ALL_PAYMENT_METHODS
        bool lastMethodProtected = false;
        try
        {
            adminService.TogglePaymentMethodAsync(
                "PIX",
                adminId,
                "FINANCIAL_ADMIN",
                new TogglePaymentMethodRequest(IsEnabled: false, Justification: "Tentativa de desativar todos os métodos")).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "CANNOT_DISABLE_ALL_PAYMENT_METHODS" && ex.HttpStatusCode == 422)
        {
            lastMethodProtected = true;
        }
        Assert(lastMethodProtected, "Plataforma deve impedir a desativação de todos os métodos de pagamento (422 CANNOT_DISABLE_ALL_PAYMENT_METHODS).");
    }),

    ("PR-FIN-02 (Simulador de Checkout Sandbox): Absorção integral da taxa de gateway pela plataforma e preservação da invariante contábil", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var finAuditRepo = new InMemoryFinancialAuditRepository();
        using var financeService = new FinancialApplicationService(policyRepo, subRepo, snapRepo, finAuditRepo);

        var settingsRepo = new InMemoryOperationalSettingsRepository();
        var vehicleRepo = new InMemoryCarrierVehicleRepository();
        var paymentRepo = new InMemoryPaymentGovernanceRepository();
        var adminAuditRepo = new InMemoryAdminAuditRepository();
        var adminService = new AdminApplicationService(settingsRepo, vehicleRepo, paymentRepo, adminAuditRepo, financeService);

        // Simulação de checkout para R$ 150,00 (15000 centavos) via PIX sob o plano Standard (13%)
        var simReq = new CheckoutSimulationRequest(
            AmountCents: 15000,
            PaymentMethodCode: "PIX",
            CarrierId: null,
            PlanCodeOverride: "STANDARD");

        var result = adminService.SimulateCheckoutAsync(simReq).GetAwaiter().GetResult();

        // Verificação de absorção de gateway
        Assert(result.GrossAmountCents == 15000, "Valor bruto deve ser 15000 centavos.");
        Assert(result.SenderTotalCents == 15000, "Remetente paga exatamente o valor contratado, sem acréscimo de taxas (absorção 100%).");
        Assert(result.PlatformAbsorbsGatewayFee, "Plataforma absorve a taxa.");
        Assert(result.PlatformAbsorbedGatewayFeeCents > 0, "Taxa de gateway simulada deve ser positiva.");

        // Verificação da comissão e repasse
        // 13% de 15000 = 1950 centavos
        Assert(result.PlatformCommissionCents == 1950, "Comissão da plataforma deve ser 1950 centavos (13%).");
        // Líquido do transportador = 15000 - 1950 = 13050 centavos
        Assert(result.CarrierNetCents == 13050, "Líquido do transportador deve ser 13050 centavos.");

        // Invariante contábil: Gross = PlatformCommission + CarrierNet
        Assert(result.GrossAmountCents == result.PlatformCommissionCents + result.CarrierNetCents,
            "Invariante contábil violada: Gross != PlatformCommission + CarrierNet");
        Assert(result.AccountingInvariantPreserved, "Flag de invariante preservada deve ser true.");

        // Mock e sandbox
        Assert(!string.IsNullOrWhiteSpace(result.SandboxPaymentReference), "Referência de pagamento simulada deve ser gerada.");
        Assert(result.SandboxInstructions.Contains("Sandbox"), "Instruções devem identificar explicitamente o ambiente Sandbox.");
    }),

    ("PR-LEG-01 (Validação e Segurança): Rejeição de placeholders desconhecidos e bloqueio de scripts/tags maliciosas", () =>
    {
        var docRepo = new InMemoryLegalDocumentRepository();
        var accRepo = new InMemoryLegalAcceptanceRepository();
        var auditRepo = new InMemoryAdminAuditRepository();
        var legalService = new LegalApplicationService(docRepo, accRepo, auditRepo);

        var adminId = Guid.NewGuid();

        // 1. Placeholder desconhecido deve ser rejeitado (422)
        var invalidReq = new CreateLegalTemplateRequest(
            Category: "TERMS_OF_SERVICE",
            Title: "Termo com Placeholder Inválido",
            Description: "Teste de validação",
            ScopeType: "NATIONAL",
            ScopeStateUf: null,
            ScopeMunicipalityIbge: null,
            Version: "1.0.1",
            ContentMarkdown: "Texto com placeholder inválido: {{UNKNOWN_TAG}}",
            ChangeSummary: "Teste");

        bool invalidPlaceholderBlocked = false;
        try
        {
            legalService.CreateTemplateAsync(adminId, "LEGAL_OPERATOR", invalidReq).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "INVALID_PLACEHOLDERS" && ex.HttpStatusCode == 422)
        {
            invalidPlaceholderBlocked = true;
        }
        Assert(invalidPlaceholderBlocked, "Template com placeholder não homologado deve ser rejeitado com INVALID_PLACEHOLDERS.");

        // 2. Script malicioso inline deve ser rejeitado (422)
        var maliciousReq = new CreateLegalTemplateRequest(
            Category: "TERMS_OF_SERVICE",
            Title: "Termo com Script Injetado",
            Description: "Tentativa XSS",
            ScopeType: "NATIONAL",
            ScopeStateUf: null,
            ScopeMunicipalityIbge: null,
            Version: "1.0.2",
            ContentMarkdown: "Documento legal <script>alert('xss')</script> com tags maliciosas",
            ChangeSummary: "Teste de segurança");

        bool maliciousBlocked = false;
        try
        {
            legalService.CreateTemplateAsync(adminId, "LEGAL_OPERATOR", maliciousReq).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "MALICIOUS_CONTENT_DETECTED" && ex.HttpStatusCode == 422)
        {
            maliciousBlocked = true;
        }
        Assert(maliciousBlocked, "Template contendo tags de script deve ser bloqueado com MALICIOUS_CONTENT_DETECTED.");
    }),

    ("PR-LEG-01 (Aprovação Segregada RBAC): Apenas LEGAL_OPERATOR ou GENERAL_ADMIN podem aprovar; bloqueio de outros perfis (403)", () =>
    {
        var docRepo = new InMemoryLegalDocumentRepository();
        var accRepo = new InMemoryLegalAcceptanceRepository();
        var auditRepo = new InMemoryAdminAuditRepository();
        var legalService = new LegalApplicationService(docRepo, accRepo, auditRepo);

        var legalUserId = Guid.NewGuid();
        var finUserId = Guid.NewGuid();

        // 1. Criação de minuta válida por LEGAL_OPERATOR
        var draftReq = new CreateLegalTemplateRequest(
            Category: "CARRIER_ADHESION",
            Title: "Minuta de Termo de Adesão Operacional",
            Description: "Minuta em análise jurídica",
            ScopeType: "STATE",
            ScopeStateUf: "MG",
            ScopeMunicipalityIbge: null,
            Version: "1.1.0",
            ContentMarkdown: "# Termo de Adesão {{VERSION}}\nO transportador {{USER_NAME}} aceita as condições em {{STATE_UF}}.",
            ChangeSummary: "Elaboração de minuta");

        var created = legalService.CreateTemplateAsync(legalUserId, "LEGAL_OPERATOR", draftReq).GetAwaiter().GetResult();
        Assert(created.Status == "DRAFT", "Novo template deve iniciar com status DRAFT.");

        // 2. Tentativa de aprovação por FINANCIAL_ADMIN deve ser bloqueada com 403
        bool finBlocked = false;
        try
        {
            legalService.ApproveTemplateAsync(created.Id, finUserId, "FINANCIAL_ADMIN", new ApproveLegalTemplateRequest("Aprovação indevida")).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "AUTH_FORBIDDEN_INSUFFICIENT_ROLE" && ex.HttpStatusCode == 403)
        {
            finBlocked = true;
        }
        Assert(finBlocked, "Aprovação por FINANCIAL_ADMIN deve ser rejeitada com 403 AUTH_FORBIDDEN_INSUFFICIENT_ROLE.");

        // 3. Aprovação legítima por LEGAL_OPERATOR
        var approved = legalService.ApproveTemplateAsync(created.Id, legalUserId, "LEGAL_OPERATOR", new ApproveLegalTemplateRequest("Minuta aprovada em conformidade com o marco legal.")).GetAwaiter().GetResult();
        Assert(approved.Status == "APPROVED", "Status deve transitar para APPROVED.");
        Assert(approved.ApprovedByUserId == legalUserId, "ApprovedByUserId deve ser preenchido.");
        Assert(approved.ApprovedAtUtc.HasValue, "ApprovedAtUtc deve conter timestamp.");
    }),

    ("PR-LEG-01 (Ciclo de Vida e Imutabilidade): Publicação exige aprovação prévia, arquiva versões anteriores e impede alteração de documento publicado", () =>
    {
        var docRepo = new InMemoryLegalDocumentRepository();
        var accRepo = new InMemoryLegalAcceptanceRepository();
        var auditRepo = new InMemoryAdminAuditRepository();
        var legalService = new LegalApplicationService(docRepo, accRepo, auditRepo);

        var legalUserId = Guid.NewGuid();

        // 1. Criar minuta e tentar publicar diretamente sem aprovação (deve falhar com 422)
        var draftReq = new CreateLegalTemplateRequest(
            Category: "PRIVACY_POLICY",
            Title: "Política de Privacidade v1.1.0",
            Description: "Atualização LGPD",
            ScopeType: "NATIONAL",
            ScopeStateUf: null,
            ScopeMunicipalityIbge: null,
            Version: "1.1.0",
            ContentMarkdown: "# Política {{VERSION}}\nContato: {{SUPPORT_EMAIL}}",
            ChangeSummary: "Revisão periódica");

        var created = legalService.CreateTemplateAsync(legalUserId, "LEGAL_OPERATOR", draftReq).GetAwaiter().GetResult();

        bool unapprovedBlocked = false;
        try
        {
            legalService.PublishTemplateAsync(created.Id, legalUserId, "LEGAL_OPERATOR", new PublishLegalTemplateRequest(null, "Publicação direta")).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "DOCUMENT_NOT_APPROVED" && ex.HttpStatusCode == 422)
        {
            unapprovedBlocked = true;
        }
        Assert(unapprovedBlocked, "Publicação sem status APPROVED deve ser rejeitada com DOCUMENT_NOT_APPROVED.");

        // 2. Aprova e em seguida publica
        legalService.ApproveTemplateAsync(created.Id, legalUserId, "LEGAL_OPERATOR", new ApproveLegalTemplateRequest("Aprovado")).GetAwaiter().GetResult();
        var published = legalService.PublishTemplateAsync(created.Id, legalUserId, "LEGAL_OPERATOR", new PublishLegalTemplateRequest(DateTimeOffset.UtcNow, "Publicado oficialmente")).GetAwaiter().GetResult();

        Assert(published.Status == "PUBLISHED", "Documento deve estar com status PUBLISHED.");

        // 3. Tentar editar documento já publicado (deve ser bloqueado por imutabilidade - 422)
        bool editBlocked = false;
        try
        {
            legalService.UpdateTemplateAsync(created.Id, legalUserId, "LEGAL_OPERATOR", new UpdateLegalTemplateRequest("Título Alterado", "Desc", "# Novo conteúdo", "Tentativa de alteração")).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "CANNOT_EDIT_PUBLISHED_TEMPLATE" && ex.HttpStatusCode == 422)
        {
            editBlocked = true;
        }
        Assert(editBlocked, "Documentos publicados devem ser estritamente imutáveis (CANNOT_EDIT_PUBLISHED_TEMPLATE).");
    }),

    ("PR-LEG-01 (Comparação de Versões): Cálculo estruturado de diff com adições, remoções e linhas mantidas", () =>
    {
        var docRepo = new InMemoryLegalDocumentRepository();
        var accRepo = new InMemoryLegalAcceptanceRepository();
        var auditRepo = new InMemoryAdminAuditRepository();
        var legalService = new LegalApplicationService(docRepo, accRepo, auditRepo);

        var legalUserId = Guid.NewGuid();

        // Template v1.0.0
        var v1Req = new CreateLegalTemplateRequest(
            Category: "PLATFORM_MEDIATION",
            Title: "Termo de Mediação v1.0.0",
            Description: "Versão inicial",
            ScopeType: "NATIONAL",
            ScopeStateUf: null,
            ScopeMunicipalityIbge: null,
            Version: "1.0.0",
            ContentMarkdown: "Linha 1: Introdução\nLinha 2: Cláusula de Arbitragem\nLinha 3: Disposições Finais",
            ChangeSummary: "v1");
        var v1 = legalService.CreateTemplateAsync(legalUserId, "LEGAL_OPERATOR", v1Req).GetAwaiter().GetResult();

        // Template v1.1.0 com acréscimo
        var v2Req = new CreateLegalTemplateRequest(
            Category: "PLATFORM_MEDIATION",
            Title: "Termo de Mediação v1.1.0",
            Description: "Versão com nova cláusula",
            ScopeType: "NATIONAL",
            ScopeStateUf: null,
            ScopeMunicipalityIbge: null,
            Version: "1.1.0",
            ContentMarkdown: "Linha 1: Introdução\nLinha 2: Cláusula de Arbitragem com Mediação Online\nLinha 3: Disposições Finais\nLinha 4: Foro de Eleição",
            ChangeSummary: "v2");
        var v2 = legalService.CreateTemplateAsync(legalUserId, "LEGAL_OPERATOR", v2Req).GetAwaiter().GetResult();

        // Compara v2 com v1
        var diff = legalService.CompareVersionsAsync(v2.Id, "1.0.0").GetAwaiter().GetResult();

        Assert(diff.SourceVersion == "1.1.0", "SourceVersion deve ser 1.1.0.");
        Assert(diff.TargetVersion == "1.0.0", "TargetVersion deve ser 1.0.0.");
        Assert(diff.Diffs.Count > 0, "Diferenças devem ser calculadas.");
        Assert(diff.AdditionsCount > 0, "Deve computar adições.");
    }),

    ("PR-LEG-01 (Importação DOCX Segura): Conversão em markdown, contagem de parágrafos e rejeição de arquivos com macros ou scripts", () =>
    {
        var docRepo = new InMemoryLegalDocumentRepository();
        var accRepo = new InMemoryLegalAcceptanceRepository();
        var auditRepo = new InMemoryAdminAuditRepository();
        var legalService = new LegalApplicationService(docRepo, accRepo, auditRepo);

        // 1. Cria um arquivo DOCX válido em memória (ZIP com word/document.xml)
        using var memStream = new MemoryStream();
        using (var zip = new System.IO.Compression.ZipArchive(memStream, System.IO.Compression.ZipArchiveMode.Create, true))
        {
            var docEntry = zip.CreateEntry("word/document.xml");
            using var entryStream = docEntry.Open();
            string xmlContent = """
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              <w:body>
                <w:p><w:t>TERMO DE ADESÃO IMPORTADO</w:t></w:p>
                <w:p><w:t>1. Este documento foi importado de forma segura para a {{PLATFORM_NAME}}.</w:t></w:p>
                <w:p><w:t>O usuário {{USER_NAME}} declara concordância com os termos.</w:t></w:p>
              </w:body>
            </w:document>
            """;
            byte[] bytes = Encoding.UTF8.GetBytes(xmlContent);
            entryStream.Write(bytes, 0, bytes.Length);
        }
        memStream.Position = 0;

        var result = legalService.ImportDocxStream(memStream);
        Assert(result.IsSanitized, "Resultado deve ser sanitizado.");
        Assert(result.ParagraphCount >= 3, $"Deve extrair pelo menos 3 parágrafos, encontrou {result.ParagraphCount}.");
        Assert(result.ExtractedMarkdown.Contains("{{PLATFORM_NAME}}"), "Deve extrair placeholder {{PLATFORM_NAME}}.");
        Assert(result.ExtractedPlaceholders.Contains("{{USER_NAME}}"), "Deve detectar {{USER_NAME}} nos placeholders.");

        // 2. Arquivo DOCX com macro maliciosa (vbaProject.bin) deve ser rejeitado (422)
        using var maliciousStream = new MemoryStream();
        using (var zip = new System.IO.Compression.ZipArchive(maliciousStream, System.IO.Compression.ZipArchiveMode.Create, true))
        {
            var docEntry = zip.CreateEntry("word/document.xml");
            using (var entryStream = docEntry.Open())
            {
                byte[] bytes = Encoding.UTF8.GetBytes("<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:t>Teste</w:t></w:p></w:body></w:document>");
                entryStream.Write(bytes, 0, bytes.Length);
            }

            // Injeta arquivo de macro VBA proibido
            var vbaEntry = zip.CreateEntry("word/vbaProject.bin");
            using (var vbaStream = vbaEntry.Open())
            {
                vbaStream.WriteByte(0x01);
            }
        }
        maliciousStream.Position = 0;

        bool macroBlocked = false;
        try
        {
            legalService.ImportDocxStream(maliciousStream);
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "MALICIOUS_DOCX_REJECTED" && ex.HttpStatusCode == 422)
        {
            macroBlocked = true;
        }
        Assert(macroBlocked, "Arquivo DOCX contendo macros VBA deve ser rejeitado com MALICIOUS_DOCX_REJECTED.");
    }),

    ("PR-LEG-01 (Abrangência Territorial & Aceite): Resolução cumulativa por IBGE e gravação imutável de aceite com hash SHA256", () =>
    {
        var docRepo = new InMemoryLegalDocumentRepository();
        var accRepo = new InMemoryLegalAcceptanceRepository();
        var auditRepo = new InMemoryAdminAuditRepository();
        var legalService = new LegalApplicationService(docRepo, accRepo, auditRepo);

        var userId = Guid.NewGuid();

        // 1. Consulta termos aplicáveis para transportador em João Monlevade (IBGE 3136207)
        var applicableTerms = legalService.GetApplicableTermsAsync("CARRIER", "MG", "3136207").GetAwaiter().GetResult();

        Assert(applicableTerms.Any(t => t.Category == "TERMS_OF_SERVICE" && t.ScopeType == "NATIONAL"),
            "Termos Gerais Nacionais devem ser aplicáveis.");
        Assert(applicableTerms.Any(t => t.Category == "CARRIER_ADHESION" && t.ScopeType == "STATE"),
            "Termo de Adesão Estadual MG deve ser aplicável.");

        // 2. Registrar aceite do Termo de Adesão do Transportador
        var carrierTerm = applicableTerms.First(t => t.Category == "CARRIER_ADHESION");
        var acceptReq = new RegisterLegalAcceptanceRequest(
            TemplateId: carrierTerm.Id,
            Version: carrierTerm.Version,
            DocumentHashSha256: "hash-gerado-no-front");

        var record = legalService.RegisterAcceptanceAsync(
            userId,
            "123.456.789-00",
            "189.40.12.5",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            acceptReq).GetAwaiter().GetResult();

        Assert(record.TemplateId == carrierTerm.Id, "TemplateId deve bater com o termo aceito.");
        Assert(record.UserCpfMasked == "123.***.***-00", "CPF do usuário deve ser gravado com mascaramento seguro.");
        Assert(!string.IsNullOrWhiteSpace(record.DocumentHashSha256), "Hash SHA256 do documento deve ser registrado.");

        // 3. Consulta histórico de aceites do usuário
        var myAcceptances = legalService.ListUserAcceptancesAsync(userId).GetAwaiter().GetResult();
        Assert(myAcceptances.Count == 1, "Usuário deve possuir 1 aceite registrado.");
        Assert(myAcceptances[0].Category == "CARRIER_ADHESION", "Categoria registrada deve ser CARRIER_ADHESION.");
    }),

    ("VIGENCIA-01: Política vigente antes dos agendamentos (POL-COM-V1 13% Free / 7% Premium)", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var current = service.GetEffectivePolicyAsync(DateTimeOffset.UtcNow).GetAwaiter().GetResult();
        Assert(current.Version == "POL-COM-V1", "Antes dos agendamentos a política vigente deve ser POL-COM-V1.");
        Assert(current.FreePlanCommissionPercent == 13.00m, "Comissão Free deve ser 13%.");
        Assert(current.PremiumPlanCommissionPercent == 7.00m, "Comissão Premium deve ser 7%.");
        Assert(current.IsActive, "POL-COM-V1 deve estar ativa.");
        Assert(FinancialApplicationService.DeterminePolicyStatus(current) == "VIGENTE", "Status deve ser VIGENTE.");
    }),

    ("VIGENCIA-02: Política aplicável entre cada horário de versões futuras encadeadas", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var adminId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var t1 = now.AddDays(5);
        var t2 = now.AddDays(10);
        var t3 = now.AddDays(15);

        // Agendamento V1 -> VA (em t1) -> VB (em t2) -> VC (em t3)
        service.CreatePolicyVersionAsync(adminId, "GENERAL_ADMIN", new CreateCommercialPolicyRequest(
            Version: "POL-COM-VA",
            Name: "Versão A",
            FreePlanCommissionPercent: 15.00m,
            PremiumPlanCommissionPercent: 8.00m,
            PremiumMonthlyFeeCents: 4000,
            CancellationPenaltyPercent: 10.00m,
            CancellationMinFeeCents: 700,
            CancellationInjuredPartySharePercent: 80.00m,
            ValidFrom: t1,
            Justification: "Agendamento A")).GetAwaiter().GetResult();

        service.CreatePolicyVersionAsync(adminId, "GENERAL_ADMIN", new CreateCommercialPolicyRequest(
            Version: "POL-COM-VB",
            Name: "Versão B",
            FreePlanCommissionPercent: 18.00m,
            PremiumPlanCommissionPercent: 9.00m,
            PremiumMonthlyFeeCents: 4500,
            CancellationPenaltyPercent: 10.00m,
            CancellationMinFeeCents: 700,
            CancellationInjuredPartySharePercent: 80.00m,
            ValidFrom: t2,
            Justification: "Agendamento B")).GetAwaiter().GetResult();

        service.CreatePolicyVersionAsync(adminId, "GENERAL_ADMIN", new CreateCommercialPolicyRequest(
            Version: "POL-COM-VC",
            Name: "Versão C",
            FreePlanCommissionPercent: 23.00m,
            PremiumPlanCommissionPercent: 23.00m,
            PremiumMonthlyFeeCents: 0,
            CancellationPenaltyPercent: 10.00m,
            CancellationMinFeeCents: 700,
            CancellationInjuredPartySharePercent: 80.00m,
            ValidFrom: t3,
            Justification: "Agendamento C")).GetAwaiter().GetResult();

        // 1. Antes de t1 (ex: now + 2 dias) -> POL-COM-V1
        var pNow = service.GetEffectivePolicyAsync(now.AddDays(2)).GetAwaiter().GetResult();
        Assert(pNow.Version == "POL-COM-V1", "Antes de t1 deve vigorar POL-COM-V1.");

        // 2. Entre t1 e t2 (ex: now + 7 dias) -> POL-COM-VA
        var pA = service.GetEffectivePolicyAsync(now.AddDays(7)).GetAwaiter().GetResult();
        Assert(pA.Version == "POL-COM-VA", "Entre t1 e t2 deve vigorar POL-COM-VA.");

        // 3. Entre t2 e t3 (ex: now + 12 dias) -> POL-COM-VB
        var pB = service.GetEffectivePolicyAsync(now.AddDays(12)).GetAwaiter().GetResult();
        Assert(pB.Version == "POL-COM-VB", "Entre t2 e t3 deve vigorar POL-COM-VB.");

        // 4. Após t3 (ex: now + 20 dias) -> POL-COM-VC
        var pC = service.GetEffectivePolicyAsync(now.AddDays(20)).GetAwaiter().GetResult();
        Assert(pC.Version == "POL-COM-VC", "Após t3 deve vigorar POL-COM-VC.");
    }),

    ("VIGENCIA-03: Rejeição de políticas com datas conflitantes ou sobrepostas", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var adminId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        // 1. Rejeição de validFrom no passado
        bool pastRejected = false;
        try
        {
            service.CreatePolicyVersionAsync(adminId, "GENERAL_ADMIN", new CreateCommercialPolicyRequest(
                "POL-COM-PAST-TEST", "Passado", 15m, 8m, 3990, 10m, 700, 80m,
                now.AddMinutes(-5), "Início no passado")).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "CONFLICTING_POLICY_VALIDITY" && ex.HttpStatusCode == 422)
        {
            pastRejected = true;
        }
        Assert(pastRejected, "Tentativa de criar política no passado deve ser rejeitada com 422.");

        // 2. Cria política futura para now + 10 dias
        service.CreatePolicyVersionAsync(adminId, "GENERAL_ADMIN", new CreateCommercialPolicyRequest(
            "POL-COM-FUT-1", "Futuro 1", 16m, 8m, 3990, 10m, 700, 80m,
            now.AddDays(10), "Agendada 10d")).GetAwaiter().GetResult();

        // 3. Tentativa de agendar outra com data anterior ou idêntica (now + 5 dias) sem revogar
        bool conflictRejected = false;
        try
        {
            service.CreatePolicyVersionAsync(adminId, "GENERAL_ADMIN", new CreateCommercialPolicyRequest(
                "POL-COM-FUT-2", "Futuro 2 Conflitante", 17m, 8m, 3990, 10m, 700, 80m,
                now.AddDays(5), "Conflito")).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "CONFLICTING_POLICY_VALIDITY" && ex.HttpStatusCode == 422)
        {
            conflictRejected = true;
        }
        Assert(conflictRejected, "Agendamento sobreposto anterior à política agendada existente deve ser rejeitado com 422.");
    }),

    ("VIGENCIA-04: Revogação de versão futura restaura encadeamento e auditoria", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var adminId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        // Agenda política para 10 dias à frente
        var created = service.CreatePolicyVersionAsync(adminId, "GENERAL_ADMIN", new CreateCommercialPolicyRequest(
            "POL-COM-TO-REVOKE", "Para Revogar", 23m, 11m, 15000, 10m, 700, 80m,
            now.AddDays(10), "Teste revogação")).GetAwaiter().GetResult();

        var polV1Before = policyRepo.GetPolicyByVersionAsync("POL-COM-V1").GetAwaiter().GetResult();
        Assert(polV1Before != null && polV1Before.ValidUntil == created.ValidFrom, "V1 deve ter ValidUntil igual ao início da versão agendada.");

        // Revoga a versão agendada
        var revoked = service.RevokePolicyAsync(created.Id, adminId, "GENERAL_ADMIN", "Revogação pelo fundador").GetAwaiter().GetResult();
        Assert(!revoked.IsActive, "Política revogada deve ter IsActive = false.");
        Assert(revoked.Status == "REVOGADA", "Status da política revogada deve ser REVOGADA.");

        // Verifica que V1 teve seu ValidUntil restaurado para null
        var polV1After = policyRepo.GetPolicyByVersionAsync("POL-COM-V1").GetAwaiter().GetResult();
        Assert(polV1After != null && polV1After.ValidUntil == null, "POL-COM-V1 deve ter seu ValidUntil restaurado para null após a revogação.");

        // Verifica auditoria
        var auditEntries = auditRepo.GetAuditEntriesAsync("COMMERCIAL_POLICY", created.Id).GetAwaiter().GetResult();
        Assert(auditEntries.Any(e => e.Operation == "POLICY_REVOKED"), "Deve existir evento de auditoria POLICY_REVOKED.");

        // Tentativa de revogar novamente deve falhar
        bool alreadyRevokedFailed = false;
        try
        {
            service.RevokePolicyAsync(created.Id, adminId, "GENERAL_ADMIN", "Segunda revogação").GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "POLICY_ALREADY_REVOKED" && ex.HttpStatusCode == 422)
        {
            alreadyRevokedFailed = true;
        }
        Assert(alreadyRevokedFailed, "Segunda revogação da mesma política deve falhar com 422.");

        // Tentativa de revogar política ativa vigente deve falhar
        bool activeRevokeFailed = false;
        try
        {
            service.RevokePolicyAsync(polV1After!.Id, adminId, "GENERAL_ADMIN", "Tentativa de revogar vigente").GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "CANNOT_REVOKE_ACTIVE_POLICY" && ex.HttpStatusCode == 422)
        {
            activeRevokeFailed = true;
        }
        Assert(activeRevokeFailed, "Revogação da política ativa vigente deve falhar com CANNOT_REVOKE_ACTIVE_POLICY (422).");
    }),

    ("VIGENCIA-05: Agendamento válido e determinístico sem sobreposição de intervalos", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var adminId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var d1 = now.AddDays(7);
        var d2 = now.AddDays(14);

        service.CreatePolicyVersionAsync(adminId, "GENERAL_ADMIN", new CreateCommercialPolicyRequest(
            "POL-V5-A", "Agendamento 1", 15m, 8m, 3990, 10m, 700, 80m, d1, "Just 1")).GetAwaiter().GetResult();

        service.CreatePolicyVersionAsync(adminId, "GENERAL_ADMIN", new CreateCommercialPolicyRequest(
            "POL-V5-B", "Agendamento 2", 20m, 10m, 3990, 10m, 700, 80m, d2, "Just 2")).GetAwaiter().GetResult();

        var p1 = policyRepo.GetPolicyByVersionAsync("POL-COM-V1").GetAwaiter().GetResult();
        var pA = policyRepo.GetPolicyByVersionAsync("POL-V5-A").GetAwaiter().GetResult();
        var pB = policyRepo.GetPolicyByVersionAsync("POL-V5-B").GetAwaiter().GetResult();

        Assert(p1!.ValidUntil == d1, "POL-COM-V1 encerra exatamente em d1.");
        Assert(pA!.ValidFrom == d1 && pA.ValidUntil == d2, "POL-V5-A vigora no intervalo contíguo [d1, d2).");
        Assert(pB!.ValidFrom == d2 && pB.ValidUntil == null, "POL-V5-B vigora a partir de d2 sem data final.");
    }),

    ("VIGENCIA-06: Preservação inviolável de snapshots financeiros de contratos já aceitos", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var contractId = Guid.NewGuid();
        var proposalId = Guid.NewGuid();
        var shipmentId = Guid.NewGuid();
        var carrierId = Guid.NewGuid();
        var senderId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        // 1. Gera snapshot sob a POL-COM-V1 (13%)
        var snap1 = service.CreateOrGetSnapshotForContractAsync(
            contractId, proposalId, shipmentId, carrierId, senderId, 10000, now).GetAwaiter().GetResult();

        Assert(snap1.CommissionRatePercent == 13.00m, "Snapshot original deve registrar 13%.");
        Assert(snap1.PlatformCommissionCents == 1300, "Comissão deve ser 1300 centavos.");
        Assert(snap1.CarrierNetCents == 8700, "Líquido transportador deve ser 8700 centavos.");

        // 2. Publica nova política com 23%
        var adminId = Guid.NewGuid();
        service.CreatePolicyVersionAsync(adminId, "GENERAL_ADMIN", new CreateCommercialPolicyRequest(
            "POL-COM-23", "Nova Política 23%", 23.00m, 23.00m, 0, 10m, 700, 80m,
            now.AddDays(1), "Alinhamento Business Plan")).GetAwaiter().GetResult();

        // 3. Consulta novamente o snapshot do contrato anterior em data posterior
        var snapAfter = service.CreateOrGetSnapshotForContractAsync(
            contractId, proposalId, shipmentId, carrierId, senderId, 10000, now.AddDays(5)).GetAwaiter().GetResult();

        Assert(snapAfter.CommissionRatePercent == 13.00m, "Snapshot do contrato anterior permanece inviolável em 13%.");
        Assert(snapAfter.PlatformCommissionCents == 1300, "Comissão permanece 1300 centavos (sem recálculo para 23%).");
        Assert(snapAfter.PolicyVersion == "POL-COM-V1", "Versão congelada deve permanecer POL-COM-V1.");
    }),

    ("VIGENCIA-07: Rejeição estrita de publicação e revogação por perfis sem autorização administrativa (RBAC 403)", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var fakeUserId = Guid.NewGuid();

        // 1. CARRIER tentando publicar
        bool carrierBlocked = false;
        try
        {
            service.CreatePolicyVersionAsync(fakeUserId, "CARRIER", new CreateCommercialPolicyRequest(
                "POL-INV", "Inválida", 10m, 5m, 0, 10m, 700, 80m, DateTimeOffset.UtcNow.AddDays(10), "Fraude")).GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "AUTH_FORBIDDEN_INSUFFICIENT_ROLE" && ex.HttpStatusCode == 403)
        {
            carrierBlocked = true;
        }
        Assert(carrierBlocked, "Transportador deve ser bloqueado com 403 ao tentar publicar política.");

        // 2. SUPPORT tentando revogar
        bool supportRevokeBlocked = false;
        try
        {
            service.RevokePolicyAsync(Guid.NewGuid(), fakeUserId, "SUPPORT", "Revogação indevida").GetAwaiter().GetResult();
        }
        catch (DomainRuleViolationException ex) when (ex.RuleCode == "AUTH_FORBIDDEN_INSUFFICIENT_ROLE" && ex.HttpStatusCode == 403)
        {
            supportRevokeBlocked = true;
        }
        Assert(supportRevokeBlocked, "Suporte deve ser bloqueado com 403 ao tentar revogar política.");
    }),

    ("VIGENCIA-08: Resistência a concorrência e sincronização em publicações simultâneas", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var adminId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        // 10 tentativas simultâneas com a mesma versão
        var tasks = Enumerable.Range(0, 10).Select(_ => Task.Run(() =>
        {
            try
            {
                service.CreatePolicyVersionAsync(adminId, "GENERAL_ADMIN", new CreateCommercialPolicyRequest(
                    "POL-CONC-1", "Concorrência", 15m, 7m, 3990, 10m, 700, 80m, now.AddDays(10), "Teste concorrência")).GetAwaiter().GetResult();
                return true;
            }
            catch (DomainRuleViolationException ex) when (ex.RuleCode == "POLICY_VERSION_ALREADY_EXISTS" && ex.HttpStatusCode == 409)
            {
                return false;
            }
        })).ToArray();

        var results = Task.WhenAll(tasks).GetAwaiter().GetResult();
        int successCount = results.Count(r => r);
        int conflictCount = results.Count(r => !r);

        Assert(successCount == 1, "Exatamente 1 publicação deve ser aceita.");
        Assert(conflictCount == 9, "As outras 9 tentativas concorrentes devem falhar com 409.");
    }),

    ("VIGENCIA-09: Consistência de datas UTC e conversão para Horário de Brasília (UTC-3)", () =>
    {
        // 16/10/2026 17:59:55 UTC corresponde a 16/10/2026 14:59:55 em Brasília
        var utcDate = DateTimeOffset.Parse("2026-10-16T17:59:55.5200000+00:00", CultureInfo.InvariantCulture);
        var brtOffset = TimeSpan.FromHours(-3);
        var brtDate = utcDate.ToOffset(brtOffset);

        Assert(brtDate.Year == 2026 && brtDate.Month == 10 && brtDate.Day == 16, "Dia deve permanecer 16/10/2026.");
        Assert(brtDate.Hour == 14 && brtDate.Minute == 59 && brtDate.Second == 55, "Horário deve converter precisamente para 14:59:55.");
    }),

    ("VIGENCIA-10: Ausência absoluta de ativação automática de políticas revogadas", () =>
    {
        var policyRepo = new InMemoryFinancialPolicyRepository();
        var subRepo = new InMemorySubscriptionRepository();
        var snapRepo = new InMemoryFinancialSnapshotRepository();
        var auditRepo = new InMemoryFinancialAuditRepository();
        using var service = new FinancialApplicationService(policyRepo, subRepo, snapRepo, auditRepo);

        var adminId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var futureDate = now.AddDays(2);

        // Cria versão futura
        var created = service.CreatePolicyVersionAsync(adminId, "GENERAL_ADMIN", new CreateCommercialPolicyRequest(
            "POL-GHOST-ACTIVATION", "Política que será revogada", 25m, 12m, 9900, 10m, 700, 80m,
            futureDate, "Para revogar")).GetAwaiter().GetResult();

        // Revoga a versão antes que ela entre em vigor
        service.RevokePolicyAsync(created.Id, adminId, "GENERAL_ADMIN", "Revogada por cancelamento de plano").GetAwaiter().GetResult();

        // Agora avança no tempo para depois de futureDate (ex: now + 5 dias)
        var simulatedFutureNow = now.AddDays(5);
        var activeInFuture = service.GetEffectivePolicyAsync(simulatedFutureNow).GetAwaiter().GetResult();

        Assert(activeInFuture.Version == "POL-COM-V1", "A política revogada NUNCA pode ser ativada; POL-COM-V1 deve permanecer em vigor.");
        Assert(activeInFuture.FreePlanCommissionPercent == 13.00m, "Alíquota ativa no futuro simulado deve continuar sendo 13.00% da POL-COM-V1.");
    }),

    ("PR-01.1 (Recuperação de Senha por E-mail): Emite código HMAC de 6 dígitos, rejeita código incorreto, redefine senha e impede reutilização", () =>
    {
        RunEmailPasswordResetUnitTest();
    }),

    ("HIST-VEIC-01: Alteração de veículo/placa do transportador preserva veículo anterior em VehicleHistory", () =>
    {
        RunVehicleHistoryUnitTest();
    }),

    ("ARQ-24H-01: Viagens/encomendas encerradas ou canceladas há >24h somem das listagens da plataforma mas permanecem no banco", () =>
    {
        RunArchival24hUnitTest();
    })
};

Console.WriteLine("======================================================================");
Console.WriteLine("TopicLog.UnitTests (.NET 10 LTS) — Executando suíte PR-00 + PR-01 + PR-02 + PR-03 + PR-04 + PR-05 + PR-FIN-01 + PR-ADM-01 + PR-FIN-02");
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
}
finally
{
    try
    {
        if (Directory.Exists(tempUnitTestStorage))
        {
            Directory.Delete(tempUnitTestStorage, recursive: true);
        }
    }
    catch { /* silencia limpeza temporária de teste */ }
}

static void RunEmailPasswordResetUnitTest()
{
    var secOpts = Options.Create(new SecurityOptions());
    var keyMat = new RuntimeKeyMaterialProvider(secOpts);
    var crypto = new SecurityCryptoService(secOpts, keyMat);
    var userRepo = new InMemoryUserRepository();
    var refreshRepo = new InMemoryRefreshTokenRepository();
    var resetRepo = new InMemoryPasswordResetRepository();
    var auditRepo = new InMemoryAuditRepository();
    var emailStub = new StubEmailDeliveryService();
    var auth = new ResourceAuthorizationService(crypto, auditRepo);
    var identityService = new IdentityApplicationService(
        userRepo, refreshRepo, resetRepo, auditRepo, emailStub, crypto, auth, secOpts);

    var userId = Guid.NewGuid();
    var user = new UserEntity
    {
        Id = userId,
        Email = "recuperacao.teste@example.test",
        PhoneEncrypted = crypto.EncryptPhone("31999990001"),
        PhoneMasked = "(**) *****-0001",
        PasswordHash = crypto.HashPassword("SenhaAntiga123"),
        Status = UserAccountStatus.LOCKED,
        FailedLoginAttempts = 5,
        LockoutUntilUtc = DateTimeOffset.UtcNow.AddMinutes(10)
    };
    var profile = new UserProfileEntity
    {
        UserId = userId,
        DisplayName = "Usuário Teste Recuperação",
        Roles = [UserRole.SENDER],
        TermsAcceptedVersion = "1.0.0",
        TermsAcceptedAtUtc = DateTimeOffset.UtcNow
    };
    userRepo.CreateAsync(user, profile, CancellationToken.None).GetAwaiter().GetResult();

    var reqResp = identityService.RequestPasswordResetAsync(
        new ForgotPasswordRequest("recuperacao.teste@example.test"), "corr-reset-1", CancellationToken.None)
        .GetAwaiter().GetResult();
    Assert(reqResp.Accepted && emailStub.SentCodes.Count == 1, "Código de 6 dígitos deve ser enviado via serviço de e-mail.");
    string sentCode = emailStub.SentCodes[0].Code;
    Assert(sentCode.Length == 6 && sentCode.All(char.IsAsciiDigit), "Código enviado deve conter 6 dígitos.");

    string wrongCode = sentCode == "000000" ? "999999" : "000000";
    bool rejectedWrong = false;
    try
    {
        identityService.ConfirmPasswordResetAsync(
            new ResetPasswordRequest("recuperacao.teste@example.test", wrongCode, "NovaSenhaForte99"),
            "corr-reset-2", CancellationToken.None).GetAwaiter().GetResult();
    }
    catch (DomainRuleViolationException)
    {
        rejectedWrong = true;
    }
    Assert(rejectedWrong, "Código incorreto deve ser rejeitado.");

    identityService.ConfirmPasswordResetAsync(
        new ResetPasswordRequest("recuperacao.teste@example.test", sentCode, "NovaSenhaForte99"),
        "corr-reset-3", CancellationToken.None).GetAwaiter().GetResult();

    bool rejectedReuse = false;
    try
    {
        identityService.ConfirmPasswordResetAsync(
            new ResetPasswordRequest("recuperacao.teste@example.test", sentCode, "OutraSenha99"),
            "corr-reset-4", CancellationToken.None).GetAwaiter().GetResult();
    }
    catch (DomainRuleViolationException)
    {
        rejectedReuse = true;
    }
    Assert(rejectedReuse, "Código já utilizado não pode ser reutilizado.");

    var session = identityService.LoginAsync(
        new LoginRequest("recuperacao.teste@example.test", "NovaSenhaForte99"),
        "corr-reset-5", CancellationToken.None).GetAwaiter().GetResult();
    Assert(!string.IsNullOrWhiteSpace(session.AccessToken), "Login com a nova senha redefinida deve emitir AccessToken.");
}

static void Assert(bool condition, string message)
{
    if (!condition)
    {
        throw new InvalidOperationException(message);
    }
}

static void RunVehicleHistoryUnitTest()
{
    var secOpts = Options.Create(new SecurityOptions());
    var keyMat = new RuntimeKeyMaterialProvider(secOpts);
    var crypto = new SecurityCryptoService(secOpts, keyMat);
    var userRepo = new InMemoryUserRepository();
    var refreshRepo = new InMemoryRefreshTokenRepository();
    var resetRepo = new InMemoryPasswordResetRepository();
    var auditRepo = new InMemoryAuditRepository();
    var emailStub = new StubEmailDeliveryService();
    var auth = new ResourceAuthorizationService(crypto, auditRepo);
    var identityService = new IdentityApplicationService(
        userRepo, refreshRepo, resetRepo, auditRepo, emailStub, crypto, auth, secOpts);

    var userId = Guid.NewGuid();
    var user = new UserEntity
    {
        Id = userId,
        Email = "carrier.veiculo@example.test",
        PhoneEncrypted = crypto.EncryptPhone("31999990000"),
        PhoneMasked = "(**) *****-0000",
        PasswordHash = crypto.HashPassword("Password123!")
    };
    var profile = new UserProfileEntity
    {
        UserId = userId,
        DisplayName = "Transportador Teste",
        City = "João Monlevade",
        StateUf = "MG",
        Roles = [UserRole.CARRIER],
        TermsAcceptedVersion = "1.0.0",
        TermsAcceptedAtUtc = DateTimeOffset.UtcNow,
        VehicleType = "VAN",
        VehicleModel = "Fiat Ducato",
        VehiclePlate = "ABC1D23",
        VehicleYear = "2022",
        Renavam = "12345678901"
    };
    userRepo.CreateAsync(user, profile, CancellationToken.None).GetAwaiter().GetResult();

    identityService.UpdatePrivateProfileAsync(
        new AuthenticatedActor(userId, "carrier.veiculo@example.test", [UserRole.CARRIER], KycStatus.VERIFIED, "tok-1"),
        userId,
        new UpdateProfileRequest(
            DisplayName: null,
            Phone: null,
            Cpf: null,
            City: null,
            StateUf: null,
            Roles: null,
            VehicleModel: "Renault Master",
            VehiclePlate: "XYZ9K88",
            VehicleYear: "2024",
            Renavam: "99887766554"),
        "corr-veic-2",
        CancellationToken.None).GetAwaiter().GetResult();

    var found = userRepo.FindByIdAsync(userId, CancellationToken.None).GetAwaiter().GetResult();
    Assert(found.HasValue, "Usuário transportador deve existir no repositório.");
    Assert(found!.Value.Profile.VehiclePlate == "XYZ9K88", "Placa atual deve ser XYZ9K88.");
    Assert(found.Value.Profile.VehicleHistory.Count == 1, "Deve existir 1 veículo anterior no histórico.");
    Assert(found.Value.Profile.VehicleHistory[0].VehiclePlate == "ABC1D23", "Placa anterior ABC1D23 deve estar preservada.");
    Assert(found.Value.Profile.VehicleHistory[0].VehicleModel == "Fiat Ducato", "Modelo anterior deve estar preservado.");
}

static void RunArchival24hUnitTest()
{
    var senderId = Guid.NewGuid();
    var carrierId = Guid.NewGuid();
    var fulfillmentRepo = new InMemoryFulfillmentRepository();
    var shipRepo = new InMemoryShipmentsRepository();

    var oldDeliveredOrder = new DeliveryOrder
    {
        ContractId = Guid.NewGuid(),
        ShipmentId = Guid.NewGuid(),
        TripId = Guid.NewGuid(),
        SenderId = senderId,
        CarrierId = carrierId,
        SenderName = "Remetente",
        CarrierName = "Transportador",
        Status = DeliveryOrderStatus.DELIVERED_VERIFIED,
        DeliveredAtUtc = DateTimeOffset.UtcNow.AddHours(-25),
        UpdatedAtUtc = DateTimeOffset.UtcNow.AddHours(-25)
    };
    var recentDeliveredOrder = new DeliveryOrder
    {
        ContractId = Guid.NewGuid(),
        ShipmentId = Guid.NewGuid(),
        TripId = Guid.NewGuid(),
        SenderId = senderId,
        CarrierId = carrierId,
        SenderName = "Remetente",
        CarrierName = "Transportador",
        Status = DeliveryOrderStatus.DELIVERED_VERIFIED,
        DeliveredAtUtc = DateTimeOffset.UtcNow.AddHours(-2),
        UpdatedAtUtc = DateTimeOffset.UtcNow.AddHours(-2)
    };
    fulfillmentRepo.CreateOrderAsync(oldDeliveredOrder).GetAwaiter().GetResult();
    fulfillmentRepo.CreateOrderAsync(recentDeliveredOrder).GetAwaiter().GetResult();

    var fulfillmentService = new FulfillmentApplicationService(fulfillmentRepo, shipRepo);
    var visibleOrders = fulfillmentService.ListOrdersForUserAsync(senderId, ActorRole.SENDER).GetAwaiter().GetResult();
    Assert(visibleOrders.Count == 1 && visibleOrders[0].Id == recentDeliveredOrder.Id,
        "ListOrdersForUserAsync deve ocultar pedidos encerrados há >24h e manter os recentes (<24h).");
    var storedOldOrder = fulfillmentRepo.GetOrderByIdAsync(oldDeliveredOrder.Id).GetAwaiter().GetResult();
    Assert(storedOldOrder is not null, "O pedido antigo deve permanecer salvo no repositório para consulta administrativa.");

    var originAddr = new ShipmentAddress(
        AddressKind.ORIGIN, "João Monlevade", "MG", "Centro", "Rua A, 10", "35930-000",
        null, null, null, null, null, default, default);
    var destAddr = new ShipmentAddress(
        AddressKind.DESTINATION, "Belo Horizonte", "MG", "Centro", "Av. Afonso Pena, 100", "30130-000",
        null, null, null, null, null, default, default);

    var oldShipment = new Shipment
    {
        SenderId = senderId,
        SenderName = "Remetente",
        Title = "Caixa Antiga",
        Category = ShipmentCategory.DOCUMENTOS,
        VehicleType = VehicleType.CAR,
        WeightGrams = 1000,
        OriginAddress = originAddr,
        DestinationAddress = destAddr,
        Status = ShipmentStatus.CANCELLED,
        UpdatedAtUtc = DateTimeOffset.UtcNow.AddHours(-26)
    };
    var recentShipment = new Shipment
    {
        SenderId = senderId,
        SenderName = "Remetente",
        Title = "Caixa Recente",
        Category = ShipmentCategory.DOCUMENTOS,
        VehicleType = VehicleType.CAR,
        WeightGrams = 1000,
        OriginAddress = originAddr,
        DestinationAddress = destAddr,
        Status = ShipmentStatus.CANCELLED,
        UpdatedAtUtc = DateTimeOffset.UtcNow.AddHours(-3)
    };
    shipRepo.CreateAsync(oldShipment).GetAwaiter().GetResult();
    shipRepo.CreateAsync(recentShipment).GetAwaiter().GetResult();

    var shipmentsService = new ShipmentsApplicationService(shipRepo, new LocalDiskObjectStorageProvider());
    var myShipments = shipmentsService.ListMyShipmentsAsync(senderId).GetAwaiter().GetResult();
    Assert(myShipments.Count == 1 && myShipments[0].Id == recentShipment.Id,
        "ListMyShipmentsAsync deve ocultar encomendas canceladas há >24h e manter as recentes (<24h).");
    var storedOldShipment = shipRepo.GetByIdAsync(oldShipment.Id).GetAwaiter().GetResult();
    Assert(storedOldShipment is not null, "A encomenda antiga deve permanecer salva no repositório para consulta administrativa.");
}

sealed class StubEmailDeliveryService : IEmailDeliveryService
{
    public bool IsConfigured => true;
    public List<(string ToEmail, string Code)> SentCodes { get; } = [];

    public Task SendPasswordResetCodeAsync(
        string toEmail,
        string recipientName,
        string resetCode,
        int expiresInMinutes,
        CancellationToken cancellationToken)
    {
        SentCodes.Add((toEmail, resetCode));
        return Task.CompletedTask;
    }
}
