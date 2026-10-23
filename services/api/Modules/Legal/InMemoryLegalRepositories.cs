// ============================================================================
// TOPIC LOG — REPOSITÓRIOS EM MEMÓRIA DE GESTÃO JURÍDICA (PR-LEG-01)
// Thread-safe com isolamento e dados de demonstração (Seed)
// ============================================================================

using System.Collections.Concurrent;

namespace TopicLog.Api.Modules.Legal;

public class InMemoryLegalDocumentRepository : ILegalDocumentRepository
{
    private readonly ConcurrentDictionary<Guid, LegalDocumentTemplate> _templates = new();
    private readonly Lock _syncLock = new();

    public InMemoryLegalDocumentRepository()
    {
        SeedDefaultTemplates();
    }

    private void SeedDefaultTemplates()
    {
        var adminUserId = Guid.Parse("00000000-0000-0000-0000-000000000099");
        var legalUserId = Guid.Parse("00000000-0000-0000-0000-000000000097");

        // 1. TERMOS GERAIS DE USO (NACIONAL, PUBLICADO)
        var termsOfService = new LegalDocumentTemplate
        {
            Id = Guid.Parse("e0000001-0000-0000-0000-000000000001"),
            Category = LegalDocumentCategory.TERMS_OF_SERVICE,
            Title = "Termos Gerais de Uso da Plataforma Topic Log",
            Description = "Condições gerais de acesso, cadastro, segurança e intermediação tecnológica aplicáveis a todos os usuários da Topic Log.",
            ScopeType = LegalScopeType.NATIONAL,
            Version = "1.0.0",
            ContentMarkdown = """
# TERMOS GERAIS DE USO DA PLATAFORMA TOPIC LOG
**Versão:** {{VERSION}} | **Data de Vigência:** {{EFFECTIVE_DATE}}

Bem-vindo à **{{PLATFORM_NAME}}**. Este documento estabelece os termos e condições vinculantes para a utilização de nossa plataforma digital de intermediação e conexão logística colaborativa.

### 1. NATUREZA DA PLATAFORMA
A **{{PLATFORM_NAME}}** atua estritamente como provedora de aplicação de internet, intermediando tecnologicamente a aproximação entre Solicitantes de Frete e Transportadores Autônomos. A plataforma não presta serviços de transporte de cargas diretamente e não possui frota própria de veículos.

### 2. CADASTRO E VERIFICAÇÃO DE IDENTIDADE (KYC)
O acesso aos recursos transacionais exige cadastro individual com fornecimento de dados verdadeiros e aprovação prévia em processo de verificação cadastral (KYC), incluindo validação biométrica e documental.

### 3. FORAL E ARBITRAGEM
Quaisquer controvérsias decorrentes destes Termos serão submetidas prioritariamente à mediação amigável e, residualmente, à comarca da sede da plataforma.

Para dúvidas e suporte: **{{SUPPORT_EMAIL}}**.
""",
            Status = LegalDocumentStatus.PUBLISHED,
            AllowedPlaceholders = ["{{PLATFORM_NAME}}", "{{VERSION}}", "{{EFFECTIVE_DATE}}", "{{SUPPORT_EMAIL}}"],
            CreatedByUserId = adminUserId,
            ApprovedByUserId = legalUserId,
            ApprovedAtUtc = DateTimeOffset.UtcNow.AddMonths(-2),
            PublishedByUserId = adminUserId,
            ValidFromUtc = DateTimeOffset.UtcNow.AddMonths(-2),
            ChangeSummary = "Versão inicial consolidada dos Termos Gerais de Uso da plataforma",
            CreatedAtUtc = DateTimeOffset.UtcNow.AddMonths(-2),
            UpdatedAtUtc = DateTimeOffset.UtcNow.AddMonths(-2)
        };

        // 2. TERMO DE ADESÃO DO TRANSPORTADOR AUTÔNOMO (ESTADUAL MG, PUBLICADO)
        var carrierAdhesion = new LegalDocumentTemplate
        {
            Id = Guid.Parse("e0000002-0000-0000-0000-000000000002"),
            Category = LegalDocumentCategory.CARRIER_ADHESION,
            Title = "Termo de Adesão do Transportador Autônomo — Minas Gerais",
            Description = "Diretrizes e obrigações operacionais para transportadores autônomos no Estado de Minas Gerais, ausência de vínculo empregatício e regras D01–D17.",
            ScopeType = LegalScopeType.STATE,
            ScopeStateUf = "MG",
            Version = "1.0.0",
            ContentMarkdown = """
# TERMO DE ADESÃO DO TRANSPORTADOR AUTÔNOMO (MG)
**Versão:** {{VERSION}} | **Transportador:** {{USER_NAME}} (CPF: {{USER_CPF}}) | **Plano Ativo:** {{CARRIER_PLAN}}

O presente instrumento regula o credenciamento de **{{USER_NAME}}** perante a **{{PLATFORM_NAME}}** no Estado de **{{STATE_UF}}**.

### 1. AUTONOMIA PROFISSIONAL E AUSÊNCIA DE SUBORDINAÇÃO
O Transportador declara-se profissional autônomo independente, detentor de liberdade irrestrita para definir seus horários, rotas, frequência de atuação e aceitação de propostas. Não há qualquer vínculo empregatício, subordinação jurídica ou exclusividade entre as partes.

### 2. POLÍTICA DE COMISSIONAMENTO E ABSORÇÃO DE TAXAS
O Transportador concorda com a retenção de comissão operacional pela plataforma sobre o valor bruto do frete:
- **Plano Vigente:** {{CARRIER_PLAN}} (Taxa comissionária aplicável: {{COMMISSION_RATE}}).
- **Tarifas de Gateway:** A Topic Log absorve integralmente (100%) as tarifas de transação dos meios de pagamento oficiais.

### 3. CONFIRMAÇÃO DE ENTREGA E CÓDIGO SEGURO (D16)
O Transportador compromete-se a concluir cada entrega exclusivamente mediante digitação do código de 4 dígitos (D16) fornecido pelo destinatário no ato da entrega e upload da foto comprobatória legível. Tentativas fraudulentas implicarão descredenciamento imediato.
""",
            Status = LegalDocumentStatus.PUBLISHED,
            AllowedPlaceholders = ["{{PLATFORM_NAME}}", "{{VERSION}}", "{{USER_NAME}}", "{{USER_CPF}}", "{{CARRIER_PLAN}}", "{{STATE_UF}}", "{{COMMISSION_RATE}}"],
            CreatedByUserId = adminUserId,
            ApprovedByUserId = legalUserId,
            ApprovedAtUtc = DateTimeOffset.UtcNow.AddMonths(-1),
            PublishedByUserId = adminUserId,
            ValidFromUtc = DateTimeOffset.UtcNow.AddMonths(-1),
            ChangeSummary = "Termo de adesão para transportadores em conformidade com o marco legal do transportador autônomo",
            CreatedAtUtc = DateTimeOffset.UtcNow.AddMonths(-1),
            UpdatedAtUtc = DateTimeOffset.UtcNow.AddMonths(-1)
        };

        // 3. TERMO DE ADESÃO DO SOLICITANTE / REMETENTE (NACIONAL, PUBLICADO)
        var senderAdhesion = new LegalDocumentTemplate
        {
            Id = Guid.Parse("e0000003-0000-0000-0000-000000000003"),
            Category = LegalDocumentCategory.SENDER_ADHESION,
            Title = "Termo de Adesão e Responsabilidade do Solicitante de Frete",
            Description = "Declaração de legalidade da mercadoria transportada, limites dimensionais, proibição de itens ilícitos e responsabilidade de embalagem.",
            ScopeType = LegalScopeType.NATIONAL,
            Version = "1.0.0",
            ContentMarkdown = """
# TERMO DE ADESÃO DO SOLICITANTE DE FRETE
**Versão:** {{VERSION}} | **Solicitante:** {{USER_NAME}} (CPF: {{USER_CPF}})

Ao publicar uma encomenda na **{{PLATFORM_NAME}}**, o Solicitante atesta sob as penas da lei:

### 1. LICITUDE DO CONTEÚDO
A encomenda não contém armas, munições, entorpecentes, produtos inflamáveis ou explosivos, animais vivos, dinheiro em espécie ou quaisquer substâncias proibidas pela legislação vigente.

### 2. ADEQUAÇÃO DE PESO E EMBALAGEM
O Solicitante é integralmente responsável pela correta embalagem e declaração fidedigna do peso e dimensões do volume. Caso o peso real ultrapasse o limite declarado, o transportador poderá recusar o embarque com direito à taxa mínima de cancelamento.

### 3. RECEBIMENTO DO CÓDIGO D16
O Solicitante recebe o código de 4 dígitos exclusivamente para transmissão ao destinatário final, garantindo que a liberação da encomenda ocorra apenas mediante conferência presencial.
""",
            Status = LegalDocumentStatus.PUBLISHED,
            AllowedPlaceholders = ["{{PLATFORM_NAME}}", "{{VERSION}}", "{{USER_NAME}}", "{{USER_CPF}}"],
            CreatedByUserId = adminUserId,
            ApprovedByUserId = legalUserId,
            ApprovedAtUtc = DateTimeOffset.UtcNow.AddMonths(-1),
            PublishedByUserId = adminUserId,
            ValidFromUtc = DateTimeOffset.UtcNow.AddMonths(-1),
            ChangeSummary = "Termo de responsabilidade sobre conteúdo e embalagem para remetentes",
            CreatedAtUtc = DateTimeOffset.UtcNow.AddMonths(-1),
            UpdatedAtUtc = DateTimeOffset.UtcNow.AddMonths(-1)
        };

        // 4. POLÍTICA DE PRIVACIDADE E PROTEÇÃO DE DADOS (NACIONAL, PUBLICADO)
        var privacyPolicy = new LegalDocumentTemplate
        {
            Id = Guid.Parse("e0000004-0000-0000-0000-000000000004"),
            Category = LegalDocumentCategory.PRIVACY_POLICY,
            Title = "Política de Privacidade e Proteção de Dados (LGPD)",
            Description = "Diretrizes sobre coleta, mascaramento, retenção, compartilhamento restrito e eliminação de dados pessoais na Topic Log.",
            ScopeType = LegalScopeType.NATIONAL,
            Version = "1.0.0",
            ContentMarkdown = """
# POLÍTICA DE PRIVACIDADE E PROTEÇÃO DE DADOS (LGPD)
**Versão:** {{VERSION}} | **Controladora:** {{PLATFORM_NAME}}

A **{{PLATFORM_NAME}}** preza pela proteção dos dados pessoais de seus usuários em estrita conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD).

### 1. PRINCÍPIO DA NECESSIDADE E MINIMIZAÇÃO
Coletamos apenas os dados estritamente necessários para a execução contratual: nome civil, CPF (armazenado de forma segura e exibido mascarado), telefone celular, dados veiculares e localização aproximada de coleta e entrega.

### 2. DADOS DE GEOLOCALIZAÇÃO
A geolocalização do transportador é coletada exclusivamente durante a viagem ativa, com consentimento prévio, para fins de cálculo de rota, segurança e estimativa de chegada, cessando no momento da confirmação da entrega.

### 3. EXCLUSÃO E REVOGAÇÃO
O usuário poderá solicitar a exclusão de sua conta a qualquer momento pelo canal oficial: **{{SUPPORT_EMAIL}}**.
""",
            Status = LegalDocumentStatus.PUBLISHED,
            AllowedPlaceholders = ["{{PLATFORM_NAME}}", "{{VERSION}}", "{{SUPPORT_EMAIL}}"],
            CreatedByUserId = adminUserId,
            ApprovedByUserId = legalUserId,
            ApprovedAtUtc = DateTimeOffset.UtcNow.AddMonths(-2),
            PublishedByUserId = adminUserId,
            ValidFromUtc = DateTimeOffset.UtcNow.AddMonths(-2),
            ChangeSummary = "Política de privacidade adaptada à LGPD com ênfase em minimização e mascaramento",
            CreatedAtUtc = DateTimeOffset.UtcNow.AddMonths(-2),
            UpdatedAtUtc = DateTimeOffset.UtcNow.AddMonths(-2)
        };

        // 5. REGULAMENTAÇÃO MUNICIPAL PILOTO (MUNICIPAL JOÃO MONLEVADE, EM REVISÃO)
        var municipalPilot = new LegalDocumentTemplate
        {
            Id = Guid.Parse("e0000005-0000-0000-0000-000000000005"),
            Category = LegalDocumentCategory.MUNICIPAL_REGULATION,
            Title = "Regulamento Específico de Operação Urbana — João Monlevade (MG)",
            Description = "Diretrizes de circulação e convivência urbana para entregas em João Monlevade (Código IBGE 3136207).",
            ScopeType = LegalScopeType.MUNICIPAL,
            ScopeStateUf = "MG",
            ScopeMunicipalityIbge = "3136207",
            Version = "1.0.0",
            ContentMarkdown = """
# REGULAMENTO MUNICIPAL DE OPERAÇÃO URBANA — JOÃO MONLEVADE
**Versão:** {{VERSION}} | **Município:** {{MUNICIPALITY_NAME}} (IBGE: 3136207)

Este documento complementa os Termos Gerais de Uso para operações que tenham origem, destino ou trânsito no município de **{{MUNICIPALITY_NAME}}**.

### 1. CIRCULAÇÃO E ESTACIONAMENTO
Transportadores utilizando modais automotores devem respeitar rigorosamente as normas de parada rápida e carga/descarga demarcadas pela autoridade municipal de trânsito.

### 2. CUMULATIVIDADE NORMATIVA
Este regulamento municipal vigora de forma cumulativa com as normas estaduais de Minas Gerais e os termos federais da plataforma.
""",
            Status = LegalDocumentStatus.APPROVED,
            AllowedPlaceholders = ["{{VERSION}}", "{{MUNICIPALITY_NAME}}"],
            CreatedByUserId = adminUserId,
            ApprovedByUserId = legalUserId,
            ApprovedAtUtc = DateTimeOffset.UtcNow.AddDays(-5),
            ChangeSummary = "Regulamento piloto para o polo de João Monlevade aprovado juridicamente",
            CreatedAtUtc = DateTimeOffset.UtcNow.AddDays(-10),
            UpdatedAtUtc = DateTimeOffset.UtcNow.AddDays(-5)
        };

        _templates[termsOfService.Id] = termsOfService;
        _templates[carrierAdhesion.Id] = carrierAdhesion;
        _templates[senderAdhesion.Id] = senderAdhesion;
        _templates[privacyPolicy.Id] = privacyPolicy;
        _templates[municipalPilot.Id] = municipalPilot;
    }

