import { NextResponse } from "next/server";
import { sendShipmentNotificationEmail } from "@/lib/mail";

export const dynamic = "force-dynamic";

/**
 * Endpoint para disparo do e-mail de Notificação de Frete
 * POST /api/mail/shipment
 * Body: { email, name, title, originCity, destinationCity, estimatedValue, status, actionUrl, actionText }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      email,
      name,
      title,
      originCity,
      destinationCity,
      estimatedValue,
      status = "PUBLICADO",
      actionUrl,
      actionText
    } = body as {
      email?: string;
      name?: string;
      title?: string;
      originCity?: string;
      destinationCity?: string;
      estimatedValue?: number | string;
      status?: string;
      actionUrl?: string;
      actionText?: string;
    };

    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "E-mail inválido." }, { status: 400 });
    }

    const result = await sendShipmentNotificationEmail({
      to: email.trim(),
      recipientName: name || "Usuário Topiclog",
      shipmentTitle: title || "Carga Topiclog",
      originCity: originCity || "Origem",
      destinationCity: destinationCity || "Destino",
      estimatedValue,
      status,
      actionUrl,
      actionText
    });

    return NextResponse.json({
      ok: result.success,
      messageId: result.messageId || null,
      skipped: result.skipped || false
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[MAIL_SHIPMENT_ERROR] ${errorMsg}`);
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 200 });
  }
}
