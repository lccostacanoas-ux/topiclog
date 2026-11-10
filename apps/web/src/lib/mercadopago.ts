/**
 * TopicLog • Integração Mercado Pago Produção
 * CNPJ: 11.776.398/0001-79 (LUIZ C COSTA LTDA)
 */

export const MERCADO_PAGO_CONFIG = {
  accessToken: "APP_USR-6207551432315578-111012-c5c763c7211397cc184a4c3a871839b5-3829261083",
  publicKey: "APP_USR-321829da-c4c0-4ea6-8d2f-7e904dcf4429",
  clientId: "6207551432315578"
};

export interface CreatePixParams {
  amountReais: number;
  description: string;
  payerEmail: string;
  payerName?: string;
  payerCpf?: string;
  orderId?: string;
}

export interface MercadoPagoPixData {
  id: number;
  status: "pending" | "approved" | "cancelled" | "rejected" | string;
  statusDetail: string;
  qrCode: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  transactionAmount: number;
  createdAt: string;
}

export async function createMercadoPagoPix(params: CreatePixParams): Promise<MercadoPagoPixData> {
  const cleanCpf = (params.payerCpf || "").replace(/\D/g, "");
  const parts = (params.payerName || "Cliente TopicLog").trim().split(" ");
  const firstName = parts[0] || "Cliente";
  const lastName = parts.slice(1).join(" ") || "TopicLog";

  const payerPayload: Record<string, unknown> = {
    email: params.payerEmail?.trim() || "contato@topiclog.com.br",
    first_name: firstName,
    last_name: lastName
  };

  if (cleanCpf.length === 11) {
    payerPayload.identification = {
      type: "CPF",
      number: cleanCpf
    };
  }

  const amount = Math.max(1.0, Math.round(params.amountReais * 100) / 100);

  const body = {
    transaction_amount: amount,
    description: params.description || "Frete TopicLog",
    payment_method_id: "pix",
    payer: payerPayload
  };

  const idempotencyKey = `topiclog-pix-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const response = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MERCADO_PAGO_CONFIG.accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(
      errorJson.message || `Erro ${response.status} ao gerar cobrança Pix no Mercado Pago.`
    );
  }

  const json = await response.json();
  const txData = json.point_of_interaction?.transaction_data;

  return {
    id: json.id,
    status: json.status,
    statusDetail: json.status_detail,
    qrCode: txData?.qr_code || "",
    qrCodeBase64: txData?.qr_code_base64 || "",
    ticketUrl: txData?.ticket_url || "",
    transactionAmount: json.transaction_amount || amount,
    createdAt: json.date_created || new Date().toISOString()
  };
}

export async function checkMercadoPagoPixStatus(paymentId: number | string): Promise<{
  id: number;
  status: string;
  statusDetail: string;
  isApproved: boolean;
}> {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${MERCADO_PAGO_CONFIG.accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Erro ${response.status} ao verificar status do pagamento.`);
  }

  const json = await response.json();
  return {
    id: json.id,
    status: json.status,
    statusDetail: json.status_detail,
    isApproved: json.status === "approved"
  };
}