    public Task<LegalDocumentTemplate?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        _templates.TryGetValue(id, out var template);
        return Task.FromResult(template);
    }

    public Task<LegalDocumentTemplate?> GetByVersionAsync(LegalDocumentCategory category, string version, CancellationToken cancellationToken = default)
    {
        var found = _templates.Values.FirstOrDefault(t => t.Category == category && string.Equals(t.Version, version, StringComparison.OrdinalIgnoreCase));
        return Task.FromResult(found);
    }

    public Task<LegalDocumentTemplate?> GetActivePublishedAsync(
        LegalDocumentCategory category,
        LegalScopeType scopeType = LegalScopeType.NATIONAL,
        string? scopeStateUf = null,
        string? scopeMunicipalityIbge = null,
        CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var found = _templates.Values
            .Where(t => t.Category == category &&
                        t.Status == LegalDocumentStatus.PUBLISHED &&
                        t.ScopeType == scopeType &&
                        (t.ValidFromUtc == null || t.ValidFromUtc <= now) &&
                        (t.ValidUntilUtc == null || t.ValidUntilUtc > now))
            .Where(t => scopeType != LegalScopeType.STATE || string.Equals(t.ScopeStateUf, scopeStateUf, StringComparison.OrdinalIgnoreCase))
            .Where(t => scopeType != LegalScopeType.MUNICIPAL || string.Equals(t.ScopeMunicipalityIbge, scopeMunicipalityIbge, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(t => t.ValidFromUtc ?? t.CreatedAtUtc)
            .FirstOrDefault();

        return Task.FromResult(found);
    }

    public Task<IReadOnlyList<LegalDocumentTemplate>> ListTemplatesAsync(
        LegalDocumentCategory? category = null,
        LegalDocumentStatus? status = null,
        LegalScopeType? scopeType = null,
        CancellationToken cancellationToken = default)
    {
        var query = _templates.Values.AsEnumerable();

        if (category.HasValue)
        {
            query = query.Where(t => t.Category == category.Value);
        }

        if (status.HasValue)
        {
            query = query.Where(t => t.Status == status.Value);
        }

        if (scopeType.HasValue)
        {
            query = query.Where(t => t.ScopeType == scopeType.Value);
        }

        IReadOnlyList<LegalDocumentTemplate> result = query.OrderByDescending(t => t.UpdatedAtUtc).ToList();
        return Task.FromResult(result);
    }

    public Task<LegalDocumentTemplate> CreateTemplateAsync(LegalDocumentTemplate documentTemplate, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(documentTemplate);
        lock (_syncLock)
        {
            _templates[documentTemplate.Id] = documentTemplate;
            return Task.FromResult(documentTemplate);
        }
    }

    public Task UpdateTemplateAsync(LegalDocumentTemplate documentTemplate, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(documentTemplate);
        lock (_syncLock)
        {
            _templates[documentTemplate.Id] = documentTemplate;
            return Task.CompletedTask;
        }
    }

    public Task ArchivePreviousVersionsAsync(
        LegalDocumentCategory category,
        LegalScopeType scopeType,
        string? scopeStateUf,
        string? scopeMunicipalityIbge,
        Guid currentPublishedId,
        CancellationToken cancellationToken = default)
    {
        lock (_syncLock)
        {
            var previous = _templates.Values.Where(t =>
                t.Id != currentPublishedId &&
                t.Category == category &&
                t.ScopeType == scopeType &&
                string.Equals(t.ScopeStateUf, scopeStateUf, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(t.ScopeMunicipalityIbge, scopeMunicipalityIbge, StringComparison.OrdinalIgnoreCase) &&
                t.Status == LegalDocumentStatus.PUBLISHED).ToList();

            foreach (var item in previous)
            {
                item.Status = LegalDocumentStatus.ARCHIVED;
                item.ValidUntilUtc = DateTimeOffset.UtcNow;
                item.UpdatedAtUtc = DateTimeOffset.UtcNow;
            }

            return Task.CompletedTask;
        }
    }
}

public class InMemoryLegalAcceptanceRepository : ILegalAcceptanceRepository
{
    private readonly ConcurrentDictionary<Guid, LegalAcceptanceRecord> _acceptances = new();
    private readonly Lock _syncLock = new();

    public Task<LegalAcceptanceRecord> RecordAcceptanceAsync(LegalAcceptanceRecord record, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(record);
        lock (_syncLock)
        {
            _acceptances[record.Id] = record;
            return Task.FromResult(record);
        }
    }

    public Task<IReadOnlyList<LegalAcceptanceRecord>> ListUserAcceptancesAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        IReadOnlyList<LegalAcceptanceRecord> list = _acceptances.Values
            .Where(a => a.UserId == userId)
            .OrderByDescending(a => a.AcceptedAtUtc)
            .ToList();

        return Task.FromResult(list);
    }

    public Task<IReadOnlyList<LegalAcceptanceRecord>> ListTemplateAcceptancesAsync(Guid templateId, string? version = null, CancellationToken cancellationToken = default)
    {
        var query = _acceptances.Values.Where(a => a.TemplateId == templateId);
        if (!string.IsNullOrWhiteSpace(version))
        {
            query = query.Where(a => string.Equals(a.Version, version, StringComparison.OrdinalIgnoreCase));
        }

        IReadOnlyList<LegalAcceptanceRecord> list = query.OrderByDescending(a => a.AcceptedAtUtc).ToList();
        return Task.FromResult(list);
    }
}
