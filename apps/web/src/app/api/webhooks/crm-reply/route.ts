import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

interface CrmReplyPayload {
  topiclog_user_id: string;
  conversation_id?: string | null;
  mensagem: string;
  sender?: string;
}

function validarBearer(authHeader: string | null): boolean {
  const secret = process.env.TOPICLOG_CHAT_SECRET;
  if (!secret || !authHeader) return false;
  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) return false;
  const token = authHeader.slice(prefix.length).trim();
  const tokenBuf = Buffer.from(token, "utf8");
  const secretBuf = Buffer.from(secret, "utf8");
  if (tokenBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(tokenBuf, secretBuf);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Validar Bearer Token com timingSafeEqual
  if (!validarBearer(req.headers.get("authorization"))) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Credencial inválida ou ausente" },
      { status: 401 },
    );
  }

  // 2. Parse do Payload
  let body: CrmReplyPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON", message: "Corpo da requisição inválido" },
      { status: 400 },
    );
  }

  const { topiclog_user_id, mensagem } = body;
  if (!topiclog_user_id || !mensagem?.trim()) {
    return NextResponse.json(
      { error: "Bad Request", message: "topiclog_user_id e mensagem são obrigatórios" },
      { status: 400 },
    );
  }

  try {
    // 3. Localizar ticket ativo do usuário
    const ticketRes = await query<{
      id: string;
      status: string;
    }>(
      `SELECT id, status
       FROM support_tickets
       WHERE user_id = $1 AND status != 'closed'
       ORDER BY created_at DESC
       LIMIT 1`,
      [topiclog_user_id],
    );

    let ticketId: string | undefined;
    if (ticketRes.rows.length > 0 && ticketRes.rows[0]) {
      ticketId = ticketRes.rows[0].id;
    } else {
      // Se não havia ticket aberto, criar um novo
      const newTicketRes = await query<{ id: string }>(
        `INSERT INTO support_tickets (user_id, status, crm_conversation_id)
         VALUES ($1, 'human_handoff', $2)
         RETURNING id`,
        [topiclog_user_id, body.conversation_id || null],
      );
      ticketId = newTicketRes.rows[0]?.id;
    }

    if (!ticketId) {
      throw new Error("Falha ao localizar ou criar ticket de suporte para resposta do CRM");
    }

    // 4. Salvar mensagem do atendente humano em support_messages
    const insertRes = await query<{
      id: string;
      ticket_id: string;
      sender_type: string;
      content: string;
      created_at: string;
    }>(
      `INSERT INTO support_messages (ticket_id, sender_type, content)
       VALUES ($1, 'human_agent', $2)
       RETURNING id, ticket_id, sender_type, content, created_at`,
      [ticketId, mensagem.trim()],
    );

    const savedMessage = insertRes.rows[0];
    if (!savedMessage) {
      throw new Error("Falha ao persistir mensagem do atendente humano");
    }

    // Atualizar ticket para status 'human_handoff' se ainda estava em 'open'
    await query(
      `UPDATE support_tickets
       SET status = 'human_handoff',
           crm_conversation_id = COALESCE($1, crm_conversation_id),
           updated_at = NOW()
       WHERE id = $2`,
      [body.conversation_id || null, ticketId],
    );

    return NextResponse.json({
      success: true,
      message_id: savedMessage.id,
      ticket_id: ticketId,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/webhooks/crm-reply] Erro:", errorMsg);
    return NextResponse.json(
      { error: "Internal Error", message: errorMsg },
      { status: 500 },
    );
  }
}
