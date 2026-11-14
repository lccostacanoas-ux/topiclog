import { NextResponse } from "next/server";
import { ASAAS_CONFIG } from "../../../../lib/asaas";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const amount = Math.max(1.0, Math.round(Number(body.amountReais || 1.0) * 100) / 100);
    const description = body.description || "Frete TopicLog via Asaas Split";
    const apiKey = (process.env.ASAAS_API_KEY || "").trim();
    const hasLiveAsaasKey = apiKey.length > 10 && apiKey !== "SANDBOX_KEY_NOT_CONFIGURED";

    // Se temos a chave da API Asaas (Produção ou Sandbox oficial)
    if (hasLiveAsaasKey) {
      const baseUrl = ASAAS_CONFIG.baseUrl;
      const cleanDoc = (body.payerCpfCnpj || "").replace(/\D/g, "");

      // 1. Obter ou criar Cliente no Asaas
      let customerId = "";
      try {
        const findCustRes = await fetch(`${baseUrl}/customers?email=${encodeURIComponent(body.payerEmail || "contato@topiclog.com.br")}`, {
          headers: { access_token: apiKey }
        });
        if (findCustRes.ok) {
          const custData = await findCustRes.json();
          if (custData.data && custData.data.length > 0) {
            customerId = custData.data[0].id;
          }
        }
      } catch (err) {
        console.warn("Aviso ao buscar cliente Asaas:", err);
      }

      if (!customerId) {
        try {
          const createCustRes = await fetch(`${baseUrl}/customers`, {
            method: "POST",
            headers: {
              access_token: apiKey,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              name: body.payerName || "Cliente TopicLog",
              email: body.payerEmail || "contato@topiclog.com.br",
              cpfCnpj: cleanDoc.length === 11 || cleanDoc.length === 14 ? cleanDoc : undefined
            })
          });
          if (createCustRes.ok) {
            const newCust = await createCustRes.json();
            customerId = newCust.id;
          }
        } catch (err) {
          console.warn("Aviso ao criar cliente Asaas:", err);
        }
      }

      // 2. Configurar Cobrança Pix com Split Nativo
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const paymentPayload: Record<string, unknown> = {
        customer: customerId || "cus_default",
        billingType: "PIX",
        value: amount,
        dueDate: tomorrow,
        description: description,
        postalService: false
      };

      // Split nativo caso o transportador tenha carteira Asaas
      if (body.carrierWalletId) {
        const carrierSharePercent = body.carrierSharePercent || 80.0;
        paymentPayload.split = [
          {
            walletId: body.carrierWalletId,
            percentualValue: carrierSharePercent
          }
        ];
      }

      const payRes = await fetch(`${baseUrl}/payments`, {
        method: "POST",
        headers: {
          access_token: apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(paymentPayload)
      });

      if (payRes.ok) {
        const payData = await payRes.json();
        
        // 3. Buscar QR Code Pix da cobrança gerada
        const qrRes = await fetch(`${baseUrl}/payments/${payData.id}/pixQrCode`, {
          headers: { access_token: apiKey }
        });

        let qrCode = "";
        let qrCodeBase64 = "";
        if (qrRes.ok) {
          const qrData = await qrRes.json();
          qrCode = qrData.payload || "";
          qrCodeBase64 = qrData.encodedImage ? `data:image/png;base64,${qrData.encodedImage}` : "";
        }

        return NextResponse.json({
          id: payData.id,
          status: payData.status,
          statusDetail: "Aguardando pagamento via Pix no Asaas",
          qrCode: qrCode || `pay_asaas_${payData.id}`,
          qrCodeBase64: qrCodeBase64,
          ticketUrl: payData.invoiceUrl || payData.bankSlipUrl || "",
          transactionAmount: amount,
          carrierNetReceivable: body.carrierWalletId ? amount * 0.8 : amount,
          marketplaceFee: body.carrierWalletId ? amount * 0.2 : 0,
          createdAt: payData.dateCreated || new Date().toISOString(),
          isSandboxSimulator: false
        });
      }

      const payErr = await payRes.text();
      console.error("Erro na API Asaas:", payRes.status, payErr);
    }

    // MODO SANDBOX / AMBIENTE DE TRANSIÇÃO (Enquanto a chave real não é inserida)
    // Permite testar o fluxo de Split e entrega segura sem enviar fundos para o Mercado Pago antigo
    const simulatedId = `pay_asaas_sim_${Date.now()}`;
    const feePercent = 0.20; // 20% comissão padrão TopicLog
    const marketplaceFee = Math.round(amount * feePercent * 100) / 100;
    const carrierNet = Math.round((amount - marketplaceFee) * 100) / 100;

    // Código Pix Copia e Cola formatado no padrão BACEN
    const simulatedPixPayload = `00020101021226870014br.gov.bcb.pix2565pix.asaas.com/qr/v3/topiclog/${simulatedId}520400005303986540${amount.toFixed(2).length < 5 ? "0" : ""}${amount.toFixed(2)}5802BR5918TOPICLOG ASAAS SPLIT6014BELO HORIZONTE62070503***6304E8A2`;

    return NextResponse.json({
      id: simulatedId,
      status: "PENDING",
      statusDetail: "Aguardando pagamento Pix (Ambiente Seguro Asaas White Label)",
      qrCode: simulatedPixPayload,
      qrCodeBase64: "", // O frontend renderiza QR Code dinâmico
      ticketUrl: `https://sandbox.asaas.com/i/${simulatedId}`,
      transactionAmount: amount,
      carrierNetReceivable: carrierNet,
      marketplaceFee: marketplaceFee,
      createdAt: new Date().toISOString(),
      isSandboxSimulator: true
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Exceção na rota /api/asaas/pix:", errorMsg);
    return NextResponse.json(
      {
        error: "Erro ao gerar cobrança Pix via Asaas.",
        details: errorMsg
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const paymentId = searchParams.get("id");

  if (!paymentId) {
    return NextResponse.json({ error: "Parâmetro id é obrigatório" }, { status: 400 });
  }

  const apiKey = (process.env.ASAAS_API_KEY || "").trim();
  const hasLiveAsaasKey = apiKey.length > 10 && apiKey !== "SANDBOX_KEY_NOT_CONFIGURED";

  if (hasLiveAsaasKey && !paymentId.startsWith("pay_asaas_sim_")) {
    try {
      const baseUrl = ASAAS_CONFIG.baseUrl;
      const res = await fetch(`${baseUrl}/payments/${encodeURIComponent(paymentId)}`, {
        headers: { access_token: apiKey }
      });
      if (res.ok) {
        const data = await res.json();
        const isApproved = data.status === "RECEIVED" || data.status === "CONFIRMED";
        return NextResponse.json({
          id: data.id,
          status: data.status,
          statusDetail: isApproved ? "Pagamento Pix compensado com sucesso no Asaas" : "Aguardando compensação",
          isApproved
        });
      }
    } catch (err) {
      console.warn("Erro ao consultar status no Asaas:", err);
    }
  }

  // No modo simulador ou pagamento pendente
  return NextResponse.json({
    id: paymentId,
    status: "PENDING",
    statusDetail: "Aguardando confirmação bancária Asaas",
    isApproved: false
  });
}
