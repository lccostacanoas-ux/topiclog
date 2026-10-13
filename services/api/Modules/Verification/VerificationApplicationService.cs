using System.Text.Json;
using Microsoft.Extensions.Options;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Common.Options;
using TopicLog.Api.Modules.Identity;

namespace TopicLog.Api.Modules.Verification;

/// <summary>
/// Serviço de aplicação do módulo Verification (PR-01.2):
/// Máquina de estados do KYC progressivo, validação dos 4 checks sem biometria bruta (LGPD),
/// segregação de funções (proibição de autoaprovação), reanálise e elegibilidade bilateral independente (D05, D08).
/// </summary>
public sealed class VerificationApplicationService : IDisposable
{
    private const int MaxSafeReferenceLength = 160;
    private const int DefaultKycValidityDays = 365;

    private static readonly KycCheckType[] MandatoryCheckTypes =
    [
        KycCheckType.CPF_STATUS,
        KycCheckType.IDENTITY_DOCUMENT,
        KycCheckType.ADDRESS_PROOF,
        KycCheckType.FACIAL_BIOMETRY_PARTNER
    ];

    private static readonly UserRole[] ReviewerAllowedRoles =
    [
        UserRole.SUPPORT,
        UserRole.GENERAL_ADMIN
    ];

    private readonly SemaphoreSlim _stateMutationGate = new(1, 1);
    private readonly IUserRepository _userRepository;
    private readonly IKycRepository _kycRepository;
    private readonly IAuditRepository _auditRepository;
    private readonly IKycProvider _kycProvider;
    private readonly SecurityCryptoService _crypto;
    private readonly ResourceAuthorizationService _authorization;
    private readonly SecurityOptions _securityOptions;

    public VerificationApplicationService(
        IUserRepository userRepository,
        IKycRepository kycRepository,
        IAuditRepository auditRepository,
        IKycProvider kycProvider,
        SecurityCryptoService crypto,
        ResourceAuthorizationService authorization,
        IOptions<SecurityOptions> securityOptions)
    {
        ArgumentNullException.ThrowIfNull(userRepository);
        ArgumentNullException.ThrowIfNull(kycRepository);
        ArgumentNullException.ThrowIfNull(auditRepository);
        ArgumentNullException.ThrowIfNull(kycProvider);
        ArgumentNullException.ThrowIfNull(crypto);
        ArgumentNullException.ThrowIfNull(authorization);
        ArgumentNullException.ThrowIfNull(securityOptions);

        _userRepository = userRepository;
        _kycRepository = kycRepository;
        _auditRepository = auditRepository;
        _kycProvider = kycProvider;
        _crypto = crypto;
        _authorization = authorization;
        _securityOptions = securityOptions.Value;
    }

    public void Dispose() => _stateMutationGate.Dispose();

    /// <summary>
    /// Valida de forma determinística a matriz de transições da máquina de estados do KYC.
    /// </summary>
    public static void ValidateStateTransition(
        KycStatus currentStatus,
        KycStatus targetStatus,
        bool isOwnerSubmissionOrAppeal,
        bool isAuthorizedReviewerDecision)
    {
        bool allowed = (currentStatus, targetStatus) switch
        {
            (KycStatus.NOT_STARTED, KycStatus.PENDING) => isOwnerSubmissionOrAppeal,
            (KycStatus.NOT_STARTED, KycStatus.IN_REVIEW) => isOwnerSubmissionOrAppeal,
            (KycStatus.PENDING, KycStatus.IN_REVIEW) => isOwnerSubmissionOrAppeal,
            (KycStatus.IN_REVIEW, KycStatus.VERIFIED) => isAuthorizedReviewerDecision && !isOwnerSubmissionOrAppeal,
            (KycStatus.IN_REVIEW, KycStatus.REJECTED) => isAuthorizedReviewerDecision && !isOwnerSubmissionOrAppeal,
            (KycStatus.REJECTED, KycStatus.IN_REVIEW) => isOwnerSubmissionOrAppeal,
            (KycStatus.VERIFIED, KycStatus.EXPIRED) => isAuthorizedReviewerDecision,
            (KycStatus.EXPIRED, KycStatus.IN_REVIEW) => isOwnerSubmissionOrAppeal,
            _ => false
        };

        if (!allowed)
        {
            throw new DomainRuleViolationException(
                "INVALID_KYC_STATE_TRANSITION",
                $"Transição de estado de KYC inválida ou não autorizada: '{currentStatus}' -> '{targetStatus}'.",
                StatusCodes.Status422UnprocessableEntity);
        }
    }

