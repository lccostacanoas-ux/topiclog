-- ============================================================================
-- TOPIC LOG — DDL 011: SUPORTE OPERACIONAL INTERNO & DESKCOMM CRM
-- ============================================================================
-- Escopo: Isolamento completo do suporte interno da plataforma em relação
--         ao chat P2P de fretes entre Embarcador e Transportador.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tabela de Tickets de Suporte da Plataforma
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    crm_conversation_id TEXT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'open'
        CONSTRAINT chk_support_tickets_status CHECK (status IN ('open', 'human_handoff', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status ON support_tickets (user_id, status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_crm_conv ON support_tickets (crm_conversation_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets (created_at DESC);

-- 2. Tabela de Mensagens de Suporte (Usuário, IA Deskcomm e Atendente Humano)
CREATE TABLE IF NOT EXISTS support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets (id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL
        CONSTRAINT chk_support_messages_sender CHECK (sender_type IN ('user', 'ai_agent', 'human_agent')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages (ticket_id, created_at ASC);
