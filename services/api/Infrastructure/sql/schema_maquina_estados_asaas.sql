-- ============================================================================
-- TOPICLOG - MÁQUINA DE ESTADOS TRANSAÇÃO FINANCEIRA, OPERACIONAL E FISCAL
-- Integração Asaas Pix Split + Códigos de Segurança (Coleta/Entrega) + Estorno + Escrow
-- ============================================================================

-- 1. EXTENSÃO E ENUMS DE MÁQUINA DE ESTADO
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE estado_corrida_enum AS ENUM (
        'AGUARDANDO_PAGAMENTO',
        'PAGO_AGUARDANDO_INICIO',    -- Pago via Pix com Split; códigos gerados para o Remetente; cancelável com estorno
        'EM_TRANSITO',               -- Motorista validou o código_inicio_viagem; cancelamento com estorno bloqueado
        'ENTREGUE',                  -- Motorista validou o código_entrega_mercadoria; entrega concluída
        'CANCELADA_ESTORNADA'        -- Cancelada antes do início com estorno total do Pix e desfazimento do split
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE estado_financeiro_custodia_enum AS ENUM (
        'PENDENTE_PAGAMENTO',
        'PAGO_RETIDO',               -- Em custódia segura (autoTransfer desativado na subconta do motorista)
        'AGUARDANDO_COMPROVACAO_NF', -- Teto Nano atingido (aguarda chave de 50 dígitos do Portal Nacional)
        'LIBERADO_SAQUE',            -- Concluída; saque liberado via API ou transferência
        'ESTORNADO'                  -- Pix devolvido integralmente na origem via API Asaas
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. TABELA DE CORRIDAS COM OS 2 CÓDIGOS DE SEGURANÇA E AUDITORIA TEMPORAL
CREATE TABLE IF NOT EXISTS viagens_operacionais (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    remetente_id UUID NOT NULL,
    transportador_id UUID NOT NULL,
    
    -- Status da Máquina de Estados
    status_operacional estado_corrida_enum NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
    status_financeiro estado_financeiro_custodia_enum NOT NULL DEFAULT 'PENDENTE_PAGAMENTO',
    
    -- Valores em Centavos Inteiros (ADR-0002)
    valor_total_frete_cents BIGINT NOT NULL CHECK (valor_total_frete_cents > 0),
    taxa_comissao_plataforma_cents BIGINT NOT NULL CHECK (taxa_comissao_plataforma_cents >= 0),
    valor_liquido_transportador_cents BIGINT NOT NULL CHECK (valor_liquido_transportador_cents > 0),
    
    -- IDs de Referência Asaas (Conta Mestre e Subconta)
    asaas_payment_id VARCHAR(50) UNIQUE,
    asaas_split_id VARCHAR(50),
    asaas_refund_id VARCHAR(50),
    subconta_transportador_wallet_id VARCHAR(50) NOT NULL,
    
    -- Códigos de Segurança (Hashes SHA-256 no banco / Plaintext apenas para o Remetente)
    hash_codigo_inicio_viagem VARCHAR(64),     -- Gerado após pagamento Pix
    hash_codigo_entrega_mercadoria VARCHAR(64), -- Gerado após pagamento Pix
    tentativas_codigo_inicio INT NOT NULL DEFAULT 0,
    tentativas_codigo_entrega INT NOT NULL DEFAULT 0,
    
    -- Parâmetros Fiscais da Corrida
    exige_nota_fiscal BOOLEAN NOT NULL DEFAULT FALSE,
    data_limite_emissao_nf DATE, -- Calculada no momento da entrega (último dia útil do mês)
    chave_acesso_nfse_nacional VARCHAR(50) UNIQUE,
    
    -- Auditoria Cronológica da Operação
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    pago_em TIMESTAMP WITH TIME ZONE,
    data_inicio_viagem TIMESTAMP WITH TIME ZONE,
    data_conclusao_entrega TIMESTAMP WITH TIME ZONE,
    cancelado_estornado_em TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT ck_viagem_soma_valores CHECK (valor_total_frete_cents = (taxa_comissao_plataforma_cents + valor_liquido_transportador_cents))
);

CREATE INDEX IF NOT EXISTS idx_viagens_status_operacional ON viagens_operacionais (status_operacional, status_financeiro);
CREATE INDEX IF NOT EXISTS idx_viagens_asaas_payment ON viagens_operacionais (asaas_payment_id);

-- 3. TABELA DE AUDITORIA DE TRANSIÇÕES DE ESTADO
CREATE TABLE IF NOT EXISTS auditoria_transicoes_viagem (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    viagem_id UUID NOT NULL REFERENCES viagens_operacionais(id),
    estado_anterior estado_corrida_enum NOT NULL,
    novo_estado estado_corrida_enum NOT NULL,
    autor_id UUID NOT NULL,
    papel_autor VARCHAR(30) NOT NULL, -- 'SENDER', 'CARRIER', 'SYSTEM_WEBHOOK'
    justificativa TEXT,
    payload_snapshot JSONB,
    ocorrido_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auditoria_transicoes_viagem ON auditoria_transicoes_viagem (viagem_id, ocorrido_em);
