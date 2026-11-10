-- ============================================================================
-- TOPIC LOG — DDL 007: GESTÃO ADMINISTRATIVA, CONFIGURAÇÕES OPERACIONAIS,
-- GOVERNANÇA DE PAGAMENTOS E FROTAS (PR-ADM-01 / PR-FIN-02)
-- Compatível com PostgreSQL 16+
-- ============================================================================

-- 1. TABELA: CONFIGURAÇÕES OPERACIONAIS DA PLATAFORMA
CREATE TABLE IF NOT EXISTS operational_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(32) NOT NULL UNIQUE,
    bicycle_max_weight_grams INT NOT NULL DEFAULT 5000,
    motorcycle_max_weight_grams INT NOT NULL DEFAULT 20000,
    car_max_weight_grams INT NOT NULL DEFAULT 20000,
    car_max_age_years INT NOT NULL DEFAULT 7,
    geo_deviation_compatible_km NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    geo_deviation_requires_eval_km NUMERIC(5,2) NOT NULL DEFAULT 20.00,
    post_delivery_radius_km NUMERIC(5,2) NOT NULL DEFAULT 2.00,
    proposal_standard_validity_hours INT NOT NULL DEFAULT 24,
    proposal_sameday_validity_hours INT NOT NULL DEFAULT 2,
    priority_second_shipment_minutes INT NOT NULL DEFAULT 10,
    cancellation_penalty_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    cancellation_min_fee_cents BIGINT NOT NULL DEFAULT 700,
    cancellation_injured_party_share_percent NUMERIC(5,2) NOT NULL DEFAULT 80.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    justification TEXT NOT NULL,
    updated_by_user_id UUID NOT NULL,
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_operational_settings_active 
ON operational_settings (is_active) 
WHERE is_active = true;

-- 2. TABELA: VEÍCULOS DE TRANSPORTADORES E MODERAÇÃO DE FROTAS
CREATE TABLE IF NOT EXISTS carrier_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    carrier_name VARCHAR(120) NOT NULL,
    vehicle_type VARCHAR(20) NOT NULL CHECK (vehicle_type IN ('BICYCLE', 'MOTORCYCLE', 'CAR')),
    brand_model VARCHAR(100) NOT NULL,
    manufacturing_year INT NOT NULL,
    plate_masked VARCHAR(20) NOT NULL,
    declared_capacity_grams INT NOT NULL,
    crlv_document_key VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'INACTIVE')),
    rejection_reason TEXT,
    moderated_by_user_id UUID,
    moderated_at_utc TIMESTAMPTZ,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_carrier_vehicles_carrier ON carrier_vehicles (carrier_id);
CREATE INDEX IF NOT EXISTS idx_carrier_vehicles_status ON carrier_vehicles (status);
CREATE INDEX IF NOT EXISTS idx_carrier_vehicles_type ON carrier_vehicles (vehicle_type);

-- 3. TABELA: GOVERNANÇA DE MEIOS DE PAGAMENTO (SANDBOX / PR-FIN-02)
CREATE TABLE IF NOT EXISTS payment_method_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    method_code VARCHAR(30) NOT NULL UNIQUE CHECK (method_code IN ('PIX', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_SLIP')),
    display_name VARCHAR(60) NOT NULL,
    provider_name VARCHAR(60) NOT NULL DEFAULT 'Asaas Sandbox',
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    fee_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    fixed_fee_cents BIGINT NOT NULL DEFAULT 0,
    platform_absorbs_fee BOOLEAN NOT NULL DEFAULT true,
    min_amount_cents BIGINT NOT NULL DEFAULT 500,
    max_amount_cents BIGINT NOT NULL DEFAULT 500000,
    justification TEXT,
    updated_by_user_id UUID,
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABELA: AUDITORIA ADMINISTRATIVA CENTRALIZADA (APPEND-ONLY)
CREATE TABLE IF NOT EXISTS admin_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID NOT NULL,
    actor_role VARCHAR(40) NOT NULL,
    category VARCHAR(40) NOT NULL, -- 'POLICY', 'OPERATIONAL_SETTINGS', 'FLEET_MODERATION', 'PAYMENT_GOVERNANCE'
    action VARCHAR(60) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    payload_before JSONB,
    payload_after JSONB NOT NULL,
    correlation_id VARCHAR(64),
    recorded_at_utc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON admin_audit_events (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_category ON admin_audit_events (category);
CREATE INDEX IF NOT EXISTS idx_admin_audit_date ON admin_audit_events (recorded_at_utc DESC);

-- SEED INICIAL: CONFIGURAÇÕES OPERACIONAIS PADRÃO V1
INSERT INTO operational_settings (
    version,
    bicycle_max_weight_grams,
    motorcycle_max_weight_grams,
    car_max_weight_grams,
    car_max_age_years,
    geo_deviation_compatible_km,
    geo_deviation_requires_eval_km,
    post_delivery_radius_km,
    proposal_standard_validity_hours,
    proposal_sameday_validity_hours,
    priority_second_shipment_minutes,
    cancellation_penalty_percent,
    cancellation_min_fee_cents,
    cancellation_injured_party_share_percent,
    is_active,
    justification,
    updated_by_user_id
) VALUES (
    'OP-SET-V1',
    5000,
    20000,
    20000,
    7,
    10.00,
    20.00,
    2.00,
    24,
    2,
    10,
    10.00,
    700,
    80.00,
    true,
    'Configurações operacionais padrão da plataforma Topic Log (D03, D04, D16, PR-03, PR-04, PR-05)',
    '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (version) DO NOTHING;

-- SEED INICIAL: MEIOS DE PAGAMENTO GOVERNADOS (SANDBOX)
INSERT INTO payment_method_settings (method_code, display_name, provider_name, is_enabled, fee_percent, fixed_fee_cents, platform_absorbs_fee, min_amount_cents, max_amount_cents, justification)
VALUES 
    ('PIX', 'PIX Instantâneo', 'Asaas Sandbox', true, 0.99, 0, true, 500, 500000, 'Método instantâneo padrão com absorção de taxa integral'),
    ('DEBIT_CARD', 'Cartão de Débito', 'Asaas Sandbox', true, 1.49, 0, true, 500, 500000, 'Cartão de débito aprovado para remetentes com absorção de taxa integral'),
    ('CREDIT_CARD', 'Cartão de Crédito', 'Asaas Sandbox', true, 2.99, 49, true, 1000, 500000, 'Cartão de crédito à vista ou parcelado com absorção de taxa'),
    ('BANK_SLIP', 'Boleto Bancário (Inativo)', 'Asaas Sandbox', false, 0.00, 199, true, 2000, 500000, 'Boleto inativo por diretriz comercial. Requer autorização expressa para ativação.')
ON CONFLICT (method_code) DO NOTHING;
