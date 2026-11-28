import { type NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

interface PostMessageBody {
  user_id: string;
  user_name: string;
  user_email?: string | null;
  user_phone?: string | null;
  message: string;
  context?: {
    perfil_usuario?: string | null;
    documento_cpf_cnpj?: string | null;
    status_kyc?: string | null;
    tipo_veiculo?: string | null;
    placa_veiculo?: string | null;
    id_frete?: string | null;
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: PostMessageBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON", message: "Corpo da requisição inválido" },
      { status: 400 },
    );
  }

  const { user_id, user_name, message } = body;
  if (!user_id || !user_name || !message?.trim()) {
    return NextResponse.json(
      { error: "Bad Request", message: "user_id, user_name e message são obrigatórios" },
      { status: 400 },
    );
  }

  // 1. Inicializar ou recuperar identificador do ticket
  let ticketId = `ticket_${user_id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`;
  try {
    const ticketRes = await query<{
      id: string;
      user_id: string;
      crm_conversation_id: string | null;
      status: "open" | "human_handoff" | "closed";
    }>(
      `SELECT id, user_id, crm_conversation_id, status
       FROM support_tickets
       WHERE user_id = $1 AND status != 'closed'
       ORDER BY created_at DESC
       LIMIT 1`,
      [user_id],
    );

    let ticket = ticketRes.rows[0];
    if (!ticket) {
      const newTicketRes = await query<{
        id: string;
        user_id: string;
        crm_conversation_id: string | null;
        status: "open" | "human_handoff" | "closed";
      }>(
        `INSERT INTO support_tickets (user_id, status)
         VALUES ($1, 'open')
         RETURNING id, user_id, crm_conversation_id, status`,
        [user_id],
      );
      ticket = newTicketRes.rows[0];
    }
    if (ticket?.id) {
      ticketId = ticket.id;
    }
  } catch (dbTicketErr) {
    console.warn("[POST /api/support/message] Aviso: Falha ao sincronizar support_tickets no banco SQL:", dbTicketErr);
  }

  // 2. Salvar mensagem do usuário (com fallback seguro em memória)
  let userMessage = {
    id: `msg_user_${Date.now()}`,
    ticket_id: ticketId,
    sender_type: "user" as const,
    content: message.trim(),
    created_at: new Date().toISOString(),
  };

  try {
    const userMsgRes = await query<{
      id: string;
      ticket_id: string;
      sender_type: "user";
      content: string;
      created_at: string;
    }>(
      `INSERT INTO support_messages (ticket_id, sender_type, content)
       VALUES ($1, 'user', $2)
       RETURNING id, ticket_id, sender_type, content, created_at`,
      [ticketId, message.trim()],
    );
    if (userMsgRes.rows[0]) {
      userMessage = userMsgRes.rows[0];
    }
  } catch (dbMsgErr) {
    console.warn("[POST /api/support/message] Aviso: Falha ao gravar support_messages no banco SQL:", dbMsgErr);
  }

  // 3. Encaminhar para o DeskcommCRM Webhook com timeout estrito
  const crmBaseUrl =
    process.env.DESKCOMM_CRM_URL || "https://deskcomm.topiclog.com.br";
  const crmSecret =
    process.env.TOPICLOG_CHAT_SECRET ||
    "fa7098440d2054dd66009e79e259daebc11a5e0ea28deba963e9435cdf9c1270";
  const crmWebhookUrl = `${crmBaseUrl.replace(/\/+$/, "")}/api/webhooks/topiclog-chat`;

  let replyMessage: {
    id: string;
    ticket_id: string;
    sender_type: "ai_agent" | "human_agent";
    content: string;
    created_at: string;
  } | null = null;
  let handoff = false;

  try {
    const crmResponse = await fetch(crmWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(crmSecret ? { Authorization: `Bearer ${crmSecret}` } : {}),
      },
      body: JSON.stringify({
        topiclog_user_id: user_id,
        nome: user_name,
        telefone: body.user_phone || null,
        email: body.user_email || null,
        mensagem: message.trim(),
        contexto: body.context || null,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (crmResponse.ok) {
      const crmData = await crmResponse.json();

      if (crmData.status === "replied_by_ai") {
        handoff = Boolean(crmData.handoff_to_human);

        // Fallback imediato do objeto de resposta
        replyMessage = {
          id: `msg_ai_${Date.now()}`,
          ticket_id: ticketId,
          sender_type: "ai_agent",
          content: crmData.reply,
          created_at: new Date().toISOString(),
        };

        // Tentar persistir no banco SQL em background
        try {
          await query(
            `UPDATE support_tickets
             SET crm_conversation_id = $1,
                 status = $2,
                 updated_at = NOW()
             WHERE id = $3`,
            [crmData.conversation_id, handoff ? "human_handoff" : "open", ticketId],
          );

          const aiMsgRes = await query<{
            id: string;
            ticket_id: string;
            sender_type: "ai_agent";
            content: string;
            created_at: string;
          }>(
            `INSERT INTO support_messages (ticket_id, sender_type, content)
             VALUES ($1, 'ai_agent', $2)
             RETURNING id, ticket_id, sender_type, content, created_at`,
            [ticketId, crmData.reply],
          );
          if (aiMsgRes.rows[0]) {
            replyMessage = aiMsgRes.rows[0];
          }
        } catch (dbAiErr) {
          console.warn("[POST /api/support/message] Aviso: Falha ao salvar resposta no banco SQL:", dbAiErr);
        }
      } else if (crmData.status === "queued_for_human") {
        handoff = true;
        try {
          await query(
            `UPDATE support_tickets
             SET status = 'human_handoff',
                 crm_conversation_id = COALESCE($1, crm_conversation_id),
                 updated_at = NOW()
             WHERE id = $2`,
            [crmData.conversation_id, ticketId],
          );
        } catch (dbHandoffErr) {
          console.warn("[POST /api/support/message] Aviso: Falha ao atualizar handoff no banco SQL:", dbHandoffErr);
        }
      }
    } else {
      console.warn("[POST /api/support/message] Resposta de erro do CRM:", crmResponse.status);
    }
  } catch (crmErr) {
    console.warn("[POST /api/support/message] Falha ao comunicar com DeskcommCRM:", crmErr);
  }

  // Se não obteve resposta direta e não houve handoff, fornecer resposta amigável
  if (!replyMessage && !handoff) {
    replyMessage = {
      id: `msg_fallback_${Date.now()}`,
      ticket_id: ticketId,
      sender_type: "ai_agent",
      content: "Recebemos sua mensagem! Nosso assistente e equipe operacional já estão processando sua solicitação.",
      created_at: new Date().toISOString(),
    };
  }

  return NextResponse.json({
    success: true,
    ticket_id: ticketId,
    user_message: userMessage,
    reply_message: replyMessage,
    handoff,
  });
}
