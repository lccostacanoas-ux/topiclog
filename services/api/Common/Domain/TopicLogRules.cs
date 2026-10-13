using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Options;

namespace TopicLog.Api.Common.Domain;

/// <summary>
/// Modalidades de veículos suportadas desde o MVP (D03, D04).
/// </summary>
public enum VehicleType
{
    BICYCLE = 0,
    MOTORCYCLE = 1,
    CAR = 2
}

/// <summary>
/// Exceção de violação de regra de domínio com código semântico para mapeamento em ProblemDetails.
/// </summary>
public sealed class DomainRuleViolationException : Exception
{
    public string RuleCode { get; }
    public int HttpStatusCode { get; }

    public DomainRuleViolationException(string ruleCode, string message, int httpStatusCode = 400)
        : base(message)
    {
        RuleCode = ruleCode;
        HttpStatusCode = httpStatusCode;
    }
}

public sealed record WeightValidationResult(
    bool IsValid,
    VehicleType VehicleType,
    int WeightGrams,
    int MaxAllowedGrams,
    string? ErrorCode,
    string? ErrorMessage);

public sealed record CommissionSnapshot(
    string PolicyVersionId,
    string PlanCode,
    long TransportAmountCents,
    decimal CommissionRate,
    long CommissionCents,
    long CarrierDueCents,
    long SenderTotalCents,
    bool GatewayFeesAbsorbedByPlatform);

public sealed record InsuranceInterestResult(
    bool Interested,
    long ChargedAmountCents,
    bool HasActivePolicy,
    bool GuaranteesCoverage,
    string MandatoryDisclaimer);

public sealed record DeliveryAndTransferEligibilityInput(
    bool HasValidSecurityCode,
    bool HasDeliveryPhoto,
    bool HasApprovedHumanException,
    bool IsCarrierUnilateralClaimOnly,
    PaymentStatus PaymentStatus,
    bool HasOpenDispute,
    bool HasHoldOrFraudFlag);

public sealed record DeliveryAndTransferEligibilityResult(
    bool IsDeliveryVerified,
    bool IsTransferEligible,
    TransferStatus RecommendedTransferStatus,
    string ReasonCode,
    string ReasonDescription);

/// <summary>
/// Motor puro de validação das regras vinculantes da Topic Log v2.0 (D01–D17).
/// </summary>
public static class TopicLogRules
{
    public const int DefaultBicycleMaxWeightGrams = 5000;
    public const int DefaultMotorcycleMaxWeightGrams = 20000;
    public const int DefaultCarMaxWeightGrams = 20000;

    /// <summary>
    /// Valida o peso em gramas contra o limite configurável do modal e a capacidade declarada (D03, D04).
    /// Critério de aceite: 5.001 kg (5001 g) bloqueia bicicleta; 20.001 kg (20001 g) bloqueia moto/carro.
    /// </summary>
    public static WeightValidationResult ValidateVehicleWeight(
        VehicleType vehicleType,
        int weightGrams,
        IReadOnlyDictionary<string, int>? configuredLimits = null,
        int? declaredCarrierCapacityGrams = null)
    {
        if (weightGrams <= 0)
        {
            return new WeightValidationResult(
                IsValid: false,
                VehicleType: vehicleType,
                WeightGrams: weightGrams,
                MaxAllowedGrams: 0,
                ErrorCode: "INVALID_WEIGHT",
                ErrorMessage: "O peso da encomenda deve ser maior que zero grama.");
        }

        int modalLimitGrams = ResolveModalLimitGrams(vehicleType, configuredLimits);
        int effectiveLimitGrams = declaredCarrierCapacityGrams.HasValue
            ? Math.Min(modalLimitGrams, declaredCarrierCapacityGrams.Value)
            : modalLimitGrams;

        if (weightGrams > effectiveLimitGrams)
        {
            return new WeightValidationResult(
                IsValid: false,
                VehicleType: vehicleType,
                WeightGrams: weightGrams,
                MaxAllowedGrams: effectiveLimitGrams,
                ErrorCode: "VEHICLE_WEIGHT_LIMIT_EXCEEDED",
                ErrorMessage: $"O peso informado ({weightGrams} g) excede o limite permitido de {effectiveLimitGrams} g para o modal {vehicleType}.");
        }

        return new WeightValidationResult(
            IsValid: true,
            VehicleType: vehicleType,
            WeightGrams: weightGrams,
            MaxAllowedGrams: effectiveLimitGrams,
            ErrorCode: null,
            ErrorMessage: null);
    }

    /// <summary>
    /// Verifica a exigência de KYC bilateral válido antes de permitir a contratação/aceite (D05).
    /// </summary>
    public static bool CanContractWithBilateralKyc(KycStatus senderKycStatus, KycStatus carrierKycStatus) =>
        senderKycStatus == KycStatus.VERIFIED && carrierKycStatus == KycStatus.VERIFIED;

