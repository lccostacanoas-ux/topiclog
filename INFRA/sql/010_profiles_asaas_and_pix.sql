-- ============================================================================
-- TOPIC LOG — DDL 010: PERFIS DE USUÁRIOS COM SUBCONTA E CARTEIRA ASAAS (PR-FIN-02)
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pix_key_type VARCHAR(20);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pix_key VARCHAR(150);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100) DEFAULT 'Asaas';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS asaas_wallet_id VARCHAR(100);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS asaas_account_id VARCHAR(100);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS asaas_kyc_status VARCHAR(50) DEFAULT 'NOT_STARTED';

CREATE INDEX IF NOT EXISTS idx_profiles_asaas_wallet ON profiles(asaas_wallet_id);
CREATE INDEX IF NOT EXISTS idx_profiles_asaas_account ON profiles(asaas_account_id);
