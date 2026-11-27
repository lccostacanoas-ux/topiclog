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

  try {
    // 1. Buscar ou criar Ticket aberto no banco SQL
    let ticketRes = await query<{
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

    if (!ticket) {
      throw new Error("Falha ao inicializar ticket de suporte");
    }

    const ticketId = ticket.id;

    // 2. Salvar mensagem do usuário no banco SQL
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
    const userMessage = userMsgRes.rows[0];

    // 3. Encaminhar para o DeskcommCRM Webhook
    const crmBaseUrl = process.env.DESKCOMM_CRM_URL || "http://localhost:3000";
    const crmSecret = process.env.TOPICLOG_CHAT_SECRET || "";
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
      });

      if (crmResponse.ok) {
        const crmData = await crmResponse.json();

        if (crmData.status === "replied_by_ai") {
          handoff = Boolean(crmData.handoff_to_human);

          // Atualizar crm_conversation_id e status do ticket
          await query(
            `UPDATE support_tickets
             SET crm_conversation_id = $1,
                 status = $2,
                 updated_at = NOW()
             WHERE id = $3`,
            [crmData.conversation_id, handoff ? "human_handoff" : "open", ticketId],
          );

          // Salvar resposta da IA no banco SQL
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
          replyMessage = aiMsgRes.rows[0] ?? null;
        } else if (crmData.status === "queued_for_human") {
          handoff = true;
          await query(
            `UPDATE support_tickets
             SET status = 'human_handoff',
                 crm_conversation_id = COALESCE($1, crm_conversation_id),
                 updated_at = NOW()
             WHERE id = $2`,
            [crmData.conversation_id, ticketId],
          );
        }
      } else {
        console.warn("[POST /api/support/message] Resposta de erro do CRM:", crmResponse.status);
      }
    } catch (crmErr) {
      console.warn("[POST /api/support/message] Falha ao comunicar com DeskcommCRM:", crmErr);
    }

    return NextResponse.json({
      success: true,
      ticket_id: ticketId,
      user_message: userMessage,
      reply_message: replyMessage,
      handoff,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/support/message] Erro:", errorMsg);
    return NextResponse.json(
      { error: "Internal Error", message: errorMsg },
      { status: 500 },
    );
  }
}
