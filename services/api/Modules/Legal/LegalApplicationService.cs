// ============================================================================
// TOPIC LOG — SERVIÇO DE APLICAÇÃO DE GESTÃO JURÍDICA (PR-LEG-01)
// Validação de placeholders, aprovação segregada, diff e importador DOCX seguro
// ============================================================================

using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Modules.Admin;

namespace TopicLog.Api.Modules.Legal;

public partial class LegalApplicationService
{
    private readonly ILegalDocumentRepository _documentRepository;
    private readonly ILegalAcceptanceRepository _acceptanceRepository;
    private readonly IAdminAuditRepository _auditRepository;

    private static readonly HashSet<string> ValidPlaceholders = new(StringComparer.OrdinalIgnoreCase)
    {
        "{{PLATFORM_NAME}}",
        "{{USER_NAME}}",
        "{{USER_CPF}}",
        "{{EFFECTIVE_DATE}}",
        "{{COMMISSION_RATE}}",
        "{{CARRIER_PLAN}}",
        "{{MUNICIPALITY_NAME}}",
        "{{STATE_UF}}",
        "{{VERSION}}",
        "{{SUPPORT_EMAIL}}",
        "{{TARGET_CORRIDOR}}"
    };

    [GeneratedRegex(@"\{\{([A-Za-z0-9_]+)\}\}", RegexOptions.Compiled)]
    private static partial Regex PlaceholderRegex();

    [GeneratedRegex(@"<script[\s\S]*?>[\s\S]*?<\/script>|javascript:|onload=|onerror=", RegexOptions.IgnoreCase | RegexOptions.Compiled)]
    private static partial Regex MaliciousContentRegex();

    public LegalApplicationService(
        ILegalDocumentRepository documentRepository,
        ILegalAcceptanceRepository acceptanceRepository,
        IAdminAuditRepository auditRepository)
    {
        _documentRepository = documentRepository ?? throw new ArgumentNullException(nameof(documentRepository));
        _acceptanceRepository = acceptanceRepository ?? throw new ArgumentNullException(nameof(acceptanceRepository));
        _auditRepository = auditRepository ?? throw new ArgumentNullException(nameof(auditRepository));
    }

    // ------------------------------------------------------------------------
    // 1. GESTÃO DE MODELOS E TERMOS DE ADESÃO
    // ------------------------------------------------------------------------

    public async Task<IReadOnlyList<LegalDocumentTemplateResponse>> ListTemplatesAsync(
        string? category = null,
        string? status = null,
        string? scopeType = null,
        CancellationToken cancellationToken = default)
    {
        LegalDocumentCategory? catFilter = null;
        if (!string.IsNullOrWhiteSpace(category) && Enum.TryParse<LegalDocumentCategory>(category, true, out var c))
            catFilter = c;

        LegalDocumentStatus? statusFilter = null;
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<LegalDocumentStatus>(status, true, out var s))
            statusFilter = s;

        LegalScopeType? scopeFilter = null;
        if (!string.IsNullOrWhiteSpace(scopeType) && Enum.TryParse<LegalScopeType>(scopeType, true, out var sc))
            scopeFilter = sc;

