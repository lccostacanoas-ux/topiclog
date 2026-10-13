using System.Diagnostics.CodeAnalysis;

namespace TopicLog.Api.Common.Contracts;

/// <summary>
/// Estados auditáveis de verificação de identidade (KYC) conforme 02-TRD-Tecnico.md (Adendo v2.0).
/// </summary>
[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica da máquina de estados definida em 02-TRD-Tecnico.md")]
public enum KycStatus
{
    NOT_STARTED = 0,
    PENDING = 1,
    IN_REVIEW = 2,
    VERIFIED = 3,
    REJECTED = 4,
    EXPIRED = 5
}

public sealed record KycVerificationStatusResult(
    Guid UserId,
    string ProviderName,
    KycStatus Status,
    bool HasVerifiedCpf,
    bool HasVerifiedIdentityDocument,
    bool HasVerifiedAddress,
    bool HasVerifiedFacialMatch,
    DateTimeOffset? VerifiedAtUtc,
    DateTimeOffset? ExpiresAtUtc);

public sealed record KycSandboxSubmissionRequest(
    Guid UserId,
    string CpfHash,
    string IdentityDocumentReference,
    string AddressProofReference,
    string PartnerFacialSessionReference);

public sealed record KycSandboxSubmissionReceipt(
    string ProviderName,
    string ProviderReferenceId,
    DateTimeOffset ReceivedAtUtc,
    bool IsSandboxMode);

/// <summary>
/// Contrato desacoplado de verificação de identidade e biometria facial (D05).
/// Proibido armazenar biometria facial bruta no banco da Topic Log (LGPD / Minimização).
/// </summary>
public interface IKycProvider
{
    string ProviderName { get; }

    Task<KycVerificationStatusResult> GetVerificationStatusAsync(
        Guid userId,
        CancellationToken cancellationToken);

    Task<KycSandboxSubmissionReceipt> RegisterSandboxSubmissionAsync(
        KycSandboxSubmissionRequest request,
        CancellationToken cancellationToken);
}
