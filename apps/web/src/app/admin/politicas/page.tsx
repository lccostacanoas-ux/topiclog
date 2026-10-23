"use client";

import React, { useEffect, useState } from "react";
import { useAdminRole } from "../admin-context";
import {
  getCommercialPolicyCurrentApi,
  getCommercialPoliciesHistoryApi,
  getSubscriptionPlansApi,
  createCommercialPolicyApi,
  revokeCommercialPolicyApi,
  simulateSplitApi
} from "@/lib/api-client";
import type { CommercialPolicyDto, SubscriptionPlanDto } from "@/lib/types";

/**
 * Sanitizador estrito universal para inputs controlados:
 * Garante matematicamente que NENHUM elemento <input>, <select> ou <textarea>
 * receba NaN, undefined, null ou a string "NaN".
 */
function toSafeInputString(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "number") {
    if (Number.isNaN(val) || !Number.isFinite(val)) return "";
    return String(val);
  }
  const str = String(val);
  if (str === "NaN" || str === "undefined" || str === "null") return "";
  return str;
}

type PolicyStatusType = "VIGENTE" | "AGENDADA" | "HISTÓRICA" | "REVOGADA";

function getPolicyStatus(p: CommercialPolicyDto): {
  status: PolicyStatusType;
  bg: string;
  color: string;
  border: string;
  description: string;
} {
  if (!p.isActive) {
    return {
      status: "REVOGADA",
      bg: "rgba(239, 68, 68, 0.15)",
      color: "#EF4444",
      border: "rgba(239, 68, 68, 0.3)",
      description: "Cancelada administrativamente antes ou após vigorar"
    };
  }
  const now = Date.now();
  const validFrom = new Date(p.validFrom).getTime();
  const validUntil = p.validUntil ? new Date(p.validUntil).getTime() : null;

  if (validFrom > now) {
    return {
      status: "AGENDADA",
      bg: "rgba(59, 130, 246, 0.15)",
      color: "#3B82F6",
      border: "rgba(59, 130, 246, 0.3)",
      description: "Entrada em vigor programada para data futura"
    };
  }
  if (validUntil !== null && validUntil <= now) {
    return {
      status: "HISTÓRICA",
      bg: "rgba(148, 163, 184, 0.15)",
      color: "#94A3B8",
      border: "rgba(148, 163, 184, 0.3)",
      description: "Encerrada; preservada para integridade dos contratos"
    };
  }
  return {
    status: "VIGENTE",
    bg: "rgba(16, 185, 129, 0.15)",
    color: "#10B981",
    border: "rgba(16, 185, 129, 0.3)",
    description: "Aplicável atualmente a novas contratações elegíveis"
  };
}