        var list = await _documentRepository.ListTemplatesAsync(catFilter, statusFilter, scopeFilter, cancellationToken);
        return list.Select(MapTemplateResponse).ToList();
    }

    public async Task<LegalDocumentTemplateResponse> GetTemplateByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var template = await _documentRepository.GetByIdAsync(id, cancellationToken);
        if (template is null)
        {
            throw new DomainRuleViolationException("LEGAL_TEMPLATE_NOT_FOUND", $"Modelo de documento jurídico '{id}' não encontrado.", 404);
        }
        return MapTemplateResponse(template);
    }

    public async Task<LegalDocumentTemplateResponse> CreateTemplateAsync(
        Guid actorUserId,
        string actorRole,
        CreateLegalTemplateRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        // RBAC: Somente LEGAL_OPERATOR ou GENERAL_ADMIN podem criar minutas de termos
        EnsureLegalOrGeneralAdminRole(actorRole, "criar minutas de modelos jurídicos");

        if (string.IsNullOrWhiteSpace(request.Title))
            throw new DomainRuleViolationException("TITLE_REQUIRED", "O título do documento é obrigatório.");

        if (string.IsNullOrWhiteSpace(request.ContentMarkdown))
            throw new DomainRuleViolationException("CONTENT_REQUIRED", "O conteúdo do modelo em Markdown é obrigatório.");

        if (!Enum.TryParse<LegalDocumentCategory>(request.Category, true, out var category))
            throw new DomainRuleViolationException("INVALID_CATEGORY", $"Categoria jurídica inválida: {request.Category}.");

        if (!Enum.TryParse<LegalScopeType>(request.ScopeType, true, out var scopeType))
            throw new DomainRuleViolationException("INVALID_SCOPE_TYPE", $"Abrangência territorial inválida: {request.ScopeType}.");

        ValidateContentSecurity(request.ContentMarkdown);

        var detectedPlaceholders = ExtractPlaceholders(request.ContentMarkdown);
        ValidatePlaceholders(detectedPlaceholders);

        var template = new LegalDocumentTemplate
        {
            Category = category,
            Title = request.Title.Trim(),
            Description = request.Description?.Trim() ?? string.Empty,
            ScopeType = scopeType,
            ScopeStateUf = scopeType != LegalScopeType.NATIONAL ? request.ScopeStateUf?.Trim().ToUpperInvariant() : null,
            ScopeMunicipalityIbge = scopeType == LegalScopeType.MUNICIPAL ? request.ScopeMunicipalityIbge?.Trim() : null,
            Version = request.Version?.Trim() ?? "1.0.0",
            ContentMarkdown = request.ContentMarkdown,
            Status = LegalDocumentStatus.DRAFT,
            AllowedPlaceholders = detectedPlaceholders,
            CreatedByUserId = actorUserId,
            ChangeSummary = request.ChangeSummary?.Trim(),
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };

        var created = await _documentRepository.CreateTemplateAsync(template, cancellationToken);

        await _auditRepository.RecordEventAsync(new AdminAuditEvent
        {
            ActorUserId = actorUserId,
            ActorRole = actorRole,
            Category = "LEGAL_MANAGEMENT",
            Action = "TEMPLATE_CREATED",
            EntityId = created.Id.ToString("D"),
            PayloadBefore = null,
            PayloadAfter = JsonSerializer.Serialize(created),
            RecordedAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

        return MapTemplateResponse(created);
    }

    public async Task<LegalDocumentTemplateResponse> UpdateTemplateAsync(
        Guid id,
        Guid actorUserId,
        string actorRole,
        UpdateLegalTemplateRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        EnsureLegalOrGeneralAdminRole(actorRole, "editar minutas de modelos jurídicos");

        var template = await _documentRepository.GetByIdAsync(id, cancellationToken);
        if (template is null)
            throw new DomainRuleViolationException("LEGAL_TEMPLATE_NOT_FOUND", $"Modelo '{id}' não encontrado.", 404);

        if (template.Status == LegalDocumentStatus.PUBLISHED)
        {
            throw new DomainRuleViolationException(
                "CANNOT_EDIT_PUBLISHED_TEMPLATE",
                "Modelos publicados são imutáveis para garantia de fé pública e segurança jurídica. Crie uma nova versão para alterações.",
                422);
        }

        if (string.IsNullOrWhiteSpace(request.Title))
            throw new DomainRuleViolationException("TITLE_REQUIRED", "O título do documento é obrigatório.");

        if (string.IsNullOrWhiteSpace(request.ContentMarkdown))
            throw new DomainRuleViolationException("CONTENT_REQUIRED", "O conteúdo em Markdown é obrigatório.");

        ValidateContentSecurity(request.ContentMarkdown);

        var detectedPlaceholders = ExtractPlaceholders(request.ContentMarkdown);
        ValidatePlaceholders(detectedPlaceholders);

        string payloadBefore = JsonSerializer.Serialize(template);

        template.Title = request.Title.Trim();
        template.Description = request.Description?.Trim() ?? template.Description;
        template.ContentMarkdown = request.ContentMarkdown;
        template.AllowedPlaceholders = detectedPlaceholders;
        template.ChangeSummary = request.ChangeSummary?.Trim() ?? template.ChangeSummary;
        template.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await _documentRepository.UpdateTemplateAsync(template, cancellationToken);

        await _auditRepository.RecordEventAsync(new AdminAuditEvent
        {
            ActorUserId = actorUserId,
            ActorRole = actorRole,
            Category = "LEGAL_MANAGEMENT",
            Action = "TEMPLATE_UPDATED",
            EntityId = template.Id.ToString("D"),
            PayloadBefore = payloadBefore,
            PayloadAfter = JsonSerializer.Serialize(template),
            RecordedAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

        return MapTemplateResponse(template);
    }

    // ------------------------------------------------------------------------
    // 2. APROVAÇÃO JURÍDICA SEGREGADA E PUBLICAÇÃO
    // ------------------------------------------------------------------------

    public async Task<LegalDocumentTemplateResponse> ApproveTemplateAsync(
        Guid id,
        Guid actorUserId,
        string actorRole,
        ApproveLegalTemplateRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        // RBAC ESTRITO: Apenas LEGAL_OPERATOR ou GENERAL_ADMIN
        EnsureLegalOrGeneralAdminRole(actorRole, "aprovar minutas jurídicas formalmente");

        var template = await _documentRepository.GetByIdAsync(id, cancellationToken);
        if (template is null)
            throw new DomainRuleViolationException("LEGAL_TEMPLATE_NOT_FOUND", $"Modelo '{id}' não encontrado.", 404);

        if (template.Status == LegalDocumentStatus.PUBLISHED)
            throw new DomainRuleViolationException("ALREADY_PUBLISHED", "O documento já se encontra publicado.");

        string payloadBefore = JsonSerializer.Serialize(template);

        template.Status = LegalDocumentStatus.APPROVED;
        template.ApprovedByUserId = actorUserId;
        template.ApprovedAtUtc = DateTimeOffset.UtcNow;
        template.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await _documentRepository.UpdateTemplateAsync(template, cancellationToken);

        await _auditRepository.RecordEventAsync(new AdminAuditEvent
        {
            ActorUserId = actorUserId,
            ActorRole = actorRole,
            Category = "LEGAL_MANAGEMENT",
            Action = "TEMPLATE_APPROVED",
            EntityId = template.Id.ToString("D"),
            PayloadBefore = payloadBefore,
            PayloadAfter = JsonSerializer.Serialize(template),
            RecordedAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

        return MapTemplateResponse(template);
    }

    public async Task<LegalDocumentTemplateResponse> PublishTemplateAsync(
        Guid id,
        Guid actorUserId,
        string actorRole,
        PublishLegalTemplateRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        EnsureLegalOrGeneralAdminRole(actorRole, "publicar modelos jurídicos");

        var template = await _documentRepository.GetByIdAsync(id, cancellationToken);
        if (template is null)
            throw new DomainRuleViolationException("LEGAL_TEMPLATE_NOT_FOUND", $"Modelo '{id}' não encontrado.", 404);

        // Regra Jurídica: Documento precisa ter sido aprovado previamente
        if (template.Status != LegalDocumentStatus.APPROVED)
        {
            throw new DomainRuleViolationException(
                "DOCUMENT_NOT_APPROVED",
                "A publicação exige aprovação jurídica formal prévia (status APPROVED).",
                422);
        }

        string payloadBefore = JsonSerializer.Serialize(template);

        template.Status = LegalDocumentStatus.PUBLISHED;
        template.PublishedByUserId = actorUserId;
        template.ValidFromUtc = request.ValidFromUtc ?? DateTimeOffset.UtcNow;
        template.UpdatedAtUtc = DateTimeOffset.UtcNow;

        // Arquiva automaticamente versões anteriores ativas da mesma categoria e abrangência
        await _documentRepository.ArchivePreviousVersionsAsync(
            template.Category,
            template.ScopeType,
            template.ScopeStateUf,
            template.ScopeMunicipalityIbge,
            template.Id,
            cancellationToken);

        await _documentRepository.UpdateTemplateAsync(template, cancellationToken);

        await _auditRepository.RecordEventAsync(new AdminAuditEvent
        {
            ActorUserId = actorUserId,
            ActorRole = actorRole,
            Category = "LEGAL_MANAGEMENT",
            Action = "TEMPLATE_PUBLISHED",
            EntityId = template.Id.ToString("D"),
            PayloadBefore = payloadBefore,
            PayloadAfter = JsonSerializer.Serialize(template),
            RecordedAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

        return MapTemplateResponse(template);
    }

    public async Task<LegalDocumentTemplateResponse> DeactivateTemplateAsync(
        Guid id,
        Guid actorUserId,
        string actorRole,
        CancellationToken cancellationToken = default)
    {
        EnsureLegalOrGeneralAdminRole(actorRole, "desativar modelos jurídicos");

        var template = await _documentRepository.GetByIdAsync(id, cancellationToken);
        if (template is null)
            throw new DomainRuleViolationException("LEGAL_TEMPLATE_NOT_FOUND", $"Modelo '{id}' não encontrado.", 404);

        string payloadBefore = JsonSerializer.Serialize(template);

        template.Status = LegalDocumentStatus.ARCHIVED;
        template.ValidUntilUtc = DateTimeOffset.UtcNow;
        template.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await _documentRepository.UpdateTemplateAsync(template, cancellationToken);

        await _auditRepository.RecordEventAsync(new AdminAuditEvent
        {
            ActorUserId = actorUserId,
            ActorRole = actorRole,
            Category = "LEGAL_MANAGEMENT",
            Action = "TEMPLATE_DEACTIVATED",
            EntityId = template.Id.ToString("D"),
            PayloadBefore = payloadBefore,
            PayloadAfter = JsonSerializer.Serialize(template),
            RecordedAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

        return MapTemplateResponse(template);
    }

    // ------------------------------------------------------------------------
    // 3. PRÉ-VISUALIZAÇÃO, COMPARAÇÃO E CAMPOS DINÂMICOS
    // ------------------------------------------------------------------------

    public Task<PreviewLegalTemplateResponse> PreviewTemplateAsync(PreviewLegalTemplateRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (string.IsNullOrWhiteSpace(request.ContentMarkdown))
        {
            throw new DomainRuleViolationException("CONTENT_REQUIRED", "O conteúdo do modelo em Markdown é obrigatório para pré-visualização.", 400);
        }

        ValidateContentSecurity(request.ContentMarkdown);

        var detected = ExtractPlaceholders(request.ContentMarkdown);
        var invalid = detected.Where(p => !ValidPlaceholders.Contains(p)).ToList();

        string rendered = request.ContentMarkdown;
        rendered = rendered.Replace("{{PLATFORM_NAME}}", "Topic Log");
        rendered = rendered.Replace("{{USER_NAME}}", request.UserName ?? "João da Silva Santos");
        rendered = rendered.Replace("{{USER_CPF}}", request.UserCpf ?? "123.***.***-00");
        rendered = rendered.Replace("{{EFFECTIVE_DATE}}", DateTime.UtcNow.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture));
        rendered = rendered.Replace("{{COMMISSION_RATE}}", "13.00%");
        rendered = rendered.Replace("{{CARRIER_PLAN}}", request.CarrierPlan ?? "Standard");
        rendered = rendered.Replace("{{MUNICIPALITY_NAME}}", request.MunicipalityName ?? "João Monlevade");
        rendered = rendered.Replace("{{STATE_UF}}", request.StateUf ?? "MG");
        rendered = rendered.Replace("{{VERSION}}", "1.0.0");
        rendered = rendered.Replace("{{SUPPORT_EMAIL}}", "juridico@topiclog.com.br");
        rendered = rendered.Replace("{{TARGET_CORRIDOR}}", "João Monlevade -> Belo Horizonte");

        var response = new PreviewLegalTemplateResponse(
            RenderedText: rendered,
            DetectedPlaceholders: detected,
            MissingOrInvalidPlaceholders: invalid,
            IsValid: invalid.Count == 0);

        return Task.FromResult(response);
    }

    public async Task<CompareLegalVersionsResponse> CompareVersionsAsync(Guid templateId, string targetVersion, CancellationToken cancellationToken = default)
    {
        var current = await _documentRepository.GetByIdAsync(templateId, cancellationToken);
        if (current is null)
            throw new DomainRuleViolationException("LEGAL_TEMPLATE_NOT_FOUND", $"Modelo '{templateId}' não encontrado.", 404);

        var target = await _documentRepository.GetByVersionAsync(current.Category, targetVersion, cancellationToken);
        if (target is null)
            throw new DomainRuleViolationException("VERSION_NOT_FOUND", $"Versão de destino '{targetVersion}' não encontrada para comparação.", 404);

        var sourceLines = current.ContentMarkdown.Split(["\r\n", "\r", "\n"], StringSplitOptions.None);
        var targetLines = target.ContentMarkdown.Split(["\r\n", "\r", "\n"], StringSplitOptions.None);

        var diffs = new List<LegalVersionDiffItem>();
        int additions = 0;
        int deletions = 0;

        int max = Math.Max(sourceLines.Length, targetLines.Length);
        for (int i = 0; i < max; i++)
        {
            string? src = i < sourceLines.Length ? sourceLines[i] : null;
            string? tgt = i < targetLines.Length ? targetLines[i] : null;

            if (src == tgt && src != null)
            {
                diffs.Add(new LegalVersionDiffItem(i + 1, "UNCHANGED", src));
            }
            else
            {
                if (src != null)
                {
                    diffs.Add(new LegalVersionDiffItem(i + 1, "ADDED", src));
                    additions++;
                }
                if (tgt != null)
                {
                    diffs.Add(new LegalVersionDiffItem(i + 1, "REMOVED", tgt));
                    deletions++;
                }
            }
        }

        return new CompareLegalVersionsResponse(
            SourceVersion: current.Version,
            TargetVersion: target.Version,
            Diffs: diffs,
            AdditionsCount: additions,
            DeletionsCount: deletions);
    }

    // ------------------------------------------------------------------------
    // 4. IMPORTAÇÃO DOCX SEGURA (SANITIZADA)
    // ------------------------------------------------------------------------

    public ImportDocxResponse ImportDocxStream(Stream docxStream)
    {
        ArgumentNullException.ThrowIfNull(docxStream);

        if (docxStream.Length == 0)
            throw new DomainRuleViolationException("EMPTY_FILE", "O arquivo DOCX está vazio.");

        if (docxStream.Length > 10 * 1024 * 1024)
            throw new DomainRuleViolationException("FILE_TOO_LARGE", "O arquivo DOCX excede o tamanho máximo permitido de 10 MB.");

        try
        {
            using var archive = new ZipArchive(docxStream, ZipArchiveMode.Read, leaveOpen: true);

            // Verificação de Segurança 1: Rejeitar arquivos com macros ou executáveis embutidos
            bool hasMaliciousEntries = archive.Entries.Any(e =>
                e.FullName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ||
                e.FullName.EndsWith(".vbs", StringComparison.OrdinalIgnoreCase) ||
                e.FullName.EndsWith(".bin", StringComparison.OrdinalIgnoreCase) ||
                e.FullName.Contains("vbaProject", StringComparison.OrdinalIgnoreCase));

            if (hasMaliciousEntries)
            {
                throw new DomainRuleViolationException(
                    "MALICIOUS_DOCX_REJECTED",
                    "Arquivo DOCX rejeitado: contém elementos executáveis, macros VBA ou binários potencialmente maliciosos.",
                    422);
            }

            var documentEntry = archive.GetEntry("word/document.xml")
                ?? throw new DomainRuleViolationException("INVALID_DOCX_FORMAT", "Arquivo DOCX corrompido ou inválido (estrutura word/document.xml ausente).");

            using var docXmlStream = documentEntry.Open();
            var xDoc = XDocument.Load(docXmlStream);

            XNamespace w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
            var paragraphs = xDoc.Descendants(w + "p").ToList();

            var markdownBuilder = new StringBuilder();
            int paragraphCount = 0;

            foreach (var p in paragraphs)
            {
                var texts = p.Descendants(w + "t").Select(t => t.Value).ToList();
                string paragraphText = string.Concat(texts).Trim();

                if (string.IsNullOrWhiteSpace(paragraphText))
                    continue;

                // Sanitização contra injeção de scripts
                if (MaliciousContentRegex().IsMatch(paragraphText))
                {
                    paragraphText = MaliciousContentRegex().Replace(paragraphText, "[CONTEÚDO REMOVIDO POR SEGURANÇA]");
                }

                // Detecta títulos básicos
                if (paragraphText.StartsWith("TERMO", StringComparison.OrdinalIgnoreCase) ||
                    paragraphText.StartsWith("CONTRATO", StringComparison.OrdinalIgnoreCase) ||
                    paragraphText.StartsWith("POLÍTICA", StringComparison.OrdinalIgnoreCase))
                {
                    markdownBuilder.Append("# ").AppendLine(paragraphText);
                }
                else if (Regex.IsMatch(paragraphText, @"^\d+\.\s+"))
                {
                    markdownBuilder.Append("### ").AppendLine(paragraphText);
                }
                else
                {
                    markdownBuilder.AppendLine(paragraphText);
                }
                markdownBuilder.AppendLine();
                paragraphCount++;
            }

            string resultMarkdown = markdownBuilder.ToString().Trim();
            var extractedPlaceholders = ExtractPlaceholders(resultMarkdown);

            return new ImportDocxResponse(
                ExtractedMarkdown: resultMarkdown,
                ParagraphCount: paragraphCount,
                CharacterCount: resultMarkdown.Length,
                ExtractedPlaceholders: extractedPlaceholders,
                IsSanitized: true);
        }
        catch (InvalidDataException)
        {
            throw new DomainRuleViolationException("INVALID_ZIP_ARCHIVE", "O arquivo fornecido não é um arquivo DOCX/ZIP válido.");
        }
    }

    // ------------------------------------------------------------------------
    // 5. REGISTRO E HISTÓRICO DE ACEITES ELETRÔNICOS
    // ------------------------------------------------------------------------

    public async Task<LegalAcceptanceResponse> RegisterAcceptanceAsync(
        Guid userId,
        string userCpf,
        string ipAddress,
        string userAgent,
        RegisterLegalAcceptanceRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var template = await _documentRepository.GetByIdAsync(request.TemplateId, cancellationToken);
        if (template is null)
            throw new DomainRuleViolationException("LEGAL_TEMPLATE_NOT_FOUND", "Modelo de termo jurídico não encontrado.", 404);

        if (template.Status != LegalDocumentStatus.PUBLISHED)
            throw new DomainRuleViolationException("TEMPLATE_NOT_ACTIVE", "O termo especificado não está ativo para aceites.", 422);

        // Gera hash SHA256 do documento atual para conferência de integridade
        string expectedHash = ComputeSha256(template.ContentMarkdown);

        string ipHash = ComputeSha256(ipAddress);
        string userAgentMasked = userAgent.Length > 80 ? userAgent[..80] : userAgent;

        var acceptance = new LegalAcceptanceRecord
        {
            UserId = userId,
            UserCpfMasked = MaskCpf(userCpf),
            TemplateId = template.Id,
            Category = template.Category,
            Version = template.Version,
            DocumentHashSha256 = expectedHash,
            AcceptedAtUtc = DateTimeOffset.UtcNow,
            IpAddressHash = ipHash,
            UserAgentMasked = userAgentMasked,
            ScopeMunicipalityIbge = template.ScopeMunicipalityIbge
        };

        var recorded = await _acceptanceRepository.RecordAcceptanceAsync(acceptance, cancellationToken);
        return MapAcceptanceResponse(recorded);
    }

    public async Task<IReadOnlyList<LegalAcceptanceResponse>> ListUserAcceptancesAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var list = await _acceptanceRepository.ListUserAcceptancesAsync(userId, cancellationToken);
        return list.Select(MapAcceptanceResponse).ToList();
    }

    public async Task<IReadOnlyList<LegalAcceptanceResponse>> ListTemplateAcceptancesAsync(Guid templateId, string? version = null, CancellationToken cancellationToken = default)
    {
        var list = await _acceptanceRepository.ListTemplateAcceptancesAsync(templateId, version, cancellationToken);
        return list.Select(MapAcceptanceResponse).ToList();
    }

    public async Task<IReadOnlyList<LegalDocumentTemplateResponse>> GetApplicableTermsAsync(
        string role,
        string? stateUf = null,
        string? municipalityIbge = null,
        CancellationToken cancellationToken = default)
    {
        var all = await _documentRepository.ListTemplatesAsync(status: LegalDocumentStatus.PUBLISHED, cancellationToken: cancellationToken);

        var applicable = new List<LegalDocumentTemplate>();

        // 1. Termos Gerais de Uso e Política de Privacidade sempre se aplicam a todos
        var generalTerms = all.FirstOrDefault(t => t.Category == LegalDocumentCategory.TERMS_OF_SERVICE && t.ScopeType == LegalScopeType.NATIONAL);
        if (generalTerms != null) applicable.Add(generalTerms);

        var privacy = all.FirstOrDefault(t => t.Category == LegalDocumentCategory.PRIVACY_POLICY && t.ScopeType == LegalScopeType.NATIONAL);
        if (privacy != null) applicable.Add(privacy);

        // 2. Termos específicos por perfil
        if (string.Equals(role, "CARRIER", StringComparison.OrdinalIgnoreCase))
        {
            var carrier = all.FirstOrDefault(t => t.Category == LegalDocumentCategory.CARRIER_ADHESION &&
                (t.ScopeStateUf == null || string.Equals(t.ScopeStateUf, stateUf ?? "MG", StringComparison.OrdinalIgnoreCase)));
            if (carrier != null) applicable.Add(carrier);
        }
        else
        {
            var sender = all.FirstOrDefault(t => t.Category == LegalDocumentCategory.SENDER_ADHESION);
            if (sender != null) applicable.Add(sender);
        }

        // 3. Documentos Municipais Complementares
        if (!string.IsNullOrWhiteSpace(municipalityIbge))
        {
            var municipal = all.FirstOrDefault(t => t.Category == LegalDocumentCategory.MUNICIPAL_REGULATION &&
                string.Equals(t.ScopeMunicipalityIbge, municipalityIbge, StringComparison.OrdinalIgnoreCase));
            if (municipal != null) applicable.Add(municipal);
        }

        return applicable.Select(MapTemplateResponse).ToList();
    }

    // ------------------------------------------------------------------------
    // MÉTODOS AUXILIARES PRIVADOS
    // ------------------------------------------------------------------------

    private static void EnsureLegalOrGeneralAdminRole(string actorRole, string actionDescription)
    {
        if (!actorRole.Equals("GENERAL_ADMIN", StringComparison.OrdinalIgnoreCase) &&
            !actorRole.Equals("LEGAL_OPERATOR", StringComparison.OrdinalIgnoreCase) &&
            !actorRole.Equals("LEGAL", StringComparison.OrdinalIgnoreCase))
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN_INSUFFICIENT_ROLE",
                $"Apenas operadores jurídicos (LEGAL_OPERATOR) e administradores gerais (GENERAL_ADMIN) possuem permissão para {actionDescription}.",
                403);
        }
    }

    private static void ValidateContentSecurity(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return;
        }

        if (MaliciousContentRegex().IsMatch(content))
        {
            throw new DomainRuleViolationException(
                "MALICIOUS_CONTENT_DETECTED",
                "O conteúdo do documento contém elementos proibidos por segurança (scripts ou manipuladores de eventos inline).",
                422);
        }
    }

    private static List<string> ExtractPlaceholders(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return [];
        }

        var matches = PlaceholderRegex().Matches(content);
        return matches.Select(m => m.Value).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static void ValidatePlaceholders(IReadOnlyList<string> placeholders)
    {
        var invalid = placeholders.Where(p => !ValidPlaceholders.Contains(p)).ToList();
        if (invalid.Count > 0)
        {
            throw new DomainRuleViolationException(
                "INVALID_PLACEHOLDERS",
                $"Placeholders dinâmicos desconhecidos detectados: {string.Join(", ", invalid)}. Permitidos: {string.Join(", ", ValidPlaceholders)}.",
                422);
        }
    }

    private static string ComputeSha256(string input)
    {
        byte[] bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static string MaskCpf(string? cpf)
    {
        if (string.IsNullOrWhiteSpace(cpf) || cpf.Length < 11)
            return "***.***.***-**";

        string digits = new(cpf.Where(char.IsDigit).ToArray());
        if (digits.Length == 11)
            return $"{digits[..3]}.***.***-{digits[9..]}";

        return "***.***.***-**";
    }

    private static LegalDocumentTemplateResponse MapTemplateResponse(LegalDocumentTemplate t) => new(
        t.Id,
        t.Category.ToString(),
        t.Title,
        t.Description,
        t.ScopeType.ToString(),
        t.ScopeStateUf,
        t.ScopeMunicipalityIbge,
        t.Version,
        t.ContentMarkdown,
        t.Status.ToString(),
        t.AllowedPlaceholders,
        t.CreatedByUserId,
        t.ApprovedByUserId,
        t.ApprovedAtUtc,
        t.PublishedByUserId,
        t.ValidFromUtc,
        t.ValidUntilUtc,
        t.ChangeSummary,
        t.CreatedAtUtc,
        t.UpdatedAtUtc);

    private static LegalAcceptanceResponse MapAcceptanceResponse(LegalAcceptanceRecord a) => new(
        a.Id,
        a.UserId,
        a.UserCpfMasked,
        a.TemplateId,
        a.Category.ToString(),
        a.Version,
        a.DocumentHashSha256,
        a.AcceptedAtUtc,
        a.ScopeMunicipalityIbge);
}
