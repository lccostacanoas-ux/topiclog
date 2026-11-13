"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { EmptyState } from "../../components/EmptyState";
import { StarRatingDisplay } from "../../components/StarRatingDisplay";
import {
  listProposalsForSenderApi,
  listProposalsByCarrierApi,
  listMyContractsApi,
  listMyDeliveryOrdersApi,
  getOrderCodesApi,
  acceptProposalApi,
  confirmContractPaymentApi,
  rejectProposalApi,
  counterProposalApi,
  listContractMessagesApi,
  sendContractMessageApi,
  getCancellationPolicyApi,
  cancelContractBySenderApi
} from "../../lib/api-client";
import {
  getDemoProposals,
  updateProposalStatus,
  removeDemoProposal,
  type DemoProposal
} from "../../lib/demo-marketplace-store";
import { useAuth } from "../../lib/auth-context";
import type {
  ContractDto,
  ContractMessageDto,
  ProposalDto,
  DeliveryOrderDto,
  OrderCodesDto
} from "../../lib/types";
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
  const [ordersByContractId, setOrdersByContractId] = useState<Record<string, DeliveryOrderDto>>({});
  const [ordersByShipmentId, setOrdersByShipmentId] = useState<Record<string, DeliveryOrderDto>>({});
  const [orderCodesByOrderId, setOrderCodesByOrderId] = useState<Record<string, OrderCodesDto>>({});
  const [filterType, setFilterType] = useState<"ALL" | "PENDING" | "COMPLETED" | "CANCELLED" | "AWAITING_PAYMENT">("ALL");
  const [counterProposalId, setCounterProposalId] = useState<string | null>(null);
  const [counterValueInput, setCounterValueInput] = useState<string>("");
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [selectedProposalForPix, setSelectedProposalForPix] = useState<ProposalDto | null>(null);
  const [selectedContractForPix, setSelectedContractForPix] = useState<ContractDto | null>(null);
  const [cancellationPenaltyPercent, setCancellationPenaltyPercent] = useState<number>(10);
  const [cancelTarget, setCancelTarget] = useState<{
    contract: ContractDto;
    proposal: ProposalDto;
    isPaid: boolean;
  } | null>(null);
  const [cancelJustification, setCancelJustification] = useState<string>("");
  const [cancelReopen, setCancelReopen] = useState<boolean>(true);
  const [submittingCancel, setSubmittingCancel] = useState<boolean>(false);
  const [, setClockTick] = useState(0);

  // Modo de visualização: CARDS (expandido/recolhível) ou LIST (tabela compacta)
  const [viewMode, setViewMode] = useState<"CARDS" | "LIST">("CARDS");
  // Controle individual de recolhimento de cada card (proposal.id -> boolean)
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const savedMode = localStorage.getItem("topiclog_proposals_view_mode");
      if (savedMode === "LIST" || savedMode === "CARDS") {
        setViewMode(savedMode);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleViewModeChange = (mode: "CARDS" | "LIST") => {
    setViewMode(mode);
    try {
      localStorage.setItem("topiclog_proposals_view_mode", mode);
    } catch {
      // ignore
    }
  };

  const toggleCardExpansion = (proposalId: string, defaultExpanded: boolean) => {
    setExpandedCardIds((prev) => ({
      ...prev,
      [proposalId]: prev[proposalId] !== undefined ? !prev[proposalId] : !defaultExpanded
    }));
  };

  const setAllCardsExpanded = (expanded: boolean) => {
    const next: Record<string, boolean> = {};
    for (const p of proposals) {
      next[p.id] = expanded;
    }
    setExpandedCardIds(next);
  };

  useEffect(() => {
    let active = true;
    getCancellationPolicyApi()
      .then((res) => {
        if (!active || !res.ok || !res.data) return;
        const pct = Math.min(10, Math.max(0, Number(res.data.cancellationPenaltyPercent ?? 10)));
        setCancellationPenaltyPercent(pct);
      })
      .catch(() => {
        // fallback 10%
      });
    return () => {
      active = false;
    };
  }, []);

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
    let deliveryOrdersList: DeliveryOrderDto[] = [];

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

      // Carrega ordens de entrega para recuperar status e códigos de coleta/retirada
      const ordersRes = await listMyDeliveryOrdersApi(token);
      if (ordersRes.ok && ordersRes.data) {
        deliveryOrdersList = ordersRes.data;
        const byContract: Record<string, DeliveryOrderDto> = {};
        const byShipment: Record<string, DeliveryOrderDto> = {};
        for (const o of ordersRes.data) {
          if (o.contractId) byContract[o.contractId] = o;
          if (o.shipmentId) byShipment[o.shipmentId] = o;
        }
        setOrdersByContractId(byContract);
        setOrdersByShipmentId(byShipment);

        // Se o usuário for remetente, busca os códigos de retirada/entrega das ordens ativas
        const senderOrders = ordersRes.data.filter((o) => o.senderId === user.userId);
        if (senderOrders.length > 0) {
          const codesMap: Record<string, OrderCodesDto> = {};
          await Promise.all(
            senderOrders.map(async (o) => {
              const cRes = await getOrderCodesApi(o.id, token);
              if (cRes.ok && cRes.data) {
                codesMap[o.id] = cRes.data;
              }
            })
          );
          setOrderCodesByOrderId(codesMap);
        }
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

    const myName = (user.displayName || user.email || "").toLowerCase();

    // Se o usuário está autenticado com token na API oficial, NÃO mesclamos dados demo do localStorage
    // para garantir isolamento estrito entre usuários e evitar vazamento de propostas residuais.
    if (!token) {
      const localDemos = getDemoProposals();

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
              carrierId: user.userId,
              carrierName: d.carrierName || user.displayName || "Transportador Parceiro",
              senderId: user.userId,
              senderName: d.senderName || "Remetente",
              amountCents: d.proposedPriceCents,
              status: d.status === "COUNTER_PROPOSED" ? "COUNTERED" : d.status,
              version: 1,
              counterCount: 0,
              isExpired: false,
              notes: d.message || "Proposta registrada via TopicLog Feed",
              expiresAtUtc: new Date(Date.now() + 86400000).toISOString(),
              createdAtUtc: new Date().toISOString(),
              carrierRatingAvg: user.ratingAvg ?? 4.7,
              carrierRatingCount: user.ratingCount ?? 3,
              shipmentTitle: d.shipmentTitle
            });
          }
        }
      }
    }

    // Garante que todas as entregas concluídas do transportador constem no histórico da aba Minhas Propostas
    if (activeTab === "SENT" && deliveryOrdersList.length > 0) {
      for (const o of deliveryOrdersList) {
        if (o.carrierId === user.userId || (o.carrierName && o.carrierName.toLowerCase().includes(myName))) {
          const tripKey = o.contractId || o.shipmentId || o.id;
          if (!seenIds.has(tripKey) && !seenIds.has(o.shipmentId)) {
            // Ignora a entrega de teste 3f2cea3b conforme solicitação do usuário
            if (o.shipmentId?.startsWith("3f2cea3b")) continue;

            seenIds.add(tripKey);
            let routeLabel = "Belo Horizonte → João Monlevade";
            if (o.originAddressSummary && o.destinationAddressSummary) {
              const oC = o.originAddressSummary.split(" - ");
              const dC = o.destinationAddressSummary.split(" - ");
              routeLabel = `${oC.length >= 2 ? oC[oC.length - 2] : "Belo Horizonte"} → ${dC.length >= 2 ? dC[dC.length - 2] : "João Monlevade"}`;
            }

            unifiedList.push({
              id: tripKey,
              shipmentId: o.shipmentId,
              carrierId: user.userId,
              carrierName: o.carrierName || user.displayName || "Luiz Carlos Costa",
              senderId: o.senderId || "sender-id",
              senderName: o.senderName || "Remetente",
              amountCents: o.amountCents || 550,
              status: "ACCEPTED",
              version: 1,
              counterCount: 0,
              isExpired: false,
              notes: "Entrega verificada e concluída com sucesso.",
              expiresAtUtc: new Date().toISOString(),
              createdAtUtc: o.createdAtUtc || new Date().toISOString(),
              carrierRatingAvg: user.ratingAvg ?? 4.7,
              carrierRatingCount: user.ratingCount ?? 3,
              shipmentTitle: routeLabel
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

  // Aceite pelo Transportador de uma Contraproposta enviada pelo Remetente (gera contrato AWAITING_PAYMENT para o remetente pagar em 15 min)
  const handleCarrierAcceptCounter = async (proposal: ProposalDto) => {
    if (!token) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setActionNotice(null);

    try {
      if (proposal.id.startsWith("prop-")) {
        updateProposalStatus(proposal.id, "ACCEPTED");
        setActionNotice("✓ Contraproposta aceita! O remetente foi notificado para efetuar o pagamento Pix.");
        await loadData(true);
        return;
      }

      const res = await acceptProposalApi(proposal.id, proposal.version ?? 1, token, undefined, true);
      if (res.ok && res.data) {
        setActionNotice("✓ Contraproposta aceita! O remetente foi notificado e tem 15 minutos para efetuar o pagamento Pix.");
        await loadData(true);
      } else if (res.problem) {
        setErrorMessage(res.problem.detail || "Não foi possível aceitar a contraproposta.");
      } else {
        setErrorMessage("Erro ao formalizar aceite da contraproposta.");
      }
    } catch {
      setErrorMessage("Erro ao processar o aceite da contraproposta.");
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

  // Mantém todo o histórico de viagens e propostas (ativas, concluídas e canceladas)
  const visibleProposals = proposals;

  const isTripCompleted = (p: ProposalDto) => {
    const c = contractsByProposalId[p.id] || contractsByShipmentId[p.shipmentId];
    const o = (c && ordersByContractId[c.id]) || ordersByShipmentId[p.shipmentId];
    return c?.status === "COMPLETED" || o?.status === "DELIVERED_VERIFIED" || o?.status === "CLOSED";
  };

  const isTripCancelled = (p: ProposalDto) => {
    const c = contractsByProposalId[p.id] || contractsByShipmentId[p.shipmentId];
    return (
      c?.status === "CANCELLED_PRE_PICKUP" ||
      c?.status === "CANCELLED_POST_PICKUP" ||
      c?.status === "PAYMENT_EXPIRED" ||
      p.status === "REJECTED"
    );
  };

  const isTripPending = (p: ProposalDto) => {
    return !isTripCompleted(p) && !isTripCancelled(p);
  };

  const completedCount = visibleProposals.filter(isTripCompleted).length;
  const cancelledCount = visibleProposals.filter(isTripCancelled).length;
  const pendingCount = visibleProposals.filter(isTripPending).length;

  const awaitingPaymentCount = visibleProposals.filter((p) => {
    if (isTripCompleted(p) || isTripCancelled(p)) return false;
    const c = contractsByProposalId[p.id] || contractsByShipmentId[p.shipmentId];
    return c?.status === "AWAITING_PAYMENT" || (p.status === "ACCEPTED" && c?.status !== "ACTIVE" && c?.status !== "COMPLETED");
  }).length;

  const filteredProposals = visibleProposals.filter((p) => {
    if (filterType === "COMPLETED") return isTripCompleted(p);
    if (filterType === "CANCELLED") return isTripCancelled(p);
    if (filterType === "PENDING") return isTripPending(p);
    if (filterType === "AWAITING_PAYMENT") {
      if (isTripCompleted(p) || isTripCancelled(p)) return false;
      const c = contractsByProposalId[p.id] || contractsByShipmentId[p.shipmentId];
      return c?.status === "AWAITING_PAYMENT" || (p.status === "ACCEPTED" && c?.status !== "ACTIVE" && c?.status !== "COMPLETED");
    }
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

      {/* Banner de Aviso de Pagamento Pix Pendente para o Remetente */}
      {awaitingPaymentCount > 0 && activeTab === "RECEIVED" && (
        <div
          style={{
            backgroundColor: "#FEF3C7",
            border: "2px solid #F59E0B",
            borderRadius: "12px",
            padding: "14px 18px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            boxShadow: "0 2px 6px rgba(245, 158, 11, 0.15)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "24px" }}>⚡</span>
            <div>
              <div style={{ fontWeight: 800, color: "#92400E", fontSize: "14px" }}>
                Você tem {awaitingPaymentCount} {awaitingPaymentCount === 1 ? "proposta aceita aguardando" : "propostas aceitas aguardando"} pagamento Pix!
              </div>
              <div style={{ fontSize: "12px", color: "#B45309", marginTop: "2px" }}>
                Após o pagamento Pix, o sistema confirma o frete e gera de imediato o <strong>Código de Retirada</strong> para início da viagem.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const target = visibleProposals.find((p) => {
                if (isTripCompleted(p) || isTripCancelled(p)) return false;
                const c = contractsByProposalId[p.id] || contractsByShipmentId[p.shipmentId];
                return c?.status === "AWAITING_PAYMENT" || p.status === "ACCEPTED";
              });
              if (target) {
                const c = contractsByProposalId[target.id] || contractsByShipmentId[target.shipmentId] || null;
                setSelectedProposalForPix(target);
                setSelectedContractForPix(c);
                setPixModalOpen(true);
              } else {
                setFilterType("AWAITING_PAYMENT");
              }
            }}
            style={{
              backgroundColor: "#D97706",
              color: "#FFFFFF",
              border: "none",
              padding: "10px 18px",
              borderRadius: "8px",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(217, 119, 6, 0.3)"
            }}
          >
            Pagar com Pix Agora ➔
          </button>
        </div>
      )}

      {/* Barra de Filtros de Status e Seletor de Modo de Visualização (Cards vs Lista Compacta) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          marginBottom: "20px",
          borderBottom: "1px solid #E2E8F0",
          paddingBottom: "12px",
          flexWrap: "wrap"
        }}
      >
        {/* Filtros de Status */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
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
            Todas ({visibleProposals.length})
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
            Pendentes ({pendingCount})
          </button>
          {awaitingPaymentCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterType("AWAITING_PAYMENT")}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                border: "none",
                backgroundColor: filterType === "AWAITING_PAYMENT" ? "#D97706" : "#FEF3C7",
                color: filterType === "AWAITING_PAYMENT" ? "#FFFFFF" : "#92400E"
              }}
            >
              ⚡ Aguardando Pagamento ({awaitingPaymentCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => setFilterType("COMPLETED")}
            style={{
              padding: "6px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              backgroundColor: filterType === "COMPLETED" ? "#059669" : "#F1F5F9",
              color: filterType === "COMPLETED" ? "#FFFFFF" : "#475569"
            }}
          >
            Concluídas ({completedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("CANCELLED")}
            style={{
              padding: "6px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              backgroundColor: filterType === "CANCELLED" ? "#DC2626" : "#F1F5F9",
              color: filterType === "CANCELLED" ? "#FFFFFF" : "#475569"
            }}
          >
            Canceladas ({cancelledCount})
          </button>
        </div>

        {/* Controles de Visualização: Cards vs Lista e Recolher/Expandir */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {viewMode === "CARDS" && filteredProposals.length > 0 && (
            <div style={{ display: "flex", gap: "6px", marginRight: "6px" }}>
              <button
                type="button"
                onClick={() => setAllCardsExpanded(false)}
                title="Recolher todos os cards para visualização compacta"
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "1px solid #CBD5E1",
                  backgroundColor: "#FFFFFF",
                  color: "#475569"
                }}
              >
                ▲ Recolher Todos
              </button>
              <button
                type="button"
                onClick={() => setAllCardsExpanded(true)}
                title="Expandir todos os cards com histórico completo"
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "1px solid #CBD5E1",
                  backgroundColor: "#FFFFFF",
                  color: "#475569"
                }}
              >
                ▼ Expandir Todos
              </button>
            </div>
          )}

          {/* Toggle Card vs Lista */}
          <div
            style={{
              display: "inline-flex",
              borderRadius: "8px",
              backgroundColor: "#F1F5F9",
              padding: "3px",
              border: "1px solid #E2E8F0"
            }}
          >
            <button
              type="button"
              onClick={() => handleViewModeChange("CARDS")}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                border: "none",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                backgroundColor: viewMode === "CARDS" ? "#FFFFFF" : "transparent",
                color: viewMode === "CARDS" ? "#1D4ED8" : "#64748B",
                boxShadow: viewMode === "CARDS" ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
              }}
            >
              <span>🗂️</span> Cards
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange("LIST")}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                border: "none",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                backgroundColor: viewMode === "LIST" ? "#FFFFFF" : "transparent",
                color: viewMode === "LIST" ? "#1D4ED8" : "#64748B",
                boxShadow: viewMode === "LIST" ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
              }}
            >
              <span>📋</span> Lista Compacta
            </button>
          </div>
        </div>
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
      ) : viewMode === "LIST" ? (
        /* =========================================================================
           MODO LISTA COMPACTA (ALTA DENSIDADE, TABULAR E RÁPIDA NAVEGAÇÃO)
           ========================================================================= */
        <div
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: "12px",
            border: "1px solid #E2E8F0",
            overflow: "hidden",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)"
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: "#F8FAFC",
                    borderBottom: "1px solid #E2E8F0",
                    color: "#64748B",
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}
                >
                  <th style={{ padding: "12px 16px" }}>{activeTab === "SENT" ? "Destinatário (Remetente)" : "Transportador"}</th>
                  <th style={{ padding: "12px 16px" }}>Carga / ID</th>
                  <th style={{ padding: "12px 16px" }}>Data</th>
                  <th style={{ padding: "12px 16px" }}>Status</th>
                  <th style={{ padding: "12px 16px" }}>Avaliação</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Valor da Oferta</th>
                  <th style={{ padding: "12px 16px", textAlign: "center" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredProposals.map((proposal) => {
                  const contract =
                    contractsByProposalId[proposal.id] ||
                    contractsByShipmentId[proposal.shipmentId];
                  const order = (contract && ordersByContractId[contract.id]) || ordersByShipmentId[proposal.shipmentId];
                  const isCompleted =
                    contract?.status === "COMPLETED" ||
                    order?.status === "DELIVERED_VERIFIED" ||
                    order?.status === "CLOSED";
                  const isCancelled =
                    contract?.status === "CANCELLED_PRE_PICKUP" ||
                    contract?.status === "CANCELLED_POST_PICKUP" ||
                    contract?.status === "PAYMENT_EXPIRED" ||
                    proposal.status === "REJECTED";
                  const isPaid =
                    !isCancelled &&
                    (contract?.status === "ACTIVE" ||
                      contract?.status === "COMPLETED" ||
                      order?.status === "IN_TRANSIT" ||
                      order?.status === "DELIVERED_VERIFIED");
                  const isAwaitingPayment =
                    !isCancelled &&
                    !isCompleted &&
                    !isPaid &&
                    (proposal.status === "ACCEPTED" || contract?.status === "AWAITING_PAYMENT");
                  const tripRatingStars = order?.carrierRatingStars ?? (isCompleted ? 5 : null);

                  return (
                    <tr
                      key={proposal.id}
                      style={{
                        borderBottom: "1px solid #F1F5F9",
                        backgroundColor: isCompleted ? "#F0FDF4" : isCancelled ? "#FFFDFD" : "#FFFFFF"
                      }}
                    >
                      <td style={{ padding: "12px 16px", fontWeight: 700, color: "#1E293B" }}>
                        {activeTab === "SENT" ? (proposal.senderName || "Remetente") : (proposal.carrierName || "Motorista Parceiro")}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#475569" }}>
                        <span style={{ fontWeight: 600 }}>{proposal.shipmentTitle || "Carga Geral"}</span>
                        <span style={{ display: "block", fontSize: "11px", color: "#94A3B8" }}>#{proposal.shipmentId.slice(0, 8)}</span>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#64748B", whiteSpace: "nowrap" }}>
                        {safeFormatDate(proposal.createdAtUtc)}
                      </td>
                      <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                        {isCompleted && (
                          <span style={{ fontSize: "11px", fontWeight: 800, color: "#166534", backgroundColor: "#DCFCE7", padding: "3px 8px", borderRadius: "10px", border: "1px solid #86EFAC" }}>
                            ✅ Concluída
                          </span>
                        )}
                        {isCancelled && (
                          <span style={{ fontSize: "11px", fontWeight: 800, color: "#991B1B", backgroundColor: "#FEE2E2", padding: "3px 8px", borderRadius: "10px", border: "1px solid #FECACA" }}>
                            🚫 Cancelada
                          </span>
                        )}
                        {isAwaitingPayment && (
                          <span style={{ fontSize: "11px", fontWeight: 800, color: "#92400E", backgroundColor: "#FEF3C7", padding: "3px 8px", borderRadius: "10px", border: "1px solid #FDE68A" }}>
                            ⏳ Aguardando Pix
                          </span>
                        )}
                        {isPaid && !isCompleted && (
                          <span style={{ fontSize: "11px", fontWeight: 800, color: "#1D4ED8", backgroundColor: "#DBEAFE", padding: "3px 8px", borderRadius: "10px", border: "1px solid #93C5FD" }}>
                            🚚 Em Andamento
                          </span>
                        )}
                        {!isCompleted && !isCancelled && !isAwaitingPayment && !isPaid && (
                          <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569", backgroundColor: "#F1F5F9", padding: "3px 8px", borderRadius: "10px", border: "1px solid #CBD5E1" }}>
                            ⏳ Pendente
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                        {tripRatingStars ? (
                          <span style={{ color: "#EAB308", fontWeight: 700, fontSize: "12px" }}>
                            {"★".repeat(tripRatingStars)} ({tripRatingStars}.0)
                          </span>
                        ) : (
                          <span style={{ color: "#94A3B8", fontSize: "12px" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, color: "#1D4ED8", whiteSpace: "nowrap" }}>
                        R$ {(proposal.amountCents / 100).toFixed(2).replace(".", ",")}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: "6px", alignItems: "center", justifyContent: "center" }}>
                          {isAwaitingPayment && isSender && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProposalForPix(proposal);
                                setSelectedContractForPix(contract || null);
                                setPixModalOpen(true);
                              }}
                              style={{
                                padding: "6px 12px",
                                backgroundColor: "#059669",
                                color: "#FFFFFF",
                                border: "none",
                                borderRadius: "6px",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                boxShadow: "0 1px 3px rgba(5, 150, 105, 0.3)"
                              }}
                            >
                              ⚡ Pagar Pix
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedCardIds((prev) => ({ ...prev, [proposal.id]: true }));
                              setViewMode("CARDS");
                            }}
                            style={{
                              padding: "5px 12px",
                              backgroundColor: "#EFF6FF",
                              color: "#1D4ED8",
                              border: "1px solid #BFDBFE",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer"
                            }}
                          >
                            👁️ Ver Detalhes
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* =========================================================================
           MODO CARDS (COM RECOLHIMENTO/EXPANSÃO INDIVIDUAL E VISUALIZAÇÃO OTIMIZADA)
           ========================================================================= */
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {filteredProposals.map((proposal) => {
            const contract =
              contractsByProposalId[proposal.id] ||
              contractsByShipmentId[proposal.shipmentId];
            const order = (contract && ordersByContractId[contract.id]) || ordersByShipmentId[proposal.shipmentId];
            const orderCodes = order ? orderCodesByOrderId[order.id] : undefined;

            const isCompleted =
              contract?.status === "COMPLETED" ||
              order?.status === "DELIVERED_VERIFIED" ||
              order?.status === "CLOSED";

            const isCancelled =
              contract?.status === "CANCELLED_PRE_PICKUP" ||
              contract?.status === "CANCELLED_POST_PICKUP" ||
              contract?.status === "PAYMENT_EXPIRED" ||
              proposal.status === "REJECTED";

            const isPaid =
              !isCancelled &&
              (contract?.status === "ACTIVE" ||
                contract?.status === "COMPLETED" ||
                order?.status === "IN_TRANSIT" ||
                order?.status === "DELIVERED_VERIFIED");

            const isAwaitingPayment =
              !isCancelled &&
              !isCompleted &&
              !isPaid &&
              (proposal.status === "ACCEPTED" || contract?.status === "AWAITING_PAYMENT");

            const isPending = !isCompleted && !isCancelled;
            const isCountered = proposal.status === "COUNTERED";
            const isAccepted = proposal.status === "ACCEPTED" || isPaid || isCompleted;
            const isRejected = proposal.status === "REJECTED";

            const countdown = isAwaitingPayment
              ? formatRemainingCountdown(contract?.paymentExpiresAtUtc)
              : null;
            const isUserSender =
              proposal.senderId === user?.userId ||
              (!proposal.senderId && activeTab === "RECEIVED");

            // Nota da avaliação da viagem (1 a 5 estrelas)
            const tripRatingStars = order?.carrierRatingStars ?? (isCompleted ? 5 : null);

            // Estado de expansão individual: viagens concluídas ou canceladas iniciam recolhidas por padrão
            const isCardExpanded = expandedCardIds[proposal.id] !== undefined
              ? expandedCardIds[proposal.id]
              : !isCompleted && !isCancelled;

            return (
              <div
                key={proposal.id}
                className="card"
                style={{
                  padding: isCardExpanded ? "20px" : "14px 20px",
                  borderRadius: "14px",
                  border: isCompleted
                    ? "2px solid #86EFAC"
                    : isPaid
                      ? "2px solid #10B981"
                      : isAwaitingPayment
                        ? "2px solid #F59E0B"
                        : isCancelled
                          ? "1px solid #FECACA"
                          : "1px solid #E2E8F0",
                  backgroundColor: isCancelled ? "#FFFDFD" : "#FFFFFF",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                  transition: "all 0.15s ease"
                }}
              >
                {/* Linha Superior: Quem propôs, Status, Valor e Botão de Recolher/Expandir */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                    marginBottom: isCardExpanded ? "12px" : "0"
                  }}
                >
                  <div style={{ flex: 1, minWidth: "260px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748B", textTransform: "uppercase" }}>
                        {activeTab === "SENT"
                          ? `Para: ${proposal.senderName || "Remetente"}`
                          : `Transportador: ${proposal.carrierName || "Motorista Parceiro"}`}
                      </span>

                      {/* Status Badges Claros: Pendente, Cancelada, Concluída */}
                      {isCompleted && (
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "#166534", backgroundColor: "#DCFCE7", padding: "3px 10px", borderRadius: "12px", border: "1px solid #86EFAC" }}>
                          ✅ Concluída • Viagem Finalizada
                        </span>
                      )}
                      {isCancelled && (
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "#991B1B", backgroundColor: "#FEE2E2", padding: "3px 10px", borderRadius: "12px", border: "1px solid #FECACA" }}>
                          🚫 Cancelada
                        </span>
                      )}
                      {isPending && isAwaitingPayment && (
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "#92400E", backgroundColor: "#FEF3C7", padding: "3px 10px", borderRadius: "12px", border: "1px solid #FDE68A" }}>
                          ⏳ Pendente • Aguardando Pix {countdown ? `(${countdown})` : "(15 min)"}
                        </span>
                      )}
                      {isPending && isPaid && (
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "#1D4ED8", backgroundColor: "#DBEAFE", padding: "3px 10px", borderRadius: "12px", border: "1px solid #93C5FD" }}>
                          🚚 Pendente • Em Andamento
                        </span>
                      )}
                      {isPending && !isPaid && !isAwaitingPayment && isCountered && (
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "#1E40AF", backgroundColor: "#DBEAFE", padding: "3px 10px", borderRadius: "12px", border: "1px solid #BFDBFE" }}>
                          🔄 Pendente • Contraproposta Ativa
                        </span>
                      )}
                      {isPending && !isPaid && !isAwaitingPayment && !isCountered && (
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569", backgroundColor: "#F1F5F9", padding: "3px 10px", borderRadius: "12px", border: "1px solid #CBD5E1" }}>
                          ⏳ Pendente • Em Negociação
                        </span>
                      )}
                    </div>

                    <span style={{ fontSize: "12px", color: "#94A3B8", display: "block" }}>
                      ID Encomenda: #{proposal.shipmentId.slice(0, 8)} • Recebida em: {safeFormatDate(proposal.createdAtUtc)}
                    </span>

                    {/* Quantidade de Estrelas da Avaliação da Viagem Concluída */}
                    {isCompleted && (
                      <div
                        style={{
                          marginTop: "6px",
                          padding: "6px 10px",
                          backgroundColor: "#FEFCE8",
                          border: "1px solid #FEF08A",
                          borderRadius: "8px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          flexWrap: "wrap"
                        }}
                      >
                        <span style={{ fontSize: "12px", fontWeight: 800, color: "#854D0E" }}>
                          ⭐ Avaliação desta Viagem:
                        </span>
                        {tripRatingStars ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ color: "#EAB308", fontSize: "16px", letterSpacing: "2px" }}>
                              {"★".repeat(tripRatingStars)}{"☆".repeat(5 - tripRatingStars)}
                            </span>
                            <span style={{ fontSize: "12px", fontWeight: 800, color: "#A16207" }}>
                              ({tripRatingStars}.0 / 5.0 estrelas)
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: "12px", color: "#64748B", fontStyle: "italic" }}>
                            Aguardando avaliação com estrelas do cliente
                          </span>
                        )}
                      </div>
                    )}

                    {!isCompleted && !isCancelled && (
                      <div style={{ marginTop: "6px" }}>
                        <StarRatingDisplay
                          size="sm"
                          ratingAvg={proposal.carrierRatingAvg ?? 0}
                          ratingCount={proposal.carrierRatingCount ?? 0}
                          label="Avaliação Geral do Transportador:"
                        />
                      </div>
                    )}
                  </div>

                  {/* Valor da Oferta e Botão de Expandir / Recolher */}
                  <div style={{ display: "flex", alignItems: "center", gap: "14px", flexShrink: 0 }}>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "11px", color: "#64748B", display: "block" }}>Valor da Oferta</span>
                      <span style={{ fontSize: "20px", fontWeight: 800, color: "#1D4ED8" }}>
                        R$ {(proposal.amountCents / 100).toFixed(2).replace(".", ",")}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleCardExpansion(proposal.id, !isCompleted && !isCancelled)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "7px 12px",
                        borderRadius: "8px",
                        border: "1px solid #CBD5E1",
                        backgroundColor: isCardExpanded ? "#F8FAFC" : "#EFF6FF",
                        color: isCardExpanded ? "#475569" : "#1D4ED8",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                      }}
                      title={isCardExpanded ? "Recolher detalhes da proposta" : "Expandir para ver histórico, chat e ações"}
                    >
                      <span>{isCardExpanded ? "▲ Recolher" : "▼ Expandir Detalhes"}</span>
                    </button>
                  </div>
                </div>

                {/* CORPO EXPANSÍVEL DO CARD (HISTÓRICO, CHAT, AÇÕES, CÓDIGOS DE ENTREGA) */}
                {isCardExpanded && (
                  <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: "1px solid #F1F5F9" }}>

                {/* Mensagem / Observações */}
                {proposal.notes && (
                  <div style={{ backgroundColor: "#F8FAFC", border: "1px solid #EDF2F7", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#334155", marginBottom: "12px" }}>
                    💬 <em>&ldquo;{proposal.notes}&rdquo;</em>
                  </div>
                )}

                {/* Proposta do Remetente e Contrapropostas Subsequentes */}
                {(typeof proposal.senderSuggestedPriceCents === "number" ||
                  (proposal.negotiationHistory && proposal.negotiationHistory.length > 0)) && (
                  <div
                    style={{
                      backgroundColor: "#F8FAFC",
                      border: "1px solid #E2E8F0",
                      borderRadius: "10px",
                      padding: "12px 14px",
                      marginBottom: "14px",
                      fontSize: "12px"
                    }}
                  >
                    <strong style={{ display: "block", color: "#0F172A", marginBottom: "8px", fontSize: "13px" }}>
                      📋 Histórico da Negociação{proposal.shipmentTitle ? ` — ${proposal.shipmentTitle}` : ""}
                    </strong>

                    {typeof proposal.senderSuggestedPriceCents === "number" && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "6px 8px",
                          borderRadius: "6px",
                          backgroundColor: "#FFFFFF",
                          border: "1px solid #E2E8F0",
                          marginBottom: "6px"
                        }}
                      >
                        <span style={{ color: "#334155", fontWeight: 600 }}>
                          📦 Valor proposto pelo Remetente ({proposal.senderName})
                        </span>
                        <strong style={{ color: "#0F172A" }}>
                          R$ {(proposal.senderSuggestedPriceCents / 100).toFixed(2).replace(".", ",")}
                        </strong>
                      </div>
                    )}

                    {proposal.negotiationHistory && proposal.negotiationHistory.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {proposal.negotiationHistory.map((item, idx) => {
                          const isInitial = item.eventType === "PROPOSAL_CREATED";
                          const roleLabel = item.actorRole === "SENDER" ? "Remetente" : "Transportador";
                          return (
                            <div
                              key={item.eventId || idx}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                flexWrap: "wrap",
                                gap: "6px",
                                padding: "6px 8px",
                                borderRadius: "6px",
                                backgroundColor: isInitial ? "#EFF6FF" : "#FEFCE8",
                                border: `1px solid ${isInitial ? "#BFDBFE" : "#FDE68A"}`
                              }}
                            >
                              <span style={{ color: "#1E293B" }}>
                                <strong>{isInitial ? "🚚 Proposta inicial" : "🔄 Contraproposta"}</strong>{" "}
                                ({roleLabel}: {item.actorName}) • {safeFormatDate(item.occurredAtUtc)}
                              </span>
                              <strong style={{ color: "#1D4ED8" }}>
                                R$ {(item.amountCents / 100).toFixed(2).replace(".", ",")}
                              </strong>
                            </div>
                          );
                        })}
                      </div>
                    )}
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

                {/* Aviso de turno quando a última oferta foi enviada pelo próprio usuário */}
                {(isPending || isCountered) &&
                  proposal.lastNegotiationActorId &&
                  proposal.lastNegotiationActorId === user?.userId && (
                    <div
                      style={{
                        backgroundColor: "#F8FAFC",
                        border: "1px dashed #CBD5E1",
                        borderRadius: "8px",
                        padding: "10px 12px",
                        fontSize: "13px",
                        color: "#475569",
                        marginBottom: "8px"
                      }}
                    >
                      ⏳ <strong>Aguardando resposta da outra parte:</strong> sua {isCountered ? "contraproposta" : "proposta"} já foi enviada.
                      {activeTab === "SENT" && (
                        <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => {
                              setCounterProposalId(proposal.id);
                              setCounterValueInput((proposal.amountCents / 100).toFixed(2).replace(".", ","));
                            }}
                            style={{
                              padding: "6px 14px",
                              backgroundColor: "#EFF6FF",
                              color: "#1D4ED8",
                              border: "1px solid #BFDBFE",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer"
                            }}
                          >
                            ✏️ Alterar Valor da Minha Oferta
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleReject(proposal.id)}
                            style={{
                              padding: "6px 12px",
                              backgroundColor: "#FFFFFF",
                              color: "#DC2626",
                              border: "1px solid #FECACA",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer"
                            }}
                          >
                            ✕ Cancelar Minha Oferta
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                {/* Botões de Ação para o Remetente (quando na aba Recebidas e for seu turno) */}
                {activeTab === "RECEIVED" &&
                  (isPending || isCountered) &&
                  (!proposal.lastNegotiationActorId || proposal.lastNegotiationActorId !== user?.userId) && (
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

                {/* Botões de Ação para o Transportador quando houver Contraproposta Ativa do Remetente na aba Enviadas */}
                {activeTab === "SENT" &&
                  isCountered &&
                  (!proposal.lastNegotiationActorId || proposal.lastNegotiationActorId !== user?.userId) && (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end", marginTop: "12px" }}>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => void handleCarrierAcceptCounter(proposal)}
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
                      ✓ Aceitar Contraproposta
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

                {/* 1º PASSO APÓS CONFIRMAÇÃO DO PAGAMENTO: CÓDIGO DE RETIRADA DA ENCOMENDA PARA INÍCIO DA VIAGEM */}
                {isPaid && !isCompleted && (
                  <div style={{ marginTop: "16px" }}>
                    {isUserSender ? (
                      <div
                        style={{
                          backgroundColor: "#ECFDF5",
                          border: "2px solid #10B981",
                          borderRadius: "12px",
                          padding: "16px 20px",
                          boxShadow: "0 2px 8px rgba(16, 185, 129, 0.12)"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                          <div>
                            <div style={{ fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: "#047857" }}>
                              ✓ Pagamento Confirmado • Pronto para Início da Viagem
                            </div>
                            <div style={{ fontSize: "16px", fontWeight: 800, color: "#065F46", marginTop: "2px" }}>
                              📦 1º Passo: Código de Retirada da Encomenda
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: "32px",
                              fontWeight: 900,
                              letterSpacing: "8px",
                              color: "#065F46",
                              backgroundColor: "#FFFFFF",
                              padding: "6px 20px",
                              borderRadius: "10px",
                              border: "2px dashed #059669",
                              fontFamily: "monospace"
                            }}
                          >
                            {orderCodes?.pickupCode || "----"}
                          </div>
                        </div>

                        <p style={{ margin: "10px 0 0 0", fontSize: "13px", color: "#047857", lineHeight: "1.5" }}>
                          {orderCodes?.pickupConfirmed
                            ? "✓ Coleta confirmada! O transportador já retirou o pacote e a viagem foi iniciada no mapa."
                            : `Guarde este código. Forneça este PIN de 4 dígitos ao transportador (${proposal.carrierName}) no momento em que ele retirar o pacote físico. Ele digitará este código no aplicativo para confirmar a coleta e iniciar a viagem.`}
                        </p>

                        {orderCodes?.deliveryCode && (
                          <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #A7F3D0", fontSize: "12px", color: "#065F46", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                            <span>
                              <strong>2º Passo (Entrega no destino):</strong> Código Secreto de Entrega: <strong style={{ fontFamily: "monospace", fontSize: "14px", letterSpacing: "2px", backgroundColor: "#FFFFFF", padding: "2px 8px", borderRadius: "4px", border: "1px solid #A7F3D0" }}>{orderCodes.deliveryCode}</strong> (passe para quem receberá a carga).
                            </span>
                            <Link
                              href="/minhas-atividades"
                              style={{ color: "#047857", fontWeight: 700, textDecoration: "underline", fontSize: "12px" }}
                            >
                              Ver no Mapa em Tempo Real ➔
                            </Link>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        style={{
                          backgroundColor: "#EFF6FF",
                          border: "2px solid #3B82F6",
                          borderRadius: "12px",
                          padding: "16px 20px"
                        }}
                      >
                        <div style={{ fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: "#1D4ED8" }}>
                          ✓ Pagamento Confirmado pelo Remetente
                        </div>
                        <div style={{ fontSize: "16px", fontWeight: 800, color: "#1E40AF", marginTop: "2px" }}>
                          Retirada da Carga & Início da Viagem
                        </div>
                        <p style={{ margin: "8px 0 12px 0", fontSize: "13px", color: "#1E40AF", lineHeight: "1.5" }}>
                          Dirija-se ao endereço de coleta do remetente ({proposal.senderName}). Ao retirar o pacote, solicite ao remetente o <strong>Código de Retirada (4 dígitos)</strong> e digite-o no sistema para validar a coleta e iniciar a viagem com rastreamento GPS.
                        </p>
                        <Link
                          href="/minhas-atividades"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "8px 18px",
                            backgroundColor: "#2563EB",
                            color: "#FFFFFF",
                            borderRadius: "8px",
                            fontWeight: 700,
                            fontSize: "13px",
                            textDecoration: "none"
                          }}
                        >
                          🚀 Digitar Código de Retirada & Iniciar Viagem
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                {/* Status quando a viagem já está Concluída */}
                {isCompleted && (
                  <div style={{ marginTop: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", padding: "10px 14px", backgroundColor: "#F0FDF4", borderRadius: "8px", border: "1px solid #BBF7D0" }}>
                    <span style={{ fontSize: "12px", color: "#166534", fontWeight: 700 }}>
                      ✓ Viagem concluída e registrada no histórico do transportador.
                    </span>
                    <Link
                      href="/minhas-atividades"
                      className="btn btn--secondary"
                      style={{ padding: "6px 14px", fontSize: "12px", fontWeight: 700, textDecoration: "none" }}
                    >
                      Ver no Mapa
                    </Link>
                  </div>
                )}

                {/* Botões quando Aceito (e viagem em andamento) */}
                {isAccepted && !isCompleted && (
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap", marginTop: "14px" }}>
                    {isUserSender && (isAwaitingPayment || (!isPaid && proposal.status === "ACCEPTED")) && (
                      <button
                        type="button"
                        onClick={() =>
                          handleResumePixPayment(
                            proposal,
                            contract ||
                              ({
                                id: `contract-${proposal.id}`,
                                proposalId: proposal.id,
                                shipmentId: proposal.shipmentId,
                                senderId: proposal.senderId,
                                carrierId: proposal.carrierId,
                                amountCents: proposal.amountCents,
                                status: "AWAITING_PAYMENT",
                                contractedAtUtc: new Date().toISOString()
                              } as any)
                          )
                        }
                        style={{
                          padding: "10px 20px",
                          backgroundColor: "#059669",
                          color: "#FFFFFF",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "14px",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          boxShadow: "0 2px 8px rgba(5, 150, 105, 0.25)"
                        }}
                      >
                        ⚡ Pagar Frete com Pix • Gerar QR Code ({countdown || "15 min"})
                      </button>
                    )}

                    {isPaid && (
                      <Link
                        href="/minhas-atividades"
                        className="btn btn--primary"
                        style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}
                      >
                        🔐 Acompanhar Viagem no Mapa
                      </Link>
                    )}

                    {isUserSender && contract && (isAwaitingPayment || isPaid) && !isCompleted && (
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "11px", color: isPaid ? "#991B1B" : "#166534", fontWeight: 600 }}>
                          {isPaid
                            ? `Cancelável a qualquer momento (multa de ${Math.min(10, Math.max(0, cancellationPenaltyPercent)).toFixed(0)}% após pagamento)`
                            : "Cancelável gratuitamente antes do pagamento Pix"}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setCancelJustification("");
                            setCancelReopen(true);
                            setCancelTarget({ contract, proposal, isPaid });
                          }}
                          style={{
                            padding: "8px 14px",
                            backgroundColor: "#DC2626",
                            color: "#FFFFFF",
                            border: "1px solid #B91C1C",
                            borderRadius: "8px",
                            fontSize: "13px",
                            fontWeight: 700,
                            cursor: "pointer"
                          }}
                        >
                          🚫 Cancelar Viagem
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {isCancelled && contract?.cancellation?.policyDisclaimer && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      backgroundColor: "#FEF2F2",
                      border: "1px solid #FECACA",
                      color: "#991B1B",
                      fontSize: "12px",
                      fontWeight: 600
                    }}
                  >
                    🚫 {contract.cancellation.policyDisclaimer}
                  </div>
                )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pixModalOpen && selectedProposalForPix && (() => {
        const effectiveContract = selectedContractForPix || contractsByProposalId[selectedProposalForPix.id] || contractsByShipmentId[selectedProposalForPix.shipmentId];
        const contractCommissionCents = effectiveContract?.commissionSnapshot?.commissionCents;
        const calculatedFeeReais = contractCommissionCents !== undefined && contractCommissionCents > 0
          ? Math.round(contractCommissionCents) / 100
          : Math.round(selectedProposalForPix.amountCents * 0.15) / 100;

        return (
          <MercadoPagoPixModal
            isOpen={pixModalOpen}
            onClose={() => setPixModalOpen(false)}
            amountReais={selectedProposalForPix.amountCents / 100}
            marketplaceFeeReais={calculatedFeeReais}
            description={`Frete TopicLog #${selectedProposalForPix.shipmentId.slice(0, 8)}`}
            payerEmail={user?.email || "contato@topiclog.com.br"}
            payerName={user?.displayName || "Remetente TopicLog"}
            orderId={selectedProposalForPix.shipmentId}
            expiresAtUtc={effectiveContract?.paymentExpiresAtUtc}
            onExpired={() => {
              setPixModalOpen(false);
              setSelectedContractForPix(null);
              setErrorMessage("O prazo de 15 minutos para pagamento Pix expirou e a encomenda voltou ao mural.");
              void loadData(true);
            }}
            onPaymentSuccess={handlePixSuccess}
          />
        );
      })()}

      {cancelTarget && (() => {
        const agreedCents = cancelTarget.contract.amountCents ?? cancelTarget.proposal.amountCents ?? 0;
        const pct = Math.min(10, Math.max(0, cancellationPenaltyPercent));
        const penaltyCents = cancelTarget.isPaid
          ? Math.min(agreedCents, Math.round(agreedCents * (pct / 100)))
          : 0;
        const refundCents = Math.max(0, agreedCents - penaltyCents);
        const fmt = (c: number) => (c / 100).toFixed(2).replace(".", ",");

        const handleConfirmCancel = async () => {
          if (!token || submittingCancel) return;
          setSubmittingCancel(true);
          setErrorMessage(null);
          const res = await cancelContractBySenderApi(
            cancelTarget.contract.id,
            {
              justification: cancelJustification.trim() || undefined,
              reopenForBidding: cancelReopen
            },
            token
          );
          if (res.ok && res.data) {
            const applied = res.data.cancellation?.simulatedPenaltyCents ?? penaltyCents;
            setActionNotice(
              applied > 0
                ? `🚫 Viagem cancelada. Multa aplicada (${pct.toFixed(0)}%): R$ ${fmt(applied)}.`
                : "🚫 Viagem cancelada antes do pagamento: isento de multa."
            );
            setCancelTarget(null);
            setCancelJustification("");
            await loadData(true);
          } else {
            setErrorMessage(res.problem?.detail || "Não foi possível cancelar a viagem no momento.");
          }
          setSubmittingCancel(false);
        };

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="propostas-cancel-modal-title"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 2100,
              backgroundColor: "rgba(15, 23, 42, 0.65)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px"
            }}
          >
            <div
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: "16px",
                padding: "24px",
                maxWidth: "480px",
                width: "100%",
                boxShadow: "0 20px 40px rgba(0,0,0,0.25)"
              }}
            >
              <h2
                id="propostas-cancel-modal-title"
                style={{ fontSize: "19px", fontWeight: 800, color: "#991B1B", margin: "0 0 8px 0" }}
              >
                🚫 Cancelar Viagem
              </h2>
              <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 14px 0", lineHeight: 1.5 }}>
                {cancelTarget.isPaid
                  ? "Como o pagamento Pix já foi confirmado, o cancelamento está sujeito à multa configurada no Console Administrativo (até 10% do valor acordado)."
                  : "O pagamento Pix ainda não foi confirmado. Você pode cancelar agora sem cobrança de multa."}
              </p>

              <div
                style={{
                  backgroundColor: cancelTarget.isPaid ? "#FFFBEB" : "#F0FDF4",
                  border: cancelTarget.isPaid ? "1px solid #FDE68A" : "1px solid #BBF7D0",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  fontSize: "13px",
                  color: cancelTarget.isPaid ? "#78350F" : "#166534",
                  marginBottom: "14px",
                  display: "grid",
                  gap: "6px"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Valor acordado do transporte:</span>
                  <strong>R$ {fmt(agreedCents)}</strong>
                </div>
                {cancelTarget.isPaid ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Multa de {pct.toFixed(0)}%:</span>
                      <strong style={{ color: "#B91C1C" }}>- R$ {fmt(penaltyCents)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed #FCD34D", paddingTop: "6px" }}>
                      <span>Saldo líquido estimado:</span>
                      <strong style={{ color: "#065F46" }}>R$ {fmt(refundCents)}</strong>
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                    <span>Multa aplicável:</span>
                    <span>Isento de multa (R$ 0,00)</span>
                  </div>
                )}
              </div>

              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Motivo do cancelamento (opcional)
              </label>
              <input
                type="text"
                value={cancelJustification}
                onChange={(e) => setCancelJustification(e.target.value)}
                placeholder="Ex.: Alteração de planos"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  fontSize: "13px",
                  marginBottom: "12px",
                  boxSizing: "border-box"
                }}
              />

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                  color: "#334155",
                  marginBottom: "18px",
                  cursor: "pointer"
                }}
              >
                <input
                  type="checkbox"
                  checked={cancelReopen}
                  onChange={(e) => setCancelReopen(e.target.checked)}
                />
                <span>Republicar encomenda no Mural para novas propostas</span>
              </label>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  disabled={submittingCancel}
                  onClick={() => setCancelTarget(null)}
                  className="btn btn--outline"
                  style={{ padding: "9px 16px", fontSize: "13px", fontWeight: 700 }}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={submittingCancel}
                  onClick={() => void handleConfirmCancel()}
                  style={{
                    padding: "9px 18px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#DC2626",
                    color: "#FFFFFF",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  {submittingCancel ? "Cancelando..." : "Confirmar Cancelamento"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
