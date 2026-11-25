import nodemailer from "nodemailer";

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface MailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * Obtém a URL base da aplicação
 */
export function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.trim().length > 0) {
    return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/+$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.trim().replace(/\/+$/, "")}`;
  }
  return "https://www.topiclog.com.br";
}

/**
 * Cria ou obtém a instância configurada do transportador Nodemailer
 */
export function getMailTransporter() {
  const host = process.env.SMTP_HOST || "my.mailbux.com";
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER || "topiclog@topiclog.com.br";
  const pass = process.env.SMTP_PASS || "";

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    },
    tls: {
      rejectUnauthorized: true
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000
  });
}

/**
 * Envio centralizado e seguro de e-mails transacionais via SMTP Mailbux.
 * Protegido por try/catch para garantir operação não-bloqueante nos fluxos do sistema.
 */
export async function sendMail(options: MailOptions): Promise<MailResult> {
  const { to, subject, html, text } = options;
  const host = process.env.SMTP_HOST || "my.mailbux.com";
  const user = process.env.SMTP_USER || "topiclog@topiclog.com.br";
  const pass = process.env.SMTP_PASS || "";
  const from = process.env.SMTP_FROM || `Topiclog <${user}>`;

  // Se a senha de app do SMTP não foi configurada, não quebra a aplicação: registra log e simula sucesso
  if (!pass || pass.trim().length === 0) {
    console.warn(
      `[MAIL_SKIPPED] SMTP_PASS não configurada no ambiente. E-mail transacional simulado com sucesso para: ${to} | Assunto: "${subject}"`
    );
    return {
      success: true,
      skipped: true,
      messageId: `simulated-mock-${Date.now()}`
    };
  }

  try {
    const transporter = getMailTransporter();
    const info = await transporter.sendMail({
      from,
      to: to.trim(),
      replyTo: options.replyTo ? options.replyTo.trim() : undefined,
      subject,
      text: text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      html
    });

    console.info(`[MAIL_SENT] E-mail enviado com sucesso via SMTP (${host}) para ${to}. MessageId: ${info.messageId}`);
    return {
      success: true,
      messageId: info.messageId
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[MAIL_ERROR] Falha no envio de e-mail para ${to} via SMTP: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Layout base responsivo padrão com a identidade visual da Topiclog
 */
function wrapTopiclogTemplate(contentHtml: string): string {
  const appUrl = getAppBaseUrl();
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Topiclog</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #F8FAFC;
      padding: 32px 16px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #FFFFFF;
      border-radius: 12px;
      border: 1px solid #E2E8F0;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .header {
      background-color: #0F172A;
      padding: 24px 32px;
      text-align: left;
      border-bottom: 3px solid #2563EB;
    }
    .logo-badge {
      display: inline-block;
      background-color: #2563EB;
      color: #FFFFFF;
      font-weight: 800;
      font-size: 14px;
      padding: 4px 10px;
      border-radius: 6px;
      letter-spacing: 0.5px;
      margin-right: 8px;
    }
    .brand-title {
      color: #FFFFFF;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.5px;
      vertical-align: middle;
    }
    .body-content {
      padding: 32px;
      line-height: 1.6;
      font-size: 15px;
      color: #334155;
    }
    .btn-primary {
      display: inline-block;
      background-color: #2563EB;
      color: #FFFFFF !important;
      font-weight: 600;
      font-size: 15px;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      margin: 20px 0;
      text-align: center;
    }
    .highlight-card {
      background-color: #F1F5F9;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 16px 20px;
      margin: 20px 0;
    }
    .footer {
      padding: 24px 32px;
      background-color: #F8FAFC;
      border-top: 1px solid #E2E8F0;
      text-align: center;
      font-size: 12px;
      color: #64748B;
      line-height: 1.5;
    }
    .footer a {
      color: #2563EB;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <span class="logo-badge">TL</span>
        <span class="brand-title">Topiclog</span>
      </div>
      <div class="body-content">
        ${contentHtml}
      </div>
      <div class="footer">
        <p style="margin: 0 0 8px 0;"><strong>Topiclog • Conectando Cargas e Rotas em Todo o Brasil</strong></p>
        <p style="margin: 0 0 8px 0;">Operação nacional atendendo todos os 5.570 municípios brasileiros.</p>
        <p style="margin: 0;">&copy; ${year} Topiclog. Todos os direitos reservados. • <a href="${appUrl}">topiclog.com.br</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 1. Template de Boas-vindas / Confirmação de Cadastro
 */
export async function sendWelcomeEmail({
  to,
  name,
  role
}: {
  to: string;
  name: string;
  role: "SENDER" | "CARRIER" | string;
}): Promise<MailResult> {
  const appUrl = getAppBaseUrl();
  const safeName = name ? name.trim() : "Usuário";
  const isCarrier = role === "CARRIER";
  const roleName = isCarrier ? "Transportador Parceiro" : "Remetente de Cargas";
  const roleBenefits = isCarrier
    ? "Como transportador, você pode encontrar fretes na sua rota, cadastrar seus veículos e receber pagamentos com garantia e segurança."
    : "Como remetente, você pode publicar suas encomendas, cotar fretes competitivos e acompanhar o transporte em tempo real com comprovantes digitais.";

  const html = wrapTopiclogTemplate(`
    <h2 style="color: #0F172A; margin-top: 0; font-size: 22px;">Seja muito bem-vindo(a) à Topiclog, ${safeName}! 👋</h2>
    <p>Sua conta foi criada com sucesso como <strong>${roleName}</strong>.</p>
    <div class="highlight-card">
      <strong style="color: #0F172A;">Seu perfil na plataforma:</strong>
      <p style="margin: 8px 0 0 0; font-size: 14px;">${roleBenefits}</p>
    </div>
    <p>A Topiclog conecta todo o território nacional de ponta a ponta com segurança, pagamento garantido via Pix e tecnologia de ponta.</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${appUrl}/minha-conta" class="btn-primary" target="_blank">Acessar Meu Painel</a>
    </div>
    <p style="font-size: 13px; color: #64748B;">Se tiver qualquer dúvida ou precisar de apoio para sua primeira operação, conte com nosso suporte em <a href="mailto:topiclog@topiclog.com.br" style="color: #2563EB;">topiclog@topiclog.com.br</a>.</p>
  `);

  return sendMail({
    to,
    subject: "Bem-vindo à Topiclog! Sua conta está pronta para operar",
    html
  });
}

/**
 * 2. Template de Notificação de Frete (Publicação, Proposta ou Aceite)
 */
export async function sendShipmentNotificationEmail({
  to,
  recipientName,
  shipmentTitle,
  originCity,
  destinationCity,
  estimatedValue,
  status,
  actionUrl,
  actionText
}: {
  to: string;
  recipientName: string;
  shipmentTitle: string;
  originCity: string;
  destinationCity: string;
  estimatedValue?: number | string;
  status: "PUBLICADO" | "PROPOSTA_RECEBIDA" | "PROPOSTA_ACEITA" | "EM_TRANSITO" | "ENTREGUE" | string;
  actionUrl?: string;
  actionText?: string;
}): Promise<MailResult> {
  const appUrl = getAppBaseUrl();
  const safeName = recipientName ? recipientName.trim() : "Usuário";
  const formattedPrice =
    typeof estimatedValue === "number"
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(estimatedValue)
      : estimatedValue || "A combinar";

  let statusTitle = "Atualização na sua carga";
  let statusBadgeColor = "#2563EB";
  let statusText = status;

  if (status === "PUBLICADO") {
    statusTitle = "Nova Carga Publicada com Sucesso!";
    statusBadgeColor = "#16A34A";
    statusText = "Disponível para Propostas";
  } else if (status === "PROPOSTA_RECEBIDA") {
    statusTitle = "Nova Proposta de Frete Recebida!";
    statusBadgeColor = "#D97706";
    statusText = "Proposta Aguardando Sua Avaliação";
  } else if (status === "PROPOSTA_ACEITA") {
    statusTitle = "Proposta Aceita • Frete Contratado!";
    statusBadgeColor = "#2563EB";
    statusText = "Frete Confirmado";
  } else if (status === "EM_TRANSITO") {
    statusTitle = "Carga Coletada e em Trânsito";
    statusBadgeColor = "#0284C7";
    statusText = "Em Transporte";
  } else if (status === "ENTREGUE") {
    statusTitle = "Entrega Realizada com Sucesso!";
    statusBadgeColor = "#16A34A";
    statusText = "Concluído";
  }

  const finalActionUrl = actionUrl || `${appUrl}/minhas-atividades`;
  const finalActionText = actionText || "Ver Detalhes do Frete";

  const html = wrapTopiclogTemplate(`
    <div style="display: inline-block; background-color: ${statusBadgeColor}; color: #FFFFFF; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 4px; text-transform: uppercase; margin-bottom: 12px;">
      ${statusText}
    </div>
    <h2 style="color: #0F172A; margin: 0 0 16px 0; font-size: 20px;">${statusTitle}</h2>
    <p>Olá, <strong>${safeName}</strong>. Há uma nova movimentação importante relacionada ao seu frete na Topiclog:</p>
    
    <div class="highlight-card">
      <div style="font-size: 16px; font-weight: 700; color: #0F172A; margin-bottom: 12px;">📦 ${shipmentTitle}</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 6px 0; color: #64748B;">Origem:</td>
          <td style="padding: 6px 0; font-weight: 600; color: #0F172A; text-align: right;">${originCity}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748B;">Destino:</td>
          <td style="padding: 6px 0; font-weight: 600; color: #0F172A; text-align: right;">${destinationCity}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748B;">Valor do Frete:</td>
          <td style="padding: 6px 0; font-weight: 700; color: #16A34A; text-align: right;">${formattedPrice}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${finalActionUrl}" class="btn-primary" target="_blank">${finalActionText}</a>
    </div>

    <p style="font-size: 13px; color: #64748B;">Você pode acompanhar todas as suas encomendas e propostas pelo painel web a qualquer momento.</p>
  `);

  return sendMail({
    to,
    subject: `Topiclog • ${statusTitle} — ${shipmentTitle}`,
    html
  });
}

/**
 * 3. Template de Recuperação de Senha com Código de 6 Dígitos
 */
export async function sendPasswordResetEmail({
  to,
  recipientName,
  resetCode,
  resetUrl,
  expiresInMinutes = 15
}: {
  to: string;
  recipientName: string;
  resetCode: string;
  resetUrl?: string;
  expiresInMinutes?: number;
}): Promise<MailResult> {
  const appUrl = getAppBaseUrl();
  const safeName = recipientName ? recipientName.trim() : "Usuário Topiclog";
  const safeCode = resetCode.trim();
  const finalResetUrl = resetUrl || `${appUrl}/recuperar-acesso?email=${encodeURIComponent(to)}&code=${encodeURIComponent(safeCode)}`;

  const html = wrapTopiclogTemplate(`
    <h2 style="color: #0F172A; margin-top: 0; font-size: 20px;">Recuperação de Senha</h2>
    <p>Olá, <strong>${safeName}</strong>.</p>
    <p>Recebemos uma solicitação para redefinir a senha da sua conta na Topiclog. Use o código temporário abaixo para concluir a alteração:</p>
    
    <div style="margin: 24px 0; padding: 18px; background-color: #F1F5F9; border: 2px dashed #CBD5E1; border-radius: 10px; text-align: center;">
      <span style="font-size: 12px; color: #64748B; font-weight: 600; display: block; margin-bottom: 6px;">SEU CÓDIGO DE VERIFICAÇÃO</span>
      <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #1E293B; font-family: monospace;">${safeCode}</span>
    </div>

    <p style="font-size: 14px; color: #475569;">Este código expira em <strong>${expiresInMinutes} minutos</strong>. Por segurança, se a sua conta estava bloqueada por tentativas de login incorretas, a redefinição com este código reativa seu acesso automaticamente.</p>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${finalResetUrl}" class="btn-primary" target="_blank">Redefinir Minha Senha</a>
    </div>

    <div style="border-top: 1px solid #E2E8F0; padding-top: 16px; margin-top: 24px; font-size: 13px; color: #94A3B8;">
      <p style="margin: 0;">Se você não solicitou a recuperação de senha, desconsidere esta mensagem. Sua senha atual permanecerá protegida e inalterada.</p>
    </div>
  `);

  return sendMail({
    to,
    subject: "Topiclog • Código de Recuperação de Senha",
    html
  });
}

/**
 * Envia notificação de atendimento para a administração da TopicLog e confirmação para o solicitante.
 */
export async function sendSupportContactEmail({
  senderName,
  senderEmail,
  senderPhone,
  protocol,
  subject,
  messageBody
}: {
  senderName: string;
  senderEmail: string;
  senderPhone?: string;
  protocol: string;
  subject: string;
  messageBody: string;
}): Promise<{ adminResult: MailResult; userResult: MailResult }> {
  const adminRecipient = process.env.SMTP_USER || "topiclog@topiclog.com.br";
  const safeName = senderName.trim() || "Usuário Topiclog";
  const safeEmail = senderEmail.trim();
  const safePhone = senderPhone?.trim() || "Não informado";
  const safeSubject = subject.trim() || "Atendimento Geral";
  const safeBody = messageBody.trim().replace(/\n/g, "<br/>");

  // 1. E-mail enviado para a equipe de Suporte/Administração
  const adminHtml = wrapTopiclogTemplate(`
    <div style="background-color: #FEF3C7; border: 1px solid #FCD34D; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <strong style="color: #92400E; font-size: 14px;">✉️ Nova Solicitação de Atendimento</strong>
      <span style="display: block; font-size: 12px; color: #B45309; margin-top: 2px;">Protocolo: <strong>${protocol}</strong></span>
    </div>

    <h2 style="color: #0F172A; margin-top: 0; font-size: 18px;">${safeSubject}</h2>

    <div style="margin: 16px 0; padding: 14px 18px; background-color: #F8FAFC; border-radius: 8px; border: 1px solid #E2E8F0; font-size: 14px; line-height: 1.6;">
      <p style="margin: 0 0 6px 0;"><strong>Nome do Solicitante:</strong> ${safeName}</p>
      <p style="margin: 0 0 6px 0;"><strong>E-mail:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
      <p style="margin: 0;"><strong>Telefone:</strong> ${safePhone}</p>
    </div>

    <div style="margin: 20px 0; padding: 18px; background-color: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 8px; font-size: 14px; line-height: 1.6; color: #1E293B;">
      <strong style="display: block; margin-bottom: 8px; color: #475569; font-size: 12px; text-transform: uppercase;">Mensagem do Cliente:</strong>
      ${safeBody}
    </div>

    <p style="font-size: 12px; color: #64748B;">Para responder diretamente ao solicitante, basta responder a este e-mail.</p>
  `);

  const adminResult = await sendMail({
    to: adminRecipient,
    replyTo: safeEmail,
    subject: `[TopicLog Protocolo ${protocol}] ${safeSubject} - ${safeName}`,
    html: adminHtml
  });

  // 2. Confirmação automática entregue na caixa de entrada do solicitante
  const userHtml = wrapTopiclogTemplate(`
    <h2 style="color: #0F172A; margin-top: 0; font-size: 20px;">Recebemos sua mensagem!</h2>
    <p>Olá, <strong>${safeName}</strong>.</p>
    <p>Sua solicitação de atendimento foi registrada com sucesso na central oficial da Topiclog.</p>

    <div style="margin: 20px 0; padding: 16px; background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px;">
      <span style="font-size: 12px; color: #1E40AF; font-weight: 600; display: block;">PROTOCOLO DE ATENDIMENTO</span>
      <span style="font-size: 22px; font-weight: 800; color: #1D4ED8; font-family: monospace;">${protocol}</span>
      <span style="display: block; font-size: 13px; color: #3B82F6; margin-top: 4px;">Assunto: <strong>${safeSubject}</strong></span>
    </div>

    <div style="margin: 16px 0; padding: 14px 18px; background-color: #F8FAFC; border-radius: 8px; border: 1px solid #E2E8F0; font-size: 13px; line-height: 1.5; color: #475569;">
      <strong style="display: block; margin-bottom: 4px; color: #334155;">Sua mensagem enviada:</strong>
      ${safeBody}
    </div>

    <p style="font-size: 14px; color: #475569;">Nossa equipe de suporte responderá ao seu chamado em breve diretamente no seu e-mail.</p>
  `);

  const userResult = await sendMail({
    to: safeEmail,
    subject: `Topiclog • Solicitação de Atendimento Registrada [${protocol}]`,
    html: userHtml
  });

  return { adminResult, userResult };
}
