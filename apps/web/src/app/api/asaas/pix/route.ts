import { NextResponse } from "next/server";

/**
 * Validação rigorosa de CRC16-CCITT para strings Pix (EMV QRCPS-MPM).
 * Padrão BACEN: Polinômio 0x1021, valor inicial 0xFFFF, finaliza com 6304XXXX.
 */
function isValidPixCrc16(payload: string): boolean {
  if (!payload || payload.length < 15) return false;
  if (!payload.startsWith("000201")) return false;
  
  const crcMatch = payload.match(/6304([0-9A-Fa-f]{4})$/);
  if (!crcMatch || !crcMatch[1]) return false;
  
  const expectedCrc = crcMatch[1].toUpperCase();
  const textToVerify = payload.slice(0, -4); // toda a string até '6304' inclusive
  
  let crc = 0xFFFF;
  for (let i = 0; i < textToVerify.length; i++) {
    crc ^= (textToVerify.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  const calculatedCrc = crc.toString(16).toUpperCase().padStart(4, "0");
  return calculatedCrc === expectedCrc;
}

/**
 * Resolução dinâmica do endpoint Asaas (Produção vs Sandbox)
 * Baseado no prefixo oficial da ASAAS_API_KEY:
 * - $aact_prod_ ou $aact_ (sem hmlg) -> https://api.asaas.com/v3
 * - $aact_hmlg_ ou contendo 'hmlg' / 'sandbox' -> https://sandbox.asaas.com/api/v3
 */
function resolveAsaasEndpoint(apiKey: string): { baseUrl: string; environment: "production" | "sandbox" } {
  if (process.env.ASAAS_BASE_URL) {
    const isSandbox = process.env.ASAAS_BASE_URL.includes("sandbox");
    return {
      baseUrl: process.env.ASAAS_BASE_URL.replace(/\/+$/, ""),
      environment: isSandbox ? "sandbox" : "production"
    };
  }

  const trimmedKey = (apiKey || "").trim();
  if (trimmedKey.startsWith("$aact_hmlg_") || trimmedKey.includes("hmlg") || process.env.ASAAS_ENVIRONMENT === "sandbox") {
    return { baseUrl: "https://sandbox.asaas.com/api/v3", environment: "sandbox" };
  }

  if (trimmedKey.startsWith("$aact_prod_") || (trimmedKey.startsWith("$aact_") && !trimmedKey.includes("hmlg")) || process.env.ASAAS_ENVIRONMENT === "production") {
    return { baseUrl: "https://api.asaas.com/v3", environment: "production" };
  }

  return process.env.NODE_ENV === "production" && process.env.ASAAS_ENVIRONMENT !== "sandbox"
    ? { baseUrl: "https://api.asaas.com/v3", environment: "production" }
    : { baseUrl: "https://sandbox.asaas.com/api/v3", environment: "sandbox" };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const amount = Math.max(1.0, Math.round(Number(body.amountReais || 1.0) * 100) / 100);
    const description = (body.description || "Frete TopicLog via Asaas").trim();
    const apiKey = (process.env.ASAAS_API_KEY || "").trim();
    const isKeyConfigured = apiKey.length > 10 && apiKey !== "SANDBOX_KEY_NOT_CONFIGURED";

    // 1. SE A CHAVE DO ASAAS ESTIVER CONFIGURADA: Comunicação direta com a API oficial do Asaas
    if (isKeyConfigured) {
      const { baseUrl, environment } = resolveAsaasEndpoint(apiKey);
      const cleanDoc = (body.payerCpfCnpj || "").replace(/\D/g, "");

      console.info(`[Asaas Pix] Criando cobrança de R$ ${amount.toFixed(2)} em ${baseUrl} (${environment})`);

      // A. Obter ou Criar Cliente no Asaas
      let customerId = "";
      const payerEmail = (body.payerEmail || "contato@topiclog.com.br").trim();
      const payerName = (body.payerName || "Cliente TopicLog").trim();

      try {
        const custQueryParam = (cleanDoc.length === 11 || cleanDoc.length === 14)
          ? `cpfCnpj=${cleanDoc}`
          : `email=${encodeURIComponent(payerEmail)}`;
        const findCustRes = await fetch(`${baseUrl}/customers?${custQueryParam}`, {
          headers: { access_token: apiKey }
        });
        if (findCustRes.ok) {
          const custData = await findCustRes.json();
          if (custData.data && custData.data.length > 0) {
            customerId = custData.data[0].id;
          }
        }
      } catch (err) {
        console.warn("[Asaas Pix] Falha na consulta de cliente existente:", err);
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
              name: payerName || "Remetente TopicLog",
              email: payerEmail || "contato@topiclog.com.br",
              cpfCnpj: (cleanDoc.length === 11 || cleanDoc.length === 14) ? cleanDoc : undefined
            })
          });
          if (createCustRes.ok) {
            const newCust = await createCustRes.json();
            customerId = newCust.id;
          } else {
            const errTxt = await createCustRes.text();
            console.warn("[Asaas Pix] Erro ao criar cliente Asaas:", createCustRes.status, errTxt);
            // Tenta fallback com nome e email genérico do pagador
            const fallbackCustRes = await fetch(`${baseUrl}/customers`, {
              method: "POST",
              headers: {
                access_token: apiKey,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                name: payerName || "Cliente TopicLog",
                email: payerEmail || "contato@topiclog.com.br"
              })
            });
            if (fallbackCustRes.ok) {
              const fallbackCust = await fallbackCustRes.json();
              customerId = fallbackCust.id;
            }
          }
        } catch (err) {
          console.warn("[Asaas Pix] Exceção ao cadastrar cliente:", err);
        }
      }

      if (!customerId) {
        return NextResponse.json(
          {
            error: "Falha ao registrar ou localizar cliente remetente no Asaas.",
            details: "O Asaas requer nome e e-mail válidos para emissão de cobranças Pix."
          },
          { status: 400 }
        );
      }

      // B. Criar a Cobrança Pix com Split no Asaas (dueDate: hoje)
      const today = new Date().toISOString().split("T")[0];
      const paymentPayload: Record<string, unknown> = {
        customer: customerId,
        billingType: "PIX",
        value: amount,
        dueDate: today,
        description: description,
        postalService: false
      };

      if (body.carrierWalletId) {
        const carrierWallet = String(body.carrierWalletId).trim();
        const isValidAsaasWallet = (carrierWallet.startsWith("wal_") || carrierWallet.startsWith("acc_")) && carrierWallet.length >= 10;
        if (isValidAsaasWallet) {
          const carrierSharePercent = body.carrierSharePercent || 80.0;
          paymentPayload.split = [
            {
              walletId: carrierWallet,
              percentualValue: carrierSharePercent
            }
          ];
        } else {
          console.info(`[Asaas Pix] Identificador "${carrierWallet}" não é uma subconta Asaas (wal_...). Frete retido em custódia na conta mestre TopicLog.`);
        }
      }

      const payRes = await fetch(`${baseUrl}/payments`, {
        method: "POST",
        headers: {
          access_token: apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(paymentPayload)
      });

      if (!payRes.ok) {
        const payErrText = await payRes.text();
        console.error(`[Asaas Pix] Erro HTTP ${payRes.status} ao criar cobrança:`, payErrText);
        let errorDetail = payErrText;
        try {
          const parsed = JSON.parse(payErrText);
          if (parsed.errors && parsed.errors.length > 0) {
            errorDetail = parsed.errors.map((e: { description: string }) => e.description).join("; ");
          }
        } catch {}

        return NextResponse.json(
          {
            error: "O Asaas recusou a criação da cobrança Pix.",
            details: errorDetail,
            statusCode: payRes.status
          },
          { status: 400 }
        );
      }

      const payData = await payRes.json();

      // C. Buscar QR Code Oficial e Payload Copia e Cola do Asaas
      const qrRes = await fetch(`${baseUrl}/payments/${payData.id}/pixQrCode`, {
        headers: { access_token: apiKey }
      });

      if (!qrRes.ok) {
        const qrErrText = await qrRes.text();
        console.error(`[Asaas Pix] Erro ao obter QR Code ${payData.id}:`, qrErrText);
        return NextResponse.json(
          {
            error: "Cobrança criada no Asaas, mas houve falha ao obter o QR Code oficial.",
            details: qrErrText,
            paymentId: payData.id
          },
          { status: 502 }
        );
      }

      const qrData = await qrRes.json();
      const rawPayload = (qrData.payload || "").trim();
      const encodedImage = qrData.encodedImage ? `data:image/png;base64,${qrData.encodedImage.trim()}` : "";

      // D. Validação estrita do padrão EMV / CRC16
      if (!rawPayload.startsWith("000201")) {
        console.error("[Asaas Pix] Payload retornado pelo Asaas não inicia com 000201:", rawPayload);
        return NextResponse.json(
          {
            error: "Código Pix retornado pelo Asaas possui formato EMV incompatível.",
            details: "Payload não inicia com 000201."
          },
          { status: 502 }
        );
      }

      const isCrcValid = isValidPixCrc16(rawPayload);
      if (!isCrcValid) {
        console.warn("[Asaas Pix] Aviso de integridade: CRC16 do payload retornado pelo Asaas divergiu:", rawPayload);
      }

      return NextResponse.json({
        id: payData.id,
        status: payData.status,
        statusDetail: "Cobrança Pix oficial gerada no Asaas com sucesso",
        qrCode: rawPayload,
        qrCodeBase64: encodedImage,
        ticketUrl: payData.invoiceUrl || payData.bankSlipUrl || "",
        transactionAmount: amount,
        carrierNetReceivable: body.carrierWalletId ? amount * 0.8 : amount,
        marketplaceFee: body.carrierWalletId ? amount * 0.2 : 0,
        createdAt: payData.dateCreated || new Date().toISOString(),
        isSandboxSimulator: false,
        isKeyConfigured: true,
        environment
      });
    }

    // 2. SE A CHAVE NÃO ESTIVER CONFIGURADA:
    // NUNCA montamos string Copia e Cola manualmente (para evitar o erro 2056 no app bancário).
    // Retornamos status explícito para o frontend orientar o cadastro da chave e permitir teste simulado seguro.
    const feePercent = 0.20;
    const marketplaceFee = Math.round(amount * feePercent * 100) / 100;
    const carrierNet = Math.round((amount - marketplaceFee) * 100) / 100;
    const simulatedId = `pay_asaas_demo_${Date.now()}`;

    console.warn("[Asaas Pix] Chave ASAAS_API_KEY ausente ou não configurada. Operando em modo de transição segura.");

    return NextResponse.json({
      id: simulatedId,
      status: "PENDING",
      statusDetail: "Chave ASAAS_API_KEY não configurada na Vercel",
      qrCode: "", // Não envia string falsa para impedir tentativa bancária que causaria Erro 2056
      qrCodeBase64: "",
      ticketUrl: "",
      transactionAmount: amount,
      carrierNetReceivable: carrierNet,
      marketplaceFee: marketplaceFee,
      createdAt: new Date().toISOString(),
      isSandboxSimulator: true,
      isKeyConfigured: false,
      environment: "sandbox"
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Asaas Pix] Exceção na rota POST /api/asaas/pix:", errorMsg);
    return NextResponse.json(
      {
        error: "Erro interno no servidor ao processar cobrança Asaas.",
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
  const isKeyConfigured = apiKey.length > 10 && apiKey !== "SANDBOX_KEY_NOT_CONFIGURED";

  if (isKeyConfigured && !paymentId.startsWith("pay_asaas_demo_") && !paymentId.startsWith("pay_asaas_sim_")) {
    try {
      const { baseUrl } = resolveAsaasEndpoint(apiKey);
      const res = await fetch(`${baseUrl}/payments/${encodeURIComponent(paymentId)}`, {
        headers: { access_token: apiKey }
      });
      if (res.ok) {
        const data = await res.json();
        const isApproved = data.status === "RECEIVED" || data.status === "CONFIRMED";
        return NextResponse.json({
          id: data.id,
          status: data.status,
          statusDetail: isApproved ? "Pagamento Pix compensado com sucesso no Asaas" : "Aguardando compensação bancária",
          isApproved
        });
      }
    } catch (err) {
      console.warn("[Asaas Pix] Erro ao consultar status no Asaas:", err);
    }
  }

  return NextResponse.json({
    id: paymentId,
    status: "PENDING",
    statusDetail: "Aguardando confirmação bancária Asaas",
    isApproved: false
  });
}
