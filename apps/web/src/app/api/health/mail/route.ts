import { NextResponse } from "next/server";
import {
  getMailTransporter,
  sendMail,
  sendWelcomeEmail,
  sendShipmentNotificationEmail,
  sendPasswordResetEmail
} from "@/lib/mail";

export const dynamic = "force-dynamic";

/**
 * Endpoint de diagnóstico seguro para testar a conectividade SMTP do Mailbux
 * Blindado em ambiente de produção com validação de token e restrição de destinatário.
 * POST /api/health/mail
 * Headers: x-health-token ou Authorization: Bearer <HEALTH_CHECK_TOKEN>
 * Body: { "to": "topiclog@topiclog.com.br", "type": "test" | "welcome" | "shipment" | "reset" }
 */
export async function POST(request: Request) {
  const isProduction = process.env.NODE_ENV === "production";
  const healthToken = process.env.HEALTH_CHECK_TOKEN;
  const providedToken =
    request.headers.get("x-health-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  // 1. Blindagem em Produção: Se o token não for informado ou não coincidir, retorna 404 imediato (como se a rota não existisse)
  if (isProduction) {
    if (!healthToken || !providedToken || providedToken !== healthToken) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
  }

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

    // 2. Restrição de Destinatário: Diagnóstico restrito exclusivamente à administração
    const adminUser = (process.env.SMTP_USER || "topiclog@topiclog.com.br").trim().toLowerCase();
    const allowedRecipients = new Set(["topiclog@topiclog.com.br", adminUser]);

    if (!allowedRecipients.has(to.trim().toLowerCase())) {
      return NextResponse.json(
        {
          ok: false,
          error: "Envio de diagnóstico restrito aos endereços administrativos autorizados da Topiclog."
        },
        { status: 403 }
      );
    }

    const host = process.env.SMTP_HOST || "my.mailbux.com";
    const port = parseInt(process.env.SMTP_PORT || "465", 10);
    const secure = process.env.SMTP_SECURE === "true" || port === 465;
    const user = process.env.SMTP_USER || "topiclog@topiclog.com.br";
    const pass = process.env.SMTP_PASS || "";
    const from = process.env.SMTP_FROM || `Topiclog <${user}>`;

    // Verificação de conectividade prévia
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

    // Disparo baseado no tipo solicitado
    let sendResult;
    if (type === "welcome") {
      sendResult = await sendWelcomeEmail({
        to: to.trim(),
        name: "Administrador Topiclog",
        role: "CARRIER"
      });
    } else if (type === "shipment") {
      sendResult = await sendShipmentNotificationEmail({
        to: to.trim(),
        recipientName: "Administrador Topiclog",
        shipmentTitle: "Carga de Diagnóstico Técnico",
        originCity: "Belo Horizonte / MG",
        destinationCity: "São Paulo / SP",
        estimatedValue: 350.0,
        status: "PUBLICADO"
      });
    } else if (type === "reset") {
      sendResult = await sendPasswordResetEmail({
        to: to.trim(),
        recipientName: "Administrador Topiclog",
        resetCode: "749215",
        expiresInMinutes: 15
      });
    } else {
      sendResult = await sendMail({
        to: to.trim(),
        subject: "Topiclog • Teste de Diagnóstico SMTP Blindado",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #0F172A;">
            <h2 style="color: #2563EB;">Diagnóstico Técnico Topiclog</h2>
            <p>Este é um disparo de validação autenticado via token de segurança.</p>
            <p><strong>Horário de Envio (UTC):</strong> ${new Date().toISOString()}</p>
            <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 16px 0;" />
            <p style="font-size: 12px; color: #64748B;">Operação nacional ativa em todos os 5.570 municípios do Brasil.</p>
          </div>
        `
      });
    }

    // 3. Ocultar detalhes internos de infraestrutura em ambiente de produção
    const responsePayload: Record<string, unknown> = {
      ok: sendResult.success,
      type,
      to: to.trim(),
      messageId: sendResult.messageId || null,
      error: sendResult.error || null,
      skipped: sendResult.skipped || false
    };

    if (!isProduction) {
      responsePayload.smtpConfig = {
        host,
        port,
        secure,
        user,
        from,
        hasPasswordConfigured: Boolean(pass && pass.trim().length > 0)
      };
      responsePayload.connectionVerification = verifyStatus;
    }

    return NextResponse.json(responsePayload);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: `Erro ao processar diagnóstico de e-mail: ${errorMsg}`
      },
      { status: 500 }
    );
  }
}

// 4. Caso tente GET em produção ou desenvolvimento, retorna 404
export async function GET() {
  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}
