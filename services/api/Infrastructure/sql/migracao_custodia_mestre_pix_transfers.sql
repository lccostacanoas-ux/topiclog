-- ============================================================================
-- TOPICLOG - MIGRAÇÃO DE INFRAESTRUTURA FINANCEIRA: CUSTÓDIA CONTA MESTRE + REPASSE PIX DIRETO
-- Elimina uso de subcontas Asaas (R$ 12,90/mês por motorista)
-- Modelo 100%: Cobrança na Conta Mestre PJ + Transferência Pix Direta (POST /v3/transfers) na Entrega
-- ============================================================================

-- 1. DESATIVAÇÃO DE OBRIGATORIEDADE DE SUBCONTAS NAS VIAGENS OPERACIONAIS
ALTER TABLE IF EXISTS viagens_operacionais 
    ALTER COLUMN subconta_transportador_wallet_id DROP NOT NULL;

-- 2. CAMPOS DE REPASSE DIRETO VIA API ASAAS (POST /v3/transfers)
ALTER TABLE IF EXISTS viagens_operacionais
    ADD COLUMN IF NOT EXISTS asaas_transfer_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS status_repasse VARCHAR(30) DEFAULT 'PENDENTE_REPASSE',
    ADD COLUMN IF NOT EXISTS data_repasse TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS motivo_falha_repasse TEXT;

CREATE INDEX IF NOT EXISTS idx_viagens_repasse ON viagens_operacionais (status_repasse, asaas_transfer_id);

-- 3. TABELA DE AUDITORIA DE REPASSES PIX (IDEMPOTÊNCIA E HISTÓRICO DE TENTATIVAS)
CREATE TABLE IF NOT EXISTS pagamentos_frete (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    viagem_id UUID NOT NULL,
    transportador_id UUID NOT NULL,
    valor_liquido_cents BIGINT NOT NULL CHECK (valor_liquido_cents > 0),
    pix_chave VARCHAR(100) NOT NULL,
    pix_tipo VARCHAR(20) NOT NULL, -- 'CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'
    asaas_transfer_id VARCHAR(64),
    status_repasse VARCHAR(30) NOT NULL DEFAULT 'PENDENTE_REPASSE', -- 'TRANSFERIDO', 'PENDENTE_REPASSE', 'ERRO_REPASSE'
    motivo_falha TEXT,
    idempotency_key VARCHAR(100) UNIQUE NOT NULL,
    data_repasse TIMESTAMP WITH TIME ZONE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_frete_viagem ON pagamentos_frete (viagem_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_frete_status ON pagamentos_frete (status_repasse);

-- 4. PRESERVAÇÃO DAS REGRAS FISCAIS (LC 214/2025)
-- O contador anual de faturamento do Nanoempreendedor (CPF) continua sendo incrementado
-- na conclusão da entrega (Gate G3) e as NFS-e sobre a comissão da plataforma continuam emitidas normalmente.