    /// <summary>
    /// Calcula e congela o snapshot comercial em centavos inteiros na contratação (D10, D11, D12).
    /// Garante a invariante: CommissionCents + CarrierDueCents == TransportAmountCents,
    /// e mantém SenderTotalCents == TransportAmountCents (sem sobretaxa por método de pagamento).
    /// </summary>
    public static CommissionSnapshot CalculateCommissionSnapshot(
        long transportAmountCents,
        decimal commissionRate,
        string policyVersionId,
        string planCode)
    {
        if (transportAmountCents <= 0)
        {
            throw new DomainRuleViolationException(
                "INVALID_TRANSPORT_AMOUNT",
                "O valor do transporte em centavos deve ser estritamente positivo.");
        }

        if (commissionRate is < 0m or > 1m)
        {
            throw new DomainRuleViolationException(
                "INVALID_COMMISSION_RATE",
                "A taxa de comissão deve estar entre 0.000000 e 1.000000.");
        }

        long commissionCents = (long)decimal.Round(
            transportAmountCents * commissionRate,
            0,
            MidpointRounding.AwayFromZero);

        long carrierDueCents = transportAmountCents - commissionCents;

        if (commissionCents < 0 || carrierDueCents < 0 || (commissionCents + carrierDueCents) != transportAmountCents)
        {
            throw new DomainRuleViolationException(
                "COMMISSION_INVARIANT_BROKEN",
                "Invariante contábil violada no cálculo de comissão em centavos.");
        }

        return new CommissionSnapshot(
            PolicyVersionId: policyVersionId,
            PlanCode: planCode,
            TransportAmountCents: transportAmountCents,
            CommissionRate: commissionRate,
            CommissionCents: commissionCents,
            CarrierDueCents: carrierDueCents,
            SenderTotalCents: transportAmountCents,
            GatewayFeesAbsorbedByPlatform: true);
    }

    /// <summary>
    /// Registra a manifestação de interesse em seguro sem cobrança, apólice ou cobertura no MVP (D06).
    /// </summary>
    public static InsuranceInterestResult CreateInsuranceInterestManifestation(bool interested) =>
        new(
            Interested: interested,
            ChargedAmountCents: 0,
            HasActivePolicy: false,
            GuaranteesCoverage: false,
            MandatoryDisclaimer: TopicLogOptions.MandatoryInsuranceDisclaimer);

    /// <summary>
    /// Avalia a confirmação de entrega e a elegibilidade para emissão de ordem de transferência (D16, D17).
    /// </summary>
    public static DeliveryAndTransferEligibilityResult EvaluateDeliveryAndTransferEligibility(
        DeliveryAndTransferEligibilityInput input)
    {
        if (input.IsCarrierUnilateralClaimOnly)
        {
            return new DeliveryAndTransferEligibilityResult(
                IsDeliveryVerified: false,
                IsTransferEligible: false,
                RecommendedTransferStatus: TransferStatus.NOT_ELIGIBLE,
                ReasonCode: "UNILATERAL_CARRIER_CLAIM_FORBIDDEN",
                ReasonDescription: "Ato unilateral do transportador nunca confirma entrega nem libera repasse (D16).");
        }

        bool normalProofComplete = input.HasValidSecurityCode && input.HasDeliveryPhoto;
        bool deliveryVerified = normalProofComplete || input.HasApprovedHumanException;

        if (!deliveryVerified)
        {
            return new DeliveryAndTransferEligibilityResult(
                IsDeliveryVerified: false,
                IsTransferEligible: false,
                RecommendedTransferStatus: TransferStatus.NOT_ELIGIBLE,
                ReasonCode: "DELIVERY_PROOF_INCOMPLETE",
                ReasonDescription: "A entrega normal exige código de segurança válido + foto privada, ou exceção revisada por humano autorizado (D16).");
        }

        if (input.HasOpenDispute || input.HasHoldOrFraudFlag)
        {
            return new DeliveryAndTransferEligibilityResult(
                IsDeliveryVerified: true,
                IsTransferEligible: false,
                RecommendedTransferStatus: TransferStatus.BLOCKED,
                ReasonCode: "TRANSFER_BLOCKED_BY_DISPUTE_OR_HOLD",
                ReasonDescription: "Repasse bloqueado devido a disputa aberta ou bloqueio de segurança/antifraude (D17).");
        }

        bool paymentConfirmed = input.PaymentStatus is PaymentStatus.CONFIRMED or PaymentStatus.SETTLED;
        if (!paymentConfirmed)
        {
            return new DeliveryAndTransferEligibilityResult(
                IsDeliveryVerified: true,
                IsTransferEligible: false,
                RecommendedTransferStatus: TransferStatus.NOT_ELIGIBLE,
                ReasonCode: "PAYMENT_NOT_CONFIRMED",
                ReasonDescription: "Repasse aguarda confirmação/elegibilidade do pagamento no provedor financeiro (D17).");
        }

        return new DeliveryAndTransferEligibilityResult(
            IsDeliveryVerified: true,
            IsTransferEligible: true,
            RecommendedTransferStatus: TransferStatus.ELIGIBLE,
            ReasonCode: "ELIGIBLE_FOR_TRANSFER_ORDER",
            ReasonDescription: "Elegível para emissão de ordem de transferência idempotente (não equivale a crédito bancário imediato — D17).");
    }

    private static int ResolveModalLimitGrams(
        VehicleType vehicleType,
        IReadOnlyDictionary<string, int>? configuredLimits)
    {
        if (configuredLimits is not null
            && configuredLimits.TryGetValue(vehicleType.ToString(), out int customLimit)
            && customLimit > 0)
        {
            return customLimit;
        }

        return vehicleType switch
        {
            VehicleType.BICYCLE => DefaultBicycleMaxWeightGrams,
            VehicleType.MOTORCYCLE => DefaultMotorcycleMaxWeightGrams,
            VehicleType.CAR => DefaultCarMaxWeightGrams,
            _ => throw new ArgumentOutOfRangeException(nameof(vehicleType), vehicleType, "Modal de veículo desconhecido.")
        };
    }
}
