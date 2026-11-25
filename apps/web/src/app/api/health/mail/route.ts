import { NextResponse } from "next/server";
import { getMailTransporter, sendMail, sendWelcomeEmail, sendShipmentNotificationEmail, sendPasswordResetEmail } from "@/lib/mail";

export const dynamic = "force-dynamic";

/**
 * Endpoint de diagnóstico seguro para testar a conectividade SMTP do Mailbux
 * POST /api/health/mail
 * Body: { "to": "usuario@exemplo.com.br", "type": "test" | "welcome" | "shipment" | "reset" }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { to, type = "test" } = body as { to?: string; type?: string };

    if (!to || typeof to !== "string" || !to.includes("@")) {
      return NextResponse.json(
        {
          ok: false,
          error: "O campo 'to' com um e-mail válido é obrigatório no corpo da requisição."
        },
        { status: 400 }
      );
    }

    const host = process.env.SMTP_HOST || "my.mailbux.com";
    const port = parseInt(process.env.SMTP_PORT || "465", 10);
    const secure = process.env.SMTP_SECURE === "true" || port === 465;
    const user = process.env.SMTP_USER || "topiclog@topiclog.com.br";
    const pass = process.env.SMTP_PASS || "";
    const from = process.env.SMTP_FROM || `Topiclog <${user}>`;

    // 1. Verificação prévia de conectividade no transporte SMTP
    const transporter = getMailTransporter();
    let verifyStatus: { verified: boolean; message?: string } = { verified: false };
    
    if (pass && pass.trim().length > 0) {
      try {
        await transporter.verify();
        verifyStatus = { verified: true, message: "Conexão com servidor SMTP estabelecida com sucesso." };
      } catch (verifyErr: unknown) {
        const verifyMsg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        verifyStatus = { verified: false, message: `Falha na verificação SMTP: ${verifyMsg}` };
      }
    } else {
      verifyStatus = { verified: false, message: "SMTP_PASS não informada. Disparo operando em modo de simulação segura." };
    }

    // 2. Disparo baseado no tipo solicitado
    let sendResult;
    if (type === "welcome") {
      sendResult = await sendWelcomeEmail({
        to,
        name: "Testador Topiclog",
        role: "CARRIER"
      });
    } else if (type === "shipment") {
      sendResult = await sendShipmentNotificationEmail({
        to,
        recipientName: "Testador Topiclog",
        shipmentTitle: "Carga de Teste • Eletrônicos e Encomendas",
        originCity: "Belo Horizonte / MG",
        destinationCity: "São Paulo / SP",
        estimatedValue: 350.0,
        status: "PUBLICADO"
      });
    } else if (type === "reset") {
      sendResult = await sendPasswordResetEmail({
        to,
        recipientName: "Testador Topiclog",
        resetCode: "749215",
        expiresInMinutes: 15
      });
    } else {
      // Teste padrão
      sendResult = await sendMail({
        to,
        subject: "Topiclog • Teste de Conexão SMTP (Mailbux)",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #0F172A;">
            <h2 style="color: #2563EB;">Teste de Conectividade SMTP Topiclog</h2>
            <p>Este é um e-mail de teste transacional disparado a partir da aplicação Topiclog via Mailbux.</p>
            <p><strong>Horário de Envio (UTC):</strong> ${new Date().toISOString()}</p>
            <p><strong>Servidor SMTP:</strong> ${host}:${port} (SSL: ${secure})</p>
            <p><strong>Remetente Oficial:</strong> ${from}</p>
            <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 16px 0;" />
            <p style="font-size: 12px; color: #64748B;">Operação nacional ativa para todos os 5.570 municípios do Brasil.</p>
          </div>
        `
      });
    }

    return NextResponse.json({
      ok: sendResult.success,
      type,
      to,
      messageId: sendResult.messageId || null,
      error: sendResult.error || null,
      skipped: sendResult.skipped || false,
      smtpConfig: {
        host,
        port,
        secure,
        user,
        from,
        hasPasswordConfigured: Boolean(pass && pass.trim().length > 0)
      },
      connectionVerification: verifyStatus
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: `Erro inesperado na rota de diagnóstico de e-mail: ${errorMsg}`
      },
      { status: 500 }
    );
  }
}
