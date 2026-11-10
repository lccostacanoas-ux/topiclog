-- ============================================================================
-- TOPIC LOG — DDL 006: POLÍTICAS COMERCIAIS, ASSINATURAS E SNAPSHOT FINANCEIRO
-- Módulo: PR-FIN-01 (Gate G4)
-- Decisões Vinculantes: D10 (13%), D11 (R$ 39,90/mês e 7%), D12 (Absorção de taxas) e ADR-0002
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tabela de Políticas Comerciais Versionadas
CREATE TABLE IF NOT EXISTS commercial_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    free_plan_commission_percent NUMERIC(5,2) NOT NULL CHECK (free_plan_commission_percent >= 0 AND free_plan_commission_percent <= 100),
    premium_plan_commission_percent NUMERIC(5,2) NOT NULL CHECK (premium_plan_commission_percent >= 0 AND premium_plan_commission_percent <= 100),
    premium_monthly_fee_cents BIGINT NOT NULL CHECK (premium_monthly_fee_cents >= 0),
    cancellation_penalty_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00 CHECK (cancellation_penalty_percent >= 0 AND cancellation_penalty_percent <= 100),
    cancellation_min_fee_cents BIGINT NOT NULL DEFAULT 700 CHECK (cancellation_min_fee_cents >= 0),
    cancellation_injured_party_share_percent NUMERIC(5,2) NOT NULL DEFAULT 80.00 CHECK (cancellation_injured_party_share_percent >= 0 AND cancellation_injured_party_share_percent <= 100),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    justification TEXT NOT NULL,
    created_by_user_id UUID NOT NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_commercial_policies_dates CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_commercial_policies_validity ON commercial_policies(valid_from, valid_until) WHERE is_active = true;

-- Seed inicial da Política V1 (Decisões vinculantes D10, D11, D12)
INSERT INTO commercial_policies (
    id, version, name, free_plan_commission_percent, premium_plan_commission_percent,
    premium_monthly_fee_cents, cancellation_penalty_percent, cancellation_min_fee_cents,
    cancellation_injured_party_share_percent, valid_from, valid_until, is_active,
    justification, created_by_user_id, created_at_utc
) VALUES (
    'a0000001-0000-0000-0000-000000000001',
    'POL-COM-V1',
    'Política Comercial Vinculante Topic Log v2.0',
    13.00,
    7.00,
    3990,
    10.00,
    700,
    80.00,
    '2026-10-12 00:00:00+00',
    NULL,
    true,
    'Política inicial aprovada nas decisões vinculantes v2.0 (D10: 13%, D11: 7% e R$ 39,90, D12: absorção de taxas)',
    '00000000-0000-0000-0000-000000000001',
    '2026-10-12 00:00:00+00'
) ON CONFLICT (version) DO NOTHING;

-- 2. Tabela de Assinaturas de Planos do Transportador (Carrier Subscriptions)
CREATE TABLE IF NOT EXISTS carrier_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_id UUID NOT NULL,
    plan_code VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED')),
    monthly_fee_cents BIGINT NOT NULL CHECK (monthly_fee_cents >= 0),
    commission_rate_percent NUMERIC(5,2) NOT NULL CHECK (commission_rate_percent >= 0 AND commission_rate_percent <= 100),
    current_period_start_utc TIMESTAMPTZ NOT NULL,
    current_period_end_utc TIMESTAMPTZ NOT NULL,
    canceled_at_utc TIMESTAMPTZ NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_carrier_subscriptions_period CHECK (current_period_end_utc > current_period_start_utc)
);

CREATE INDEX IF NOT EXISTS idx_carrier_subscriptions_carrier_status ON carrier_subscriptions(carrier_id, status);

-- 3. Tabela de Snapshots Financeiros Imutáveis (Financial Snapshots)
CREATE TABLE IF NOT EXISTS financial_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL UNIQUE,
    proposal_id UUID NOT NULL,
    shipment_id UUID NOT NULL,
    carrier_id UUID NOT NULL,
    sender_id UUID NOT NULL,
    policy_id UUID NOT NULL REFERENCES commercial_policies(id),
    policy_version VARCHAR(32) NOT NULL,
    plan_code VARCHAR(32) NOT NULL,
    commission_rate_percent NUMERIC(5,2) NOT NULL,
    transport_amount_cents BIGINT NOT NULL CHECK (transport_amount_cents >= 0),
    platform_commission_cents BIGINT NOT NULL CHECK (platform_commission_cents >= 0),
    carrier_net_cents BIGINT NOT NULL CHECK (carrier_net_cents >= 0),
    rounding_difference_cents BIGINT NOT NULL DEFAULT 0,
    gateway_fees_absorbed_by_platform BOOLEAN NOT NULL DEFAULT true,
    snapshotted_at_utc TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_financial_snapshots_invariant CHECK (transport_amount_cents = platform_commission_cents + carrier_net_cents)
);

CREATE INDEX IF NOT EXISTS idx_financial_snapshots_contract ON financial_snapshots(contract_id);
CREATE INDEX IF NOT EXISTS idx_financial_snapshots_carrier ON financial_snapshots(carrier_id);

-- 4. Tabela de Livro-Razão de Auditoria Financeira (Financial Audit Ledger)
CREATE TABLE IF NOT EXISTS financial_audit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(64) NOT NULL,
    entity_id UUID NOT NULL,
    operation VARCHAR(32) NOT NULL,
    actor_user_id UUID NOT NULL,
    actor_role VARCHAR(32) NOT NULL,
    payload_before JSONB NULL,
    payload_after JSONB NOT NULL,
    recorded_at_utc TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_financial_audit_ledger_entity ON financial_audit_ledger(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_financial_audit_ledger_recorded ON financial_audit_ledger(recorded_at_utc);
