-- ==============================================================================
-- TOPIC LOG — DDL 005: EXECUÇÃO DE VIAGENS, RASTREAMENTO E CONSOLIDAÇÃO DE ENTREGA (GATE G3)
-- Monólito Modular Topic Log (.NET 10 LTS + PostgreSQL 16 / PostGIS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS delivery_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL,
    shipment_id UUID NOT NULL,
    trip_id UUID NOT NULL,
    sender_id UUID NOT NULL,
    carrier_id UUID NOT NULL,
    recipient_name VARCHAR(150) NOT NULL,
    recipient_phone VARCHAR(50),
    recipient_document_masked VARCHAR(20),
    status VARCHAR(40) NOT NULL DEFAULT 'AWAITING_PICKUP',
    picked_up_at_utc TIMESTAMPTZ,
    delivered_at_utc TIMESTAMPTZ,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_delivery_orders_contract UNIQUE (contract_id),
    CONSTRAINT chk_delivery_order_status CHECK (
        status IN (
            'AWAITING_PICKUP',
            'IN_TRANSIT',
            'OUT_FOR_DELIVERY',
            'DELIVERED_VERIFIED',
            'EXCEPTION_REPORTED',
            'RESCHEDULED',
            'RETURN_TO_SENDER_INITIATED',
            'DISPUTED',
            'CLOSED'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_carrier ON delivery_orders (carrier_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_sender ON delivery_orders (sender_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_shipment ON delivery_orders (shipment_id);

CREATE TABLE IF NOT EXISTS delivery_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id UUID NOT NULL REFERENCES delivery_orders (id) ON DELETE CASCADE,
    code_hash VARCHAR(128) NOT NULL,
    code_salt VARCHAR(64) NOT NULL,
    failed_attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    locked_at_utc TIMESTAMPTZ,
    expires_at_utc TIMESTAMPTZ NOT NULL,
    verified_at_utc TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_challenges_order ON delivery_challenges (delivery_order_id, is_active);

CREATE TABLE IF NOT EXISTS delivery_proofs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id UUID NOT NULL REFERENCES delivery_orders (id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    mime_type VARCHAR(50) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    approximate_lat DOUBLE PRECISION,
    approximate_lng DOUBLE PRECISION,
    uploaded_by_user_id UUID NOT NULL,
    uploaded_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_proofs_order ON delivery_proofs (delivery_order_id);

CREATE TABLE IF NOT EXISTS delivery_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id UUID NOT NULL REFERENCES delivery_orders (id) ON DELETE CASCADE,
    event_type VARCHAR(60) NOT NULL,
    actor_id UUID NOT NULL,
    actor_role VARCHAR(30) NOT NULL,
    previous_status VARCHAR(40) NOT NULL,
    new_status VARCHAR(40) NOT NULL,
    notes TEXT,
    approximate_lat DOUBLE PRECISION,
    approximate_lng DOUBLE PRECISION,
    occurred_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_order ON delivery_events (delivery_order_id, occurred_at_utc);

CREATE TABLE IF NOT EXISTS delivery_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id UUID NOT NULL REFERENCES delivery_orders (id) ON DELETE CASCADE,
    reason_code VARCHAR(50) NOT NULL,
    justification TEXT NOT NULL,
    photo_url TEXT,
    reported_by_user_id UUID NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'PENDING_RESOLUTION',
    resolution_action VARCHAR(50),
    rescheduled_for TIMESTAMPTZ,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at_utc TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_delivery_exceptions_order ON delivery_exceptions (delivery_order_id, status);
