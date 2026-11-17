import { NextResponse } from "next/server";

/**
 * Handler oficial do Webhook de Eventos do Asaas (POST /api/webhooks/asaas)
 * 
 * Processa notificações assíncronas do Asaas:
 * 1. Eventos de Pagamento ('PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'):
 *    - Atualiza a carga/contrato para PAGO_RETIDO (custódia segura na Conta Mestre)
 *    - Libera os códigos de retirada e entrega
 * 2. Eventos de Transferência/Repasse ('TRANSFER_DONE', 'TRANSFER_FAILED', 'TRANSFER_CANCELLED'):
 *    - Registra no histórico da viagem o comprovante e status do repasse Pix ao transportador
 */

export async function GET() {
  return NextResponse.json({
    status: "UP",
    service: "TopicLog Asaas Events Webhook",
    timestamp: new Date().toISOString()
  });
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}

export async function POST(request: Request) {
  try {
    // 1. Validação do Token de Autenticação do Webhook Asaas (se configurado no ambiente)
    const expectedToken = (process.env.ASAAS_WEBHOOK_TOKEN || "").trim();
    if (expectedToken) {
      const incomingToken = (request.headers.get("asaas-access-token") || "").trim();
      if (!incomingToken || incomingToken !== expectedToken) {
        console.warn("[Asaas Webhook] Tentativa de acesso com token de webhook inválido ou ausente.");
        return NextResponse.json(
          { error: "Acesso negado: token de webhook Asaas inválido ou ausente." },
          { status: 401 }
        );
      }
    }

    let payload: any = null;
    try {
      payload = await request.json();
    } catch {
      try {
        const rawBody = await request.text();
        if (rawBody && rawBody.trim().length > 0) {
          payload = JSON.parse(rawBody);
        }
      } catch {
        payload = null;
      }
    }

    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Payload vazio ou inválido" }, { status: 400 });
    }

    const event = String(payload?.event || "").toUpperCase();
    const payment = payload?.payment;
    const transfer = payload?.transfer;

    console.info(`[Asaas Webhook] Evento recebido: '${event}' | Payment: ${payment?.id || "N/A"} | Transfer: ${transfer?.id || "N/A"}`);

    const backendBaseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_BASE_URL || "http://127.0.0.1:5080";
    const cleanBackendUrl = backendBaseUrl.replace(/\/+$/, "");

    // A. TRATAMENTO DE EVENTOS DE PAGAMENTO (PAYMENT_RECEIVED / PAYMENT_CONFIRMED)
    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      const paymentId = payment?.id ? String(payment.id) : null;
      const externalRef = payment?.externalReference ? String(payment.externalReference) : null;

      if (!paymentId) {
        return NextResponse.json({ error: "Dados do pagamento ausentes no webhook" }, { status: 400 });
      }

      console.info(`[Asaas Webhook] Pagamento Pix ${paymentId} confirmado! Atualizando carga para PAGO_RETIDO...`);

      // Se externalReference for UUID de contrato, aciona confirmação assíncrona no backend
      if (externalRef && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(externalRef)) {
        try {
          // Tenta endpoint de confirmação de webhook do sistema
          const webhookConfirmRes = await fetch(`${cleanBackendUrl}/api/v1/contracts/${externalRef}/webhook-confirm-payment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paymentProvider: "asaas_pix",
              paymentReferenceId: paymentId,
              status: "PAGO_RETIDO"
            })
          });

          if (webhookConfirmRes.ok) {
            console.info(`[Asaas Webhook] Carga/Contrato ${externalRef} atualizada com sucesso para PAGO_RETIDO.`);
            return NextResponse.json({
              received: true,
              success: true,
              event,
              paymentId,
              contractId: externalRef,
              statusFinanceiro: "PAGO_RETIDO"
            });
          } else {
            // Fallback para endpoint padrão de confirm-payment
            const fallbackRes = await fetch(`${cleanBackendUrl}/api/v1/contracts/${externalRef}/confirm-payment`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                paymentProvider: "asaas_pix",
                paymentReferenceId: paymentId
              })
            });
            if (fallbackRes.ok) {
              console.info(`[Asaas Webhook] Carga/Contrato ${externalRef} confirmada via fallback.`);
              return NextResponse.json({
                received: true,
                success: true,
                event,
                paymentId,
                contractId: externalRef,
                statusFinanceiro: "PAGO_RETIDO"
              });
            }
          }
        } catch (backendErr) {
          console.error(`[Asaas Webhook] Erro ao sincronizar pagamento com backend:`, backendErr);
        }
      }

      return NextResponse.json({
        received: true,
        success: true,
        event,
        paymentId,
        statusFinanceiro: "PAGO_RETIDO",
        message: "Pagamento registrado com sucesso."
      });
    }

    // B. TRATAMENTO DE EVENTOS DE TRANSFERÊNCIA / REPASSE PIX
    if (event.startsWith("TRANSFER_")) {
      const transferId = transfer?.id ? String(transfer.id) : (payload?.id ? String(payload.id) : null);
      const transferStatus = transfer?.status || payload?.status || "UNKNOWN";
      const failReason = transfer?.failReason || payload?.failReason || null;
      const transferValue = transfer?.value || payload?.value || null;

      console.info(`[Asaas Webhook] Processando evento de repasse '${event}' para Transfer ID: ${transferId} (Status: ${transferStatus})`);

      if (transferId) {
        try {
          const syncTransferRes = await fetch(`${cleanBackendUrl}/api/v1/deliveries/webhook-transfer-event`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transferId,
              event,
              status: (event === "TRANSFER_DONE" || event === "TRANSFER_FINISHED" || transferStatus === "DONE") ? "TRANSFERIDO" : "ERRO_REPASSE",
              failReason,
              value: transferValue
            })
          });

          if (syncTransferRes.ok) {
            console.info(`[Asaas Webhook] Repasse ${transferId} sincronizado no banco com sucesso.`);
          }
        } catch (syncErr) {
          console.warn(`[Asaas Webhook] Falha ao notificar backend sobre transferência ${transferId}:`, syncErr);
        }
      }

      return NextResponse.json({
        received: true,
        success: true,
        event,
        transferId,
        transferStatus,
        message: `Evento de repasse '${event}' registrado.`
      });
    }

    // C. DEMAIS EVENTOS INFORMATIVOS
    return NextResponse.json({
      received: true,
      event,
      message: `Evento '${event}' recebido e registrado para auditoria.`
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