    /// <summary>
    /// Impede o envio ou armazenamento de biometria facial bruta ou blobs de imagem (LGPD Art. 11 / D05).
    /// Aceita exclusivamente identificadores curtos de referência opaca.
    /// </summary>
    public static string ValidateSafeEvidenceReference(string? rawReference, string fieldName)
    {
        if (string.IsNullOrWhiteSpace(rawReference))
        {
            throw new DomainRuleViolationException(
                "INVALID_KYC_CHECK_REFERENCE",
                $"A referência segura para '{fieldName}' é obrigatória.",
                StatusCodes.Status422UnprocessableEntity);
        }

        string trimmed = rawReference.Trim();

        if (trimmed.StartsWith("data:", StringComparison.OrdinalIgnoreCase)
            || trimmed.Contains("base64,", StringComparison.OrdinalIgnoreCase)
            || trimmed.Contains("biometric_template", StringComparison.OrdinalIgnoreCase)
            || trimmed.Contains("raw_face", StringComparison.OrdinalIgnoreCase)
            || trimmed.Length > MaxSafeReferenceLength)
        {
            throw new DomainRuleViolationException(
                "RAW_BIOMETRY_PAYLOAD_FORBIDDEN",
                $"Violação LGPD (D05): O campo '{fieldName}' contém payload biométrico bruto ou binário não permitido. Envie apenas a referência opaca da sessão.",
                StatusCodes.Status400BadRequest);
        }

        return trimmed;
    }

    /// <summary>
    /// Garante que todos os 4 checks obrigatórios (CPF, Identidade, Endereço e Facial via parceiro) estão aprovados (PASSED).
    /// </summary>
    public static void EnsureAllFourChecksPassed(IReadOnlyCollection<KycCheckEntity> checks)
    {
        ArgumentNullException.ThrowIfNull(checks);

        foreach (KycCheckType requiredType in MandatoryCheckTypes)
        {
            var match = checks.FirstOrDefault(c => c.CheckType == requiredType);
            if (match is null || match.Status != KycCheckStatus.PASSED)
            {
                throw new DomainRuleViolationException(
                    "KYC_CHECKS_NOT_ALL_PASSED",
                    $"Não é possível aprovar o KYC (VERIFIED): o check obrigatório '{requiredType}' não está com status PASSED.",
                    StatusCodes.Status422UnprocessableEntity);
            }
        }
    }

    public async Task<KycDossierResponse> GetUserKycDossierAsync(
        AuthenticatedActor actor,
        Guid targetUserId,
        string correlationId,
        CancellationToken cancellationToken)
    {
        await _authorization.EnsureCanAccessPrivateUserResourceAsync(
            actor,
            targetUserId,
            resourceName: "KycDossier",
            correlationId: correlationId,
            cancellationToken: cancellationToken).ConfigureAwait(false);

        var entry = await _userRepository.FindByIdAsync(targetUserId, cancellationToken).ConfigureAwait(false)
            ?? throw new DomainRuleViolationException(
                "USER_NOT_FOUND",
                "Usuário não encontrado.",
                StatusCodes.Status404NotFound);

        var (user, profile) = entry;
        var latestCase = await _kycRepository.FindLatestByUserIdAsync(targetUserId, cancellationToken).ConfigureAwait(false);

        if (latestCase is not null
            && latestCase.Status == KycStatus.VERIFIED
            && latestCase.ExpiresAtUtc.HasValue
            && latestCase.ExpiresAtUtc.Value <= DateTimeOffset.UtcNow)
        {
            latestCase.Status = KycStatus.EXPIRED;
            profile.KycStatus = KycStatus.EXPIRED;
            profile.UpdatedAtUtc = DateTimeOffset.UtcNow;

            await _kycRepository.SaveCaseAsync(latestCase, cancellationToken).ConfigureAwait(false);
            await _userRepository.UpdateAsync(user, profile, cancellationToken).ConfigureAwait(false);
        }

        return MapDossier(user, profile, latestCase);
    }

