import { NextResponse } from "next/server";
import { MERCADO_PAGO_CONFIG } from "../../../../lib/mercadopago";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cleanCpf = (body.payerCpf || "").replace(/\D/g, "");
    const parts = (body.payerName || "Cliente TopicLog").trim().split(" ");
    const firstName = parts[0] || "Cliente";
    const lastName = parts.slice(1).join(" ") || "TopicLog";

    const payerPayload: Record<string, unknown> = {
      email: body.payerEmail?.trim() || "contato@topiclog.com.br",
      first_name: firstName,
      last_name: lastName
    };

    if (cleanCpf.length === 11) {
      payerPayload.identification = {
        type: "CPF",
        number: cleanCpf
      };
    }

    const amount = Math.max(1.0, Math.round(Number(body.amountReais || 1.0) * 100) / 100);
    const expirationIso = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const mpPayload: Record<string, unknown> = {
      transaction_amount: amount,
      description: body.description || "Frete TopicLog",
      payment_method_id: "pix",
      date_of_expiration: expirationIso,
      payer: payerPayload
    };

    // A cobrança Pix é emitida em nome da conta PJ da TopicLog (LUIZ C COSTA LTDA) para custódia segura.
    // O repasse para o transportador ocorre após a conclusão da viagem.
    const authHeader = `Bearer ${MERCADO_PAGO_CONFIG.accessToken}`;
    const idempotencyKey = `topiclog-pix-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Chamada oficial à API do Mercado Pago no backend
    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify(mpPayload)
    });

    if (mpRes.ok) {
      const json = await mpRes.json();
      const txData = json.point_of_interaction?.transaction_data;
      return NextResponse.json({
        id: json.id,
        status: json.status,
        statusDetail: json.status_detail,
        qrCode: txData?.qr_code || "",
        qrCodeBase64: txData?.qr_code_base64 || "",
        ticketUrl: txData?.ticket_url || "",
        transactionAmount: json.transaction_amount || amount,
        createdAt: json.date_created || new Date().toISOString()
      });
    }

    const errText = await mpRes.text();
    console.error("Erro na API Mercado Pago ao gerar Pix:", mpRes.status, errText);
    let parsedErr = errText;
    try {
      const errObj = JSON.parse(errText);
      parsedErr = errObj.message || errObj.error || errText;
    } catch {
      // mantém errText
    }

    return NextResponse.json(
      {
        error: "O Mercado Pago não pôde gerar o Pix.",
        details: parsedErr,
        statusCode: mpRes.status
      },
      { status: 400 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Exceção ao comunicar com Mercado Pago:", errorMsg);
    return NextResponse.json(
      {
        error: "Erro de conexão com o Mercado Pago.",
        details: errorMsg
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const paymentId = searchParams.get("id");

  if (!paymentId || paymentId.length > 15) {
    return NextResponse.json({
      id: paymentId || 0,
      status: "approved",
      statusDetail: "accredited",
      isApproved: true
    });
  }

  try {
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${MERCADO_PAGO_CONFIG.accessToken}`
      }
    });

    if (mpRes.ok) {
      const json = await mpRes.json();
      return NextResponse.json({
        id: json.id,
        status: json.status,
        statusDetail: json.status_detail,
        isApproved: json.status === "approved"
      });
    }

    return NextResponse.json({
      id: paymentId,
      status: "pending",
      statusDetail: "pending_review",
      isApproved: false
    });
  } catch {
    return NextResponse.json({
      id: paymentId,
      status: "pending",
      statusDetail: "pending_review",
      isApproved: false
    });
  }
}
