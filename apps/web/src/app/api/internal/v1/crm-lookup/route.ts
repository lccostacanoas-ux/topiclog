import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type TipoConsulta = "resumo_geral" | "kyc" | "fretes" | "financeiro_pix";

interface CrmLookupBody {
  topiclog_user_id: string;
  tipo_consulta?: TipoConsulta;
}

function validarBearer(authHeader: string | null): boolean {
  const secret =
    process.env.TOPICLOG_CHAT_SECRET ||
    "fa7098440d2054dd66009e79e259daebc11a5e0ea28deba963e9435cdf9c1270";
  if (!secret || !authHeader) return false;
  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) return false;
  const token = authHeader.slice(prefix.length).trim();
  const tokenBuf = Buffer.from(token, "utf8");
  const secretBuf = Buffer.from(secret, "utf8");
  if (tokenBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(tokenBuf, secretBuf);
}

function mascararChavePix(pixKey: string): string {
  if (!pixKey) return "";
  const trimmed = pixKey.trim();
  if (trimmed.includes("@")) {
    const [user, domain] = trimmed.split("@");
    const maskedUser = (user || "").slice(0, 2) + "***";
    return `${maskedUser}@${domain || ""}`;
  }
  if (trimmed.length >= 11) {
    return `${trimmed.slice(0, 3)}.***.***-${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`;
}

function traduzirPapeis(roles: string[] | null): string[] {
  if (!roles || !Array.isArray(roles)) return ["Embarcador"];
  return roles.map((r) => {
    const upper = r.toUpperCase();
    if (upper === "SENDER" || upper === "EMBARCADOR") return "Embarcador";
    if (upper === "CARRIER" || upper === "TRANSPORTADOR") return "Transportador";
    if (upper === "ADMIN") return "Administrador";
    return r;
  });
}

function traduzirKycStatus(status: string | null): string {
  const s = (status || "").toUpperCase();
  switch (s) {
    case "VERIFIED":
      return "Aprovado / Verificado";
    case "PENDING":
    case "IN_REVIEW":
      return "Em Análise pela Equipe";
    case "REJECTED":
      return "Reprovado";
    case "EXPIRED":
      return "Expirado / Reenvio Necessário";
    case "NOT_STARTED":
    default:
      return "Não Iniciado";
  }
}

function traduzirStatusFrete(contratoStatus: string | null, entregaStatus: string | null): string {
  if (entregaStatus) {
    const es = entregaStatus.toUpperCase();
    if (es === "DELIVERED_VERIFIED" || es === "CLOSED") return "entregue";
    if (es === "IN_TRANSIT" || es === "OUT_FOR_DELIVERY") return "em_transporte";
    if (es === "AWAITING_PICKUP") return "aguardando_coleta";
    if (es === "EXCEPTION_REPORTED" || es === "DISPUTED") return "em_disputa_suporte";
  }
  const cs = (contratoStatus || "").toUpperCase();
  switch (cs) {
    case "ACTIVE":
      return "em_transporte";
    case "COMPLETED":
      return "entregue";
    case "CANCELLED_PRE_PICKUP":
    case "CANCELLED_POST_PICKUP":
    case "CANCELLED":
      return "cancelado";
    case "PENDING":
      return "aguardando_propostas";
    default:
      return "em_andamento";
  }
}

function traduzirStatusCustodia(status: string | null): string {
  const s = (status || "").toUpperCase();
  switch (s) {
    case "PAGO":
    case "CONFIRMADO":
    case "RECEIVED":
      return "em_custodia_segura_asaas";
    case "AGUARDANDO_PAGAMENTO":
    case "PENDING":
      return "aguardando_pagamento_pix";
    case "OVERDUE":
    case "VENCIDO":
      return "pix_vencido";
    default:
      return "processando";
  }
}

function traduzirStatusRepasse(status: string | null, entregaStatus: string | null): string {
  if (entregaStatus && entregaStatus.toUpperCase() !== "DELIVERED_VERIFIED") {
    return "aguardando_entrega";
  }
  const s = (status || "").toUpperCase();
  switch (s) {
    case "PAGO":
    case "RECEIVED":
    case "CONFIRMADO":
      return "pago";
    case "FALHA":
    case "FAILED":
      return "falha_chave_pix";
    case "PROCESSING":
    case "PROCESSANDO":
      return "processando_repasse";
    default:
      return "aguardando_entrega";
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Autenticação Estrita via Bearer Token com timingSafeEqual
  if (!validarBearer(req.headers.get("authorization"))) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Credencial inválida ou ausente" },
      { status: 401 },
    );
  }

  // 2. Parse e Validação do Body
  let body: CrmLookupBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON", message: "Corpo da requisição deve ser JSON válido" },
      { status: 400 },
    );
  }

  const { topiclog_user_id } = body;
  const tipo_consulta: TipoConsulta = body.tipo_consulta || "resumo_geral";

  if (!topiclog_user_id || typeof topiclog_user_id !== "string" || !topiclog_user_id.trim()) {
    return NextResponse.json(
      { error: "Bad Request", message: "O parâmetro 'topiclog_user_id' é obrigatório" },
      { status: 400 },
    );
  }

  const userId = topiclog_user_id.trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

  if (!isUuid) {
    return NextResponse.json({
      success: true,
      encontrado: false,
      topiclog_user_id: userId,
      tipo_consulta,
      consultado_em: new Date().toISOString(),
      mensagem: "Identificador de usuário não possui formato UUID válido do banco SQL.",
      dados: {
        cadastro_kyc: null,
        fretes_recentes: [],
        financeiro_pix: null,
      },
    });
  }

  try {
    // 3. Consulta de Cadastro & KYC (Estritamente isolada por topiclog_user_id)
    let cadastroKyc = null;
    let pixInfoFromProfile = {
      pix_key: null as string | null,
      pix_key_type: null as string | null,
      bank_name: null as string | null,
      asaas_kyc_status: null as string | null,
      asaas_wallet_id: null as string | null,
    };

    if (tipo_consulta === "resumo_geral" || tipo_consulta === "kyc" || tipo_consulta === "financeiro_pix") {
      const userRes = await query<{
        id: string;
        email: string;
        phone_masked: string;
        status_conta: string;
        display_name: string | null;
        roles: string[] | null;
        kyc_status: string | null;
        city: string | null;
        state_uf: string | null;
        rating_avg: string | number | null;
        rating_count: number | null;
        pix_key_type: string | null;
        pix_key: string | null;
        bank_name: string | null;
        asaas_wallet_id: string | null;
        asaas_account_id: string | null;
        asaas_kyc_status: string | null;
        kyc_case_status: string | null;
        kyc_motivo_rejeicao: string | null;
        kyc_submetido_em: string | null;
      }>(
        `SELECT 
          u.id,
          u.email,
          u.phone_masked,
          u.status AS status_conta,
          p.display_name,
          p.roles,
          p.kyc_status,
          p.city,
          p.state_uf,
          p.rating_avg,
          p.rating_count,
          p.pix_key_type,
          p.pix_key,
          p.bank_name,
          p.asaas_wallet_id,
          p.asaas_account_id,
          p.asaas_kyc_status,
          kc.status AS kyc_case_status,
          kc.rejection_reason AS kyc_motivo_rejeicao,
          kc.submitted_at AS kyc_submetido_em
        FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id
        LEFT JOIN LATERAL (
          SELECT status, rejection_reason, submitted_at
          FROM kyc_cases
          WHERE user_id = u.id
          ORDER BY submitted_at DESC
          LIMIT 1
        ) kc ON true
        WHERE u.id = $1`,
        [userId],
      );

      if (userRes.rows.length === 0) {
        return NextResponse.json({
          success: true,
          encontrado: false,
          topiclog_user_id: userId,
          tipo_consulta,
          consultado_em: new Date().toISOString(),
          mensagem: "Usuário não localizado na base SQL da Topiclog.",
          dados: {
            cadastro_kyc: null,
            fretes_recentes: [],
            financeiro_pix: null,
          },
        });
      }

      const row = userRes.rows[0];
      if (!row) {
        return NextResponse.json({
          success: true,
          encontrado: false,
          topiclog_user_id: userId,
          tipo_consulta,
          consultado_em: new Date().toISOString(),
          mensagem: "Registro não encontrado.",
          dados: { cadastro_kyc: null, fretes_recentes: [], financeiro_pix: null },
        });
      }

      pixInfoFromProfile = {
        pix_key: row.pix_key,
        pix_key_type: row.pix_key_type,
        bank_name: row.bank_name,
        asaas_kyc_status: row.asaas_kyc_status,
        asaas_wallet_id: row.asaas_wallet_id,
      };

      if (tipo_consulta === "resumo_geral" || tipo_consulta === "kyc") {
        cadastroKyc = {
          nome: row.display_name || "Usuário Topiclog",
          perfis_habilitados: traduzirPapeis(row.roles),
          status_conta: row.status_conta,
          status_kyc: traduzirKycStatus(row.kyc_status),
          kyc_detalhes: {
            status_bruto: row.kyc_status || "NOT_STARTED",
            caso_recente_status: row.kyc_case_status || null,
            motivo_pendencia_ou_reprovacao: row.kyc_motivo_rejeicao || null,
            submetido_em: row.kyc_submetido_em || null,
          },
          cidade_base: row.city && row.state_uf ? `${row.city}/${row.state_uf}` : "Brasil",
          reputacao: {
            media_estrelas: Number(row.rating_avg || 5.0),
            total_avaliacoes: Number(row.rating_count || 0),
          },
        };
      }
    }

    // 4. Consulta de Fretes & Propostas (Isolamento por sender_id = $1 OR carrier_id = $1)
    // ZERO VAZAMENTO: Sem expor CPF, telefone, placa ou dados sensíveis da contraparte.
    let fretesRecentes: Array<{
      codigo_frete: string;
      papel: string;
      rota: string;
      status_operacional: string;
      valor_acordado_formatado: string;
      valor_acordado_centavos: number;
      repasse_liquido_centavos: number | null;
      status_avaliacao: string;
      contratado_em: string;
    }> = [];

    if (tipo_consulta === "resumo_geral" || tipo_consulta === "fretes") {
      const fretesRes = await query<{
        contrato_id: string;
        shipment_id: string;
        amount_cents: string | number;
        carrier_due_cents: string | number;
        contrato_status: string;
        contracted_at: string;
        papel_usuario: string;
        origem_cidade: string | null;
        destino_cidade: string | null;
        status_entrega: string | null;
      }>(
        `SELECT 
          c.id AS contrato_id,
          c.shipment_id,
          c.amount_cents,
          c.carrier_due_cents,
          c.status AS contrato_status,
          c.contracted_at,
          CASE WHEN c.sender_id = $1 THEN 'Embarcador' ELSE 'Transportador' END AS papel_usuario,
          clr.from_city AS origem_cidade,
          clr.to_city AS destino_cidade,
          deliv.status AS status_entrega
        FROM contracts c
        LEFT JOIN LATERAL (
          SELECT from_city, to_city 
          FROM contract_leg_reservations 
          WHERE contract_id = c.id 
          ORDER BY leg_index ASC 
          LIMIT 1
        ) clr ON true
        LEFT JOIN delivery_orders deliv ON deliv.contract_id = c.id
        WHERE c.sender_id = $1 OR c.carrier_id = $1
        ORDER BY c.contracted_at DESC
        LIMIT 3`,
        [userId],
      );

      fretesRecentes = fretesRes.rows.map((f) => {
        const valorCentavos = Number(f.amount_cents || 0);
        const repasseCentavos = Number(f.carrier_due_cents || 0);
        const valorFormatado = (valorCentavos / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });

        const rota = f.origem_cidade && f.destino_cidade
          ? `${f.origem_cidade} -> ${f.destino_cidade}`
          : "Rota Nacional (Brasil)";

        const statusOperacional = traduzirStatusFrete(f.contrato_status, f.status_entrega);

        return {
          codigo_frete: f.shipment_id || f.contrato_id,
          papel: f.papel_usuario,
          rota,
          status_operacional: statusOperacional,
          valor_acordado_formatado: valorFormatado,
          valor_acordado_centavos: valorCentavos,
          repasse_liquido_centavos: f.papel_usuario === "Transportador" ? repasseCentavos : null,
          status_avaliacao: statusOperacional === "entregue" ? "Avaliação Disponível" : "Aguardando conclusão",
          contratado_em: f.contracted_at,
        };
      });
    }

    // 5. Custódia & Repasses Pix Asaas (Sem expor chaves sensíveis de API)
    let financeiroPix = null;

    if (tipo_consulta === "resumo_geral" || tipo_consulta === "financeiro_pix") {
      const splitRes = await query<{
        id: string;
        shipment_id: string;
        amount_cents: string | number;
        carrier_due_cents: string | number;
        platform_fee_cents: string | number;
        split_status: string;
        created_at: string;
        pago_em: string | null;
        expira_em: string;
        status_entrega: string | null;
      }>(
        `SELECT 
          ps.id,
          ps.shipment_id,
          ps.amount_cents,
          ps.carrier_due_cents,
          ps.platform_fee_cents,
          ps.status AS split_status,
          ps.created_at,
          ps.pago_em,
          ps.expira_em,
          deliv.status AS status_entrega
        FROM pagamentos_split ps
        LEFT JOIN delivery_orders deliv ON deliv.shipment_id = ps.shipment_id
        WHERE ps.payer_id = $1 
           OR ($2::text IS NOT NULL AND ps.carrier_wallet_id = $2::text)
        ORDER BY ps.created_at DESC
        LIMIT 3`,
        [userId, pixInfoFromProfile.asaas_wallet_id || null],
      );

      const splits = splitRes.rows.map((s) => {
        const total = Number(s.amount_cents || 0);
        const repasse = Number(s.carrier_due_cents || 0);

        return {
          codigo_transacao: s.id,
          codigo_frete: s.shipment_id,
          valor_total_formatado: (total / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          repasse_85_liquido_formatado: (repasse / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          status_custodia_embarcador: traduzirStatusCustodia(s.split_status),
          status_repasse_transportador: traduzirStatusRepasse(s.split_status, s.status_entrega),
          pago_em: s.pago_em,
          criado_em: s.created_at,
        };
      });

      financeiroPix = {
        pix_transportador: {
          chave_cadastrada: Boolean(pixInfoFromProfile.pix_key),
          tipo_chave: pixInfoFromProfile.pix_key_type || "NÃO_CONFIGURADA",
          chave_mascarada: pixInfoFromProfile.pix_key ? mascararChavePix(pixInfoFromProfile.pix_key) : null,
          banco: pixInfoFromProfile.bank_name || "Asaas",
          status_subconta_asaas: pixInfoFromProfile.asaas_kyc_status || "NOT_STARTED",
        },
        regras_operacionais: {
          garantia_custodia_embarcador: "Valor retido com segurança no Asaas até confirmação de entrega pelo destinatário.",
          repasse_liquido_transportador: "85% do valor total liberado via Pix nativo automaticamente após a entrega validada.",
          taxa_plataforma: "15% retida na fonte para custeio operacional e garantia antifraude.",
        },
        transacoes_recentes: splits,
      };
    }

    return NextResponse.json({
      success: true,
      encontrado: true,
      topiclog_user_id: userId,
      tipo_consulta,
      consultado_em: new Date().toISOString(),
      dados: {
        cadastro_kyc: cadastroKyc,
        fretes_recentes: fretesRecentes,
        financeiro_pix: financeiroPix,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn("[CRM-Lookup Warning] Consulta operacional falhou ou banco indisponível:", errorMsg);
    return NextResponse.json({
      success: true,
      encontrado: false,
      topiclog_user_id: userId,
      tipo_consulta,
      consultado_em: new Date().toISOString(),
      mensagem: "Dados cadastrais e operacionais temporariamente indisponíveis para consulta direta.",
      dados: {
        cadastro_kyc: null,
        fretes_recentes: [],
        financeiro_pix: null,
      },
    });
  }
}
