// ============================================================================
// TOPIC LOG — INTERFACES DE REPOSITÓRIO JURÍDICO (PR-LEG-01)
// ============================================================================

namespace TopicLog.Api.Modules.Legal;

public interface ILegalDocumentRepository
{
    Task<LegalDocumentTemplate?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    Task<LegalDocumentTemplate?> GetByVersionAsync(LegalDocumentCategory category, string version, CancellationToken cancellationToken = default);

    Task<LegalDocumentTemplate?> GetActivePublishedAsync(
        LegalDocumentCategory category,
        LegalScopeType scopeType = LegalScopeType.NATIONAL,
        string? scopeStateUf = null,
        string? scopeMunicipalityIbge = null,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<LegalDocumentTemplate>> ListTemplatesAsync(
        LegalDocumentCategory? category = null,
        LegalDocumentStatus? status = null,
        LegalScopeType? scopeType = null,
        CancellationToken cancellationToken = default);

    Task<LegalDocumentTemplate> CreateTemplateAsync(LegalDocumentTemplate documentTemplate, CancellationToken cancellationToken = default);

    Task UpdateTemplateAsync(LegalDocumentTemplate documentTemplate, CancellationToken cancellationToken = default);

    Task ArchivePreviousVersionsAsync(LegalDocumentCategory category, LegalScopeType scopeType, string? scopeStateUf, string? scopeMunicipalityIbge, Guid currentPublishedId, CancellationToken cancellationToken = default);
}

public interface ILegalAcceptanceRepository
{
    Task<LegalAcceptanceRecord> RecordAcceptanceAsync(LegalAcceptanceRecord record, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<LegalAcceptanceRecord>> ListUserAcceptancesAsync(Guid userId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<LegalAcceptanceRecord>> ListTemplateAcceptancesAsync(Guid templateId, string? version = null, CancellationToken cancellationToken = default);
}
