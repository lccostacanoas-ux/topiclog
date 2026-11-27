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

  try {
    // Buscar ticket ativo mais recente
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

    // Buscar mensagens do ticket
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
    console.error("[GET /api/support/ticket] Erro:", errorMsg);
    return NextResponse.json(
      { error: "Internal Error", message: errorMsg },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      { error: "Bad Request", message: "userId é obrigatório" },
      { status: 400 },
    );
  }

  try {
    // Fecha todos os tickets ativos do usuário para reiniciar o chat limpo
    await query(
      `UPDATE support_tickets
       SET status = 'closed', updated_at = NOW()
       WHERE user_id = $1 AND status != 'closed'`,
      [userId],
    );

    return NextResponse.json({
      success: true,
      message: "Conversa de suporte encerrada e limpa com sucesso",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[DELETE /api/support/ticket] Erro:", errorMsg);
    return NextResponse.json(
      { error: "Internal Error", message: errorMsg },
      { status: 500 },
    );
  }
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
      await query(
        `UPDATE support_tickets
         SET status = 'closed', updated_at = NOW()
         WHERE user_id = $1 AND status != 'closed'`,
        [userId],
      );

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
