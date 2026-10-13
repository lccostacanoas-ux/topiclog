using System.Diagnostics.CodeAnalysis;
using TopicLog.Api.Common.Contracts;

namespace TopicLog.Api.Modules.Verification;

/// <summary>
/// Tipos canônicos de verificação obrigatória antes da contratação (D05, 05-Banco-de-Dados.md).
/// </summary>
[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica definida no esquema SQL 001_identity_kyc_audit.sql")]
public enum KycCheckType
{
    CPF_STATUS = 0,
    IDENTITY_DOCUMENT = 1,
    ADDRESS_PROOF = 2,
    FACIAL_BIOMETRY_PARTNER = 3
}

/// <summary>
/// Estados individuais de cada check dentro de um caso de KYC (05-Banco-de-Dados.md).
/// </summary>
public enum KycCheckStatus
{
    PENDING = 0,
    PASSED = 1,
    FAILED = 2
}

/// <summary>
/// Entidade de domínio correspondente à tabela kyc_cases (05-Banco-de-Dados.md).
/// </summary>
public sealed class KycCaseEntity
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public required Guid UserId { get; init; }

    public required string Provider { get; init; }

    public required string ProviderReferenceId { get; set; }

    public KycStatus Status { get; set; } = KycStatus.PENDING;

    public string? RejectionReason { get; set; }

    public DateTimeOffset SubmittedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? DecidedAtUtc { get; set; }

    public DateTimeOffset? ExpiresAtUtc { get; set; }

    public List<KycCheckEntity> Checks { get; init; } = [];
}

/// <summary>
/// Entidade de domínio correspondente à tabela kyc_checks (05-Banco-de-Dados.md).
/// PROIBIDO armazenar imagem ou vetor biométrico facial bruto (LGPD Art. 11 / D05).
/// </summary>
public sealed class KycCheckEntity
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public required Guid KycCaseId { get; init; }

    public required KycCheckType CheckType { get; init; }

    public KycCheckStatus Status { get; set; } = KycCheckStatus.PENDING;

    public required string EvidenceReference { get; set; }

    public DateTimeOffset? VerifiedAtUtc { get; set; }
}

public sealed record SubmitKycCaseRequest(
    string Cpf,
    string IdentityDocumentRef,
    string AddressProofRef,
    string PartnerFacialSessionRef,
    bool ConsentGiven);

public sealed record KycCheckReviewInput(
    string CheckType,
    string Status);

public sealed record ReviewKycDecisionRequest(
    string TargetStatus,
    IReadOnlyList<KycCheckReviewInput>? CheckResults,
    string? JustificationOrRejectionReason,
    int? ValidityDays);

public sealed record ReanalyzeKycCaseRequest(
    string IdentityDocumentRef,
    string AddressProofRef,
    string PartnerFacialSessionRef,
    string AppealJustification);

public sealed record EvaluateBilateralKycRequest(
    Guid SenderUserId,
    Guid CarrierUserId);

public sealed record KycCheckItemResponse(
    Guid CheckId,
    string CheckType,
    string Status,
    string EvidenceReference,
    DateTimeOffset? VerifiedAtUtc);

public sealed record KycDossierResponse(
    Guid UserId,
    string CurrentKycStatus,
    bool CanNavigatePlatform,
    bool CanContractDelivery,
    Guid? ActiveCaseId,
    string? Provider,
    string? ProviderReferenceId,
    string? RejectionReason,
    DateTimeOffset? SubmittedAtUtc,
    DateTimeOffset? DecidedAtUtc,
    DateTimeOffset? ExpiresAtUtc,
    IReadOnlyList<KycCheckItemResponse> Checks);

public sealed record PartyKycEligibilitySummary(
    Guid UserId,
    string RequiredRole,
    string CurrentKycStatus,
    bool IsAccountActive,
    bool HasRequiredRole,
    bool HasAcceptedCurrentTerms,
    bool HasAllFourChecksPassed,
    bool IsNotExpired,
    bool IsEligible,
    IReadOnlyList<string> BlockingCodes);

public sealed record BilateralKycEvaluationResponse(
    bool IsEligible,
    PartyKycEligibilitySummary Sender,
    PartyKycEligibilitySummary Carrier,
    IReadOnlyList<string> BlockingCodes,
    string SummaryMessage,
    DateTimeOffset EvaluatedAtUtc);

public sealed record ActorResponsibilityClause(
    string Actor,
    string LegalSummary,
    IReadOnlyList<string> Obligations);

public sealed record TermsResponsibilityManifestResponse(
    string TermsVersion,
    string DecisionCode,
    bool HasAbsolutePlatformExemptionClause,
    string LegalPrinciple,
    IReadOnlyList<ActorResponsibilityClause> Responsibilities);
