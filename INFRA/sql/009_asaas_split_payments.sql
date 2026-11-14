-- ============================================================================
-- TOPIC LOG — DDL 009: TABELA DE CUSTÓDIA E SPLIT NATIVO ASAAS PIX (PR-FIN-02)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pagamentos_split (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID,
    proposal_id UUID,
    shipment_id UUID NOT NULL,
    asaas_payment_id VARCHAR(100) NOT NULL,
    payer_id UUID,
    payer_name VARCHAR(150),
    payer_cpf_cnpj VARCHAR(20),
    amount_cents BIGINT NOT NULL,
    carrier_wallet_id VARCHAR(100),
    carrier_due_cents BIGINT,
    platform_fee_cents BIGINT,
    pix_copia_cola TEXT,
    qr_code_base64 TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
    expira_em TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
    pago_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_split_asaas_id ON pagamentos_split(asaas_payment_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_split_shipment ON pagamentos_split(shipment_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_split_status_expira ON pagamentos_split(status, expira_em);
