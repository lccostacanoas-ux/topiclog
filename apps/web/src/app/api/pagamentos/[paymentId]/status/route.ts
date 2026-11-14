import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const { paymentId } = await params;

  if (!paymentId) {
    return NextResponse.json({ error: "paymentId é obrigatório" }, { status: 400 });
  }

  const apiKey = (
    process.env.ASAAS_API_KEY ||
    process.env.ASAAS_ACCESS_TOKEN ||
    process.env.ASAAS_TOKEN ||
    ""
  ).trim();
  const isKeyConfigured = apiKey.length > 10 && apiKey !== "SANDBOX_KEY_NOT_CONFIGURED";

  if (isKeyConfigured && !paymentId.startsWith("pay_asaas_demo_") && !paymentId.startsWith("pay_asaas_sim_")) {
    try {
      const customUrl = (process.env.ASAAS_API_URL || process.env.ASAAS_BASE_URL || "").trim();
      const isExplicitSandbox = (process.env.ASAAS_ENV || process.env.ASAAS_ENVIRONMENT || "").toLowerCase().trim() === "sandbox" || apiKey.includes("hmlg");
      const baseUrl = customUrl || (isExplicitSandbox ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/v3");
      
      const res = await fetch(`${baseUrl}/payments/${encodeURIComponent(paymentId)}`, {
        headers: { access_token: apiKey }
      });

      if (res.ok) {
        const data = await res.json();
        const isApproved = data.status === "RECEIVED" || data.status === "CONFIRMED";
        return NextResponse.json({
          id: data.id,
          status: data.status,
          isApproved,
          message: isApproved
            ? "Pagamento Confirmado! Códigos de Início e Entrega gerados."
            : "Aguardando confirmação bancária Asaas.",
          paymentProvider: "asaas_pix"
        });
      }
    } catch (err) {
      console.warn("[Pagamentos Status] Erro ao consultar Asaas:", err);
    }
  }

  return NextResponse.json({
    id: paymentId,
    status: "PENDING",
    isApproved: false,
    message: "Aguardando confirmação bancária."
  });
}
