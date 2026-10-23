// ============================================================================
// TOPIC LOG — MÓDULO DE GESTÃO JURÍDICA E CONTRATOS DIGITAIS (PR-LEG-01)
// Modelos de Domínio, Enums e DTOs
// ============================================================================

using System.Diagnostics.CodeAnalysis;

namespace TopicLog.Api.Modules.Legal;

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica da Topic Log")]
public enum LegalDocumentCategory
{
    TERMS_OF_SERVICE = 0,
    CARRIER_ADHESION = 1,
    SENDER_ADHESION = 2,
    PRIVACY_POLICY = 3,
    PLATFORM_MEDIATION = 4,
    MUNICIPAL_REGULATION = 5
}

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica da Topic Log")]
public enum LegalDocumentStatus
{
    DRAFT = 0,
    IN_REVIEW = 1,
    APPROVED = 2,
    PUBLISHED = 3,
    ARCHIVED = 4
}

[SuppressMessage("Naming", "CA1707:Identifiers should not contain underscores", Justification = "Nomenclatura canônica da Topic Log")]
public enum LegalScopeType
{
    NATIONAL = 0,
    STATE = 1,
    MUNICIPAL = 2
}

public class LegalDocumentTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public LegalDocumentCategory Category { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public LegalScopeType ScopeType { get; set; } = LegalScopeType.NATIONAL;
    public string? ScopeStateUf { get; set; } // Ex: "MG"
    public string? ScopeMunicipalityIbge { get; set; } // Ex: "3136207" (João Monlevade)
    public string Version { get; set; } = "1.0.0";
    public string ContentMarkdown { get; set; } = string.Empty;
    public LegalDocumentStatus Status { get; set; } = LegalDocumentStatus.DRAFT;
    public List<string> AllowedPlaceholders { get; set; } = [];
    public Guid CreatedByUserId { get; set; }
    public Guid? ApprovedByUserId { get; set; }
    public DateTimeOffset? ApprovedAtUtc { get; set; }
    public Guid? PublishedByUserId { get; set; }
    public DateTimeOffset? ValidFromUtc { get; set; }
    public DateTimeOffset? ValidUntilUtc { get; set; }
    public string? ChangeSummary { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public class LegalAcceptanceRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string UserCpfMasked { get; set; } = string.Empty;
    public Guid TemplateId { get; set; }
    public LegalDocumentCategory Category { get; set; }
    public string Version { get; set; } = string.Empty;
    public string DocumentHashSha256 { get; set; } = string.Empty;
    public DateTimeOffset AcceptedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public string IpAddressHash { get; set; } = string.Empty;
    public string UserAgentMasked { get; set; } = string.Empty;
    public string? ScopeMunicipalityIbge { get; set; }
}

public record LegalPlaceholderDefinition(
    string Key,
    string DisplayLabel,
    string Description,
    string SampleValue,
    bool IsMandatory
);

// ----------------------------------------------------------------------------
// DTOs de Entrada e Saída
// ----------------------------------------------------------------------------

public record CreateLegalTemplateRequest(
    string Category,
    string Title,
    string Description,
    string ScopeType,
    string? ScopeStateUf,
    string? ScopeMunicipalityIbge,
    string Version,
    string ContentMarkdown,
    string? ChangeSummary
);

public record UpdateLegalTemplateRequest(
    string Title,
    string Description,
    string ContentMarkdown,
    string? ChangeSummary
);

public record ApproveLegalTemplateRequest(
    string ApprovalNotes
);

public record PublishLegalTemplateRequest(
    DateTimeOffset? ValidFromUtc,
    string PublicationJustification
);

public record PreviewLegalTemplateRequest(
    string ContentMarkdown,
    string? UserName,
    string? UserCpf,
    string? MunicipalityName,
    string? StateUf,
    string? CarrierPlan
);

public record PreviewLegalTemplateResponse(
    string RenderedText,
    IReadOnlyList<string> DetectedPlaceholders,
    IReadOnlyList<string> MissingOrInvalidPlaceholders,
    bool IsValid
);

public record ImportDocxResponse(
    string ExtractedMarkdown,
    int ParagraphCount,
    int CharacterCount,
    IReadOnlyList<string> ExtractedPlaceholders,
    bool IsSanitized
);

public record LegalVersionDiffItem(
    int LineNumber,
    string Type, // "ADDED", "REMOVED", "UNCHANGED"
    string Content
);

public record CompareLegalVersionsResponse(
    string SourceVersion,
    string TargetVersion,
    IReadOnlyList<LegalVersionDiffItem> Diffs,
    int AdditionsCount,
    int DeletionsCount
);

public record RegisterLegalAcceptanceRequest(
    Guid TemplateId,
    string Version,
    string DocumentHashSha256
);

public record LegalDocumentTemplateResponse(
    Guid Id,
    string Category,
    string Title,
    string Description,
    string ScopeType,
    string? ScopeStateUf,
    string? ScopeMunicipalityIbge,
    string Version,
    string ContentMarkdown,
    string Status,
    IReadOnlyList<string> AllowedPlaceholders,
    Guid CreatedByUserId,
    Guid? ApprovedByUserId,
    DateTimeOffset? ApprovedAtUtc,
    Guid? PublishedByUserId,
    DateTimeOffset? ValidFromUtc,
    DateTimeOffset? ValidUntilUtc,
    string? ChangeSummary,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc
);

public record LegalAcceptanceResponse(
    Guid Id,
    Guid UserId,
    string UserCpfMasked,
    Guid TemplateId,
    string Category,
    string Version,
    string DocumentHashSha256,
    DateTimeOffset AcceptedAtUtc,
    string? ScopeMunicipalityIbge
);
