-- ============================================================================
-- TOPIC LOG — DDL 008: GESTÃO JURÍDICA, MODELOS CONTRATUAIS,
-- ABRANGÊNCIA TERRITORIAL E TRILHA DE ACEITES IMUTÁVEL (PR-LEG-01)
-- Compatível com PostgreSQL 16+
-- ============================================================================

-- 1. TABELA: MODELOS E MINUTAS DE CONTRATOS E TERMOS (PR-LEG-01)
CREATE TABLE IF NOT EXISTS legal_document_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN (
        'TERMS_OF_SERVICE',
        'CARRIER_ADHESION',
        'SENDER_ADHESION',
        'PRIVACY_POLICY',
        'PLATFORM_MEDIATION',
        'MUNICIPAL_REGULATION'
    )),
    title VARCHAR(200) NOT NULL,
    description VARCHAR(500) NOT NULL,
    scope_type VARCHAR(20) NOT NULL CHECK (scope_type IN ('NATIONAL', 'STATE', 'MUNICIPAL')),
    scope_state_uf VARCHAR(2),
    scope_municipality_ibge VARCHAR(10),
    version VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'PUBLISHED', 'ARCHIVED')),
    content_markdown TEXT NOT NULL,
    content_sha256 CHAR(64) NOT NULL,
    allowed_placeholders JSONB NOT NULL DEFAULT '[]'::jsonb,
    valid_from_utc TIMESTAMPTZ,
    valid_until_utc TIMESTAMPTZ,
    previous_version_id UUID REFERENCES legal_document_templates(id),
    change_summary VARCHAR(500),
    approval_notes TEXT,
    approved_by_user_id UUID,
    approved_at_utc TIMESTAMPTZ,
    created_by_user_id UUID NOT NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_legal_document_code_version UNIQUE (code, version)
);

CREATE INDEX IF NOT EXISTS idx_legal_templates_status ON legal_document_templates (status);
CREATE INDEX IF NOT EXISTS idx_legal_templates_category ON legal_document_templates (category);
CREATE INDEX IF NOT EXISTS idx_legal_templates_scope ON legal_document_templates (scope_type, scope_state_uf, scope_municipality_ibge);

-- 2. TABELA: REGISTRO IMUTÁVEL DE ACEITES ELETRÔNICOS (AUDITORIA E FÉ PÚBLICA)
CREATE TABLE IF NOT EXISTS legal_document_acceptances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES legal_document_templates(id) ON DELETE RESTRICT,
    category VARCHAR(50) NOT NULL,
    version VARCHAR(20) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    user_role VARCHAR(30) NOT NULL,
    user_cpf_masked VARCHAR(20) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT NOT NULL,
    document_hash_sha256 CHAR(64) NOT NULL,
    accepted_at_utc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_legal_acceptance_user_doc_version UNIQUE (template_id, version, user_id)
);

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user ON legal_document_acceptances (user_id);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_template ON legal_document_acceptances (template_id, version);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_hash ON legal_document_acceptances (document_hash_sha256);

-- 3. SEED INICIAL: DOCUMENTOS OFICIAIS DO PROTÓTIPO EM MINAS GERAIS
INSERT INTO legal_document_templates (
    id, code, category, title, description, scope_type, scope_state_uf, scope_municipality_ibge,
    version, status, content_markdown, content_sha256, allowed_placeholders, valid_from_utc, created_by_user_id
) VALUES
(
    'e0000001-0000-0000-0000-000000000001',
    'TERMS-SERVICE-V1',
    'TERMS_OF_SERVICE',
    'Termos de Uso e Condições Gerais da Plataforma Topic Log',
    'Termos gerais de intermediação, distribuição de responsabilidade (D08) e regras de convivência.',
    'NATIONAL',
    NULL,
    NULL,
    '1.0.0',
    'PUBLISHED',
    '# Termos de Uso Gerais da {{PLATFORM_NAME}}\n\nA {{PLATFORM_NAME}} atua como intermediadora digital...',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    '["{{PLATFORM_NAME}}", "{{EFFECTIVE_DATE}}", "{{VERSION}}"]'::jsonb,
    CURRENT_TIMESTAMP,
    '00000000-0000-0000-0000-000000000001'
),
(
    'e0000002-0000-0000-0000-000000000002',
    'CARRIER-ADHESION-MG-V1',
    'CARRIER_ADHESION',
    'Termo de Adesão e Credenciamento do Transportador Autônomo (Minas Gerais)',
    'Contrato de credenciamento do transportador parceiro para prestação de serviços no território mineiro.',
    'STATE',
    'MG',
    NULL,
    '1.0.0',
    'PUBLISHED',
    '# Termo de Adesão do Transportador Autônomo (MG)\n\nO transportador {{USER_NAME}}, CPF {{USER_CPF}}...',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    '["{{PLATFORM_NAME}}", "{{USER_NAME}}", "{{USER_CPF}}", "{{STATE_UF}}", "{{COMMISSION_RATE}}", "{{CARRIER_PLAN}}"]'::jsonb,
    CURRENT_TIMESTAMP,
    '00000000-0000-0000-0000-000000000001'
),
(
    'e0000003-0000-0000-0000-000000000003',
    'SENDER-ADHESION-V1',
    'SENDER_ADHESION',
    'Termo de Adesão do Remetente e Declaração de Conteúdo',
    'Condições de postagem, restrições de cargas perigosas (D06/D07) e limites dimensionais.',
    'NATIONAL',
    NULL,
    NULL,
    '1.0.0',
    'PUBLISHED',
    '# Termo de Adesão do Remetente\n\nO remetente {{USER_NAME}}, CPF {{USER_CPF}}, declara a veracidade dos dados...',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    '["{{PLATFORM_NAME}}", "{{USER_NAME}}", "{{USER_CPF}}"]'::jsonb,
    CURRENT_TIMESTAMP,
    '00000000-0000-0000-0000-000000000001'
),
(
    'e0000004-0000-0000-0000-000000000004',
    'PRIVACY-POLICY-V1',
    'PRIVACY_POLICY',
    'Política de Privacidade e Tratamento de Dados Pessoais (LGPD)',
    'Diretrizes de conformidade com a LGPD (Lei 13.709/2018), minimização de dados e direitos do titular.',
    'NATIONAL',
    NULL,
    NULL,
    '1.0.0',
    'PUBLISHED',
    '# Política de Privacidade da {{PLATFORM_NAME}}\n\nTratamos seus dados pessoais com estrito respeito à LGPD...',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    '["{{PLATFORM_NAME}}", "{{VERSION}}"]'::jsonb,
    CURRENT_TIMESTAMP,
    '00000000-0000-0000-0000-000000000001'
),
(
    'e0000005-0000-0000-0000-000000000005',
    'MUN-REG-JM-V1',
    'MUNICIPAL_REGULATION',
    'Regulamentação Específica do Polo Piloto de João Monlevade',
    'Condições operacionais municipais e diretrizes de circulação local para o polo piloto de João Monlevade.',
    'MUNICIPAL',
    'MG',
    '3136207',
    '1.0.0',
    'PUBLISHED',
    '# Regulamentação Operacional do Polo Piloto — {{MUNICIPALITY_NAME}} (MG)\n\nDisposições complementares...',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    '["{{PLATFORM_NAME}}", "{{MUNICIPALITY_NAME}}", "{{STATE_UF}}"]'::jsonb,
    CURRENT_TIMESTAMP,
    '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (code, version) DO NOTHING;
