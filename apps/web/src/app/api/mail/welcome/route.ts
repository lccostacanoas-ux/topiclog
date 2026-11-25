import { NextResponse } from "next/server";
import { sendWelcomeEmail } from "@/lib/mail";

export const dynamic = "force-dynamic";

/**
 * Endpoint para disparo do e-mail de Boas-vindas / Confirmação de Cadastro
 * POST /api/mail/welcome
 * Body: { email, name, role }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email, name, role = "SENDER" } = body as { email?: string; name?: string; role?: string };

    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "E-mail inválido." }, { status: 400 });
    }

    // O envio é protegido contra quebra da thread principal
    const result = await sendWelcomeEmail({
      to: email.trim(),
      name: name || "Usuário Topiclog",
      role: role || "SENDER"
    });

    return NextResponse.json({
      ok: result.success,
      messageId: result.messageId || null,
      skipped: result.skipped || false
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[MAIL_WELCOME_ERROR] ${errorMsg}`);
    // Retorna 200 com ok: false para não quebrar a tela de cadastro
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 200 });
  }
}
