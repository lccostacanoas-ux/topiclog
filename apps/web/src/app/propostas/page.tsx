"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { EmptyState } from "../../components/EmptyState";
import { StatusPill } from "../../components/StatusPill";
import {
  listProposalsForSenderApi,
  listProposalsByCarrierApi,
  acceptProposalApi,
  rejectProposalApi,
  counterProposalApi,
  listPriorityOffersForCarrierApi,
  respondPriorityOfferApi,
  cancelContractPrePickupApi,
  getProposalEventsApi,
  getSandboxTokenApi
} from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import type {
  ProposalDto,
  PriorityOfferDto,
  ProposalEventDto,
  CancellationReasonCode
} from "../../lib/types";

// Remetente e transportador demo
const DEMO_SENDER_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_CARRIER_ID = "00000000-0000-0000-0000-000000000002";

export default function PropostasPage(): React.JSX.Element {
  const { token: sessionToken } = useAuth();
  const [senderToken, setSenderToken] = useState<string | null>(null);
  const [carrierToken, setCarrierToken] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<"SENDER" | "CARRIER">("SENDER");

  const [proposals, setProposals] = useState<ProposalDto[]>([]);
  const [priorityOffers, setPriorityOffers] = useState<PriorityOfferDto[]>([]);
  const [filterType, setFilterType] = useState<"ALL" | "RECEIVED" | "SENT">("ALL");
  const [counterProposalId, setCounterProposalId] = useState<string | null>(null);
  const [counterValueInput, setCounterValueInput] = useState<string>("55,00");
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Modal de auditoria/histórico de eventos
  const [historyProposalId, setHistoryProposalId] = useState<string | null>(null);
  const [historyEvents, setHistoryEvents] = useState<ProposalEventDto[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Modal de cancelamento pré-coleta
  const [cancelModalContractId, setCancelModalContractId] = useState<string | null>(null);
  const [cancelReasonCode, setCancelReasonCode] = useState<CancellationReasonCode>("MUTUAL_AGREEMENT");
  const [cancelJustification, setCancelJustification] = useState<string>("");
  const [cancelReopen, setCancelReopen] = useState<boolean>(true);

  // Inicializa tokens de sandbox para permitir testes controlados sem spoofing de cabeçalhos
  useEffect(() => {
    async function initSandboxTokens() {
      try {
        const [sRes, cRes] = await Promise.all([
          getSandboxTokenApi("SENDER"),
          getSandboxTokenApi("CARRIER")
        ]);
        if (sRes.ok && sRes.data) {
          setSenderToken(sRes.data.accessToken);
        }
        if (cRes.ok && cRes.data) {
          setCarrierToken(cRes.data.accessToken);
        }
      } catch {
        // Ignora caso endpoint não esteja em modo testing
      }
    }
    initSandboxTokens();
  }, []);

  const getEffectiveToken = useCallback((targetRole: "SENDER" | "CARRIER") => {
    if (sessionToken) return sessionToken;
    return targetRole === "SENDER" ? senderToken || undefined : carrierToken || undefined;
  }, [sessionToken, senderToken, carrierToken]);

  // Carregar propostas da API
  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      let sTok = senderToken;
      let cTok = carrierToken;

      if (!sessionToken && (!sTok || !cTok)) {
        const [sRes, cRes] = await Promise.all([
          getSandboxTokenApi("SENDER"),
          getSandboxTokenApi("CARRIER")
        ]);
        if (sRes.ok && sRes.data) {
          sTok = sRes.data.accessToken;
          setSenderToken(sTok);
        }
        if (cRes.ok && cRes.data) {
          cTok = cRes.data.accessToken;
          setCarrierToken(cTok);
        }
      }

      const activeSenderTok = sessionToken || sTok || undefined;
      const activeCarrierTok = sessionToken || cTok || undefined;

      const [senderRes, carrierRes, offersRes] = await Promise.all([
        listProposalsForSenderApi(DEMO_SENDER_ID, activeSenderTok),
        listProposalsByCarrierApi(DEMO_CARRIER_ID, activeCarrierTok),
        listPriorityOffersForCarrierApi(DEMO_CARRIER_ID, activeCarrierTok)
      ]);

      const mergedMap = new Map<string, ProposalDto>();
      if (senderRes.ok && senderRes.data) {
        senderRes.data.forEach((p) => mergedMap.set(p.id, p));
      }
      if (carrierRes.ok && carrierRes.data) {
        carrierRes.data.forEach((p) => mergedMap.set(p.id, p));
      }

      setProposals(Array.from(mergedMap.values()));

      if (offersRes.ok && offersRes.data) {
        setPriorityOffers(offersRes.data);
      }
    } catch {
      setErrorMessage("Erro ao conectar à API de propostas. Verifique a conexão com o backend.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, senderToken, carrierToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredProposals = proposals.filter((p) => {
    if (filterType === "RECEIVED") return p.senderId === DEMO_SENDER_ID;
    if (filterType === "SENT") return p.carrierId === DEMO_CARRIER_ID;
    return true;
  });

  // Aceitar Proposta (Gate G2: versão esperada e atomicidade)
  const handleAccept = async (proposal: ProposalDto) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setActionNotice(null);
    try {
      const tok = getEffectiveToken(activePersona);
      const res = await acceptProposalApi(proposal.id, proposal.version, tok);
      if (res.ok && res.data) {
        setActionNotice(
          `✓ Proposta aceita com sucesso! Contrato formalizado #${res.data.id.substring(0, 8)}. Capacidade reservada em ${res.data.legReservations.length} trecho(s). Snapshot comercial de 13% congelado imutavelmente.`
        );
        await loadData();
      } else if (res.problem) {
        if (res.status === 409) {
          setErrorMessage(
            `⚠️ CONFLITO DE CONTRATAÇÃO (409 Conflict): ${res.problem.detail || "A encomenda já foi contratada por outra proposta aceita concorrentemente ou a versão foi alterada."}`
          );
        } else if (res.status === 403) {
          setErrorMessage(
            `🔒 NÃO AUTORIZADO (403 Forbidden): ${res.problem.detail || "Apenas as partes diretamente vinculadas à proposta podem aceitá-la."}`
          );
        } else if (res.status === 422) {
          setErrorMessage(
            `🚫 OPERAÇÃO BLOQUEADA (422 Unprocessable Entity): ${res.problem.detail || "Auto-aceite ou estado da proposta não permite aceitação."}`
          );
        } else {
          setErrorMessage(`Falha na aceitação: ${res.problem.detail || "Regra de negócio violada."}`);
        }
        await loadData();
      }
    } catch {
      setErrorMessage("Erro inesperado ao aceitar a proposta.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Recusar Proposta
  const handleReject = async (id: string) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const tok = getEffectiveToken(activePersona);
      const res = await rejectProposalApi(id, "Recusada pelo usuário via painel", tok);
      if (res.ok) {
        setActionNotice("Proposta recusada com sucesso.");
        await loadData();
      } else if (res.problem) {
        if (res.status === 403) {
          setErrorMessage(`🔒 NÃO AUTORIZADO (403 Forbidden): ${res.problem.detail || "Apenas as partes da proposta podem recusá-la."}`);
        } else {
          setErrorMessage(res.problem?.detail || "Falha ao recusar proposta.");
        }
      }
    } catch {
      setErrorMessage("Erro inesperado ao recusar a proposta.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Contraproposta
  const handleSendCounter = async (id: string) => {
    const val = parseFloat(counterValueInput.replace(",", ".").replace(/[^0-9.]/g, ""));
    if (isNaN(val) || val <= 0) return;
    const cents = Math.round(val * 100);

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const tok = getEffectiveToken(activePersona);
      const res = await counterProposalApi(id, {
        amountCents: cents,
        notes: `Contraproposta no valor de R$ ${val.toFixed(2).replace(".", ",")}`
      }, tok);
      if (res.ok) {
        setCounterProposalId(null);
        setActionNotice(`✓ Contraproposta enviada no valor de R$ ${val.toFixed(2).replace(".", ",")}!`);
        await loadData();
      } else if (res.problem) {
        if (res.status === 422) {
          setErrorMessage(
            `⏳ ALTERNÂNCIA DE TURNO (422 Unprocessable Entity): ${res.problem.detail || "Aguarde a resposta da outra parte antes de contrapropor novamente."}`
          );
        } else if (res.status === 403) {
          setErrorMessage(
            `🔒 NÃO AUTORIZADO (403 Forbidden): ${res.problem.detail || "Apenas remetente ou transportador da proposta podem contrapropor."}`
          );
        } else {
          setErrorMessage(res.problem?.detail || "Falha ao enviar contraproposta.");
        }
      }
    } catch {
      setErrorMessage("Erro inesperado ao enviar contraproposta.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Responder Oferta Prioritária (Regra 2)
  const handleRespondPriorityOffer = async (shipmentId: string, accept: boolean) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const tok = getEffectiveToken("CARRIER");
      const res = await respondPriorityOfferApi(shipmentId, accept, tok);
      if (res.ok) {
        if (accept) {
          setActionNotice("✓ Oferta prioritária aceita! Prossiga com o envio da sua proposta de transporte.");
        } else {
          setActionNotice("Oferta prioritária recusada sem penalidade. A encomenda foi liberada para o Feed geral.");
        }
        await loadData();
      } else {
        setErrorMessage(res.problem?.detail || "Falha ao responder oferta prioritária.");
      }
    } catch {
      setErrorMessage("Erro inesperado ao responder oferta prioritária.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Abrir Histórico de Auditoria
  const handleViewEvents = async (proposalId: string) => {
    setHistoryProposalId(proposalId);
    setLoadingHistory(true);
    try {
      const tok = getEffectiveToken(activePersona);
      const res = await getProposalEventsApi(proposalId, tok);
      if (res.ok && res.data) {
        setHistoryEvents(res.data);
      }
    } finally {
      setLoadingHistory(false);
    }
  };

  // Confirmar Cancelamento Pré-Coleta
  const handleConfirmCancelContract = async () => {
    if (!cancelModalContractId) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const tok = getEffectiveToken(activePersona);
      const res = await cancelContractPrePickupApi(cancelModalContractId, {
        reasonCode: cancelReasonCode,
        justification: cancelJustification || "Cancelamento consensual solicitado antes da coleta",
        reopenForBidding: cancelReopen
      }, tok);
      if (res.ok && res.data) {
        setCancelModalContractId(null);
        setActionNotice(
          `✓ Contrato #${res.data.id.substring(0, 8)} cancelado pré-coleta. Capacidade devolvida à viagem. ${res.data.cancellation?.policyDisclaimer || ""}`
        );
        await loadData();
      } else if (res.problem) {
        if (res.status === 403) {
          setErrorMessage(`🔒 NÃO AUTORIZADO (403 Forbidden): ${res.problem.detail || "Apenas as partes do contrato podem cancelá-lo."}`);
        } else {
          setErrorMessage(res.problem?.detail || "Falha ao cancelar contrato pré-coleta.");
        }
      }
    } catch {
      setErrorMessage("Erro ao processar o cancelamento do contrato.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cálculo da contraproposta ao vivo
  const parsedCounterVal = parseFloat(counterValueInput.replace(",", ".").replace(/[^0-9.]/g, "")) || 0;
  const liveCounterCommission = (parsedCounterVal * 0.13).toFixed(2).replace(".", ",");
  const liveCounterCarrierNet = (parsedCounterVal * 0.87).toFixed(2).replace(".", ",");

  return (
    <main className="container" style={{ paddingTop: "28px", paddingBottom: "56px" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 800, margin: 0, color: "var(--color-brand-deep-navy)" }}>
            Propostas e Negociações
          </h1>
          <span className="status-pill status-pill--warning" style={{ fontSize: "11px", fontWeight: 700 }}>
            PR-04 • Aceite Único & Concorrência
          </span>
        </div>
        <p style={{ color: "var(--color-muted)", margin: 0, fontSize: "15px", maxWidth: "720px" }}>
          Gerencie propostas comerciais, envie contrapropostas com recálculo automático de comissão (13% Plano Free)
          e formalize contratos com prevenção determinística de concorrência e reserva de capacidade por trecho.
        </p>
      </div>

      {actionNotice && (
        <div className="alert alert--success" role="status" style={{ marginBottom: "20px" }}>
          {actionNotice}
        </div>
      )}

      {errorMessage && (
        <div className="alert alert--danger" role="alert" style={{ marginBottom: "20px" }}>
          {errorMessage}
        </div>
      )}

      {/* BANNER: OFERTA PRIORITÁRIA DA 2ª ENCOMENDA (REGRA 2) */}
      {priorityOffers.length > 0 && (
        <div
          className="card"
          style={{
            backgroundColor: "#FEF3C7",
            border: "2px solid #F59E0B",
            padding: "18px 20px",
            marginBottom: "24px",
            boxShadow: "var(--shadow-md)"
          }}
        >
          {priorityOffers.map((offer) => (
            <div key={offer.shipmentId} style={{ display: "flex", gap: "14px", alignItems: "flex-start", flexWrap: "wrap", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span style={{ fontSize: "26px", lineHeight: 1 }} aria-hidden="true">⏱️</span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <strong style={{ color: "#92400E", fontSize: "15px" }}>
                      OFERTA PRIORITÁRIA DA 2ª ENCOMENDA (REGRA 2)
                    </strong>
                    <span className="status-pill status-pill--warning" style={{ fontSize: "10px", fontWeight: 700 }}>
                      Janela Exclusiva de 10 min
                    </span>
                  </div>
                  <p style={{ color: "#78350F", fontSize: "13px", margin: "4px 0 0 0", lineHeight: 1.45 }}>
                    {offer.notes} Você transportará a primeira encomenda e possui prioridade de rota nesta segunda carga.
                    Caso decline ou expire, ela será liberada para o Feed geral <strong>sem penalidade</strong>.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", alignItems: "center", alignSelf: "center" }}>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleRespondPriorityOffer(offer.shipmentId, true)}
                  className="btn btn--primary"
                  style={{ fontSize: "13px", padding: "8px 16px" }}
                >
                  ✓ Aceitar Prioridade
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleRespondPriorityOffer(offer.shipmentId, false)}
                  className="btn btn--outline"
                  style={{ fontSize: "13px", padding: "8px 14px", backgroundColor: "#FFFFFF" }}
                >
                  Recusar Sem Penalidade
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Alerta de Elegibilidade Bilateral (D05) */}
      <div
        className="card"
        style={{
          backgroundColor: "#EFF6FF",
          border: "1px solid #BFDBFE",
          padding: "16px 20px",
          marginBottom: "24px",
          display: "flex",
          gap: "14px",
          alignItems: "flex-start",
          boxShadow: "var(--shadow-sm)"
        }}
      >
        <span style={{ fontSize: "24px", lineHeight: 1 }} aria-hidden="true">🛡️</span>
        <div>
          <strong style={{ color: "#1E40AF", fontSize: "14px" }}>
            Regra Vinculante de Elegibilidade Bilateral (D05) & Aceite Único (Gate G2):
          </strong>
          <p style={{ color: "#1E3A8A", fontSize: "13px", margin: "4px 0 0 0", lineHeight: 1.45 }}>
            A negociação é interativa. No momento do aceite definitivo, o backend efetua bloqueio atômico de concorrência.
            Apenas uma proposta pode ser aceita por encomenda. Todas as propostas concorrentes passam deterministicamente
            ao estado <code>SUPERSEDED</code> com HTTP 409 Conflict em tentativas simultâneas.
          </p>
        </div>
      </div>

      {/* Seletor de Persona Sandbox Controlado */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
          marginBottom: "16px",
          padding: "10px 14px",
          backgroundColor: "#F8FAFC",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-brand-deep-navy)" }}>
            👤 Atuando como:
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setActivePersona("SENDER")}
              style={{
                padding: "4px 12px",
                borderRadius: "var(--radius-full)",
                fontSize: "12px",
                fontWeight: 700,
                border: "1px solid",
                borderColor: activePersona === "SENDER" ? "var(--color-primary)" : "var(--color-border)",
                backgroundColor: activePersona === "SENDER" ? "#EFF6FF" : "#FFFFFF",
                color: activePersona === "SENDER" ? "var(--color-primary)" : "var(--color-text)",
                cursor: "pointer"
              }}
            >
              Embarcador Demo (Remetente)
            </button>
            <button
              type="button"
              onClick={() => setActivePersona("CARRIER")}
              style={{
                padding: "4px 12px",
                borderRadius: "var(--radius-full)",
                fontSize: "12px",
                fontWeight: 700,
                border: "1px solid",
                borderColor: activePersona === "CARRIER" ? "#10B981" : "var(--color-border)",
                backgroundColor: activePersona === "CARRIER" ? "#ECFDF5" : "#FFFFFF",
                color: activePersona === "CARRIER" ? "#047857" : "var(--color-text)",
                cursor: "pointer"
              }}
            >
              Transportador Demo
            </button>
          </div>
        </div>
        <span style={{ fontSize: "11px", color: "var(--color-muted)" }}>
          Identidade protegida por Token JWT assinado • Sem impersonação insegura
        </span>
      </div>

      {/* Abas */}
      <nav className="tabs-nav" aria-label="Filtro de propostas">
        <button
          type="button"
          onClick={() => setFilterType("ALL")}
          className={`tab-button ${filterType === "ALL" ? "tab-button--active" : ""}`}
        >
          Todas as Negociações ({proposals.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setFilterType("RECEIVED");
            setActivePersona("SENDER");
          }}
          className={`tab-button ${filterType === "RECEIVED" ? "tab-button--active" : ""}`}
        >
          Recebidas como Remetente
        </button>
        <button
          type="button"
          onClick={() => {
            setFilterType("SENT");
            setActivePersona("CARRIER");
          }}
          className={`tab-button ${filterType === "SENT" ? "tab-button--active" : ""}`}
        >
          Enviadas como Transportador
        </button>
      </nav>

      {/* Conteúdo */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <p style={{ color: "var(--color-muted)" }}>Carregando propostas e negociações da API...</p>
        </div>
      ) : filteredProposals.length === 0 ? (
        <EmptyState
          icon="🤝"
          title="Nenhuma proposta encontrada nesta categoria"
          description="Você ainda não possui propostas registradas. Localize encomendas no Feed para enviar propostas de transporte."
          actionLabel="Ver Oportunidades no Feed"
          actionHref="/feed"
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {filteredProposals.map((p) => {
            const isPending = p.status === "PENDING";
            const isAccepted = p.status === "ACCEPTED";
            const isCounter = p.status === "COUNTERED";
            const isRejected = p.status === "REJECTED";
            const isSuperseded = p.status === "SUPERSEDED";
            const isExpired = p.status === "EXPIRED" || p.isExpired;
            const isCancelled = p.status === "CANCELLED";

            const commissionCents = Math.round(p.amountCents * 0.13);
            const carrierNetCents = p.amountCents - commissionCents;

            return (
              <article key={p.id} className="ticket-card" style={{ padding: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
                  <div>
                    <span style={{ fontSize: "12px", color: "var(--color-muted)", fontWeight: 600 }}>
                      ID: #{p.id.substring(0, 8)} • Versão {p.version} • {new Date(p.createdAtUtc).toLocaleDateString("pt-BR")}
                    </span>
                    <h2 style={{ fontSize: "19px", fontWeight: 800, margin: "4px 0 0 0", color: "var(--color-brand-deep-navy)" }}>
                      Encomenda #{p.shipmentId.substring(0, 8)}
                    </h2>
                  </div>

                  <StatusPill
                    label={
                      isAccepted
                        ? "Proposta Aceita (Contrato Ativo)"
                        : isRejected
                        ? "Recusada"
                        : isCounter
                        ? `Contraproposta (${p.counterCount}x)`
                        : isSuperseded
                        ? "Superada por Outra Proposta"
                        : isExpired
                        ? "Expirada"
                        : isCancelled
                        ? "Cancelada"
                        : "Aguardando Decisão"
                    }
                    tone={
                      isAccepted
                        ? "success"
                        : isRejected || isExpired
                        ? "danger"
                        : isCounter
                        ? "neutral"
                        : isSuperseded
                        ? "neutral"
                        : "warning"
                    }
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginBottom: "18px" }}>
                  {/* Partícipes e Notas */}
                  <div style={{ backgroundColor: "#F8FAFC", padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
                    <div style={{ fontSize: "12px", color: "var(--color-muted)", marginBottom: "6px", textTransform: "uppercase", fontWeight: 700 }}>
                      Partícipes da Negociação:
                    </div>
                    <div style={{ fontSize: "14px", marginBottom: "4px" }}>
                      Remetente: <strong style={{ color: "var(--color-brand-deep-navy)" }}>{p.senderName || "Carlos M. (Remetente Demo)"}</strong>
                    </div>
                    <div style={{ fontSize: "14px", marginBottom: "8px" }}>
                      Transportador: <strong style={{ color: "var(--color-brand-deep-navy)" }}>{p.carrierName || "Marcos Vinícius (Demo)"}</strong>
                    </div>
                    {p.notes && (
                      <div style={{ fontSize: "13px", color: "var(--color-text)", backgroundColor: "#FFFFFF", padding: "10px", borderRadius: "var(--radius-sm)", border: "1px solid #E2E8F0", fontStyle: "italic", marginBottom: "8px" }}>
                        "{p.notes}"
                      </div>
                    )}
                    <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>
                      Expira em: <strong>{new Date(p.expiresAtUtc).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} de {new Date(p.expiresAtUtc).toLocaleDateString("pt-BR")}</strong>
                    </div>
                  </div>

                  {/* Detalhamento Comercial com Split Bar (ADR-0002) */}
                  <div style={{ backgroundColor: "#FFFFFF", border: "1px solid var(--color-border)", padding: "16px", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-sm)" }}>
                    <div style={{ fontSize: "12px", color: "var(--color-muted)", marginBottom: "8px", fontWeight: 700, textTransform: "uppercase" }}>
                      Divisão Comercial (13% Plano Free Topic Log):
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", marginBottom: "6px" }}>
                      <span style={{ color: "var(--color-muted)" }}>Valor Total do Frete:</span>
                      <strong style={{ fontSize: "17px", color: "var(--color-brand-deep-navy)" }}>
                        R$ {(p.amountCents / 100).toFixed(2).replace(".", ",")}
                      </strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "var(--color-muted)", marginBottom: "6px" }}>
                      <span>Comissão Topic Log (13%):</span>
                      <span>R$ {(commissionCents / 100).toFixed(2).replace(".", ",")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "15px", borderTop: "1px dashed var(--color-border)", paddingTop: "8px", color: "var(--color-success)", fontWeight: 800 }}>
                      <span>Transportador Recebe Líquido:</span>
                      <span>R$ {(carrierNetCents / 100).toFixed(2).replace(".", ",")}</span>
                    </div>

                    {/* Split Bar */}
                    <div className="split-bar-container" style={{ marginTop: "10px" }}>
                      <div className="split-bar-carrier" style={{ width: "87%" }} title="87% Transportador" />
                      <div className="split-bar-platform" style={{ width: "13%" }} title="13% Plataforma" />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--color-muted)", marginTop: "4px" }}>
                      <span>87% Repasse</span>
                      <span>13% Topic Log (Taxas absorvidas)</span>
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderTop: "1px solid var(--color-border)", paddingTop: "16px" }}>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Link href="/mensagens" className="btn btn--outline" style={{ fontSize: "13px" }}>
                      💬 Chat
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleViewEvents(p.id)}
                      className="btn btn--outline"
                      style={{ fontSize: "13px" }}
                    >
                      📜 Histórico Auditável
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    {(isPending || isCounter) && (
                      <>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleAccept(p)}
                          className="btn btn--primary"
                          style={{ fontSize: "13px", padding: "8px 18px", fontWeight: 700 }}
                        >
                          ✓ Aceitar Proposta
                        </button>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => setCounterProposalId(counterProposalId === p.id ? null : p.id)}
                          className="btn btn--secondary"
                          style={{
                            fontSize: "13px",
                            padding: "7px 16px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px"
                          }}
                          title="Contrapropor: Propor outro valor para esta encomenda"
                        >
                          <span style={{ fontWeight: 600 }}>Contrapropor</span>
                          <span
                            style={{
                              fontSize: "11px",
                              backgroundColor: "rgba(0, 0, 0, 0.08)",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontWeight: 500
                            }}
                          >
                            Propor outro valor
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleReject(p.id)}
                          className="btn btn--danger"
                          style={{ fontSize: "13px", padding: "8px 14px" }}
                        >
                          Recusar
                        </button>
                      </>
                    )}

                    {isSuperseded && (
                      <span style={{ fontSize: "12px", color: "#64748B", fontWeight: 600 }}>
                        🔒 Esta proposta foi superada pela aceitação de outra concorrente (Gate G2).
                      </span>
                    )}

                    {isAccepted && (
                      <button
                        type="button"
                        onClick={() => setCancelModalContractId(p.shipmentId)}
                        className="btn btn--danger"
                        style={{ fontSize: "13px", padding: "8px 14px" }}
                      >
                        Simular Cancelamento Pré-Coleta
                      </button>
                    )}
                  </div>
                </div>

                {/* Bloco de Contraproposta */}
                {counterProposalId === p.id && (
                  <div
                    style={{
                      marginTop: "16px",
                      padding: "18px",
                      backgroundColor: "#FFFBEB",
                      border: "1px solid #FDE68A",
                      borderRadius: "var(--radius-md)"
                    }}
                  >
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#92400E", marginBottom: "8px" }}>
                      Propor Novo Valor de Frete (R$):
                    </div>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "12px" }}>
                      <input
                        type="text"
                        value={counterValueInput}
                        onChange={(e) => setCounterValueInput(e.target.value)}
                        className="form-control"
                        style={{ maxWidth: "160px", fontSize: "16px", fontWeight: 700 }}
                        placeholder="Ex: 55,00"
                      />
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleSendCounter(p.id)}
                        className="btn btn--primary"
                        style={{ fontSize: "13px" }}
                      >
                        Confirmar Contraproposta
                      </button>
                      <button
                        type="button"
                        onClick={() => setCounterProposalId(null)}
                        className="btn btn--outline"
                        style={{ fontSize: "13px" }}
                      >
                        Cancelar
                      </button>
                    </div>

                    {parsedCounterVal > 0 && (
                      <div style={{ fontSize: "12px", color: "#92400E" }}>
                        Simulação do novo valor: Comissão Topic Log (13%): <strong>R$ {liveCounterCommission}</strong> | Repasse líquido ao transportador: <strong>R$ {liveCounterCarrierNet}</strong>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* MODAL: HISTÓRICO DE AUDITORIA DE EVENTOS */}
      {historyProposalId && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(16, 33, 58, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px"
          }}
          onClick={() => setHistoryProposalId(null)}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "560px",
              width: "100%",
              maxHeight: "92vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(16, 33, 58, 0.35)",
              border: "1px solid var(--color-border)",
              padding: "24px"
            }}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", fontWeight: 800 }}>
              📜 Histórico Auditável da Proposta
            </h3>

            {loadingHistory ? (
              <p style={{ color: "var(--color-muted)" }}>Carregando eventos de auditoria...</p>
            ) : historyEvents.length === 0 ? (
              <p style={{ color: "var(--color-muted)" }}>Nenhum evento registrado ainda.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "360px", overflowY: "auto" }}>
                {historyEvents.map((ev) => (
                  <div key={ev.id} style={{ padding: "10px 14px", backgroundColor: "#F8FAFC", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700, color: "var(--color-brand-deep-navy)" }}>
                      <span>{ev.eventType}</span>
                      <span style={{ color: "var(--color-muted)" }}>{new Date(ev.occurredAtUtc).toLocaleTimeString("pt-BR")}</span>
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--color-text)", marginTop: "4px" }}>
                      {ev.justification || `Transição de ${ev.previousStatus} para ${ev.newStatus}`}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: "20px", textAlign: "right" }}>
              <button
                type="button"
                onClick={() => setHistoryProposalId(null)}
                className="btn btn--outline"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SIMULAÇÃO DE CANCELAMENTO PRÉ-COLETA */}
      {cancelModalContractId && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(16, 33, 58, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px"
          }}
          onClick={() => setCancelModalContractId(null)}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "520px",
              width: "100%",
              maxHeight: "92vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(16, 33, 58, 0.35)",
              border: "1px solid var(--color-border)",
              padding: "24px"
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: "18px", fontWeight: 800, color: "var(--color-danger)" }}>
              ⚠️ Cancelamento Pré-Coleta (Sandbox)
            </h3>
            <p style={{ fontSize: "13px", color: "var(--color-muted)", marginBottom: "16px" }}>
              O cancelamento pré-coleta restaura a capacidade reservada nos trechos da viagem e atualiza a encomenda.
            </p>

            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 700, marginBottom: "6px" }}>
                Motivo do Cancelamento:
              </label>
              <select
                value={cancelReasonCode}
                onChange={(e) => setCancelReasonCode(e.target.value as CancellationReasonCode)}
                className="form-control"
              >
                <option value="MUTUAL_AGREEMENT">Acordo Mútuo entre as partes (Isento de taxas)</option>
                <option value="OPERATIONAL_IMPOSSIBILITY">Impossibilidade Operacional Justificada (Isento)</option>
                <option value="FORCE_MAJEURE">Caso Fortuito / Força Maior (Isento)</option>
                <option value="SENDER_CHANGE_OF_PLANS">Mudança de Planos do Remetente (Simulação de taxa 10%)</option>
                <option value="CARRIER_UNAVAILABLE">Indisponibilidade do Transportador (Simulação de taxa 10%)</option>
                <option value="UNJUSTIFIED_CANCELLATION">Cancelamento Injustificado (Simulação de taxa 10%)</option>
              </select>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 700, marginBottom: "6px" }}>
                Justificativa:
              </label>
              <textarea
                value={cancelJustification}
                onChange={(e) => setCancelJustification(e.target.value)}
                className="form-control"
                rows={2}
                placeholder="Descreva o motivo do cancelamento..."
              />
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={cancelReopen}
                  onChange={(e) => setCancelReopen(e.target.checked)}
                />
                Reabrir encomenda para novas propostas no Feed geral
              </label>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setCancelModalContractId(null)}
                className="btn btn--outline"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmCancelContract}
                className="btn btn--danger"
              >
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
