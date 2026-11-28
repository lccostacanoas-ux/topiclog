import { type NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      { error: "Bad Request", message: "userId é obrigatório" },
      { status: 400 },
    );
  }

  // 1. Prioridade: Consultar histórico centralizado no DeskcommCRM (porta 3300 / SSL)
  const crmBaseUrl = process.env.DESKCOMM_CRM_URL || "https://deskcomm.topiclog.com.br";
  const crmSecret =
    process.env.TOPICLOG_CHAT_SECRET ||
    "fa7098440d2054dd66009e79e259daebc11a5e0ea28deba963e9435cdf9c1270";

  try {
    const crmRes = await fetch(
      `${crmBaseUrl.replace(/\/+$/, "")}/api/webhooks/topiclog-chat?topiclog_user_id=${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${crmSecret}`,
        },
        signal: AbortSignal.timeout(3500),
      },
    );

    if (crmRes.ok) {
      const crmData = await crmRes.json();
      if (crmData.ticket || (Array.isArray(crmData.messages) && crmData.messages.length > 0)) {
        return NextResponse.json({
          ticket: crmData.ticket,
          messages: crmData.messages || [],
        });
      }
    }
  } catch (crmErr) {
    console.warn("[GET /api/support/ticket] Aviso: Falha ao consultar CRM Deskcomm:", crmErr);
  }

  // 2. Fallback local: Buscar no banco SQL se disponível
  try {
    const ticketRes = await query<{
      id: string;
      user_id: string;
      crm_conversation_id: string | null;
      status: "open" | "human_handoff" | "closed";
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, user_id, crm_conversation_id, status, created_at, updated_at
       FROM support_tickets
       WHERE user_id = $1 AND status != 'closed'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    );

    const ticket = ticketRes.rows[0] || null;

    if (!ticket) {
      return NextResponse.json({ ticket: null, messages: [] });
    }

    const msgsRes = await query<{
      id: string;
      ticket_id: string;
      sender_type: "user" | "ai_agent" | "human_agent";
      content: string;
      created_at: string;
    }>(
      `SELECT id, ticket_id, sender_type, content, created_at
       FROM support_messages
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [ticket.id],
    );

    return NextResponse.json({
      ticket,
      messages: msgsRes.rows,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn("[GET /api/support/ticket] Aviso: Falha ao consultar histórico de suporte no banco SQL:", errorMsg);
    return NextResponse.json({
      ticket: {
        id: `ticket_${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`,
        user_id: userId,
        crm_conversation_id: null,
        status: "open",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      messages: [],
    });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const reason = searchParams.get("reason") || "user_clear";

  if (!userId) {
    return NextResponse.json(
      { error: "Bad Request", message: "userId é obrigatório" },
      { status: 400 },
    );
  }

  // Notificar CRM Deskcomm para encerrar conversa
  const crmBaseUrl = process.env.DESKCOMM_CRM_URL || "https://deskcomm.topiclog.com.br";
  const crmSecret =
    process.env.TOPICLOG_CHAT_SECRET ||
    "fa7098440d2054dd66009e79e259daebc11a5e0ea28deba963e9435cdf9c1270";

  try {
    await fetch(
      `${crmBaseUrl.replace(/\/+$/, "")}/api/webhooks/topiclog-chat?topiclog_user_id=${encodeURIComponent(userId)}&reason=${encodeURIComponent(reason)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${crmSecret}`,
        },
        signal: AbortSignal.timeout(3000),
      },
    );
  } catch (crmErr) {
    console.warn("[DELETE /api/support/ticket] Aviso ao notificar encerramento no CRM:", crmErr);
  }

  try {
    // Fecha todos os tickets ativos do usuário para reiniciar o chat limpo
    await query(
      `UPDATE support_tickets
       SET status = 'closed', updated_at = NOW()
       WHERE user_id = $1 AND status != 'closed'`,
      [userId],
    );
  } catch (err: unknown) {
    console.warn("[DELETE /api/support/ticket] Aviso ao atualizar suporte no banco SQL:", err);
  }

  return NextResponse.json({
    success: true,
    message: "Conversa de suporte encerrada e limpa com sucesso",
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = body.userId || body.user_id;
    const action = body.action || "clear";

    if (!userId) {
      return NextResponse.json(
        { error: "Bad Request", message: "userId é obrigatório" },
        { status: 400 },
      );
    }

    if (action === "clear" || action === "close") {
      const crmBaseUrl = process.env.DESKCOMM_CRM_URL || "https://deskcomm.topiclog.com.br";
      const crmSecret =
        process.env.TOPICLOG_CHAT_SECRET ||
        "fa7098440d2054dd66009e79e259daebc11a5e0ea28deba963e9435cdf9c1270";

      try {
        await fetch(
          `${crmBaseUrl.replace(/\/+$/, "")}/api/webhooks/topiclog-chat?topiclog_user_id=${encodeURIComponent(userId)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${crmSecret}` },
            signal: AbortSignal.timeout(3000),
          },
        );
      } catch (crmErr) {
        console.warn("[POST /api/support/ticket] Aviso ao notificar encerramento no CRM:", crmErr);
      }

      try {
        await query(
          `UPDATE support_tickets
           SET status = 'closed', updated_at = NOW()
           WHERE user_id = $1 AND status != 'closed'`,
          [userId],
        );
      } catch (dbErr) {
        console.warn("[POST /api/support/ticket] Aviso ao fechar ticket no banco SQL:", dbErr);
      }

      return NextResponse.json({
        success: true,
        message: "Conversa de suporte encerrada e limpa com sucesso",
      });
    }

    return NextResponse.json(
      { error: "Bad Request", message: `Ação '${action}' não reconhecida` },
      { status: 400 },
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/support/ticket] Erro:", errorMsg);
    return NextResponse.json(
      { error: "Internal Error", message: errorMsg },
      { status: 500 },
    );
  }
}
