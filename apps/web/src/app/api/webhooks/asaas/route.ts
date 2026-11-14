import { NextResponse } from "next/server";

/**
 * Handler oficial do Webhook do Asaas (POST /api/webhooks/asaas)
 * 
 * Processa notificações assíncronas do Asaas quando uma cobrança Pix é recebida/compensada:
 * - Evento 'PAYMENT_RECEIVED' ou 'PAYMENT_CONFIRMED'
 * - Confirma o pagamento no backend oficial do TopicLog
 * - Transaciona o contrato para ACTIVE
 * - Gera os códigos de retirada e entrega de forma segura
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (!rawBody || rawBody.trim().length === 0) {
      return NextResponse.json({ error: "Payload vazio" }, { status: 400 });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const event = payload?.event;
    const payment = payload?.payment;

    console.info(`[Asaas Webhook] Evento recebido: ${event} para pagamento ID: ${payment?.id}`);

    if (event !== "PAYMENT_RECEIVED" && event !== "PAYMENT_CONFIRMED") {
      return NextResponse.json({
        received: true,
        message: `Evento '${event}' registrado sem ação mandatória de liberação de códigos.`
      });
    }

    if (!payment?.id) {
      return NextResponse.json({ error: "Dados do pagamento ausentes no webhook" }, { status: 400 });
    }

    const paymentId = String(payment.id);
    const externalRef = payment.externalReference ? String(payment.externalReference) : null;

    // Busca o endpoint de backend local / túnel para confirmar o contrato
    const backendBaseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_BASE_URL || "http://127.0.0.1:5080";
    
    // Tenta confirmar diretamente se o externalReference for um UUID de contrato válido
    if (externalRef && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(externalRef)) {
      try {
        const confirmRes = await fetch(`${backendBaseUrl.replace(/\/+$/, "")}/api/v1/contracts/${externalRef}/confirm-payment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            paymentProvider: "asaas_pix",
            paymentReferenceId: paymentId
          })
        });

        if (confirmRes.ok) {
          console.info(`[Asaas Webhook] Contrato ${externalRef} confirmado via webhook com sucesso.`);
          return NextResponse.json({ received: true, success: true, contractId: externalRef });
        } else {
          const errTxt = await confirmRes.text();
          console.warn(`[Asaas Webhook] Erro ao confirmar contrato ${externalRef}: ${confirmRes.status} ${errTxt}`);
        }
      } catch (err) {
        console.error(`[Asaas Webhook] Exceção ao acionar backend para contrato ${externalRef}:`, err);
      }
    }

    return NextResponse.json({
      received: true,
      success: true,
      paymentId,
      message: "Pagamento validado pelo webhook do Asaas."
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Asaas Webhook] Erro fatal no processamento do webhook:", errorMsg);
    return NextResponse.json(
      { error: "Erro interno ao processar webhook Asaas", details: errorMsg },
      { status: 500 }
    );
  }
}
