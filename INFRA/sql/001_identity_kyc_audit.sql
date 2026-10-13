-- ============================================================================
-- Topic Log — Script DDL PostgreSQL 16 (Migração Versionada 001)
-- Escopo: PR-01 (Identidade, Perfis Multipapel, Sessões, KYC Progressivo e Auditoria)
-- Referências: DOCS/05-Banco-de-Dados.md, DOCS/02-TRD-Tecnico.md (Seção 3), D05, D08
-- ============================================================================
-- NOTA OPERACIONAL (DEC-01):
-- Este script define o esquema canônico para PostgreSQL 16.
-- Na PR-01.1 o PostgreSQL não está instalado na máquina de desenvolvimento (8 GB RAM);
-- a execução e os testes de integração contra instância real do PostgreSQL
-- permanecem pendentes antes de qualquer homologação para produção.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- 1. Tabela de Contas de Usuário (PRD-01)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT NOT NULL UNIQUE,
    phone_encrypted TEXT NOT NULL,
    phone_masked VARCHAR(32) NOT NULL,
    password_hash TEXT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE'
        CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'LOCKED', 'SUSPENDED')),
    failed_login_attempts INT NOT NULL DEFAULT 0
        CONSTRAINT chk_users_failed_attempts CHECK (failed_login_attempts >= 0),
    lockout_until TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

-- 2. Tabela de Perfis Multipapel, KYC Status e Aceite de Termos (PRD-02, D05, D08)
CREATE TABLE IF NOT EXISTS profiles (
    user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE RESTRICT,
    display_name VARCHAR(120) NOT NULL,
    cpf_hash VARCHAR(128) NULL UNIQUE,
    cpf_masked VARCHAR(18) NULL,
    city VARCHAR(80) NOT NULL DEFAULT 'João Monlevade',
    state_uf CHAR(2) NOT NULL DEFAULT 'MG',
    roles TEXT[] NOT NULL DEFAULT ARRAY['SENDER']::TEXT[],
    kyc_status VARCHAR(24) NOT NULL DEFAULT 'NOT_STARTED'
        CONSTRAINT chk_profiles_kyc_status CHECK (
            kyc_status IN ('NOT_STARTED', 'PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED')
        ),
    terms_accepted_version VARCHAR(40) NOT NULL,
    terms_accepted_at TIMESTAMPTZ NOT NULL,
    rating_avg NUMERIC(3, 2) NOT NULL DEFAULT 5.00
        CONSTRAINT chk_profiles_rating_avg CHECK (rating_avg >= 0.00 AND rating_avg <= 5.00),
    rating_count INT NOT NULL DEFAULT 0
        CONSTRAINT chk_profiles_rating_count CHECK (rating_count >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_kyc_status ON profiles (kyc_status);
CREATE INDEX IF NOT EXISTS idx_profiles_city_uf ON profiles (state_uf, city);

-- 3. Tabela de Sessões de Refresh Token Rotativo (TRD Seção 3.1)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    token_family_id UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    replaced_by_token_hash VARCHAR(128) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens (token_family_id);

-- 4. Tabela de Casos de Verificação de Identidade / KYC (PRD-02, D05)
CREATE TABLE IF NOT EXISTS kyc_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    provider VARCHAR(64) NOT NULL,
    provider_reference_id VARCHAR(128) NOT NULL,
    status VARCHAR(24) NOT NULL
        CONSTRAINT chk_kyc_cases_status CHECK (
            status IN ('NOT_STARTED', 'PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED')
        ),
    rejection_reason TEXT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_kyc_cases_user_id ON kyc_cases (user_id);

-- 5. Tabela de Verificações Individuais de KYC (D05, LGPD Minimização)
-- PROIBIDO armazenar imagem ou vetor biométrico facial bruto nesta tabela.
CREATE TABLE IF NOT EXISTS kyc_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kyc_case_id UUID NOT NULL REFERENCES kyc_cases (id) ON DELETE CASCADE,
    check_type VARCHAR(40) NOT NULL
        CONSTRAINT chk_kyc_checks_type CHECK (
            check_type IN ('CPF_STATUS', 'IDENTITY_DOCUMENT', 'ADDRESS_PROOF', 'FACIAL_BIOMETRY_PARTNER')
        ),
    status VARCHAR(24) NOT NULL
        CONSTRAINT chk_kyc_checks_status CHECK (status IN ('PENDING', 'PASSED', 'FAILED')),
    evidence_reference VARCHAR(256) NOT NULL,
    verified_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_kyc_checks_case_id ON kyc_checks (kyc_case_id);

-- 6. Trilha de Auditoria Imutável Append-Only (TRD Seção 3 / LGPD)
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    action VARCHAR(64) NOT NULL,
    correlation_id VARCHAR(128) NOT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events (action);
