-- ============================================================================
-- TOPICLOG - EVOLUÇÃO FISCAL 2026: LEI COMPLEMENTAR 214/2025
-- Nanoempreendedor (CPF), NFS-e Padrão Nacional (ADN), Asaas Split e Competência Mensal
-- ============================================================================

-- 1. NOVOS ENUMS E TIPOS DE DOMÍNIO FISCAL
DO $$ BEGIN
    CREATE TYPE regime_tributario_transportador_enum AS ENUM (
        'CPF_NANOEMPREENDEDOR',        -- Isento de IBS/CBS e dispensa de NFS-e (abaixo do teto anual)
        'CPF_OBRIGADO_NFSE_NACIONAL',  -- Ultrapassou o teto anual do Nanoempreendedor: obrigado a emitir no Portal Nacional
        'PJ_MEI',                      -- Microempreendedor Individual (NFS-e Nacional / Asaas)
        'PJ_SIMPLES_LUCRO_PRESUMIDO'   -- Demais PJs com emissão direta via Subconta Asaas
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE status_conta_transportador_enum AS ENUM (
        'ATIVO_REGULAR',
        'BLOQUEADO_PENDENCIA_FISCAL',  -- Teto atingido sem comprovação da NFS-e do mês
        'BLOQUEADO_ADMINISTRATIVO'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE canal_emissao_nfse_enum AS ENUM (
        'ASAAS_SUBCONTA_API',          -- Automático via API (Transportadores PJ habilitados)
        'PORTAL_NACIONAL_ADN_GOVBR'    -- Emissão pelo motorista CPF via Portal Nacional da NFS-e
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. PARÂMETROS GLOBAIS DE CONFORMIDADE FISCAL (CONFIGURÁVEL PELO CONSOLE ADMIN)
CREATE TABLE IF NOT EXISTS configuracoes_fiscais_globais (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'GLOBAL_CONFIG_V1',
    teto_nanoempreendedor_anual_cents BIGINT NOT NULL DEFAULT 4050000, -- R$ 40.500,00 (50% do MEI)
    exigir_validacao_adn_online BOOLEAN NOT NULL DEFAULT TRUE,
    tolerancia_divergencia_centavos INT NOT NULL DEFAULT 0,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    atualizado_por_usuario_id UUID
);

-- Insere o registro default se não existir
INSERT INTO configuracoes_fiscais_globais (id, teto_nanoempreendedor_anual_cents)
VALUES ('GLOBAL_CONFIG_V1', 4050000)
ON CONFLICT (id) DO NOTHING;

-- 3. ADAPTAÇÕES NA TABELA DE TRANSPORTADORES
ALTER TABLE transportadores 
    ADD COLUMN IF NOT EXISTS regime_tributario regime_tributario_transportador_enum NOT NULL DEFAULT 'CPF_NANOEMPREENDEDOR',
    ADD COLUMN IF NOT EXISTS status_conta status_conta_transportador_enum NOT NULL DEFAULT 'ATIVO_REGULAR',
    ADD COLUMN IF NOT EXISTS faturamento_acumulado_ano_cents BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ano_faturamento_vigente INT NOT NULL DEFAULT 2026,
    ADD COLUMN IF NOT EXISTS data_desenquadramento_nano TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_transportadores_regime_status 
ON transportadores (status_conta, regime_tributario, faturamento_acumulado_ano_cents);

-- 4. ADAPTAÇÕES NA TABELA DE CORRIDAS
ALTER TABLE corridas
    ADD COLUMN IF NOT EXISTS canal_emissao_nfse canal_emissao_nfse_enum,
    ADD COLUMN IF NOT EXISTS data_limite_emissao_nf DATE, -- Último dia útil do mês da conclusão
    ADD COLUMN IF NOT EXISTS chave_acesso_nfse_nacional VARCHAR(50) UNIQUE, -- Chave de 50 dígitos do ADN
    ADD COLUMN IF NOT EXISTS nfse_nacional_validada BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS data_validacao_adn TIMESTAMP WITH TIME ZONE;

-- Modifica enum de status financeiro para suportar AGUARDANDO_COMPROVACAO_NF
ALTER TYPE status_financeiro_enum ADD VALUE IF NOT EXISTS 'AGUARDANDO_COMPROVACAO_NF' AFTER 'PAGO_RETIDO';

CREATE INDEX IF NOT EXISTS idx_corridas_chave_adn ON corridas (chave_acesso_nfse_nacional);
CREATE INDEX IF NOT EXISTS idx_corridas_competencia_fiscal ON corridas (data_limite_emissao_nf, status_financeiro);

-- 5. TABELA DE AUDITORIA DE COMPROVAÇÃO DE NFS-E NACIONAL VIA WEBSERVICE ADN
CREATE TABLE IF NOT EXISTS comprovacoes_nfse_adn (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    corrida_id UUID NOT NULL REFERENCES corridas(id),
    transportador_id UUID NOT NULL REFERENCES transportadores(id),
    chave_acesso_50 VARCHAR(50) NOT NULL UNIQUE,
    numero_dps VARCHAR(30),
    serie_dps VARCHAR(10),
    data_emissao_dps TIMESTAMP WITH TIME ZONE,
    competencia_fiscal DATE NOT NULL,
    cpf_prestador VARCHAR(14) NOT NULL,
    cpf_cnpj_tomador VARCHAR(18) NOT NULL,
    valor_servico_cents BIGINT NOT NULL,
    cnae_servico VARCHAR(20),
    status_adn VARCHAR(50) NOT NULL, -- 'AUTORIZADA', 'CANCELADA', etc.
    divergencia_detectada TEXT,
    aprovada_com_sucesso BOOLEAN NOT NULL DEFAULT FALSE,
    validado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_comprovacoes_adn_corrida ON comprovacoes_nfse_adn (corrida_id);
