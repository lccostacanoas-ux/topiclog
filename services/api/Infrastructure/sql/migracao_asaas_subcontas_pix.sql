-- ============================================================================
-- TOPICLOG - MIGRAÇÃO DE INFRAESTRUTURA FINANCEIRA: MERCADO PAGO -> ASAAS WHITE LABEL
-- Remoção de colunas legadas e adição das colunas de Subcontas, Carteira e Pix Universal
-- ============================================================================

-- 1. ENUMS TIPADOS PARA CHAVE PIX E KYC ASAAS
DO $$ BEGIN
    CREATE TYPE pix_chave_tipo_enum AS ENUM ('CPF_CNPJ', 'EMAIL', 'TELEFONE', 'EVP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE asaas_kyc_status_enum AS ENUM ('NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. MIGRAÇÃO NA TABELA DE TRANSPORTADORES / USUÁRIOS
ALTER TABLE transportadores 
    -- Chave Pix Universal de Qualquer Instituição Financeira
    ADD COLUMN IF NOT EXISTS pix_chave_tipo pix_chave_tipo_enum NOT NULL DEFAULT 'CPF_CNPJ',
    ADD COLUMN IF NOT EXISTS pix_chave_valor VARCHAR(140),
    ADD COLUMN IF NOT EXISTS banco_destino_nome VARCHAR(100),
    
    -- Dados da Subconta White Label Asaas
    ADD COLUMN IF NOT EXISTS asaas_account_id VARCHAR(64) UNIQUE,
    ADD COLUMN IF NOT EXISTS asaas_wallet_id VARCHAR(64) UNIQUE,
    ADD COLUMN IF NOT EXISTS asaas_kyc_status asaas_kyc_status_enum NOT NULL DEFAULT 'NOT_STARTED',
    ADD COLUMN IF NOT EXISTS asaas_api_key_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS data_nascimento DATE,
    ADD COLUMN IF NOT EXISTS renda_mensal_cents BIGINT DEFAULT 300000;

-- 3. REMOÇÃO SEGURA OU DEPRECIAÇÃO DE COLUNAS LEGADAS DO MERCADO PAGO
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transportadores' AND column_name='mp_seller_user_id') THEN
        ALTER TABLE transportadores DROP COLUMN mp_seller_user_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transportadores' AND column_name='mp_account_email') THEN
        ALTER TABLE transportadores DROP COLUMN mp_account_email;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transportadores' AND column_name='mercado_pago_email') THEN
        ALTER TABLE transportadores DROP COLUMN mercado_pago_email;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transportadores' AND column_name='banco_homologado') THEN
        ALTER TABLE transportadores DROP COLUMN banco_homologado;
    END IF;
END $$;

-- 4. ÍNDICES DE BUSCA RÁPIDA E UNICIDADE
CREATE INDEX IF NOT EXISTS idx_transportadores_asaas_wallet ON transportadores (asaas_wallet_id);
CREATE INDEX IF NOT EXISTS idx_transportadores_pix ON transportadores (pix_chave_valor);