    public async Task<KycDossierResponse> SubmitKycCaseAsync(
        AuthenticatedActor actor,
        SubmitKycCaseRequest request,
        string correlationId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(actor);
        ArgumentNullException.ThrowIfNull(request);

        if (!request.ConsentGiven)
        {
            throw new DomainRuleViolationException(
                "KYC_CONSENT_REQUIRED",
                "É obrigatório fornecer consentimento explícito para a verificação de identidade e tratamento de metadados (LGPD / TRD Seção 3).",
                StatusCodes.Status400BadRequest);
        }

        string cpfDigits = SecurityCryptoService.NormalizeDigits(request.Cpf);
        if (cpfDigits.Length != 11)
        {
            throw new DomainRuleViolationException(
                "INVALID_CPF_FORMAT",
                "O CPF deve conter 11 dígitos numéricos para verificação de KYC (D05).",
                StatusCodes.Status400BadRequest);
        }

        string safeIdentityDocRef = ValidateSafeEvidenceReference(request.IdentityDocumentRef, nameof(request.IdentityDocumentRef));
        string safeAddressRef = ValidateSafeEvidenceReference(request.AddressProofRef, nameof(request.AddressProofRef));
        string safeFacialRef = ValidateSafeEvidenceReference(request.PartnerFacialSessionRef, nameof(request.PartnerFacialSessionRef));

        await _stateMutationGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var entry = await _userRepository.FindByIdAsync(actor.UserId, cancellationToken).ConfigureAwait(false)
                ?? throw new DomainRuleViolationException(
                    "USER_NOT_FOUND",
                    "Conta de usuário não localizada.",
                    StatusCodes.Status404NotFound);

            var (user, profile) = entry;

            ValidateStateTransition(
                currentStatus: profile.KycStatus,
                targetStatus: KycStatus.IN_REVIEW,
                isOwnerSubmissionOrAppeal: true,
                isAuthorizedReviewerDecision: false);

            string cpfHash = _crypto.ComputeCpfHash(cpfDigits);
            bool cpfUsedByOther = await _userRepository.ExistsByCpfHashAsync(cpfHash, excludeUserId: user.Id, cancellationToken).ConfigureAwait(false);
            if (cpfUsedByOther)
            {
                throw new DomainRuleViolationException(
                    "CPF_ALREADY_REGISTERED",
                    "O CPF informado já está vinculado a outra conta na plataforma.",
                    StatusCodes.Status409Conflict);
            }

            var receipt = await _kycProvider.RegisterSandboxSubmissionAsync(
                new KycSandboxSubmissionRequest(
                    UserId: user.Id,
                    CpfHash: cpfHash,
                    IdentityDocumentReference: safeIdentityDocRef,
                    AddressProofReference: safeAddressRef,
                    PartnerFacialSessionReference: safeFacialRef),
                cancellationToken).ConfigureAwait(false);

            DateTimeOffset nowUtc = DateTimeOffset.UtcNow;
            KycStatus previousStatus = profile.KycStatus;
            Guid caseId = Guid.NewGuid();

            var kycCase = new KycCaseEntity
            {
                Id = caseId,
                UserId = user.Id,
                Provider = receipt.ProviderName,
                ProviderReferenceId = receipt.ProviderReferenceId,
                Status = KycStatus.IN_REVIEW,
                RejectionReason = null,
                SubmittedAtUtc = nowUtc,
                DecidedAtUtc = null,
                ExpiresAtUtc = null,
                Checks =
                [
                    new KycCheckEntity
                    {
                        Id = Guid.NewGuid(),
                        KycCaseId = caseId,
                        CheckType = KycCheckType.CPF_STATUS,
                        Status = KycCheckStatus.PENDING,
                        EvidenceReference = $"cpf_hmac:{cpfHash[..16]}"
                    },
                    new KycCheckEntity
                    {
                        Id = Guid.NewGuid(),
                        KycCaseId = caseId,
                        CheckType = KycCheckType.IDENTITY_DOCUMENT,
                        Status = KycCheckStatus.PENDING,
                        EvidenceReference = safeIdentityDocRef
                    },
                    new KycCheckEntity
                    {
                        Id = Guid.NewGuid(),
                        KycCaseId = caseId,
                        CheckType = KycCheckType.ADDRESS_PROOF,
                        Status = KycCheckStatus.PENDING,
                        EvidenceReference = safeAddressRef
                    },
                    new KycCheckEntity
                    {
                        Id = Guid.NewGuid(),
                        KycCaseId = caseId,
                        CheckType = KycCheckType.FACIAL_BIOMETRY_PARTNER,
                        Status = KycCheckStatus.PENDING,
                        EvidenceReference = safeFacialRef
                    }
                ]
            };

            profile.CpfHash = cpfHash;
            profile.CpfMasked = SecurityCryptoService.MaskCpf(cpfDigits);
            profile.KycStatus = KycStatus.IN_REVIEW;
            profile.UpdatedAtUtc = nowUtc;
            user.UpdatedAtUtc = nowUtc;

            await _kycRepository.SaveCaseAsync(kycCase, cancellationToken).ConfigureAwait(false);
            await _userRepository.UpdateAsync(user, profile, cancellationToken).ConfigureAwait(false);

            await _auditRepository.AppendAsync(
                new AuditEventEntity(
                    Id: Guid.NewGuid(),
                    ActorUserId: actor.UserId,
                    EntityType: "KYC_CASE",
                    EntityId: kycCase.Id.ToString("D"),
                    Action: "KYC_CASE_SUBMITTED",
                    CorrelationId: correlationId,
                    MetadataJson: JsonSerializer.Serialize(new
                    {
                        targetUserId = user.Id,
                        previousStatus = previousStatus.ToString(),
                        newStatus = kycCase.Status.ToString(),
                        provider = receipt.ProviderName,
                        providerReferenceId = receipt.ProviderReferenceId,
                        reason = "Submissão dos 4 checks de KYC pelo titular com consentimento LGPD"
                    }),
                    CreatedAtUtc: nowUtc),
                cancellationToken).ConfigureAwait(false);

            return MapDossier(user, profile, kycCase);
        }
        finally
        {
            _stateMutationGate.Release();
        }
    }

    public async Task<KycDossierResponse> ReviewKycDecisionAsync(
        AuthenticatedActor actor,
        Guid caseId,
        ReviewKycDecisionRequest request,
        string correlationId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(actor);
        ArgumentNullException.ThrowIfNull(request);

        // 1. RBAC Estrito: apenas SUPPORT ou GENERAL_ADMIN podem decidir casos de KYC
        await _authorization.EnsureHasAnyRoleAsync(
            actor,
            ReviewerAllowedRoles,
            operationName: "ReviewKycDecision",
            correlationId: correlationId,
            cancellationToken: cancellationToken).ConfigureAwait(false);

        await _stateMutationGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var kycCase = await _kycRepository.FindByIdAsync(caseId, cancellationToken).ConfigureAwait(false)
                ?? throw new DomainRuleViolationException(
                    "KYC_CASE_NOT_FOUND",
                    "Caso de verificação de KYC não encontrado.",
                    StatusCodes.Status404NotFound);

            DateTimeOffset nowUtc = DateTimeOffset.UtcNow;

            // 2. Segregação de Funções (Four-Eyes / SoD): nem mesmo um operador SUPPORT/ADMIN pode aprovar o próprio caso
            if (actor.UserId == kycCase.UserId)
            {
                await _auditRepository.AppendAsync(
                    new AuditEventEntity(
                        Id: Guid.NewGuid(),
                        ActorUserId: actor.UserId,
                        EntityType: "KYC_CASE",
                        EntityId: kycCase.Id.ToString("D"),
                        Action: "KYC_SELF_APPROVAL_BLOCKED",
                        CorrelationId: correlationId,
                        MetadataJson: JsonSerializer.Serialize(new
                        {
                            targetUserId = kycCase.UserId,
                            reason = "Tentativa bloqueada de autoaprovação/decisão do próprio caso de KYC"
                        }),
                        CreatedAtUtc: nowUtc),
                    cancellationToken).ConfigureAwait(false);

                throw new DomainRuleViolationException(
                    "KYC_SELF_APPROVAL_FORBIDDEN",
                    "Segregação de funções: um usuário ou operador jamais pode aprovar, rejeitar ou modificar diretamente seu próprio caso de KYC.",
                    StatusCodes.Status403Forbidden);
            }

            if (!Enum.TryParse<KycStatus>(request.TargetStatus?.Trim(), ignoreCase: true, out var targetStatus)
                || targetStatus is not (KycStatus.VERIFIED or KycStatus.REJECTED or KycStatus.EXPIRED))
            {
                throw new DomainRuleViolationException(
                    "INVALID_KYC_DECISION_TARGET",
                    "A decisão de revisão deve ser VERIFIED, REJECTED ou EXPIRED.",
                    StatusCodes.Status422UnprocessableEntity);
            }

            if (string.IsNullOrWhiteSpace(request.JustificationOrRejectionReason)
                || request.JustificationOrRejectionReason.Trim().Length < 5)
            {
                throw new DomainRuleViolationException(
                    "KYC_DECISION_REASON_REQUIRED",
                    "É obrigatório registrar o motivo/justificativa da decisão de KYC para auditoria.",
                    StatusCodes.Status422UnprocessableEntity);
            }

            ValidateStateTransition(
                currentStatus: kycCase.Status,
                targetStatus: targetStatus,
                isOwnerSubmissionOrAppeal: false,
                isAuthorizedReviewerDecision: true);

            // Atualiza status individual dos checks informados na revisão
            if (request.CheckResults is not null)
            {
                foreach (var checkInput in request.CheckResults)
                {
                    if (!Enum.TryParse<KycCheckType>(checkInput.CheckType?.Trim(), ignoreCase: true, out var parsedType)
                        || !Enum.TryParse<KycCheckStatus>(checkInput.Status?.Trim(), ignoreCase: true, out var parsedCheckStatus))
                    {
                        throw new DomainRuleViolationException(
                            "INVALID_KYC_CHECK_RESULT",
                            $"Resultado de check inválido: '{checkInput.CheckType}' = '{checkInput.Status}'.",
                            StatusCodes.Status422UnprocessableEntity);
                    }

                    var existingCheck = kycCase.Checks.FirstOrDefault(c => c.CheckType == parsedType);
                    if (existingCheck is not null)
                    {
                        existingCheck.Status = parsedCheckStatus;
                        existingCheck.VerifiedAtUtc = nowUtc;
                    }
                }
            }

            if (targetStatus == KycStatus.VERIFIED)
            {
                EnsureAllFourChecksPassed(kycCase.Checks);
                int validityDays = request.ValidityDays.HasValue && request.ValidityDays.Value > 0
                    ? request.ValidityDays.Value
                    : DefaultKycValidityDays;

                kycCase.RejectionReason = null;
                kycCase.DecidedAtUtc = nowUtc;
                kycCase.ExpiresAtUtc = nowUtc.AddDays(validityDays);
            }
            else if (targetStatus == KycStatus.REJECTED)
            {
                if (!kycCase.Checks.Any(c => c.Status == KycCheckStatus.FAILED))
                {
                    throw new DomainRuleViolationException(
                        "KYC_REJECTION_REQUIRES_FAILED_CHECK",
                        "Para rejeitar um caso de KYC (REJECTED), ao menos um check deve estar marcado como FAILED.",
                        StatusCodes.Status422UnprocessableEntity);
                }

                kycCase.RejectionReason = request.JustificationOrRejectionReason.Trim();
                kycCase.DecidedAtUtc = nowUtc;
                kycCase.ExpiresAtUtc = null;
            }
            else if (targetStatus == KycStatus.EXPIRED)
            {
                kycCase.RejectionReason = request.JustificationOrRejectionReason.Trim();
                kycCase.ExpiresAtUtc = nowUtc;
            }

            KycStatus previousStatus = kycCase.Status;
            kycCase.Status = targetStatus;

            var entry = await _userRepository.FindByIdAsync(kycCase.UserId, cancellationToken).ConfigureAwait(false)
                ?? throw new DomainRuleViolationException(
                    "USER_NOT_FOUND",
                    "Titular do caso de KYC não encontrado.",
                    StatusCodes.Status404NotFound);

            var (user, profile) = entry;
            profile.KycStatus = targetStatus;
            profile.UpdatedAtUtc = nowUtc;

            await _kycRepository.SaveCaseAsync(kycCase, cancellationToken).ConfigureAwait(false);
            await _userRepository.UpdateAsync(user, profile, cancellationToken).ConfigureAwait(false);

            string auditAction = targetStatus switch
            {
                KycStatus.VERIFIED => "KYC_DECISION_VERIFIED",
                KycStatus.REJECTED => "KYC_DECISION_REJECTED",
                _ => "KYC_CASE_EXPIRED"
            };

            await _auditRepository.AppendAsync(
                new AuditEventEntity(
                    Id: Guid.NewGuid(),
                    ActorUserId: actor.UserId,
                    EntityType: "KYC_CASE",
                    EntityId: kycCase.Id.ToString("D"),
                    Action: auditAction,
                    CorrelationId: correlationId,
                    MetadataJson: JsonSerializer.Serialize(new
                    {
                        targetUserId = kycCase.UserId,
                        previousStatus = previousStatus.ToString(),
                        newStatus = targetStatus.ToString(),
                        reason = request.JustificationOrRejectionReason.Trim(),
                        expiresAtUtc = kycCase.ExpiresAtUtc
                    }),
                    CreatedAtUtc: nowUtc),
                cancellationToken).ConfigureAwait(false);

            return MapDossier(user, profile, kycCase);
        }
        finally
        {
            _stateMutationGate.Release();
        }
    }

    public async Task<KycDossierResponse> RequestReanalysisAsync(
        AuthenticatedActor actor,
        Guid caseId,
        ReanalyzeKycCaseRequest request,
        string correlationId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(actor);
        ArgumentNullException.ThrowIfNull(request);

        await _stateMutationGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var kycCase = await _kycRepository.FindByIdAsync(caseId, cancellationToken).ConfigureAwait(false)
                ?? throw new DomainRuleViolationException(
                    "KYC_CASE_NOT_FOUND",
                    "Caso de verificação de KYC não encontrado.",
                    StatusCodes.Status404NotFound);

            // ABAC estrito: somente o próprio titular pode solicitar reanálise do seu caso
            if (actor.UserId != kycCase.UserId)
            {
                await _authorization.EnsureCanAccessPrivateUserResourceAsync(
                    actor,
                    kycCase.UserId,
                    resourceName: "KycCaseReanalysis",
                    correlationId: correlationId,
                    cancellationToken: cancellationToken).ConfigureAwait(false);

                throw new DomainRuleViolationException(
                    "KYC_REANALYSIS_ONLY_BY_OWNER",
                    "Apenas o próprio titular da conta pode submeter pedido de reanálise de documentos.",
                    StatusCodes.Status403Forbidden);
            }

            if (string.IsNullOrWhiteSpace(request.AppealJustification)
                || request.AppealJustification.Trim().Length < 5)
            {
                throw new DomainRuleViolationException(
                    "KYC_REANALYSIS_JUSTIFICATION_REQUIRED",
                    "Informe o motivo da solicitação de reanálise.",
                    StatusCodes.Status422UnprocessableEntity);
            }

            ValidateStateTransition(
                currentStatus: kycCase.Status,
                targetStatus: KycStatus.IN_REVIEW,
                isOwnerSubmissionOrAppeal: true,
                isAuthorizedReviewerDecision: false);

            string safeIdentityDocRef = ValidateSafeEvidenceReference(request.IdentityDocumentRef, nameof(request.IdentityDocumentRef));
            string safeAddressRef = ValidateSafeEvidenceReference(request.AddressProofRef, nameof(request.AddressProofRef));
            string safeFacialRef = ValidateSafeEvidenceReference(request.PartnerFacialSessionRef, nameof(request.PartnerFacialSessionRef));

            DateTimeOffset nowUtc = DateTimeOffset.UtcNow;
            KycStatus previousStatus = kycCase.Status;

            foreach (var check in kycCase.Checks)
            {
                check.Status = KycCheckStatus.PENDING;
                check.VerifiedAtUtc = null;

                if (check.CheckType == KycCheckType.IDENTITY_DOCUMENT)
                {
                    check.EvidenceReference = safeIdentityDocRef;
                }
                else if (check.CheckType == KycCheckType.ADDRESS_PROOF)
                {
                    check.EvidenceReference = safeAddressRef;
                }
                else if (check.CheckType == KycCheckType.FACIAL_BIOMETRY_PARTNER)
                {
                    check.EvidenceReference = safeFacialRef;
                }
            }

            kycCase.Status = KycStatus.IN_REVIEW;
            kycCase.RejectionReason = null;
            kycCase.SubmittedAtUtc = nowUtc;
            kycCase.DecidedAtUtc = null;
            kycCase.ExpiresAtUtc = null;

            var entry = await _userRepository.FindByIdAsync(kycCase.UserId, cancellationToken).ConfigureAwait(false)
                ?? throw new DomainRuleViolationException(
                    "USER_NOT_FOUND",
                    "Titular não encontrado.",
                    StatusCodes.Status404NotFound);

            var (user, profile) = entry;
            profile.KycStatus = KycStatus.IN_REVIEW;
            profile.UpdatedAtUtc = nowUtc;

            await _kycRepository.SaveCaseAsync(kycCase, cancellationToken).ConfigureAwait(false);
            await _userRepository.UpdateAsync(user, profile, cancellationToken).ConfigureAwait(false);

            await _auditRepository.AppendAsync(
                new AuditEventEntity(
                    Id: Guid.NewGuid(),
                    ActorUserId: actor.UserId,
                    EntityType: "KYC_CASE",
                    EntityId: kycCase.Id.ToString("D"),
                    Action: "KYC_REANALYSIS_REQUESTED",
                    CorrelationId: correlationId,
                    MetadataJson: JsonSerializer.Serialize(new
                    {
                        targetUserId = kycCase.UserId,
                        previousStatus = previousStatus.ToString(),
                        newStatus = kycCase.Status.ToString(),
                        reason = request.AppealJustification.Trim()
                    }),
                    CreatedAtUtc: nowUtc),
                cancellationToken).ConfigureAwait(false);

            return MapDossier(user, profile, kycCase);
        }
        finally
        {
            _stateMutationGate.Release();
        }
    }

    public async Task<BilateralKycEvaluationResponse> EvaluateBilateralEligibilityAsync(
        AuthenticatedActor actor,
        EvaluateBilateralKycRequest request,
        string correlationId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(actor);
        ArgumentNullException.ThrowIfNull(request);

        bool isParticipant = actor.UserId == request.SenderUserId || actor.UserId == request.CarrierUserId;
        bool isPrivileged = actor.Roles.Contains(UserRole.SUPPORT) || actor.Roles.Contains(UserRole.GENERAL_ADMIN);

        if (!isParticipant && !isPrivileged)
        {
            await _authorization.EnsureCanAccessPrivateUserResourceAsync(
                actor,
                request.SenderUserId,
                resourceName: "BilateralKycEvaluation",
                correlationId: correlationId,
                cancellationToken: cancellationToken).ConfigureAwait(false);
        }

        DateTimeOffset nowUtc = DateTimeOffset.UtcNow;
        var senderSummary = await EvaluatePartyAsync(
            request.SenderUserId,
            requiredRole: UserRole.SENDER,
            prefix: "SENDER",
            nowUtc: nowUtc,
            cancellationToken: cancellationToken).ConfigureAwait(false);

        var carrierSummary = await EvaluatePartyAsync(
            request.CarrierUserId,
            requiredRole: UserRole.CARRIER,
            prefix: "CARRIER",
            nowUtc: nowUtc,
            cancellationToken: cancellationToken).ConfigureAwait(false);

        var allBlockingCodes = new List<string>();
        if (request.SenderUserId == request.CarrierUserId)
        {
            allBlockingCodes.Add("SELF_CONTRACTING_FORBIDDEN");
        }

        allBlockingCodes.AddRange(senderSummary.BlockingCodes);
        allBlockingCodes.AddRange(carrierSummary.BlockingCodes);

        bool isBilateralEligible = allBlockingCodes.Count == 0
            && senderSummary.IsEligible
            && carrierSummary.IsEligible
            && TopicLogRules.CanContractWithBilateralKyc(
                Enum.Parse<KycStatus>(senderSummary.CurrentKycStatus),
                Enum.Parse<KycStatus>(carrierSummary.CurrentKycStatus));

        string summaryMessage = isBilateralEligible
            ? "Elegibilidade bilateral aprovada (D05): Remetente e Transportador estão com KYC VERIFIED, 4 checks aprovados e termos vigentes aceitos."
            : $"Contratação bloqueada (D05): pendências identificadas [{string.Join(", ", allBlockingCodes)}].";

        await _auditRepository.AppendAsync(
            new AuditEventEntity(
                Id: Guid.NewGuid(),
                ActorUserId: actor.UserId,
                EntityType: "BILATERAL_KYC_CHECK",
                EntityId: $"{request.SenderUserId:N}_{request.CarrierUserId:N}",
                Action: isBilateralEligible ? "BILATERAL_KYC_VERIFIED" : "BILATERAL_KYC_BLOCKED",
                CorrelationId: correlationId,
                MetadataJson: JsonSerializer.Serialize(new
                {
                    senderUserId = request.SenderUserId,
                    carrierUserId = request.CarrierUserId,
                    isEligible = isBilateralEligible,
                    blockingCodes = allBlockingCodes,
                    reason = summaryMessage
                }),
                CreatedAtUtc: nowUtc),
            cancellationToken).ConfigureAwait(false);

        return new BilateralKycEvaluationResponse(
            IsEligible: isBilateralEligible,
            Sender: senderSummary,
            Carrier: carrierSummary,
            BlockingCodes: allBlockingCodes,
            SummaryMessage: summaryMessage,
            EvaluatedAtUtc: nowUtc);
    }

    public TermsResponsibilityManifestResponse GetCurrentTermsManifest() =>
        new(
            TermsVersion: _securityOptions.RequiredTermsVersion,
            DecisionCode: "D08",
            HasAbsolutePlatformExemptionClause: false,
            LegalPrinciple: "Os termos e contratos distribuem responsabilidades entre remetente, transportador e Topic Log dentro da lei; nenhuma cláusula assegura isenção absoluta da plataforma (D08).",
            Responsibilities:
            [
                new ActorResponsibilityClause(
                    Actor: "SENDER",
                    LegalSummary: "Responsabilidade pela licitude, embalagem adequada e veracidade da declaração do objeto.",
                    Obligations:
                    [
                        "Não enviar itens ilícitos, perigosos ou proibidos.",
                        "Declarar peso real em gramas compatível com o modal (5 kg bicicleta, 20 kg moto/carro — D04).",
                        "Fornecer código de segurança válido na entrega (D16)."
                    ]),
                new ActorResponsibilityClause(
                    Actor: "CARRIER",
                    LegalSummary: "Responsabilidade pela guarda zelosa, condução regular do veículo e comprovação idônea de entrega.",
                    Obligations:
                    [
                        "Respeitar limites legais de transporte, habilitação e capacidade real do veículo (D04).",
                        "Coletar o código de segurança e registrar foto privada na entrega normal (D16).",
                        "Não declarar entrega por ato unilateral."
                    ]),
                new ActorResponsibilityClause(
                    Actor: "TOPIC_LOG_PLATFORM",
                    LegalSummary: "Responsabilidade pela segurança da intermediação tecnológica, custódia operacional de regras, suporte e mediação de disputas nos termos do CDC e Marco Civil.",
                    Obligations:
                    [
                        "Verificar identidade bilateral (KYC) antes de permitir contratação (D05).",
                        "Bloquear repasse financeiro em caso de disputa aberta ou ausência de prova válida (D16, D17).",
                        "Manter trilha de auditoria e canais de revisão humana sem cláusula abusiva de isenção total (D08)."
                    ])
            ]);

    private async Task<PartyKycEligibilitySummary> EvaluatePartyAsync(
        Guid userId,
        UserRole requiredRole,
        string prefix,
        DateTimeOffset nowUtc,
        CancellationToken cancellationToken)
    {
        var blocking = new List<string>();
        var entry = await _userRepository.FindByIdAsync(userId, cancellationToken).ConfigureAwait(false);

        if (entry is null)
        {
            blocking.Add($"{prefix}_USER_NOT_FOUND");
            return new PartyKycEligibilitySummary(
                UserId: userId,
                RequiredRole: requiredRole.ToString(),
                CurrentKycStatus: KycStatus.NOT_STARTED.ToString(),
                IsAccountActive: false,
                HasRequiredRole: false,
                HasAcceptedCurrentTerms: false,
                HasAllFourChecksPassed: false,
                IsNotExpired: false,
                IsEligible: false,
                BlockingCodes: blocking);
        }

        var (user, profile) = entry.Value;
        var latestCase = await _kycRepository.FindLatestByUserIdAsync(userId, cancellationToken).ConfigureAwait(false);

        bool isAccountActive = user.Status == UserAccountStatus.ACTIVE
            && (!user.LockoutUntilUtc.HasValue || user.LockoutUntilUtc.Value <= nowUtc);
        if (!isAccountActive)
        {
            blocking.Add($"{prefix}_ACCOUNT_NOT_ACTIVE");
        }

        bool hasRole = profile.Roles.Contains(requiredRole);
        if (!hasRole)
        {
            blocking.Add($"{prefix}_ROLE_MISSING");
        }

        bool hasTerms = string.Equals(
            profile.TermsAcceptedVersion,
            _securityOptions.RequiredTermsVersion,
            StringComparison.Ordinal);
        if (!hasTerms)
        {
            blocking.Add($"{prefix}_TERMS_VERSION_OUTDATED");
        }

        bool isNotExpired = latestCase is not null
            && (!latestCase.ExpiresAtUtc.HasValue || latestCase.ExpiresAtUtc.Value > nowUtc);

        KycStatus effectiveKycStatus = profile.KycStatus;
        if (effectiveKycStatus == KycStatus.VERIFIED && !isNotExpired)
        {
            effectiveKycStatus = KycStatus.EXPIRED;
        }

        if (effectiveKycStatus != KycStatus.VERIFIED)
        {
            blocking.Add($"{prefix}_KYC_NOT_VERIFIED");
        }

        bool allFourPassed = latestCase is not null
            && MandatoryCheckTypes.All(reqType =>
                latestCase.Checks.Any(c => c.CheckType == reqType && c.Status == KycCheckStatus.PASSED));

        if (!allFourPassed)
        {
            blocking.Add($"{prefix}_KYC_CHECKS_INCOMPLETE");
        }

        return new PartyKycEligibilitySummary(
            UserId: userId,
            RequiredRole: requiredRole.ToString(),
            CurrentKycStatus: effectiveKycStatus.ToString(),
            IsAccountActive: isAccountActive,
            HasRequiredRole: hasRole,
            HasAcceptedCurrentTerms: hasTerms,
            HasAllFourChecksPassed: allFourPassed,
            IsNotExpired: isNotExpired,
            IsEligible: blocking.Count == 0,
            BlockingCodes: blocking);
    }

    private static KycDossierResponse MapDossier(
        UserEntity user,
        UserProfileEntity profile,
        KycCaseEntity? kycCase)
    {
        IReadOnlyList<KycCheckItemResponse> checks = kycCase is null
            ? []
            : kycCase.Checks
                .Select(c => new KycCheckItemResponse(
                    CheckId: c.Id,
                    CheckType: c.CheckType.ToString(),
                    Status: c.Status.ToString(),
                    EvidenceReference: c.EvidenceReference,
                    VerifiedAtUtc: c.VerifiedAtUtc))
                .ToList();

        bool canContract = user.Status == UserAccountStatus.ACTIVE
            && profile.KycStatus == KycStatus.VERIFIED
            && kycCase is not null
            && (!kycCase.ExpiresAtUtc.HasValue || kycCase.ExpiresAtUtc.Value > DateTimeOffset.UtcNow)
            && MandatoryCheckTypes.All(t => kycCase.Checks.Any(c => c.CheckType == t && c.Status == KycCheckStatus.PASSED));

        return new KycDossierResponse(
            UserId: user.Id,
            CurrentKycStatus: profile.KycStatus.ToString(),
            CanNavigatePlatform: user.Status == UserAccountStatus.ACTIVE,
            CanContractDelivery: canContract,
            ActiveCaseId: kycCase?.Id,
            Provider: kycCase?.Provider,
            ProviderReferenceId: kycCase?.ProviderReferenceId,
            RejectionReason: kycCase?.RejectionReason,
            SubmittedAtUtc: kycCase?.SubmittedAtUtc,
            DecidedAtUtc: kycCase?.DecidedAtUtc,
            ExpiresAtUtc: kycCase?.ExpiresAtUtc,
            Checks: checks);
    }
}
