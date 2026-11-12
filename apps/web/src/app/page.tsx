"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { getRatingsSummary, type RatingsSummary } from "../lib/demo-marketplace-store";
import { listShipmentsApi } from "../lib/api-client";
import type { ShipmentSummaryDto } from "../lib/types";

function renderStars(rating: number) {
  return (
    <div style={{ display: "inline-flex", gap: "2px", alignItems: "center" }} aria-label={`${rating} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={`star-${star}`}
          style={{
            fontSize: "16px",
            color: star <= rating ? "#F59E0B" : "#CBD5E1",
            lineHeight: 1
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

interface FaqItem {
  readonly id: string;
  readonly category: "TODAS" | "REMETENTE" | "TRANSPORTADOR" | "PAGAMENTO" | "SEGURANCA";
  readonly categoryBadge: string;
  readonly question: string;
  readonly answer: string;
}

const FAQ_ITEMS: readonly FaqItem[] = [
  {
    id: "faq-1",
    category: "TODAS",
    categoryBadge: "Geral",
    question: "O que é a Topic Log e como funciona a plataforma?",
    answer: "A Topic Log é um marketplace colaborativo de logística que conecta pessoas e empresas precisando enviar encomendas a motoristas e viajantes que já vão fazer aquele trajeto com espaço disponível no veículo (carros, motos, utilitários ou vans). O remetente anuncia o pacote, os transportadores enviam propostas e a negociação é fechada com total agilidade, economia e segurança dentro da plataforma."
  },
  {
    id: "faq-2",
    category: "SEGURANCA",
    categoryBadge: "Segurança",
    question: "Como funciona a confirmação da entrega por senha?",
    answer: "A entrega na Topic Log é 100% segura e validada exclusivamente por senha/código. Ao despachar a encomenda, um código de liberação único é gerado no sistema. Quando o transportador entrega o pacote no destino, o destinatário informa esse código para validação imediata no aplicativo, comprovando a conclusão sem necessidade de fotos ou burocracia."
  },
  {
    id: "faq-3",
    category: "PAGAMENTO",
    categoryBadge: "Pagamentos",
    question: "Como é garantido o pagamento do frete e o repasse ao transportador?",
    answer: "O remetente realiza o pagamento de forma protegida pela plataforma no momento da contratação (via Pix ou cartão). O valor do frete fica em custódia segura e é liberado diretamente para o transportador no exato instante em que a entrega é confirmada com o código seguro no destino. O transportador tem garantia absoluta de recebimento e o remetente tem garantia de entrega."
  },
  {
    id: "faq-4",
    category: "PAGAMENTO",
    categoryBadge: "Políticas & Taxas",
    question: "Como funcionam as taxas e repasses da plataforma?",
    answer: "A Topic Log opera com políticas comerciais claras e atualizadas centralmente pelas configurações da plataforma, sem tarifas surpresas ou cobranças ocultas. Antes de aceitar qualquer proposta ou confirmar um envio, o demonstrativo financeiro completo é exibido na tela, detalhando o valor bruto do frete, as taxas do serviço e o repasse líquido exato."
  },
  {
    id: "faq-5",
    category: "TRANSPORTADOR",
    categoryBadge: "Transportadores",
    question: "Quantos volumes e quanto peso o transportador pode levar?",
    answer: "O transportador pode levar quantos volumes e encomendas couberem no seu veículo e quanto peso suportar o seu trajeto. A plataforma permite agregar múltiplos pedidos de remetentes diferentes em uma mesma viagem, otimizando o seu ganho financeiro."
  },
  {
    id: "faq-6",
    category: "REMETENTE",
    categoryBadge: "Remetentes",
    question: "Qual o limite de peso e volumes por envio para o remetente?",
    answer: "O remetente pode enviar encomendas de no máximo 20 kg e exatamente 1 volume por pedido. O campo de peso no cadastro é opcional (deixe em branco se não souber o peso exato, desde que dentro do limite de 20 kg). Caso possua mais de uma encomenda ou pacote, basta cadastrar um pedido para cada volume."
  },
  {
    id: "faq-7",
    category: "REMETENTE",
    categoryBadge: "Remetentes",
    question: "Quais tipos de itens podem ser transportados?",
    answer: "São aceitas pequenas e médias encomendas legais e seguras: documentos, eletrônicos, autopeças, vestuário, mercadorias para revenda, itens domésticos e alimentos não perecíveis embalados. É estritamente proibido o transporte de itens ilícitos, perigosos, inflamáveis, armas ou cargas proibidas por lei."
  },
  {
    id: "faq-8",
    category: "SEGURANCA",
    categoryBadge: "Segurança",
    question: "Como é avaliada a procedência e confiança dos usuários?",
    answer: "Todos os usuários passam por verificação cadastral obrigatória com validação de CPF e identidade. Além disso, a plataforma disponibiliza o histórico público de viagens realizadas, selo de verificação e a quantidade de estrelas atribuídas após a conclusão de entregas e interações reais."
  }
];

export default function HomePage(): React.JSX.Element {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const displayName = user?.displayName ? user.displayName.split(" ")[0] : null;
  const [, setRecentShipments] = useState<ShipmentSummaryDto[]>([]);
  const [ratingsSummary, setRatingsSummary] = useState<RatingsSummary>({
    carrierCount: 0,
    carrierAvg: 0,
    senderCount: 0,
    senderAvg: 0,
    totalCount: 0
  });
  const [openFaqId, setOpenFaqId] = useState<string | null>("faq-1");
  const [faqFilter, setFaqFilter] = useState<string>("TODAS");

  const isCarrier = Boolean(user?.roles?.includes("CARRIER"));
  const isSender = Boolean(user?.roles?.includes("SENDER"));
  const hasBothRoles = isCarrier && isSender;
  const [activeRole, setActiveRole] = useState<"CARRIER" | "SENDER">(
    user?.roles?.includes("CARRIER") ? "CARRIER" : "SENDER"
  );

  React.useEffect(() => {
    setRatingsSummary(getRatingsSummary());
    if (!isAuthenticated || !user) {
      setRecentShipments([]);
      return;
    }
    void listShipmentsApi().then((res) => {
      if (res.ok && !res.isFallback && Array.isArray(res.data)) {
        setRecentShipments(res.data.slice(0, 3));
      }
    });
  }, [isAuthenticated, user]);

  React.useEffect(() => {
    if (user?.roles?.includes("CARRIER")) {
      setActiveRole("CARRIER");
    } else if (user?.roles?.includes("SENDER")) {
      setActiveRole("SENDER");
    }
  }, [user?.roles]);

  const filteredFaqItems = faqFilter === "TODAS"
    ? FAQ_ITEMS
    : FAQ_ITEMS.filter((f) => f.category === faqFilter || f.category === "TODAS");

  return (
    <main
      id="main-content"
      style={{
        backgroundColor: "#F1F5F9",
        minHeight: "calc(100vh - 56px)",
        paddingBottom: "88px"
      }}
    >
      <div className="container" style={{ maxWidth: "860px", padding: "20px 16px 32px 16px", margin: "0 auto" }}>
        {/* Saudação Superior */}
        <section style={{ marginBottom: "20px" }}>
          <h1
            style={{
              fontSize: "26px",
              fontWeight: 800,
              color: "#0F172A",
              margin: "0 0 4px 0",
              letterSpacing: "-0.5px"
            }}
          >
            {displayName ? `Olá, ${displayName}` : "Bem-vindo à Topic Log"}
          </h1>
          <p style={{ margin: 0, fontSize: "14px", color: "#64748B", fontWeight: 500 }}>
            {user
              ? `Conectado como ${activeRole === "CARRIER" ? "Transportador" : "Remetente"} • ${user.city && user.stateUf ? `${user.city} (${user.stateUf})` : "Todo o Brasil"}`
              : "Marketplace de Encomendas & Rotas • Todo o Brasil"}
          </p>

          {hasBothRoles && (
            <div style={{ marginTop: "12px", display: "inline-flex", backgroundColor: "#E2E8F0", padding: "3px", borderRadius: "10px" }}>
              <button
                type="button"
                onClick={() => setActiveRole("CARRIER")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                  backgroundColor: activeRole === "CARRIER" ? "#2563EB" : "transparent",
                  color: activeRole === "CARRIER" ? "#FFFFFF" : "#475569",
                  transition: "all 0.15s ease"
                }}
              >
                🚚 Painel do Transportador
              </button>
              <button
                type="button"
                onClick={() => setActiveRole("SENDER")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                  backgroundColor: activeRole === "SENDER" ? "#2563EB" : "transparent",
                  color: activeRole === "SENDER" ? "#FFFFFF" : "#475569",
                  transition: "all 0.15s ease"
                }}
              >
                📦 Painel do Remetente
              </button>
            </div>
          )}
        </section>

        {/* Card de Acesso para Visitantes Não Logados */}
        {!user && (
          <div
            style={{
              backgroundColor: "#FFFFFF",
              border: "1px solid #CBD5E1",
              borderRadius: "14px",
              padding: "14px 18px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
              gap: "12px",
              flexWrap: "wrap"
            }}
          >
            <div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A" }}>
                Você ainda não está conectado
              </div>
              <div style={{ fontSize: "12px", color: "#64748B" }}>
                Acesse sua conta para publicar e acompanhar encomendas
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <Link
                href="/entrar"
                className="btn btn--primary"
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: 700,
                  textDecoration: "none"
                }}
              >
                Entrar
              </Link>
              <Link
                href="/cadastro"
                className="btn btn--outline"
                style={{
                  padding: "8px 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  textDecoration: "none",
                  backgroundColor: "#FFFFFF"
                }}
              >
                Cadastrar
              </Link>
            </div>
          </div>
        )}

        {/* =========================================================================
            1 & 2. BOTÕES DE AÇÃO E SERVIÇOS (SOMENTE QUANDO CONECTADO)
           ========================================================================= */}
        {isAuthenticated && user && (
          <>
            <section
              className="flex flex-row items-center gap-3 sm:gap-4 flex-wrap"
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
                marginBottom: "28px"
              }}
              aria-label="Ações Principais Topic Log"
            >
          {activeRole === "CARRIER" ? (
            <>
              {/* Botão 1 Transportador: MURAL DE ENCOMENDAS */}
              <Link
                href="/feed"
                id="btn-cta-mural"
                className="px-4 py-2 text-sm sm:text-base flex items-center gap-2 font-bold rounded-lg shadow-sm transition"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 18px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #059669 0%, #10B981 100%)",
                  color: "#FFFFFF",
                  fontSize: "14px",
                  fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: "0 2px 6px rgba(5, 150, 105, 0.3)"
                }}
              >
                <span>🚚</span>
                <span>Mural de Encomendas</span>
              </Link>

              {/* Botão 2 Transportador: CADASTRAR VIAGEM */}
              <Link
                href="/viagens/cadastrar"
                id="btn-cta-cadastrar-viagem"
                className="px-4 py-2 text-sm sm:text-base flex items-center gap-2 font-bold rounded-lg shadow-sm transition"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 18px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #0284C7 0%, #38BDF8 100%)",
                  color: "#FFFFFF",
                  fontSize: "14px",
                  fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)"
                }}
              >
                <span>🗺️</span>
                <span>Cadastrar Minha Viagem</span>
              </Link>

              {/* Botão 3 Transportador: MINHAS PROPOSTAS */}
              <Link
                href="/propostas"
                id="btn-cta-propostas"
                className="px-4 py-2 text-sm sm:text-base flex items-center gap-2 font-bold rounded-lg shadow-sm transition"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 18px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)",
                  color: "#FFFFFF",
                  fontSize: "14px",
                  fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: "0 2px 6px rgba(30, 64, 175, 0.3)"
                }}
              >
                <span>🤝</span>
                <span>Minhas Propostas</span>
              </Link>

              {/* Botão 4 Transportador: CHAT E MENSAGENS */}
              <Link
                href="/mensagens"
                id="btn-cta-mensagens"
                className="px-4 py-2 text-sm sm:text-base flex items-center gap-2 font-bold rounded-lg shadow-sm transition"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 18px",
                  borderRadius: "10px",
                  backgroundColor: "#FFFFFF",
                  color: "#1E293B",
                  border: "1px solid #CBD5E1",
                  fontSize: "14px",
                  fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)"
                }}
              >
                <span>💬</span>
                <span>Chat & Mensagens</span>
              </Link>
            </>
          ) : (
            <>
              {/* Botão 1 Remetente: ENVIAR ENCOMENDA */}
              <Link
                href="/encomendas/publicar"
                id="btn-cta-enviar"
                className="px-4 py-2 text-sm sm:text-base flex items-center gap-2 font-bold rounded-lg shadow-sm transition"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 18px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #059669 0%, #10B981 100%)",
                  color: "#FFFFFF",
                  fontSize: "14px",
                  fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: "0 2px 6px rgba(5, 150, 105, 0.3)"
                }}
              >
                <span>📦</span>
                <span>Enviar Encomenda</span>
              </Link>

              {/* Botão 2 Remetente: MINHAS ENCOMENDAS */}
              <Link
                href="/encomendas"
                id="btn-cta-encomendas"
                className="px-4 py-2 text-sm sm:text-base flex items-center gap-2 font-bold rounded-lg shadow-sm transition"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 18px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #0284C7 0%, #38BDF8 100%)",
                  color: "#FFFFFF",
                  fontSize: "14px",
                  fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)"
                }}
              >
                <span>📍</span>
                <span>Minhas Encomendas</span>
              </Link>

              {/* Botão 3 Remetente: PROPOSTAS RECEBIDAS */}
              <Link
                href="/propostas"
                id="btn-cta-propostas"
                className="px-4 py-2 text-sm sm:text-base flex items-center gap-2 font-bold rounded-lg shadow-sm transition"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 18px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)",
                  color: "#FFFFFF",
                  fontSize: "14px",
                  fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: "0 2px 6px rgba(30, 64, 175, 0.3)"
                }}
              >
                <span>🤝</span>
                <span>Propostas Recebidas</span>
              </Link>

              {/* Botão 4 Remetente: CHAT E MENSAGENS */}
              <Link
                href="/mensagens"
                id="btn-cta-mensagens"
                className="px-4 py-2 text-sm sm:text-base flex items-center gap-2 font-bold rounded-lg shadow-sm transition"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 18px",
                  borderRadius: "10px",
                  backgroundColor: "#FFFFFF",
                  color: "#1E293B",
                  border: "1px solid #CBD5E1",
                  fontSize: "14px",
                  fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)"
                }}
              >
                <span>💬</span>
                <span>Chat & Mensagens</span>
              </Link>
            </>
          )}
        </section>

        {/* =========================================================================
            2. SERVIÇOS PARA VOCÊ (GRADE 2 COLUNAS - ESTILO MEU INSS)
           ========================================================================= */}
        <section style={{ marginBottom: "28px" }}>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "#334155",
              margin: "0 0 14px 0"
            }}
          >
            Serviços para você
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px"
            }}
          >
            {activeRole === "CARRIER" ? (
              <>
                {/* Serviço 1: Mural de Fretes */}
                <Link
                  href="/feed"
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "14px",
                    padding: "16px 14px",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
                    border: "1px solid #E2E8F0"
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      backgroundColor: "#EFF6FF",
                      color: "#2563EB",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px",
                      flexShrink: 0
                    }}
                  >
                    🚚
                  </div>
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#1E293B", display: "block", lineHeight: "1.2" }}>
                      Mural de Fretes
                    </span>
                    <span style={{ fontSize: "11px", color: "#64748B", marginTop: "2px", display: "block" }}>
                      Catálogo de cargas
                    </span>
                  </div>
                </Link>

                {/* Serviço 2: Cadastrar Viagem */}
                <Link
                  href="/viagens/cadastrar"
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "14px",
                    padding: "16px 14px",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
                    border: "1px solid #E2E8F0"
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      backgroundColor: "#EFF6FF",
                      color: "#2563EB",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px",
                      flexShrink: 0
                    }}
                  >
                    🗺️
                  </div>
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#1E293B", display: "block", lineHeight: "1.2" }}>
                      Cadastrar Viagem
                    </span>
                    <span style={{ fontSize: "11px", color: "#64748B", marginTop: "2px", display: "block" }}>
                      Rotas e caronas
                    </span>
                  </div>
                </Link>

                {/* Serviço 3: Minha Conta & Perfil */}
                <Link
                  href="/minha-conta"
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "14px",
                    padding: "16px 14px",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
                    border: "1px solid #E2E8F0"
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      backgroundColor: "#EFF6FF",
                      color: "#2563EB",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px",
                      flexShrink: 0
                    }}
                  >
                    👤
                  </div>
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#1E293B", display: "block", lineHeight: "1.2" }}>
                      Minha Conta
                    </span>
                    <span style={{ fontSize: "11px", color: "#64748B", marginTop: "2px", display: "block" }}>
                      Perfil & Veículo
                    </span>
                  </div>
                </Link>

                {/* Serviço 4: Enviar Encomenda */}
                <Link
                  href="/encomendas/publicar"
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "14px",
                    padding: "16px 14px",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
                    border: "1px solid #E2E8F0"
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      backgroundColor: "#EFF6FF",
                      color: "#2563EB",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px",
                      flexShrink: 0
                    }}
                  >
                    📦
                  </div>
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#1E293B", display: "block", lineHeight: "1.2" }}>
                      Enviar Encomenda
                    </span>
                    <span style={{ fontSize: "11px", color: "#64748B", marginTop: "2px", display: "block" }}>
                      Alternar p/ remetente
                    </span>
                  </div>
                </Link>
              </>
            ) : (
              <>
                {/* Serviço 1: Publicar Encomenda */}
                <Link
                  href="/encomendas/publicar"
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "14px",
                    padding: "16px 14px",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
                    border: "1px solid #E2E8F0"
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      backgroundColor: "#EFF6FF",
                      color: "#2563EB",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px",
                      flexShrink: 0
                    }}
                  >
                    📦
                  </div>
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#1E293B", display: "block", lineHeight: "1.2" }}>
                      Enviar Encomenda
                    </span>
                    <span style={{ fontSize: "11px", color: "#64748B", marginTop: "2px", display: "block" }}>
                      Novo pedido com mapa
                    </span>
                  </div>
                </Link>

                {/* Serviço 2: Minha Conta & Perfil */}
                <Link
                  href="/minha-conta"
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "14px",
                    padding: "16px 14px",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
                    border: "1px solid #E2E8F0"
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      backgroundColor: "#EFF6FF",
                      color: "#2563EB",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px",
                      flexShrink: 0
                    }}
                  >
                    👤
                  </div>
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#1E293B", display: "block", lineHeight: "1.2" }}>
                      Minha Conta
                    </span>
                    <span style={{ fontSize: "11px", color: "#64748B", marginTop: "2px", display: "block" }}>
                      Perfil & Segurança
                    </span>
                  </div>
                </Link>

                {/* Serviço 3: Verificação de Identidade */}
                <Link
                  href="/verificacao-kyc"
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "14px",
                    padding: "16px 14px",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
                    border: "1px solid #E2E8F0"
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      backgroundColor: "#EFF6FF",
                      color: "#2563EB",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px",
                      flexShrink: 0
                    }}
                  >
                    🛡️
                  </div>
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#1E293B", display: "block", lineHeight: "1.2" }}>
                      Verificação Segura
                    </span>
                    <span style={{ fontSize: "11px", color: "#64748B", marginTop: "2px", display: "block" }}>
                      Documento & Proteção
                    </span>
                  </div>
                </Link>

                {/* Serviço 4: Termos de Uso e Regras */}
                <Link
                  href="/termos"
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "14px",
                    padding: "16px 14px",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
                    border: "1px solid #E2E8F0"
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      backgroundColor: "#EFF6FF",
                      color: "#2563EB",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px",
                      flexShrink: 0
                    }}
                  >
                    📜
                  </div>
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#1E293B", display: "block", lineHeight: "1.2" }}>
                      Termos & Regras
                    </span>
                    <span style={{ fontSize: "11px", color: "#64748B", marginTop: "2px", display: "block" }}>
                      Itens Proibidos & Limites
                    </span>
                  </div>
                </Link>
              </>
            )}
          </div>
        </section>
          </>
        )}

        {/* =========================================================================
            3. SEÇÃO DE REPUTAÇÃO E AVALIAÇÕES EM ESTRELAS (APARECE QUANDO HOUVER INTERAÇÃO)
           ========================================================================= */}
        <section style={{ marginBottom: "32px" }} aria-label="Avaliações e Reputação Topic Log">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "8px", marginBottom: "6px" }}>
            <h2
              style={{
                fontSize: "19px",
                fontWeight: 800,
                color: "#0F172A",
                margin: 0,
                letterSpacing: "-0.3px",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <span>⭐</span>
              <span>Avaliações em Estrelas</span>
            </h2>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#166534", backgroundColor: "#DCFCE7", padding: "3px 10px", borderRadius: "12px" }}>
              ✓ Reputação por Interação Real
            </span>
          </div>
          <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#64748B" }}>
            Média de estrelas atribuídas mutuamente a transportadores e remetentes com base nas entregas e interações realizadas.
          </p>

          {/* Cards Públicos de Avaliação: Transportadores e Remetentes (Apenas Estrelas, Sem Comentários) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "14px"
            }}
          >
            {/* Card Transportador */}
            <div
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: "14px",
                padding: "20px 22px",
                border: "1px solid #E2E8F0",
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.04)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between"
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "50%",
                      backgroundColor: "#D1FAE5",
                      color: "#065F46",
                      fontWeight: 800,
                      fontSize: "20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }}
                  >
                    🚚
                  </div>
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>
                      Transportadores
                    </div>
                    <span style={{ fontSize: "12px", color: "#64748B" }}>
                      Avaliação pública concedida por remetentes
                    </span>
                  </div>
                </div>

                {ratingsSummary.carrierCount > 0 ? (
                  <div style={{ marginTop: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                      {renderStars(Math.round(ratingsSummary.carrierAvg))}
                      <span style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A" }}>
                        {ratingsSummary.carrierAvg.toFixed(1)}{" "}
                        <span style={{ fontSize: "13px", color: "#64748B", fontWeight: 500 }}>/ 5.0</span>
                      </span>
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#047857" }}>
                      ★ {ratingsSummary.carrierCount} {ratingsSummary.carrierCount === 1 ? "avaliação recebida" : "avaliações recebidas"}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                      color: "#64748B",
                      fontStyle: "italic",
                      backgroundColor: "#F8FAFC",
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: "1px solid #E2E8F0",
                      marginTop: "10px"
                    }}
                  >
                    <span>⭐</span>
                    <span>Ainda sem avaliação</span>
                  </div>
                )}
              </div>

            </div>

            {/* Card Remetente */}
            <div
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: "14px",
                padding: "20px 22px",
                border: "1px solid #E2E8F0",
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.04)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between"
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "50%",
                      backgroundColor: "#DBEAFE",
                      color: "#1E40AF",
                      fontWeight: 800,
                      fontSize: "20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }}
                  >
                    📦
                  </div>
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>
                      Remetentes
                    </div>
                    <span style={{ fontSize: "12px", color: "#64748B" }}>
                      Avaliação pública concedida por transportadores
                    </span>
                  </div>
                </div>

                {ratingsSummary.senderCount > 0 ? (
                  <div style={{ marginTop: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                      {renderStars(Math.round(ratingsSummary.senderAvg))}
                      <span style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A" }}>
                        {ratingsSummary.senderAvg.toFixed(1)}{" "}
                        <span style={{ fontSize: "13px", color: "#64748B", fontWeight: 500 }}>/ 5.0</span>
                      </span>
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#1D4ED8" }}>
                      ★ {ratingsSummary.senderCount} {ratingsSummary.senderCount === 1 ? "avaliação recebida" : "avaliações recebidas"}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                      color: "#64748B",
                      fontStyle: "italic",
                      backgroundColor: "#F8FAFC",
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: "1px solid #E2E8F0",
                      marginTop: "10px"
                    }}
                  >
                    <span>⭐</span>
                    <span>Ainda sem avaliação</span>
                  </div>
                )}
              </div>

            </div>
          </div>
        </section>

        {/* =========================================================================
            4. TIRE SUAS DÚVIDAS (FAQ / PERGUNTAS FREQUENTES)
           ========================================================================= */}
        <section style={{ marginBottom: "32px" }}>
          <div style={{ marginBottom: "16px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#2563EB", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Central de Dúvidas
            </span>
            <h2
              style={{
                fontSize: "22px",
                fontWeight: 800,
                color: "#0F172A",
                margin: "4px 0 6px 0"
              }}
            >
              Tire suas dúvidas
            </h2>
            <p style={{ color: "#64748B", fontSize: "14px", margin: 0 }}>
              Confira as respostas para as principais dúvidas sobre fretes, prazos, confirmação de entrega e pagamentos.
            </p>
          </div>

          {/* Filtros por Categoria */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              overflowX: "auto",
              paddingBottom: "8px",
              marginBottom: "16px",
              scrollbarWidth: "none"
            }}
          >
            {[
              { id: "TODAS", label: "Todas as dúvidas" },
              { id: "REMETENTE", label: "📦 Remetentes" },
              { id: "TRANSPORTADOR", label: "🚗 Transportadores" },
              { id: "PAGAMENTO", label: "💳 Pagamentos & Taxas" },
              { id: "SEGURANCA", label: "🛡️ Confirmação por Senha" }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFaqFilter(f.id)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "9999px",
                  fontSize: "13px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  border: `1.5px solid ${faqFilter === f.id ? "#2563EB" : "#E2E8F0"}`,
                  backgroundColor: faqFilter === f.id ? "#EFF6FF" : "#FFFFFF",
                  color: faqFilter === f.id ? "#1D4ED8" : "#475569",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Lista de Itens do FAQ em Accordion */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {filteredFaqItems.map((faq) => {
              const isOpen = openFaqId === faq.id;
              return (
                <div
                  key={faq.id}
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "14px",
                    border: `1px solid ${isOpen ? "#93C5FD" : "#E2E8F0"}`,
                    boxShadow: isOpen ? "0 4px 12px rgba(37, 99, 235, 0.08)" : "0 1px 3px rgba(0, 0, 0, 0.03)",
                    overflow: "hidden",
                    transition: "all 0.2s ease"
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                    aria-expanded={isOpen}
                    style={{
                      width: "100%",
                      padding: "16px 18px",
                      background: "transparent",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      cursor: "pointer",
                      textAlign: "left"
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "#2563EB",
                          textTransform: "uppercase",
                          letterSpacing: "0.4px"
                        }}
                      >
                        {faq.categoryBadge}
                      </span>
                      <span
                        style={{
                          fontSize: "15px",
                          fontWeight: 700,
                          color: isOpen ? "#1D4ED8" : "#0F172A",
                          lineHeight: "1.4"
                        }}
                      >
                        {faq.question}
                      </span>
                    </div>
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        backgroundColor: isOpen ? "#EFF6FF" : "#F1F5F9",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: isOpen ? "#2563EB" : "#64748B",
                        fontSize: "14px",
                        fontWeight: 700,
                        flexShrink: 0,
                        transition: "transform 0.2s ease",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)"
                      }}
                    >
                      ▾
                    </div>
                  </button>

                  {isOpen && (
                    <div
                      style={{
                        padding: "0 18px 18px 18px",
                        fontSize: "14px",
                        lineHeight: "1.6",
                        color: "#475569",
                        borderTop: "1px solid #F1F5F9",
                        paddingTop: "12px"
                      }}
                    >
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Card de Contato / Suporte Direto */}
          <div
            style={{
              marginTop: "16px",
              backgroundColor: "#F8FAFC",
              borderRadius: "14px",
              padding: "16px 18px",
              border: "1px solid #E2E8F0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "14px",
              flexWrap: "wrap"
            }}
          >
            <div>
              <strong style={{ fontSize: "14px", color: "#0F172A", display: "block" }}>
                Ainda tem alguma dúvida específica?
              </strong>
              <span style={{ fontSize: "13px", color: "#64748B" }}>
                Fale com a administração da plataforma ou acione nossa central de atendimento via e-mail.
              </span>
            </div>
            <Link
              href="/mensagens"
              className="btn btn--outline"
              style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap" }}
            >
              Falar com a Administração →
            </Link>
          </div>
        </section>

        {/* =========================================================================
            5. RODAPÉ INSTITUCIONAL (ESTILO CARTEIRA DIGITAL DE TRÂNSITO)
           ========================================================================= */}
        <footer
          style={{
            marginTop: "32px",
            paddingTop: "20px",
            borderTop: "1px solid #CBD5E1",
            textAlign: "center"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "24px",
              marginBottom: "12px",
              opacity: 0.8
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "14px" }}>📦</span>
              <span style={{ fontSize: "12px", fontWeight: 800, color: "#1E293B" }}>TOPIC LOG</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "14px" }}>🇧🇷</span>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#475569" }}>TODO O BRASIL</span>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: "11px", color: "#94A3B8" }}>
            Cobertura Nacional: Todos os municípios e estados do Brasil
          </p>
        </footer>
      </div>
    </main>
  );
}
