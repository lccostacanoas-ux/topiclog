import { NextResponse } from "next/server";
import { sendSupportContactEmail } from "@/lib/mail";

export const dynamic = "force-dynamic";

/**
 * Endpoint para envio direto e automático de mensagens para a administração/suporte
 * POST /api/mail/support
 * Body: { name, email, phone, subject, message }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { name, email, phone, subject, message } = body as {
      name?: string;
      email?: string;
      phone?: string;
      subject?: string;
      message?: string;
    };

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { ok: false, error: "Informe um e-mail válido para contato." },
        { status: 400 }
      );
    }

    if (!message || message.trim().length < 5) {
      return NextResponse.json(
        { ok: false, error: "Por favor, digite uma mensagem com mais detalhes (mínimo 5 caracteres)." },
        { status: 400 }
      );
    }

    const protocol = `TL-ADM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const { adminResult, userResult } = await sendSupportContactEmail({
      senderName: name || "Usuário Topiclog",
      senderEmail: email.trim(),
      senderPhone: phone || "",
      protocol,
      subject: subject || "Atendimento Geral",
      messageBody: message.trim()
    });

    if (!adminResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: adminResult.error || "Não foi possível enviar a mensagem para a administração no momento. Tente novamente."
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      protocol,
      message: "Mensagem registrada e enviada com sucesso para a equipe de atendimento!",
      userConfirmationSent: userResult.success
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json(
      { ok: false, error: `Falha interna no processamento: ${errorMsg}` },
      { status: 500 }
    );
  }
}