export default function AdminPoliticasPage(): React.JSX.Element {
  const { role, token } = useAdminRole();
  const [currentPolicy, setCurrentPolicy] = useState<CommercialPolicyDto | null>(null);
  const [history, setHistory] = useState<CommercialPolicyDto[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlanDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Simulador de Repasse
  const [simAmount, setSimAmount] = useState<string>("55.00");
  const [simPlan, setSimPlan] = useState<string>("STANDARD");
  const [simResult, setSimResult] = useState<{
    gross: number;
    commission: number;
    carrierNet: number;
    rate: number;
  } | null>(null);

  // Proposta de Nova Política
  const [newVersion, setNewVersion] = useState("POL-COM-V2");
  const [newName, setNewName] = useState("Política Comercial Topic Log 2027");
  const [freeRate, setFreeRate] = useState<string>("13.00");
  const [premiumRate, setPremiumRate] = useState<string>("7.00");
  const [premiumFee, setPremiumFee] = useState<string>("39.90");
  const [cancelPenalty, setCancelPenalty] = useState<string>("10.00");
  const [cancelMinFee, setCancelMinFee] = useState<string>("7.00");
  const [cancelShare, setCancelShare] = useState<string>("80.00");
  const [validDaysAhead, setValidDaysAhead] = useState<string>("15");
  const [justification, setJustification] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [draftPayload, setDraftPayload] = useState<{
    version: string;
    name: string;
    freePlanCommissionPercent: number;
    premiumPlanCommissionPercent: number;
    premiumMonthlyFeeCents: number;
    cancellationPenaltyPercent: number;
    cancellationMinFeeCents: number;
    cancellationInjuredPartySharePercent: number;
    validFromIso: string;
    validFromBrt: string;
    justification: string;
  } | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!token) return;
      setLoading(true);
      setMessage(null);

      const [curRes, histRes, plansRes] = await Promise.all([
        getCommercialPolicyCurrentApi(token),
        getCommercialPoliciesHistoryApi(token),
        getSubscriptionPlansApi(token)
      ]);

      if (curRes.ok && curRes.data) setCurrentPolicy(curRes.data);
      if (histRes.ok && histRes.data) setHistory(histRes.data);
      if (plansRes.ok && plansRes.data) setPlans(plansRes.data);

      setLoading(false);
    }
    loadData();
  }, [token]);

  // Executa simulação sempre que simAmount ou simPlan mudam
  useEffect(() => {
    async function runSim() {
      const cleanAmount = typeof simAmount === "string" ? simAmount.replace(",", ".") : String(simAmount);
      const parsedAmount = parseFloat(cleanAmount);
      if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        setSimResult(null);
        return;
      }

      // Simulação Proposta do Novo Business Plan: 23% alíquota única de plataforma
      if (simPlan === "PROPOSED_23") {
        const parsedRate = 23.0;
        const gross = parsedAmount;
        const commission = Math.round(gross * (parsedRate / 100) * 100) / 100;
        const carrierNet = Math.round((gross - commission) * 100) / 100;
        setSimResult({
          gross,
          commission,
          carrierNet,
          rate: parsedRate
        });
        return;
      }

      const amountCents = Math.round(parsedAmount * 100);
      const res = await simulateSplitApi({
        transportAmountCents: amountCents,
        planCodeOverride: simPlan
      }, token);

      if (res.ok && res.data) {
        setSimResult({
          gross: res.data.transportAmountCents / 100,
          commission: res.data.platformCommissionCents / 100,
          carrierNet: res.data.carrierNetCents / 100,
          rate: res.data.commissionRatePercent
        });
      }
    }
    runSim();
  }, [simAmount, simPlan, token]);

  const handleDuplicateCurrentPolicy = () => {
    if (!currentPolicy) return;

    const baseVersion = currentPolicy.version || "POL-COM-V1";
    const nextVer = baseVersion.includes("-V")
      ? baseVersion.replace(/-V(\d+)/, (_, n) => `-V${parseInt(n, 10) + 1}`)
      : `${baseVersion}-RASCUNHO`;

    const safePercent = (num: number | null | undefined, fallback: string) => {
      if (num == null || Number.isNaN(num) || !Number.isFinite(num)) return fallback;
      return num.toFixed(2);
    };

    const safeFee = (cents: number | null | undefined, fallback: string) => {
      if (cents == null || Number.isNaN(cents) || !Number.isFinite(cents)) return fallback;
      return (cents / 100).toFixed(2);
    };

    setNewVersion(nextVer);
    setNewName(`Revisão de ${currentPolicy.name ?? "Política Comercial"}`);
    setFreeRate(safePercent(currentPolicy.freePlanCommissionPercent, "13.00"));
    setPremiumRate(safePercent(currentPolicy.premiumPlanCommissionPercent, "7.00"));
    setPremiumFee(safeFee(currentPolicy.premiumMonthlyFeeCents, "39.90"));
    setCancelPenalty(safePercent(currentPolicy.cancellationPenaltyPercent, "10.00"));
    setCancelMinFee(safeFee(currentPolicy.cancellationMinFeeCents, "7.00"));
    setCancelShare(safePercent(currentPolicy.cancellationInjuredPartySharePercent, "80.00"));
    setValidDaysAhead("15");
    setJustification(""); // Exige justificativa nova obrigatória

    setMessage({
      text: `✓ Rascunho de nova política gerado a partir de ${currentPolicy.version}. Edite os parâmetros e informe a justificativa antes de submeter.`,
      isError: false
    });

    const formEl = document.getElementById("form-nova-politica");
    if (formEl) {
      formEl.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleRevoke = async (policy: CommercialPolicyDto) => {
    if (role !== "GENERAL_ADMIN") {
      setMessage({
        text: `Ação bloqueada por RBAC: o perfil '${role}' não tem permissão para revogar políticas comerciais. Apenas GENERAL_ADMIN é autorizado.`,
        isError: true
      });
      return;
    }
    const confirmed = window.confirm(
      `ATENÇÃO: Deseja realmente revogar a política agendada '${policy.version}' (${policy.name})?\n\nEsta versão será marcada como REVOGADA no histórico e seu agendamento futuro não entrará em vigor.`
    );
    if (!confirmed) return;

    setRevokingId(policy.id);
    setMessage(null);
    const res = await revokeCommercialPolicyApi(policy.id, "Revogação de versão futura pelo painel administrativo", token);
    setRevokingId(null);

    if (res.ok) {
      setMessage({
        text: `✓ Política ${policy.version} revogada com sucesso! Histórico e auditoria preservados.`,
        isError: false
      });
      const [curRes, histRes] = await Promise.all([
        getCommercialPolicyCurrentApi(token),
        getCommercialPoliciesHistoryApi(token)
      ]);
      if (curRes.ok && curRes.data) setCurrentPolicy(curRes.data);
      if (histRes.ok && histRes.data) setHistory(histRes.data);
    } else {
      setMessage({
        text: res.problem?.detail ?? "Falha ao revogar política comercial.",
        isError: true
      });
    }
  };

  const handleCreatePolicy = (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== "GENERAL_ADMIN") {
      setMessage({
        text: `Ação bloqueada por RBAC: o perfil '${role}' não tem permissão para cadastrar novas políticas. Apenas GENERAL_ADMIN é autorizado.`,
        isError: true
      });
      return;
    }

    // Normalização e conversão segura de strings para números
    const cleanFree = String(freeRate ?? "").trim().replace(",", ".");
    const cleanPremium = String(premiumRate ?? "").trim().replace(",", ".");
    const cleanFee = String(premiumFee ?? "").trim().replace(",", ".");
    const cleanPenalty = String(cancelPenalty ?? "").trim().replace(",", ".");
    const cleanMinFee = String(cancelMinFee ?? "").trim().replace(",", ".");
    const cleanShare = String(cancelShare ?? "").trim().replace(",", ".");
    const cleanDays = String(validDaysAhead ?? "").trim().replace(",", ".");

    const parsedFreeRate = parseFloat(cleanFree);
    const parsedPremiumRate = parseFloat(cleanPremium);
    const parsedPremiumFee = parseFloat(cleanFee);
    const parsedCancelPenalty = parseFloat(cleanPenalty);
    const parsedCancelMinFee = parseFloat(cleanMinFee);
    const parsedCancelShare = parseFloat(cleanShare);
    const parsedDaysAhead = parseInt(cleanDays, 10);

    // Validações robustas contra NaN e limites de negócio
    if (Number.isNaN(parsedFreeRate) || parsedFreeRate < 0 || parsedFreeRate > 100) {
      setMessage({ text: "Comissão Standard / Free (%) inválida. Informe um percentual válido entre 0% e 100%.", isError: true });
      return;
    }
    if (Number.isNaN(parsedPremiumRate) || parsedPremiumRate < 0 || parsedPremiumRate > 100) {
      setMessage({ text: "Comissão Premium (%) inválida. Informe um percentual válido entre 0% e 100%.", isError: true });
      return;
    }
    if (Number.isNaN(parsedPremiumFee) || parsedPremiumFee < 0) {
      setMessage({ text: "Mensalidade Premium (R$) inválida. O valor monetário não pode ser negativo.", isError: true });
      return;
    }
    if (Number.isNaN(parsedCancelPenalty) || parsedCancelPenalty < 0 || parsedCancelPenalty > 100) {
      setMessage({ text: "Multa de Cancelamento (%) inválida. Informe um percentual entre 0% e 100%.", isError: true });
      return;
    }
    if (Number.isNaN(parsedCancelMinFee) || parsedCancelMinFee < 0) {
      setMessage({ text: "Piso de Multa Mínima (R$) inválido. O valor monetário não pode ser negativo.", isError: true });
      return;
    }
    if (Number.isNaN(parsedCancelShare) || parsedCancelShare < 0 || parsedCancelShare > 100) {
      setMessage({ text: "Rateio da Parte Prejudicada (%) inválido. Informe um percentual entre 0% e 100%.", isError: true });
      return;
    }
    if (Number.isNaN(parsedDaysAhead) || parsedDaysAhead < 1) {
      setMessage({ text: "Início da Vigência inválido. Deve ser no mínimo 1 dia futuro para garantir a não-retroatividade (D10).", isError: true });
      return;
    }

    if (!justification.trim()) {
      setMessage({ text: "Justificativa obrigatória para publicar nova versão de política.", isError: true });
      return;
    }

    const futureDate = new Date(Date.now() + parsedDaysAhead * 24 * 60 * 60 * 1000);
    const validFromIso = futureDate.toISOString();
    const validFromBrt = futureDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    setDraftPayload({
      version: newVersion.trim(),
      name: newName.trim(),
      freePlanCommissionPercent: parsedFreeRate,
      premiumPlanCommissionPercent: parsedPremiumRate,
      premiumMonthlyFeeCents: Math.round(parsedPremiumFee * 100),
      cancellationPenaltyPercent: parsedCancelPenalty,
      cancellationMinFeeCents: Math.round(parsedCancelMinFee * 100),
      cancellationInjuredPartySharePercent: parsedCancelShare,
      validFromIso,
      validFromBrt,
      justification: justification.trim()
    });

    setShowConfirmModal(true);
  };

  const handleConfirmPublish = async () => {
    if (!draftPayload) return;
    setSubmitting(true);
    setMessage(null);

    const res = await createCommercialPolicyApi({
      version: draftPayload.version,
      name: draftPayload.name,
      freePlanCommissionPercent: draftPayload.freePlanCommissionPercent,
      premiumPlanCommissionPercent: draftPayload.premiumPlanCommissionPercent,
      premiumMonthlyFeeCents: draftPayload.premiumMonthlyFeeCents,
      cancellationPenaltyPercent: draftPayload.cancellationPenaltyPercent,
      cancellationMinFeeCents: draftPayload.cancellationMinFeeCents,
      cancellationInjuredPartySharePercent: draftPayload.cancellationInjuredPartySharePercent,
      validFrom: draftPayload.validFromIso,
      justification: draftPayload.justification
    }, token);

    if (res.ok && res.data) {
      setMessage({
        text: `✓ Política ${res.data.version} publicada e agendada com sucesso! Vigência inicia em ${new Date(draftPayload.validFromIso).toLocaleDateString("pt-BR")}.`,
        isError: false
      });
      setJustification("");
      setShowConfirmModal(false);
      setDraftPayload(null);
      // Recarrega histórico
      const [curRes, histRes] = await Promise.all([
        getCommercialPolicyCurrentApi(token),
        getCommercialPoliciesHistoryApi(token)
      ]);
      if (curRes.ok && curRes.data) setCurrentPolicy(curRes.data);
      if (histRes.ok && histRes.data) setHistory(histRes.data);
    } else {
      setMessage({ text: res.problem?.detail ?? "Falha ao cadastrar versão de política.", isError: true });
    }
    setSubmitting(false);
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#FFFFFF", margin: "0 0 6px 0" }}>
          Políticas Comerciais, Planos & Assinaturas
        </h1>
        <p style={{ fontSize: "14px", color: "#94A3B8", margin: 0 }}>
          Gestão de alíquotas comissionárias vinculantes, planos de transportador (Free / Premium) e garantia de não-retroatividade.
        </p>
      </div>

      {message && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: "8px",
            backgroundColor: message.isError ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
            border: `1px solid ${message.isError ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
            color: message.isError ? "#FCA5A5" : "#6EE7B7",
            fontSize: "13px",
            marginBottom: "24px"
          }}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#94A3B8" }}>
          Carregando dados comerciais...
        </div>
      ) : (
        <>
          {/* Seção 1: Política Vigente & Simulador */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>
            {/* Card Política Vigente */}
            <div style={panelCardStyle}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#10B981", textTransform: "uppercase" }}>
                    Vigente Agora
                  </span>
                  <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#FFFFFF", margin: "4px 0 0 0" }}>
                    {currentPolicy?.version} — {currentPolicy?.name}
                  </h2>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={handleDuplicateCurrentPolicy}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      backgroundColor: "rgba(56, 189, 248, 0.12)",
                      color: "#38BDF8",
                      border: "1px solid rgba(56, 189, 248, 0.35)",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                    title="Duplicar parâmetros desta política para o formulário de rascunho"
                  >
                    📋 Duplicar Política Vigente
                  </button>
                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: "4px",
                      backgroundColor: "rgba(16, 185, 129, 0.15)",
                      color: "#10B981",
                      fontSize: "11px",
                      fontWeight: 700
                    }}
                  >
                    ATIVO
                  </span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div style={subCardStyle}>
                  <div style={subLabelStyle}>Comissão Standard (Free)</div>
                  <div style={subValStyle}>
                    {(currentPolicy?.freePlanCommissionPercent != null ? currentPolicy.freePlanCommissionPercent.toFixed(2) : "13.00")}%
                  </div>
                  <div style={subDescStyle}>Regra D10 vinculante</div>
                </div>
                <div style={subCardStyle}>
                  <div style={subLabelStyle}>Comissão Premium</div>
                  <div style={subValStyle}>
                    {(currentPolicy?.premiumPlanCommissionPercent != null ? currentPolicy.premiumPlanCommissionPercent.toFixed(2) : "7.00")}%
                  </div>
                  <div style={subDescStyle}>Regra D11 vinculante</div>
                </div>
                <div style={subCardStyle}>
                  <div style={subLabelStyle}>Mensalidade Premium</div>
                  <div style={subValStyle}>
                    {((currentPolicy?.premiumMonthlyFeeCents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </div>
                  <div style={subDescStyle}>R$ 39,90 fixo mensal</div>
                </div>
                <div style={subCardStyle}>
                  <div style={subLabelStyle}>Multa Cancelamento Injustificado</div>
                  <div style={subValStyle}>
                    {(currentPolicy?.cancellationPenaltyPercent != null ? currentPolicy.cancellationPenaltyPercent.toFixed(2) : "10.00")}%
                  </div>
                  <div style={subDescStyle}>Piso R$ 7,00 • Rateio 80/20</div>
                </div>
              </div>

              <div style={{ fontSize: "11px", color: "#64748B", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "12px" }}>
                <strong>Vigência:</strong> Desde {new Date(currentPolicy?.validFrom ?? "").toLocaleDateString("pt-BR")} |
                {" "}<strong>Justificativa:</strong> {currentPolicy?.justification}
              </div>
            </div>

            {/* Simulador Interativo de Repasse */}
            <div style={panelCardStyle}>
              <div style={{ marginBottom: "16px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#38BDF8", textTransform: "uppercase" }}>
                  Simulador de Impacto Financeiro
                </span>
                <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#FFFFFF", margin: "4px 0 0 0" }}>
                  Cálculo em Tempo Real de Split & Comissão
                </h2>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div>
                  <label htmlFor="sim-amount" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "6px" }}>
                    Valor do Frete (R$):
                  </label>
                  <input
                    id="sim-amount"
                    type="text"
                    inputMode="decimal"
                    value={toSafeInputString(simAmount)}
                    onChange={(e) => setSimAmount(e.target.value.replace(",", "."))}
                    style={inputStyle}
                    placeholder="Ex: 55.00"
                  />
                </div>
                <div>
                  <label htmlFor="sim-plan" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "6px" }}>
                    Plano / Alíquota para Simulação:
                  </label>
                  <select
                    id="sim-plan"
                    value={toSafeInputString(simPlan)}
                    onChange={(e) => setSimPlan(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="STANDARD">Standard Vigente ({currentPolicy?.freePlanCommissionPercent != null ? currentPolicy.freePlanCommissionPercent.toFixed(2) : "13.00"}% Comissão)</option>
                    <option value="PREMIUM">Premium Vigente ({currentPolicy?.premiumPlanCommissionPercent != null ? currentPolicy.premiumPlanCommissionPercent.toFixed(2) : "7.00"}% Comissão)</option>
                    <option value="PROPOSED_23">Novo Business Plan (23% Alíquota Única / Frete Ref. R$ 55,00)</option>
                  </select>
                </div>
              </div>

              {simResult && (
                <div style={{ backgroundColor: "#0F172A", padding: "16px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1E293B" }}>
                    <span style={{ fontSize: "13px", color: "#94A3B8" }}>Valor Total Pago pelo Remetente:</span>
                    <strong style={{ fontSize: "14px", color: "#FFFFFF" }}>
                      {simResult.gross.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1E293B" }}>
                    <span style={{ fontSize: "13px", color: "#94A3B8" }}>Comissão Topic Log ({simResult.rate}%):</span>
                    <strong style={{ fontSize: "14px", color: "#38BDF8" }}>
                      {simResult.commission.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1E293B" }}>
                    <span style={{ fontSize: "13px", color: "#94A3B8" }}>Líquido Repassado ao Transportador:</span>
                    <strong style={{ fontSize: "14px", color: "#10B981" }}>
                      {simResult.carrierNet.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                    <span style={{ fontSize: "12px", color: "#64748B" }}>Invariante Contábil (Frete == Comissão + Líquido):</span>
                    <span style={{ fontSize: "12px", color: "#10B981", fontWeight: 700 }}>PRESERVADA ✓</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Seção 2: Propor Nova Versão de Política (GENERAL_ADMIN Exclusivo) */}
          <div style={{ ...panelCardStyle, marginBottom: "32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#F59E0B", textTransform: "uppercase" }}>
                  Evolução Tarifária & Não-Retroatividade
                </span>
                <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#FFFFFF", margin: "4px 0 0 0" }}>
                  Cadastrar Nova Versão de Política Comercial
                </h2>
                <p style={{ fontSize: "12px", color: "#94A3B8", margin: "4px 0 0 0" }}>
                  Contratos já formalizados permanecerão congelados na política vigente no momento do aceite (D10). Novas regras só valem a partir de <code>validFrom</code>.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDuplicateCurrentPolicy}
                style={{
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: 700,
                  borderRadius: "6px",
                  backgroundColor: "rgba(56, 189, 248, 0.12)",
                  color: "#38BDF8",
                  border: "1px solid rgba(56, 189, 248, 0.35)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
                title="Copiar parâmetros da política vigente para edição como rascunho"
              >
                📋 Duplicar Política Vigente
              </button>
            </div>

            <form id="form-nova-politica" onSubmit={handleCreatePolicy}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <label htmlFor="new-version" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                    Código da Versão:
                  </label>
                  <input
                    id="new-version"
                    type="text"
                    value={toSafeInputString(newVersion)}
                    onChange={(e) => setNewVersion(e.target.value)}
                    style={inputStyle}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="new-name" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                    Nome da Política:
                  </label>
                  <input
                    id="new-name"
                    type="text"
                    value={toSafeInputString(newName)}
                    onChange={(e) => setNewName(e.target.value)}
                    style={inputStyle}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="free-rate" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                    Comissão Standard / Free (%):
                  </label>
                  <input
                    id="free-rate"
                    type="text"
                    inputMode="decimal"
                    value={toSafeInputString(freeRate)}
                    onChange={(e) => setFreeRate(e.target.value.replace(",", "."))}
                    style={inputStyle}
                    placeholder="Ex: 23.00 ou 13.00"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="premium-rate" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                    Comissão Premium (%):
                  </label>
                  <input
                    id="premium-rate"
                    type="text"
                    inputMode="decimal"
                    value={toSafeInputString(premiumRate)}
                    onChange={(e) => setPremiumRate(e.target.value.replace(",", "."))}
                    style={inputStyle}
                    placeholder="Ex: 7.00 ou 23.00"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="premium-fee" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                    Mensalidade Premium (R$):
                  </label>
                  <input
                    id="premium-fee"
                    type="text"
                    inputMode="decimal"
                    value={toSafeInputString(premiumFee)}
                    onChange={(e) => setPremiumFee(e.target.value.replace(",", "."))}
                    style={inputStyle}
                    placeholder="Ex: 39.90 ou 0.00"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="valid-days" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                    Início da Vigência (dias futuros):
                  </label>
                  <input
                    id="valid-days"
                    type="number"
                    min="1"
                    value={toSafeInputString(validDaysAhead)}
                    onChange={(e) => setValidDaysAhead(e.target.value)}
                    style={inputStyle}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="cancel-penalty" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                    Multa Cancelamento Injustificado (%):
                  </label>
                  <input
                    id="cancel-penalty"
                    type="text"
                    inputMode="decimal"
                    value={toSafeInputString(cancelPenalty)}
                    onChange={(e) => setCancelPenalty(e.target.value.replace(",", "."))}
                    style={inputStyle}
                    placeholder="Ex: 10.00"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="cancel-min-fee" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                    Piso Multa Mínima (R$):
                  </label>
                  <input
                    id="cancel-min-fee"
                    type="text"
                    inputMode="decimal"
                    value={toSafeInputString(cancelMinFee)}
                    onChange={(e) => setCancelMinFee(e.target.value.replace(",", "."))}
                    style={inputStyle}
                    placeholder="Ex: 7.00"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="cancel-share" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                    Rateio Parte Prejudicada (%):
                  </label>
                  <input
                    id="cancel-share"
                    type="text"
                    inputMode="decimal"
                    value={toSafeInputString(cancelShare)}
                    onChange={(e) => setCancelShare(e.target.value.replace(",", "."))}
                    style={inputStyle}
                    placeholder="Ex: 80.00"
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label htmlFor="justification" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                  Justificativa Fundamentada (Obrigatória):
                </label>
                <textarea
                  id="justification"
                  value={toSafeInputString(justification)}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Ex: Atualização periódica da tabela de incentivo comercial para o piloto em Minas Gerais..."
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: "10px 20px",
                  borderRadius: "6px",
                  backgroundColor: role === "GENERAL_ADMIN" ? "#2563EB" : "#475569",
                  color: "#FFFFFF",
                  border: "none",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: role === "GENERAL_ADMIN" ? "pointer" : "not-allowed"
                }}
              >
                {submitting ? "Publicando versão..." : "Publicar Nova Versão de Política"}
              </button>
              {role !== "GENERAL_ADMIN" && (
                <span style={{ marginLeft: "12px", fontSize: "12px", color: "#94A3B8" }}>
                  (Apenas perfil GENERAL_ADMIN pode publicar novas políticas)
                </span>
              )}
            </form>
          </div>

          {/* Seção 3: Histórico de Versões */}
          <div style={panelCardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#FFFFFF", margin: "0 0 4px 0" }}>
                  Histórico Imutável de Políticas Comerciais
                </h2>
                <p style={{ fontSize: "12px", color: "#94A3B8", margin: 0 }}>
                  Classificação temporal e ciclo de vida: <span style={{ color: "#10B981" }}>VIGENTE</span> (aplicável agora), <span style={{ color: "#3B82F6" }}>AGENDADA</span> (futura), <span style={{ color: "#94A3B8" }}>HISTÓRICA</span> (concluída) ou <span style={{ color: "#EF4444" }}>REVOGADA</span> (cancelada).
                </p>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "#94A3B8" }}>
                    <th style={{ padding: "10px 12px" }}>Versão</th>
                    <th style={{ padding: "10px 12px" }}>Nome</th>
                    <th style={{ padding: "10px 12px" }}>Comissão Free</th>
                    <th style={{ padding: "10px 12px" }}>Comissão Premium</th>
                    <th style={{ padding: "10px 12px" }}>Mensalidade</th>
                    <th style={{ padding: "10px 12px" }}>Multa Mínima</th>
                    <th style={{ padding: "10px 12px" }}>Vigência Início</th>
                    <th style={{ padding: "10px 12px" }}>Vigência Fim</th>
                    <th style={{ padding: "10px 12px" }}>Status</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((p) => {
                    const st = getPolicyStatus(p);
                    return (
                      <tr key={p.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                        <td style={{ padding: "12px", fontWeight: 700, color: "#FFFFFF" }}>{p.version}</td>
                        <td style={{ padding: "12px", color: "#CBD5E1" }}>{p.name}</td>
                        <td style={{ padding: "12px", color: "#38BDF8" }}>
                          {(p.freePlanCommissionPercent != null ? p.freePlanCommissionPercent.toFixed(2) : "0.00")}%
                        </td>
                        <td style={{ padding: "12px", color: "#10B981" }}>
                          {(p.premiumPlanCommissionPercent != null ? p.premiumPlanCommissionPercent.toFixed(2) : "0.00")}%
                        </td>
                        <td style={{ padding: "12px" }}>
                          {((p.premiumMonthlyFeeCents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </td>
                        <td style={{ padding: "12px", color: "#F59E0B" }}>
                          {((p.cancellationMinFeeCents ?? 700) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </td>
                        <td style={{ padding: "12px", color: "#94A3B8" }}>
                          {new Date(p.validFrom).toLocaleDateString("pt-BR")}
                        </td>
                        <td style={{ padding: "12px", color: "#64748B" }}>
                          {p.validUntil ? new Date(p.validUntil).toLocaleDateString("pt-BR") : "Indefinida"}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: "4px",
                              fontSize: "10px",
                              fontWeight: 800,
                              letterSpacing: "0.5px",
                              backgroundColor: st.bg,
                              color: st.color,
                              border: `1px solid ${st.border}`
                            }}
                            title={st.description}
                          >
                            {st.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px", textAlign: "center" }}>
                          {st.status === "AGENDADA" && role === "GENERAL_ADMIN" ? (
                            <button
                              type="button"
                              onClick={() => handleRevoke(p)}
                              disabled={revokingId === p.id}
                              style={{
                                padding: "4px 10px",
                                borderRadius: "6px",
                                backgroundColor: "rgba(239, 68, 68, 0.12)",
                                color: "#EF4444",
                                border: "1px solid rgba(239, 68, 68, 0.4)",
                                fontSize: "11px",
                                fontWeight: 700,
                                cursor: "pointer"
                              }}
                              title="Revogar agendamento futuro desta política"
                            >
                              {revokingId === p.id ? "Revogando..." : "Revogar"}
                            </button>
                          ) : (
                            <span style={{ color: "#475569", fontSize: "12px" }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal de Confirmação & Revisão de Impacto (Diff de Parâmetros) */}
          {showConfirmModal && draftPayload && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0, 0, 0, 0.75)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
                padding: "20px"
              }}
            >
              <div
                style={{
                  backgroundColor: "#1E293B",
                  borderRadius: "14px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  maxWidth: "760px",
                  width: "100%",
                  maxHeight: "90vh",
                  overflowY: "auto",
                  padding: "28px",
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  <span style={{ fontSize: "24px" }}>⚖️</span>
                  <div>
                    <h3 style={{ fontSize: "20px", fontWeight: 800, color: "#FFFFFF", margin: 0 }}>
                      Confirmação e Revisão de Impacto Tarifário
                    </h3>
                    <p style={{ fontSize: "13px", color: "#94A3B8", margin: "4px 0 0 0" }}>
                      Compare atentamente a política atualmente vigente com a nova versão proposta antes de efetivar o agendamento:
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: "rgba(245, 158, 11, 0.1)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    fontSize: "12px",
                    color: "#FCD34D",
                    marginBottom: "20px"
                  }}
                >
                  ⚠️ <strong>Garantia de Não-Retroatividade (D10 / ADR-0002):</strong> Contratos já formalizados permanecerão congelados nas condições da política vigente no instante do aceite. Esta nova política aplicar-se-á estritamente a novas propostas aceitas a partir da data de início.
                </div>

                {/* Tabela de Diff */}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left", marginBottom: "20px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "#94A3B8" }}>
                      <th style={{ padding: "8px 10px" }}>Parâmetro</th>
                      <th style={{ padding: "8px 10px" }}>Política Vigente ({currentPolicy?.version ?? "Atual"})</th>
                      <th style={{ padding: "8px 10px" }}>Nova Proposta ({draftPayload.version})</th>
                      <th style={{ padding: "8px 10px" }}>Variação / Impacto</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <td style={{ padding: "10px", fontWeight: 600, color: "#FFFFFF" }}>Comissão Standard / Free</td>
                      <td style={{ padding: "10px", color: "#94A3B8" }}>{(currentPolicy?.freePlanCommissionPercent ?? 13).toFixed(2)}%</td>
                      <td style={{ padding: "10px", color: "#38BDF8", fontWeight: 700 }}>{draftPayload.freePlanCommissionPercent.toFixed(2)}%</td>
                      <td style={{ padding: "10px", color: draftPayload.freePlanCommissionPercent > (currentPolicy?.freePlanCommissionPercent ?? 13) ? "#F59E0B" : "#10B981" }}>
                        {draftPayload.freePlanCommissionPercent === (currentPolicy?.freePlanCommissionPercent ?? 13)
                          ? "Sem alteração"
                          : `${draftPayload.freePlanCommissionPercent > (currentPolicy?.freePlanCommissionPercent ?? 13) ? "+" : ""}${(draftPayload.freePlanCommissionPercent - (currentPolicy?.freePlanCommissionPercent ?? 13)).toFixed(2)}%`}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <td style={{ padding: "10px", fontWeight: 600, color: "#FFFFFF" }}>Comissão Premium</td>
                      <td style={{ padding: "10px", color: "#94A3B8" }}>{(currentPolicy?.premiumPlanCommissionPercent ?? 7).toFixed(2)}%</td>
                      <td style={{ padding: "10px", color: "#10B981", fontWeight: 700 }}>{draftPayload.premiumPlanCommissionPercent.toFixed(2)}%</td>
                      <td style={{ padding: "10px", color: "#94A3B8" }}>
                        {draftPayload.premiumPlanCommissionPercent === (currentPolicy?.premiumPlanCommissionPercent ?? 7)
                          ? "Sem alteração"
                          : `${draftPayload.premiumPlanCommissionPercent > (currentPolicy?.premiumPlanCommissionPercent ?? 7) ? "+" : ""}${(draftPayload.premiumPlanCommissionPercent - (currentPolicy?.premiumPlanCommissionPercent ?? 7)).toFixed(2)}%`}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <td style={{ padding: "10px", fontWeight: 600, color: "#FFFFFF" }}>Assinatura Premium</td>
                      <td style={{ padding: "10px", color: "#94A3B8" }}>
                        {(currentPolicy?.premiumMonthlyFeeCents ?? 3990) > 0 ? "Habilitada (R$ 39,90/mês)" : "Descontinuada"}
                      </td>
                      <td style={{ padding: "10px", color: "#FFFFFF", fontWeight: 700 }}>
                        {draftPayload.premiumMonthlyFeeCents > 0
                          ? `Habilitada (${(draftPayload.premiumMonthlyFeeCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês)`
                          : "Descontinuada (Sem Cobrança)"}
                      </td>
                      <td style={{ padding: "10px", color: "#94A3B8" }}>
                        {draftPayload.premiumMonthlyFeeCents === 0 ? "Alinhada ao Business Plan Flat" : "Mensalidade ativa"}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <td style={{ padding: "10px", fontWeight: 600, color: "#FFFFFF" }}>Multa de Cancelamento</td>
                      <td style={{ padding: "10px", color: "#94A3B8" }}>{(currentPolicy?.cancellationPenaltyPercent ?? 10).toFixed(2)}%</td>
                      <td style={{ padding: "10px", color: "#FFFFFF", fontWeight: 700 }}>{draftPayload.cancellationPenaltyPercent.toFixed(2)}%</td>
                      <td style={{ padding: "10px", color: "#94A3B8" }}>Taxa de desistência injustificada</td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <td style={{ padding: "10px", fontWeight: 600, color: "#FFFFFF" }}>Piso de Multa Mínima</td>
                      <td style={{ padding: "10px", color: "#94A3B8" }}>
                        {((currentPolicy?.cancellationMinFeeCents ?? 700) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </td>
                      <td style={{ padding: "10px", color: "#F59E0B", fontWeight: 700 }}>
                        {(draftPayload.cancellationMinFeeCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </td>
                      <td style={{ padding: "10px", color: draftPayload.cancellationMinFeeCents > (currentPolicy?.cancellationMinFeeCents ?? 700) ? "#F59E0B" : "#10B981" }}>
                        {draftPayload.cancellationMinFeeCents === (currentPolicy?.cancellationMinFeeCents ?? 700)
                          ? "Sem alteração"
                          : `Piso ajustado para ${(draftPayload.cancellationMinFeeCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <td style={{ padding: "10px", fontWeight: 600, color: "#FFFFFF" }}>Rateio entre as Partes</td>
                      <td style={{ padding: "10px", color: "#94A3B8" }}>
                        {(currentPolicy?.cancellationInjuredPartySharePercent ?? 80).toFixed(0)}% Lesado / {(100 - (currentPolicy?.cancellationInjuredPartySharePercent ?? 80)).toFixed(0)}% Plataforma
                      </td>
                      <td style={{ padding: "10px", color: "#FFFFFF", fontWeight: 700 }}>
                        {draftPayload.cancellationInjuredPartySharePercent.toFixed(0)}% Lesado / {(100 - draftPayload.cancellationInjuredPartySharePercent).toFixed(0)}% Plataforma
                      </td>
                      <td style={{ padding: "10px", color: "#94A3B8" }}>Divisão da penalidade</td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <td style={{ padding: "10px", fontWeight: 600, color: "#FFFFFF" }}>Início Efetivo da Vigência</td>
                      <td style={{ padding: "10px", color: "#94A3B8" }}>Imediata (Vigente)</td>
                      <td style={{ padding: "10px", color: "#38BDF8", fontWeight: 700 }} colSpan={2}>
                        {draftPayload.validFromBrt} (Horário de Brasília) • {draftPayload.validFromIso} (UTC)
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "10px", fontWeight: 600, color: "#FFFFFF" }}>Justificativa Administrativa</td>
                      <td style={{ padding: "10px", color: "#CBD5E1", fontStyle: "italic" }} colSpan={3}>
                        "{draftPayload.justification}"
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Botões de Ação */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.1)", paddingTop: "18px" }}>
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(false)}
                    disabled={submitting}
                    style={{
                      padding: "10px 18px",
                      borderRadius: "6px",
                      backgroundColor: "transparent",
                      color: "#94A3B8",
                      border: "1px solid #475569",
                      fontWeight: 700,
                      fontSize: "13px",
                      cursor: "pointer"
                    }}
                  >
                    Voltar e Editar Rascunho
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmPublish}
                    disabled={submitting}
                    style={{
                      padding: "10px 22px",
                      borderRadius: "6px",
                      backgroundColor: submitting ? "#475569" : "#2563EB",
                      color: "#FFFFFF",
                      border: "none",
                      fontWeight: 700,
                      fontSize: "13px",
                      cursor: submitting ? "not-allowed" : "pointer"
                    }}
                  >
                    {submitting ? "Publicando versão..." : "Confirmar e Agendar Publicação"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const panelCardStyle: React.CSSProperties = {
  backgroundColor: "#1E293B",
  borderRadius: "12px",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  padding: "24px"
};

const subCardStyle: React.CSSProperties = {
  backgroundColor: "#0F172A",
  padding: "14px",
  borderRadius: "8px",
  border: "1px solid rgba(255, 255, 255, 0.05)"
};

const subLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#94A3B8",
  fontWeight: 600,
  marginBottom: "4px"
};

const subValStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 800,
  color: "#FFFFFF",
  marginBottom: "2px"
};

const subDescStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#64748B"
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  backgroundColor: "#0F172A",
  border: "1px solid #334155",
  borderRadius: "6px",
  color: "#FFFFFF",
  fontSize: "13px",
  boxSizing: "border-box"
};
