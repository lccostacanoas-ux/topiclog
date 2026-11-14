/**
 * TopicLog • Integração Asaas Pagamentos & Split Nativo (API v3)
 * CNPJ TopicLog: 11.776.398/0001-79 (LUIZ C COSTA LTDA)
 */

export const ASAAS_CONFIG = {
  apiKey: process.env.ASAAS_API_KEY || "",
  environment: process.env.ASAAS_ENVIRONMENT || "sandbox",
  baseUrl: process.env.ASAAS_BASE_URL || (process.env.ASAAS_ENVIRONMENT === "production" ? "https://api.asaas.com/v3" : "https://sandbox.asaas.com/api/v3")
};

export interface CreateAsaasPixParams {
  amountReais: number;
  description: string;
  payerEmail: string;
  payerName?: string;
  payerCpfCnpj?: string;
  orderId?: string;
  carrierWalletId?: string;
  carrierSharePercent?: number;
  marketplaceFeeReais?: number;
}

export interface AsaasPixData {
  id: string;
  status: "PENDING" | "RECEIVED" | "CONFIRMED" | "OVERDUE" | "REFUNDED" | string;
  statusDetail: string;
  qrCode: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  transactionAmount: number;
  carrierNetReceivable?: number;
  marketplaceFee?: number;
  createdAt: string;
  isSandboxSimulator?: boolean;
  isKeyConfigured?: boolean;
  environment?: "production" | "sandbox";
}

export async function createAsaasPix(params: CreateAsaasPixParams): Promise<AsaasPixData> {
  const amount = Math.max(1.0, Math.round(params.amountReais * 100) / 100);

  const res = await fetch("/api/asaas/pix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amountReais: amount,
      description: params.description,
      payerEmail: params.payerEmail,
      payerName: params.payerName,
      payerCpfCnpj: params.payerCpfCnpj,
      orderId: params.orderId,
      carrierWalletId: params.carrierWalletId,
      carrierSharePercent: params.carrierSharePercent,
      marketplaceFeeReais: params.marketplaceFeeReais
    })
  });

  if (res.ok) {
    const data = await res.json();
    return data as AsaasPixData;
  }

  const errJson = await res.json().catch(() => null);
  const errMsg = errJson?.details || errJson?.error || `Falha ao gerar cobrança Pix via Asaas (HTTP ${res.status})`;
  throw new Error(errMsg);
}

export async function checkAsaasPixStatus(paymentId: string): Promise<{
  id: string;
  status: string;
  statusDetail: string;
  isApproved: boolean;
}> {
  try {
    const res = await fetch(`/api/asaas/pix?id=${encodeURIComponent(paymentId)}`);
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch {
    // fallback
  }

  return {
    id: paymentId,
    status: "PENDING",
    statusDetail: "Aguardando confirmação bancária",
    isApproved: false
  };
}
