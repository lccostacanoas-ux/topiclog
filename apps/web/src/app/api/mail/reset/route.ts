import { NextResponse } from "next/server";
import { sendPasswordResetEmail } from "@/lib/mail";

export const dynamic = "force-dynamic";

/**
 * Endpoint para envio de código de recuperação de senha
 * POST /api/mail/reset
 * Body: { email, code, name }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email, code, name } = body as { email?: string; code?: string; name?: string };

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { ok: false, error: "Informe um e-mail válido para recuperação." },
        { status: 400 }
      );
    }

    if (!code || code.trim().length !== 6) {
      return NextResponse.json(
        { ok: false, error: "Código numérico de 6 dígitos obrigatório." },
        { status: 400 }
      );
    }

    const result = await sendPasswordResetEmail({
      to: email.trim(),
      recipientName: name || "Usuário Topiclog",
      resetCode: code.trim(),
      expiresInMinutes: 15
    });

    if (!result.success) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error || "Não foi possível enviar o e-mail de recuperação de senha. Tente novamente em instantes."
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      messageId: result.messageId || null,
      message: "Se o e-mail informado estiver cadastrado, enviamos um código de 6 dígitos válido por 15 minutos."
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[MAIL_RESET_ERROR] ${errorMsg}`);
    return NextResponse.json(
      { ok: false, error: "Falha interna ao processar a solicitação de redefinição de senha." },
      { status: 500 }
    );
  }
}
