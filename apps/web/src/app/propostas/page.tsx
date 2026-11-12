"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { EmptyState } from "../../components/EmptyState";
import { StarRatingDisplay } from "../../components/StarRatingDisplay";
import {
  listProposalsForSenderApi,
  listProposalsByCarrierApi,
  listMyContractsApi,
  acceptProposalApi,
  confirmContractPaymentApi,
  rejectProposalApi,
  counterProposalApi,
  listContractMessagesApi,
  sendContractMessageApi
} from "../../lib/api-client";
import {
  getDemoProposals,
  updateProposalStatus,
  removeDemoProposal,
  type DemoProposal
} from "../../lib/demo-marketplace-store";
import { useAuth } from "../../lib/auth-context";
import type { ContractDto, ContractMessageDto, ProposalDto } from "../../lib/types";
import { MercadoPagoPixModal } from "../../components/MercadoPagoPixModal";
import type { MercadoPagoPixData } from "../../lib/mercadopago";

function safeFormatDate(val?: string): string {
  if (!val) return new Date().toLocaleDateString("pt-BR");
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date().toLocaleDateString("pt-BR") : d.toLocaleDateString("pt-BR");
}

function formatTimeHHMM(val?: string): string {
  if (!val) return "";
  const d = new Date(val);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatRemainingCountdown(expiresAtUtc?: string | null): string | null {
  if (!expiresAtUtc) return null;
  const diffMs = new Date(expiresAtUtc).getTime() - Date.now();
  if (diffMs <= 0) return "Prazo expirado";
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function ProposalNegotiationChat({
  contractId,
  token,
  currentUserId,
  counterpartName
}: {
  contractId: string;
  token: string;
  currentUserId: string;
  counterpartName: string;
}): React.JSX.Element {
  const [messages, setMessages] = useState<ContractMessageDto[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  const loadMessages = useCallback(async () => {
    if (!token || !contractId) return;
    const res = await listContractMessagesApi(contractId, token);
    if (res.ok && res.data) {
      setMessages(res.data);
      setChatError(null);
    }
  }, [contractId, token]);

  useEffect(() => {
    if (!isOpen) return;
    void loadMessages();
    const timer = window.setInterval(() => {
      void loadMessages();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [isOpen, loadMessages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setChatError(null);
    const res = await sendContractMessageApi(contractId, trimmed, token);
    if (res.ok && res.data) {
      setMessages((prev) => [...prev, res.data!]);
      setText("");
    } else {
      setChatError(res.problem?.detail || "Não foi possível enviar a mensagem.");
    }
    setSending(false);
  };

  return (
    <div style={{ marginTop: "14px", border: "1px solid #BFDBFE", borderRadius: "10px", overflow: "hidden", backgroundColor: "#F8FAFC" }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: "10px 14px",
          backgroundColor: "#EFF6FF",
          borderBottom: isOpen ? "1px solid #BFDBFE" : "none",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "14px" }}>💬</span>
          <strong style={{ fontSize: "13px", color: "#1E40AF" }}>
            Chat Privado da Entrega ({counterpartName})
          </strong>
          <span style={{ fontSize: "11px", backgroundColor: "#D1FAE5", color: "#065F46", padding: "2px 8px", borderRadius: "12px", fontWeight: 700 }}>
            ✓ Pagamento Confirmado • Somente Vocês 2
          </span>
        </div>
        <span style={{ fontSize: "12px", color: "#1E40AF", fontWeight: 600 }}>
          {isOpen ? "Ocultar ▲" : "Abrir Chat ▼"}
        </span>
      </div>

      {isOpen && (
        <div style={{ padding: "12px" }}>
          <div style={{ maxHeight: "220px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", marginBottom: "10px", paddingRight: "4px" }}>
            <div style={{ textAlign: "center", padding: "6px 12px", backgroundColor: "#E2E8F0", borderRadius: "6px", fontSize: "11px", color: "#475569", fontWeight: 600, margin: "4px 0" }}>
              ✓ Pagamento Pix confirmado. Este chat direto é exclusivo entre remetente e transportador contratado.
            </div>
            {messages.map((m) => {
              const isMine = m.senderUserId === currentUserId;
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: isMine ? "flex-end" : "flex-start",
                    maxWidth: "80%",
                    backgroundColor: isMine ? "#2563EB" : "#FFFFFF",
                    color: isMine ? "#FFFFFF" : "#1E293B",
                    border: isMine ? "none" : "1px solid #E2E8F0",
                    borderRadius: "10px",
                    padding: "8px 12px",
                    fontSize: "13px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                  }}
                >
                  <div style={{ fontSize: "10px", fontWeight: 700, color: isMine ? "#BFDBFE" : "#64748B", marginBottom: "2px", display: "flex", justifyContent: "space-between", gap: "8px" }}>
                    <span>{isMine ? "Você" : (m.senderName || counterpartName)}</span>
                    <span>{formatTimeHHMM(m.sentAtUtc)}</span>
                  </div>
                  <div>{m.body}</div>
                </div>
              );
            })}
          </div>

          {chatError && (
            <div style={{ fontSize: "12px", color: "#DC2626", marginBottom: "8px" }}>
              {chatError}
            </div>
          )}

          <form onSubmit={(e) => void handleSend(e)} style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Digite sua mensagem privada sobre coleta ou entrega..."
              disabled={sending}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #CBD5E1",
                fontSize: "13px",
                outline: "none"
              }}
            />
            <button
              type="submit"
              className="btn btn--primary"
              disabled={sending || !text.trim()}
              style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap" }}
            >
              {sending ? "Enviando..." : "Enviar"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function PropostasPage(): React.JSX.Element {
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth();

  const isCarrier = Boolean(user?.roles?.includes("CARRIER"));
  const isSender = Boolean(user?.roles?.includes("SENDER"));

  // Aba ativa: Recebidas (Remetente) ou Enviadas (Transportador)
  const [activeTab, setActiveTab] = useState<"RECEIVED" | "SENT">(
    isCarrier && !isSender ? "SENT" : "RECEIVED"
  );

  const [proposals, setProposals] = useState<ProposalDto[]>([]);
  const [contractsByProposalId, setContractsByProposalId] = useState<Record<string, ContractDto>>({});
  const [contractsByShipmentId, setContractsByShipmentId] = useState<Record<string, ContractDto>>({});
  const [filterType, setFilterType] = useState<"ALL" | "PENDING" | "ACCEPTED">("ALL");
  const [counterProposalId, setCounterProposalId] = useState<string | null>(null);
  const [counterValueInput, setCounterValueInput] = useState<string>("");
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [selectedProposalForPix, setSelectedProposalForPix] = useState<ProposalDto | null>(null);
  const [selectedContractForPix, setSelectedContractForPix] = useState<ContractDto | null>(null);
  const [, setClockTick] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setClockTick((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!token || !user) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setErrorMessage(null);

    const unifiedList: ProposalDto[] = [];
    const seenIds = new Set<string>();

    try {
      const contractsRes = await listMyContractsApi(token);
      if (contractsRes.ok && contractsRes.data) {
        const byProp: Record<string, ContractDto> = {};
        const byShip: Record<string, ContractDto> = {};
        const priority = (s: string) =>
          s === "ACTIVE" || s === "COMPLETED" ? 3 : s === "AWAITING_PAYMENT" ? 2 : 1;

        for (const c of contractsRes.data) {
          const prevP = byProp[c.proposalId];
          if (!prevP || priority(c.status) >= priority(prevP.status)) {
            byProp[c.proposalId] = c;
          }
          const prevS = byShip[c.shipmentId];
          if (!prevS || priority(c.status) >= priority(prevS.status)) {
            byShip[c.shipmentId] = c;
          }
        }
        setContractsByProposalId(byProp);
        setContractsByShipmentId(byShip);
      }

      if (activeTab === "SENT") {
        const res = await listProposalsByCarrierApi(user.userId, token);
        if (res.ok && res.data) {
          for (const p of res.data) {
            seenIds.add(p.id);
            unifiedList.push(p);
          }
        }
      } else {
        const res = await listProposalsForSenderApi(user.userId, token);
        if (res.ok && res.data) {
          for (const p of res.data) {
            seenIds.add(p.id);
            unifiedList.push(p);
          }
        }
      }
    } catch (err) {
      console.warn("Aviso ao buscar propostas da API:", err);
    }

    const isLocalHost =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (isLocalHost) {
      const localDemos = getDemoProposals();
      const myName = (user.displayName || user.email || "").toLowerCase();

      for (const d of localDemos) {
        if (!seenIds.has(d.id)) {
          const isCarrierOfProposal = d.isCurrentUserCarrier === true || (Boolean(myName) && Boolean(d.carrierName?.toLowerCase().includes(myName)));
          const isSenderOfProposal = d.isCurrentUserCarrier === false || (Boolean(myName) && Boolean(d.senderName?.toLowerCase().includes(myName)));

          const showInSent = activeTab === "SENT" && (isCarrier || isCarrierOfProposal || d.isCurrentUserCarrier);
          const showInReceived = activeTab === "RECEIVED" && (isSender || isSenderOfProposal || !d.isCurrentUserCarrier);

          if (showInSent || showInReceived) {
            seenIds.add(d.id);
            unifiedList.push({
              id: d.id,
              shipmentId: d.shipmentId,
              carrierId: "demo-carrier",
              carrierName: d.carrierName || "Transportador Parceiro",
              senderId: user.userId,
              senderName: d.senderName || "Remetente",
              amountCents: d.proposedPriceCents,
              status: d.status === "COUNTER_PROPOSED" ? "COUNTERED" : d.status,
              version: 1,
              counterCount: 0,
              isExpired: false,
              notes: d.message || "Proposta registrada via TopicLog Feed",
              expiresAtUtc: new Date(Date.now() + 86400000).toISOString(),
              createdAtUtc: new Date().toISOString()
            });
          }
        }
      }
    }

    setProposals(unifiedList);
    setLoading(false);
  }, [token, user, activeTab, isCarrier, isSender]);

  useEffect(() => {
    if (isAuthenticated) {
      void loadData();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, loadData]);

  // Passo 1 do Remetente: Aceita proposta no backend com janela de 15 minutos e abre Pix
  const handleAcceptAndOpenPix = async (proposal: ProposalDto) => {
    if (!token) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setActionNotice(null);

    try {
      if (proposal.id.startsWith("prop-")) {
        updateProposalStatus(proposal.id, "ACCEPTED");
        setSelectedProposalForPix(proposal);
        setSelectedContractForPix(null);
        setPixModalOpen(true);
        await loadData(true);
        return;
      }

      const existingContract = contractsByProposalId[proposal.id] || contractsByShipmentId[proposal.shipmentId];
      if (existingContract && existingContract.status === "AWAITING_PAYMENT") {
        setSelectedProposalForPix(proposal);
        setSelectedContractForPix(existingContract);
        setPixModalOpen(true);
        return;
      }

      const res = await acceptProposalApi(proposal.id, proposal.version ?? 1, token, undefined, true);
      if (res.ok && res.data) {
        const createdContract = res.data;
        setSelectedProposalForPix(proposal);
        setSelectedContractForPix(createdContract);
        setPixModalOpen(true);
        setActionNotice("✓ Proposta aceita! O código Pix foi gerado — conclua o pagamento em até 15 minutos para confirmar o frete.");
        await loadData(true);
      } else if (res.problem) {
        setErrorMessage(res.problem.detail || "Não foi possível aceitar a proposta.");
      } else {
        setErrorMessage("Erro ao formalizar aceite da proposta.");
      }
    } catch {
      setErrorMessage("Erro ao processar o aceite da proposta.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResumePixPayment = (proposal: ProposalDto, contract: ContractDto) => {
    setSelectedProposalForPix(proposal);
    setSelectedContractForPix(contract);
    setPixModalOpen(true);
  };

  // Passo 2 do Remetente: Mercado Pago aprova o Pix -> Confirma pagamento na API (tira do Mural, libera códigos e chat)
  const handlePixSuccess = async (paymentData: MercadoPagoPixData) => {
    if (!token || !selectedProposalForPix) {
      setPixModalOpen(false);
      return;
    }

    const contract =
      selectedContractForPix ||
      contractsByProposalId[selectedProposalForPix.id] ||
      contractsByShipmentId[selectedProposalForPix.shipmentId];

    if (contract && !selectedProposalForPix.id.startsWith("prop-")) {
      const confirmRes = await confirmContractPaymentApi(
        contract.id,
        {
          paymentProvider: "mercadopago_pix",
          paymentReferenceId: String(paymentData.id || `mp-${Date.now()}`)
        },
        token
      );
      if (!confirmRes.ok) {
        setErrorMessage(
          confirmRes.problem?.detail ||
            "Pix aprovado, mas houve falha ao registrar a confirmação no servidor. Recarregue a página."
        );
        setPixModalOpen(false);
        return;
      }
    }

    setActionNotice(
      `✓ Pagamento Pix de R$ ${(selectedProposalForPix.amountCents / 100).toFixed(2).replace(".", ",")} confirmado! Sua encomenda saiu do mural público, o chat privado foi liberado e os códigos de coleta/entrega já estão em Minhas Atividades.`
    );
    setPixModalOpen(false);
    setSelectedContractForPix(null);
    await loadData(true);
  };

  // Recusar Proposta
  const handleReject = async (proposalId: string) => {
    if (!token) return;
    if (!window.confirm("Deseja realmente recusar esta proposta de frete?")) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setActionNotice(null);

    try {
      if (proposalId.startsWith("prop-")) {
        updateProposalStatus(proposalId, "REJECTED");
        setActionNotice("Proposta recusada.");
        await loadData();
      } else {
        const res = await rejectProposalApi(proposalId, "Proposta recusada pelo usuário", token);
        if (res.ok) {
          setActionNotice("Proposta recusada.");
          await loadData();
        } else if (res.problem) {
          setErrorMessage(res.problem.detail || "Não foi possível recusar a proposta.");
        }
      }
    } catch {
      setErrorMessage("Erro ao recusar a proposta.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Excluir Proposta do Histórico
  const handleDeleteProposal = async (proposalId: string) => {
    if (!window.confirm("Deseja realmente remover esta proposta do seu histórico?")) return;
    removeDemoProposal(proposalId);
    setActionNotice("Proposta removida do seu histórico.");
    await loadData();
  };

  // Enviar Contraproposta
  const handleSendCounter = async (proposal: ProposalDto) => {
    if (!token) return;
    const cleanNum = parseFloat(counterValueInput.replace(",", ".").replace(/[^0-9.]/g, ""));
    if (isNaN(cleanNum) || cleanNum <= 0) {
      setErrorMessage("Informe um valor válido em reais para a contraproposta.");
      return;
    }
    const amountCents = Math.round(cleanNum * 100);
    setIsSubmitting(true);
    setErrorMessage(null);
    setActionNotice(null);

    try {
      if (proposal.id.startsWith("prop-")) {
        updateProposalStatus(proposal.id, "COUNTER_PROPOSED", amountCents);
        setActionNotice(`✓ Contraproposta de R$ ${cleanNum.toFixed(2).replace(".", ",")} enviada com sucesso! Aguarde a resposta da outra parte.`);
        setCounterProposalId(null);
        setCounterValueInput("");
        await loadData();
      } else {
        const res = await counterProposalApi(
          proposal.id,
          {
            amountCents,
            notes: `Contraproposta no valor de R$ ${cleanNum.toFixed(2).replace(".", ",")}`
          },
          token
        );
        if (res.ok) {
          setActionNotice(`✓ Contraproposta de R$ ${cleanNum.toFixed(2).replace(".", ",")} enviada com sucesso! Aguarde a resposta da outra parte.`);
          setCounterProposalId(null);
          setCounterValueInput("");
          await loadData();
        } else if (res.problem) {
          setErrorMessage(res.problem.detail || "Não foi possível enviar a contraproposta.");
        }
      }
    } catch {
      setErrorMessage("Erro ao enviar contraproposta.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <main className="container" style={{ paddingTop: "40px", paddingBottom: "60px", textAlign: "center" }}>
        <p style={{ color: "var(--color-muted, #64748B)", fontSize: "16px" }}>Carregando sua sessão...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="container" style={{ paddingTop: "40px", paddingBottom: "60px" }}>
        <div className="card" style={{ maxWidth: "520px", margin: "0 auto", textAlign: "center", padding: "32px 24px" }}>
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>🔒</div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: "var(--color-brand-deep-navy, #0F172A)", marginBottom: "8px" }}>
            Acesse sua conta para ver suas negociações
          </h1>
          <p style={{ color: "var(--color-muted, #64748B)", fontSize: "14px", lineHeight: "1.5", marginBottom: "24px" }}>
            Para acompanhar propostas recebidas de transportadores ou propostas que você enviou, faça login na plataforma.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Link href="/entrar" className="btn btn--primary" style={{ padding: "12px", textDecoration: "none" }}>
              Entrar na Topic Log
            </Link>
            <Link href="/cadastro" className="btn btn--outline" style={{ padding: "12px", textDecoration: "none" }}>
              Criar conta gratuita
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const filteredProposals = proposals.filter((p) => {
    if (filterType === "PENDING") return p.status === "PENDING" || p.status === "COUNTERED";
    if (filterType === "ACCEPTED") return p.status === "ACCEPTED";
    return true;
  });

  return (
    <main className="container" style={{ paddingTop: "28px", paddingBottom: "60px", maxWidth: "860px" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 800, margin: "0 0 6px 0", color: "#0F172A" }}>
          Negociações & Propostas de Frete
        </h1>
        <p style={{ color: "#64748B", margin: 0, fontSize: "15px" }}>
          Gerencie valores ofertados, envie contrapropostas e formalize contratos de transporte.
        </p>
      </div>

      {/* Seletor Bilateral de Abas: Recebidas (Remetente) vs Enviadas (Transportador) */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          backgroundColor: "#F1F5F9",
          padding: "4px",
          borderRadius: "12px",
          marginBottom: "20px"
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("RECEIVED")}
          id="tab-propostas-recebidas"
          style={{
            flex: 1,
            padding: "10px 16px",
            borderRadius: "10px",
            border: "none",
            fontSize: "14px",
            fontWeight: 700,
            cursor: "pointer",
            backgroundColor: activeTab === "RECEIVED" ? "#2563EB" : "transparent",
            color: activeTab === "RECEIVED" ? "#FFFFFF" : "#475569",
            transition: "all 0.15s ease",
            boxShadow: activeTab === "RECEIVED" ? "0 2px 6px rgba(37, 99, 235, 0.25)" : "none"
          }}
        >
          📥 Propostas Recebidas (Remetente)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("SENT")}
          id="tab-propostas-enviadas"
          style={{
            flex: 1,
            padding: "10px 16px",
            borderRadius: "10px",
            border: "none",
            fontSize: "14px",
            fontWeight: 700,
            cursor: "pointer",
            backgroundColor: activeTab === "SENT" ? "#2563EB" : "transparent",
            color: activeTab === "SENT" ? "#FFFFFF" : "#475569",
            transition: "all 0.15s ease",
            boxShadow: activeTab === "SENT" ? "0 2px 6px rgba(37, 99, 235, 0.25)" : "none"
          }}
        >
          📤 Minhas Ofertas Enviadas (Transportador)
        </button>
      </div>

      {actionNotice && (
        <div
          role="status"
          style={{
            padding: "14px 16px",
            backgroundColor: "#ECFDF5",
            color: "#065F46",
            border: "1px solid #A7F3D0",
            borderRadius: "8px",
            marginBottom: "20px",
            fontSize: "14px",
            fontWeight: 500
          }}
        >
          {actionNotice}
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: "12px 16px",
            backgroundColor: "#FEF2F2",
            color: "#991B1B",
            border: "1px solid #FECACA",
            borderRadius: "8px",
            marginBottom: "20px",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px"
          }}
        >
          <span>⚠️ {errorMessage}</span>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void loadData()}
              style={{ fontSize: "12px", padding: "6px 14px", cursor: "pointer" }}
            >
              🔄 Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Filtros de Status */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", borderBottom: "1px solid #E2E8F0", paddingBottom: "10px" }}>
        <button
          type="button"
          onClick={() => setFilterType("ALL")}
          style={{
            padding: "6px 14px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            border: "none",
            backgroundColor: filterType === "ALL" ? "#2563EB" : "#F1F5F9",
            color: filterType === "ALL" ? "#FFFFFF" : "#475569"
          }}
        >
          Todas ({proposals.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterType("PENDING")}
          style={{
            padding: "6px 14px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            border: "none",
            backgroundColor: filterType === "PENDING" ? "#2563EB" : "#F1F5F9",
            color: filterType === "PENDING" ? "#FFFFFF" : "#475569"
          }}
        >
          Em Negociação ({proposals.filter((p) => p.status === "PENDING" || p.status === "COUNTERED").length})
        </button>
        <button
          type="button"
          onClick={() => setFilterType("ACCEPTED")}
          style={{
            padding: "6px 14px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            border: "none",
            backgroundColor: filterType === "ACCEPTED" ? "#2563EB" : "#F1F5F9",
            color: filterType === "ACCEPTED" ? "#FFFFFF" : "#475569"
          }}
        >
          Aceitas ({proposals.filter((p) => p.status === "ACCEPTED").length})
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <p style={{ color: "#64748B" }}>Atualizando negociações...</p>
        </div>
      ) : filteredProposals.length === 0 ? (
        <EmptyState
          icon="📦"
          title={activeTab === "SENT" ? "Nenhuma proposta enviada até o momento" : "Nenhuma proposta recebida para suas encomendas"}
          description={
            activeTab === "SENT"
              ? "Você ainda não enviou propostas de frete para as encomendas disponíveis no Mural."
              : "Assim que um motorista visualizar sua carga publicada e enviar uma oferta, ela aparecerá aqui para você aceitar ou negociar."
          }
          actionLabel={activeTab === "SENT" ? "Ver Encomendas no Mural" : "Publicar Nova Encomenda"}
          actionHref={activeTab === "SENT" ? "/feed" : "/encomendas/publicar"}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {filteredProposals.map((proposal) => {
            const isPending = proposal.status === "PENDING";
            const isCountered = proposal.status === "COUNTERED";
            const isAccepted = proposal.status === "ACCEPTED";
            const isRejected = proposal.status === "REJECTED";
            const contract =
              contractsByProposalId[proposal.id] ||
              contractsByShipmentId[proposal.shipmentId];
            const isPaid =
              isAccepted &&
              (contract?.status === "ACTIVE" || contract?.status === "COMPLETED");
            const isAwaitingPayment =
              isAccepted && contract?.status === "AWAITING_PAYMENT";
            const isPaymentExpired = contract?.status === "PAYMENT_EXPIRED";
            const countdown = isAwaitingPayment
              ? formatRemainingCountdown(contract?.paymentExpiresAtUtc)
              : null;
            const isUserSender =
              proposal.senderId === user?.userId ||
              (!proposal.senderId && activeTab === "RECEIVED");

            return (
              <div
                key={proposal.id}
                className="card"
                style={{
                  padding: "20px",
                  borderRadius: "14px",
                  border: isPaid
                    ? "2px solid #10B981"
                    : isAwaitingPayment
                      ? "2px solid #F59E0B"
                      : "1px solid #E2E8F0",
                  backgroundColor: "#FFFFFF",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.03)"
                }}
              >
                {/* Linha Superior: Quem propôs e Valor */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748B", textTransform: "uppercase" }}>
                        {activeTab === "SENT"
                          ? `Para: ${proposal.senderName || "Remetente"}`
                          : `Transportador: ${proposal.carrierName || "Motorista Parceiro"}`}
                      </span>
                      {isPaid && (
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#065F46", backgroundColor: "#D1FAE5", padding: "2px 8px", borderRadius: "12px" }}>
                          ✓ Pagamento Confirmado
                        </span>
                      )}
                      {isAwaitingPayment && (
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#92400E", backgroundColor: "#FEF3C7", padding: "2px 8px", borderRadius: "12px" }}>
                          ⏳ Aguardando Pix {countdown ? `(${countdown})` : "(15 min)"}
                        </span>
                      )}
                      {isAccepted && !isPaid && !isAwaitingPayment && (
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#065F46", backgroundColor: "#D1FAE5", padding: "2px 8px", borderRadius: "12px" }}>
                          ✓ Frete Aceito
                        </span>
                      )}
                      {isPaymentExpired && (
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#991B1B", backgroundColor: "#FEE2E2", padding: "2px 8px", borderRadius: "12px" }}>
                          ⌛ Prazo Pix Expirado
                        </span>
                      )}
                      {isCountered && (
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#1E40AF", backgroundColor: "#DBEAFE", padding: "2px 8px", borderRadius: "12px" }}>
                          🔄 Contraproposta Ativa
                        </span>
                      )}
                      {isRejected && (
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#991B1B", backgroundColor: "#FEE2E2", padding: "2px 8px", borderRadius: "12px" }}>
                          ✕ Recusada
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: "12px", color: "#94A3B8", display: "block" }}>
                      ID Encomenda: #{proposal.shipmentId.slice(0, 8)} • Recebida em: {safeFormatDate(proposal.createdAtUtc)}
                    </span>
                    <div style={{ marginTop: "6px" }}>
                      <StarRatingDisplay
                        size="sm"
                        ratingAvg={proposal.carrierRatingAvg ?? 0}
                        ratingCount={proposal.carrierRatingCount ?? 0}
                        label="Avaliação do Transportador:"
                      />
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "11px", color: "#64748B", display: "block" }}>Valor da Oferta</span>
                    <span style={{ fontSize: "22px", fontWeight: 800, color: "#1D4ED8" }}>
                      R$ {(proposal.amountCents / 100).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                </div>

                {/* Mensagem / Observações */}
                {proposal.notes && (
                  <div style={{ backgroundColor: "#F8FAFC", border: "1px solid #EDF2F7", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#334155", marginBottom: "14px" }}>
                    💬 <em>&ldquo;{proposal.notes}&rdquo;</em>
                  </div>
                )}

                {/* Painel de Contraproposta (se aberto) */}
                {counterProposalId === proposal.id && (
                  <div style={{ backgroundColor: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "10px", padding: "14px", marginBottom: "14px" }}>
                    <label htmlFor={`counter-input-${proposal.id}`} style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#1E40AF", marginBottom: "6px" }}>
                      Proponha um novo valor de frete (R$):
                    </label>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        id={`counter-input-${proposal.id}`}
                        type="text"
                        placeholder="Ex: 85,00"
                        value={counterValueInput}
                        onChange={(e) => setCounterValueInput(e.target.value)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "8px",
                          border: "1px solid #93C5FD",
                          fontSize: "14px",
                          fontWeight: 700,
                          width: "140px",
                          outline: "none"
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void handleSendCounter(proposal)}
                        disabled={isSubmitting}
                        className="btn btn--primary"
                        style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 700 }}
                      >
                        {isSubmitting ? "Enviando..." : "Enviar Contraproposta"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setCounterProposalId(null); setCounterValueInput(""); }}
                        style={{ background: "none", border: "none", color: "#64748B", fontSize: "13px", cursor: "pointer" }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Botões de Ação para o Remetente (quando na aba Recebidas) */}
                {activeTab === "RECEIVED" && (isPending || isCountered) && (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => void handleAcceptAndOpenPix(proposal)}
                      style={{
                        padding: "8px 18px",
                        backgroundColor: "#059669",
                        color: "#FFFFFF",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "13px",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px"
                      }}
                    >
                      ⚡ Aceitar Proposta & Gerar Pix
                    </button>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        setCounterProposalId(proposal.id);
                        setCounterValueInput((proposal.amountCents / 100).toFixed(2).replace(".", ","));
                      }}
                      style={{
                        padding: "8px 16px",
                        backgroundColor: "#EFF6FF",
                        color: "#1D4ED8",
                        border: "1px solid #BFDBFE",
                        borderRadius: "8px",
                        fontSize: "13px",
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                    >
                      🔄 Fazer Contraproposta
                    </button>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => void handleReject(proposal.id)}
                      style={{
                        padding: "8px 14px",
                        backgroundColor: "#FFFFFF",
                        color: "#DC2626",
                        border: "1px solid #FECACA",
                        borderRadius: "8px",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      ✕ Recusar
                    </button>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => void handleDeleteProposal(proposal.id)}
                      style={{
                        padding: "8px 12px",
                        backgroundColor: "#F8FAFC",
                        color: "#64748B",
                        border: "1px solid #CBD5E1",
                        borderRadius: "8px",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                      title="Excluir proposta"
                    >
                      🗑️ Excluir
                    </button>
                  </div>
                )}

                {/* Botões quando Recusada */}
                {isRejected && (
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => void handleDeleteProposal(proposal.id)}
                      style={{
                        padding: "6px 14px",
                        backgroundColor: "#F8FAFC",
                        color: "#DC2626",
                        border: "1px solid #FECACA",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      🗑️ Excluir do Histórico
                    </button>
                  </div>
                )}

                {/* Seção de Comunicação Bilateral Direta da Negociação */}
                {isPaid && contract && token ? (
                  <ProposalNegotiationChat
                    contractId={contract.id}
                    token={token}
                    currentUserId={user?.userId || ""}
                    counterpartName={activeTab === "SENT" ? (proposal.senderName || "Remetente") : (proposal.carrierName || "Transportador")}
                  />
                ) : isAwaitingPayment ? (
                  <div
                    style={{
                      marginTop: "14px",
                      padding: "12px 14px",
                      backgroundColor: "#FFFBEB",
                      border: "1px solid #FDE68A",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "#92400E",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}
                  >
                    <span style={{ fontSize: "16px" }}>⏳</span>
                    <span>
                      {isUserSender ? (
                        <>
                          <strong>Aguardando seu pagamento Pix ({countdown || "15:00"}):</strong>{" "}
                          Assim que o Pix for pago, a encomenda sairá do mural público e serão liberados o chat privado e os códigos de coleta e entrega.
                        </>
                      ) : (
                        <>
                          <strong>O remetente aceitou sua proposta!</strong>{" "}
                          O remetente tem 15 minutos para efetuar o pagamento Pix ({countdown || "em andamento"}). Você receberá um alerta e os endereços completos assim que o pagamento for confirmado.
                        </>
                      )}
                    </span>
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: "14px",
                      padding: "10px 14px",
                      backgroundColor: "#F8FAFC",
                      border: "1px dashed #CBD5E1",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "#64748B",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}
                  >
                    <span style={{ fontSize: "16px" }}>🔒</span>
                    <span>
                      <strong>Troca de mensagens restrita:</strong> O chat direto entre remetente e transportador só é liberado após o aceite da proposta e a confirmação do pagamento Pix.
                    </span>
                  </div>
                )}

                {/* Botões quando Aceito */}
                {isAccepted && (
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap", marginTop: "12px" }}>
                    {isUserSender && isAwaitingPayment && contract && (
                      <button
                        type="button"
                        onClick={() => handleResumePixPayment(proposal, contract)}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#059669",
                          color: "#FFFFFF",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "13px",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px"
                        }}
                      >
                        ⚡ Concluir Pagamento Pix ({countdown || "15 min"})
                      </button>
                    )}

                    {isPaid && (
                      <Link
                        href="/minhas-atividades"
                        className="btn btn--primary"
                        style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}
                      >
                        🔐 Códigos & Acompanhamento no Mapa
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pixModalOpen && selectedProposalForPix && (
        <MercadoPagoPixModal
          isOpen={pixModalOpen}
          onClose={() => setPixModalOpen(false)}
          amountReais={selectedProposalForPix.amountCents / 100}
          description={`Frete TopicLog #${selectedProposalForPix.shipmentId.slice(0, 8)}`}
          payerEmail={user?.email || "contato@topiclog.com.br"}
          payerName={user?.displayName || "Remetente TopicLog"}
          orderId={selectedProposalForPix.shipmentId}
          expiresAtUtc={selectedContractForPix?.paymentExpiresAtUtc}
          onExpired={() => {
            setPixModalOpen(false);
            setSelectedContractForPix(null);
            setErrorMessage("O prazo de 15 minutos para pagamento Pix expirou e a encomenda voltou ao mural.");
            void loadData(true);
          }}
          onPaymentSuccess={handlePixSuccess}
        />
      )}
    </main>
  );
}
