-- ============================================================================
-- Topic Log — Script DDL PostgreSQL 16 (Migração Versionada 004)
-- Escopo: PR-04 (Propostas, Negociação, Aceite Único, Reserva por Trecho e Prioridade 2ª Encomenda)
-- Referências: DOCS/05-Banco-de-Dados.md, DOCS/02-TRD-Tecnico.md, D05, D10, D11, D12, ADR-0002
-- ============================================================================

-- 1. Tabela de Propostas Comerciais de Frete (proposals)
CREATE TABLE IF NOT EXISTS proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID NOT NULL,
    trip_id UUID,
    carrier_id UUID NOT NULL,
    carrier_name VARCHAR(120) NOT NULL,
    sender_id UUID NOT NULL,
    sender_name VARCHAR(120) NOT NULL,
    amount_cents BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    estimated_pickup VARCHAR(100),
    estimated_delivery VARCHAR(100),
    notes TEXT,
    parent_proposal_id UUID,
    counter_count INT NOT NULL DEFAULT 0,
    expires_at_utc TIMESTAMPTZ NOT NULL,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_proposals_amount CHECK (amount_cents > 0),
    CONSTRAINT chk_proposals_status CHECK (status IN ('PENDING', 'COUNTERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_proposals_shipment ON proposals (shipment_id, status);
CREATE INDEX IF NOT EXISTS idx_proposals_carrier ON proposals (carrier_id, status);
CREATE INDEX IF NOT EXISTS idx_proposals_sender ON proposals (sender_id, status);
CREATE INDEX IF NOT EXISTS idx_proposals_expires ON proposals (expires_at_utc) WHERE status IN ('PENDING', 'COUNTERED');

-- 2. Tabela de Contratos Formalizados (contracts)
-- Gate G2 / ADR-0002: Aceite único garantido pela restrição UNIQUE em shipment_id
CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID NOT NULL UNIQUE,
    trip_id UUID NOT NULL,
    proposal_id UUID NOT NULL UNIQUE,
    sender_id UUID NOT NULL,
    sender_name VARCHAR(120) NOT NULL,
    carrier_id UUID NOT NULL,
    carrier_name VARCHAR(120) NOT NULL,
    amount_cents BIGINT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    commission_rate NUMERIC(8, 6) NOT NULL,
    commission_cents BIGINT NOT NULL,
    carrier_due_cents BIGINT NOT NULL,
    policy_version_id VARCHAR(50) NOT NULL,
    plan_code VARCHAR(30) NOT NULL,
    gateway_fees_absorbed_by_platform BOOLEAN NOT NULL DEFAULT TRUE,
    cancellation_reason_code VARCHAR(50),
    cancellation_justification TEXT,
    cancellation_reopened_for_bidding BOOLEAN,
    cancellation_simulated_penalty_cents BIGINT DEFAULT 0,
    contracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_contract_accounting CHECK (commission_cents + carrier_due_cents = amount_cents),
    CONSTRAINT chk_contract_status CHECK (status IN ('ACTIVE', 'CANCELLED_PRE_PICKUP', 'CANCELLED_POST_PICKUP', 'COMPLETED'))
);

CREATE INDEX IF NOT EXISTS idx_contracts_carrier ON contracts (carrier_id, status);
CREATE INDEX IF NOT EXISTS idx_contracts_sender ON contracts (sender_id, status);
CREATE INDEX IF NOT EXISTS idx_contracts_trip ON contracts (trip_id);

-- 3. Tabela de Reservas de Capacidade por Trecho (contract_leg_reservations)
CREATE TABLE IF NOT EXISTS contract_leg_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    leg_index INT NOT NULL,
    from_city VARCHAR(100) NOT NULL,
    to_city VARCHAR(100) NOT NULL,
    reserved_grams INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_res_grams CHECK (reserved_grams > 0)
);

CREATE INDEX IF NOT EXISTS idx_res_contract ON contract_leg_reservations (contract_id);

-- 4. Tabela de Auditoria de Eventos de Negociação (proposal_audit_events)
CREATE TABLE IF NOT EXISTS proposal_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL,
    shipment_id UUID NOT NULL,
    actor_id UUID NOT NULL,
    actor_role VARCHAR(20) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    amount_cents BIGINT NOT NULL,
    justification TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prop_events_proposal ON proposal_audit_events (proposal_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_prop_events_shipment ON proposal_audit_events (shipment_id, occurred_at);

-- 5. Tabela de Janela de Oferta Prioritária de 10 min — Regra 2 (priority_offers)
CREATE TABLE IF NOT EXISTS priority_offers (
    shipment_id UUID PRIMARY KEY,
    eligible_carrier_id UUID NOT NULL,
    first_shipment_id UUID NOT NULL,
    trip_id UUID NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    is_declined BOOLEAN NOT NULL DEFAULT FALSE,
    is_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_priority_carrier ON priority_offers (eligible_carrier_id, expires_at) WHERE is_declined = FALSE AND is_accepted = FALSE;
