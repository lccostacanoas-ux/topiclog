"use client";

import React, { useEffect, useState } from "react";
import { useAdminRole } from "../admin-context";
import { listPaymentMethodsApi, togglePaymentMethodApi, simulateCheckoutApi } from "@/lib/api-client";
import type { PaymentMethodDto, CheckoutSimulationDto } from "@/lib/types";

export default function AdminGovernancaPage(): React.JSX.Element {
  const { role, token } = useAdminRole();
  const [methods, setMethods] = useState<PaymentMethodDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Modal / Prompt de Toggle
  const [togglingCode, setTogglingCode] = useState<string | null>(null);
  const [togglingCurrentState, setTogglingCurrentState] = useState<boolean>(true);
  const [toggleJustification, setToggleJustification] = useState<string>("");
  const [actionLoading, setActionLoading] = useState(false);

  // Simulador de Checkout Sandbox
  const [simAmount, setSimAmount] = useState<number>(150);
  const [simMethod, setSimMethod] = useState<string>("PIX");
  const [simPlan, setSimPlan] = useState<string>("STANDARD");
  const [simResult, setSimResult] = useState<CheckoutSimulationDto | null>(null);
  const [simulating, setSimulating] = useState(false);

  const loadPaymentMethods = async () => {
    if (!token) return;
    setLoading(true);
    const res = await listPaymentMethodsApi(token);
    if (res.ok && res.data) {
      setMethods(res.data);
    } else {
      setMessage({ text: res.problem?.detail ?? "Falha ao carregar métodos de pagamento.", isError: true });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPaymentMethods();
  }, [token]);

  const handleToggleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!togglingCode) return;

    if (!toggleJustification.trim()) {
      setMessage({ text: "Justificativa obrigatória para ativar ou desativar método de pagamento.", isError: true });
      return;
    }

    setActionLoading(true);
    setMessage(null);

    const newState = !togglingCurrentState;
    const res = await togglePaymentMethodApi(togglingCode, {
      isEnabled: newState,
      justification: toggleJustification.trim()
    }, token);

    if (res.ok && res.data) {
      setMessage({
        text: `Método ${res.data.displayName} agora está ${res.data.isEnabled ? "ATIVO" : "DESATIVADO"}. Evento registrado na auditoria.`,
        isError: false
      });
      setTogglingCode(null);
      setToggleJustification("");
      loadPaymentMethods();
    } else {
      setMessage({ text: res.problem?.detail ?? "Falha ao alterar status do método de pagamento.", isError: true });
    }
    setActionLoading(false);
  };

  const handleSimulateCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    setMessage(null);

    const amountCents = Math.round(simAmount * 100);
    const res = await simulateCheckoutApi({
      amountCents,
      paymentMethodCode: simMethod,
      planCodeOverride: simPlan
    }, token);

    if (res.ok && res.data) {
      setSimResult(res.data);
    } else {
      setMessage({ text: res.problem?.detail ?? "Falha ao simular checkout sandbox.", isError: true });
    }
    setSimulating(false);
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#FFFFFF", margin: "0 0 6px 0" }}>
          Governança de Pagamentos & Simulador de Checkout (PR-FIN-02)
        </h1>
        <p style={{ fontSize: "14px", color: "#94A3B8", margin: 0 }}>
          Controle de disponibilidade de adquirentes e simulação sandbox com absorção integral de taxas pela plataforma.
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

      {/* Banner de Absorção de Taxas (Regra D12) */}
      <div
        style={{
          padding: "16px 20px",
          borderRadius: "10px",
          backgroundColor: "rgba(16, 185, 129, 0.12)",
          border: "1px solid rgba(16, 185, 129, 0.3)",
          color: "#A7F3D0",
          fontSize: "13px",
          marginBottom: "28px",
          display: "flex",
          alignItems: "center",
          gap: "12px"
        }}
      >
        <span style={{ fontSize: "24px" }}>🛡️</span>
        <div>
          <strong style={{ color: "#FFFFFF" }}>Diretriz Vinculante D12 — Absorção Integral de Taxas de Gateway:</strong> A Topic Log absorve 100% dos custos do gateway de pagamento (Pix, Boleto ou Cartão). O remetente paga exatamente o valor líquido contratado do frete sem qualquer sobretaxa ou taxa oculta.
        </div>
      </div>

      {/* Modal de Toggle de Meio de Pagamento */}
      {togglingCode && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
        >
          <div
            style={{
              backgroundColor: "#1E293B",
              padding: "28px",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "480px",
              border: "1px solid rgba(255, 255, 255, 0.1)"
            }}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#FFFFFF", margin: "0 0 8px 0" }}>
              {togglingCurrentState ? "Desativar" : "Ativar"} Método de Pagamento ({togglingCode})
            </h3>
            <p style={{ fontSize: "13px", color: "#94A3B8", margin: "0 0 16px 0" }}>
              A plataforma exige ao menos um método de pagamento ativo para operação contínua. Justifique esta alteração para a trilha de auditoria.
            </p>

            <form onSubmit={handleToggleConfirm}>
              <div style={{ marginBottom: "16px" }}>
                <label htmlFor="modal-toggle-justification" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "6px" }}>
                  Justificativa Fundamentada:
                </label>
                <textarea
                  id="modal-toggle-justification"
                  rows={3}
                  value={toggleJustification}
                  onChange={(e) => setToggleJustification(e.target.value)}
                  placeholder="Ex: Manutenção programada do adquirente bancário..."
                  style={inputStyle}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => { setTogglingCode(null); setToggleJustification(""); }}
                  style={{
                    padding: "8px 14px",
                    backgroundColor: "transparent",
                    color: "#94A3B8",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    fontSize: "13px",
                    cursor: "pointer"
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: togglingCurrentState ? "#EF4444" : "#10B981",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer"
                  }}
                >
                  {actionLoading ? "Salvando..." : togglingCurrentState ? "Confirmar Desativação" : "Confirmar Ativação"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grid Principal: Métodos e Simulador */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px" }}>
        {/* Coluna 1: Métodos de Pagamento */}
        <div style={panelCardStyle}>
          <div style={{ marginBottom: "16px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#38BDF8", textTransform: "uppercase" }}>
              Configurações de Gateway
            </span>
            <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#FFFFFF", margin: "4px 0 0 0" }}>
              Meios de Pagamento Disponíveis
            </h2>
            <p style={{ fontSize: "12px", color: "#94A3B8", margin: "4px 0 0 0" }}>
              Permitido para GENERAL_ADMIN e FINANCIAL_ADMIN.
            </p>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "36px 0", color: "#94A3B8" }}>
              Carregando métodos de pagamento...
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {methods.map((m) => (
                <div
                  key={m.methodCode}
                  style={{
                    backgroundColor: "#0F172A",
                    padding: "16px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 700, fontSize: "15px", color: "#FFFFFF" }}>{m.displayName}</span>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          backgroundColor: m.isEnabled ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                          color: m.isEnabled ? "#10B981" : "#EF4444"
                        }}
                      >
                        {m.isEnabled ? "ATIVO" : "INATIVO"}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#94A3B8" }}>
                      Provedor: {m.providerName} • Taxa: {m.feePercent}% {m.fixedFeeCents > 0 && `+ R$ ${(m.fixedFeeCents / 100).toFixed(2)}`}
                    </div>
                    <div style={{ fontSize: "11px", color: "#10B981", marginTop: "2px" }}>
                      ✓ 100% da taxa absorvida pela Topic Log
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setTogglingCode(m.methodCode);
                      setTogglingCurrentState(m.isEnabled);
                      setToggleJustification("");
                    }}
                    disabled={role !== "GENERAL_ADMIN" && role !== "FINANCIAL_ADMIN"}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "none",
                      backgroundColor: m.isEnabled ? "#334155" : "#2563EB",
                      color: "#FFFFFF",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: (role === "GENERAL_ADMIN" || role === "FINANCIAL_ADMIN") ? "pointer" : "not-allowed"
                    }}
                    title={
                      (role === "GENERAL_ADMIN" || role === "FINANCIAL_ADMIN")
                        ? "Alterar status"
                        : "Apenas GENERAL_ADMIN ou FINANCIAL_ADMIN podem alterar meios de pagamento"
                    }
                  >
                    {m.isEnabled ? "Desativar" : "Ativar"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Coluna 2: Simulador de Checkout Sandbox */}
        <div style={panelCardStyle}>
          <div style={{ marginBottom: "16px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#10B981", textTransform: "uppercase" }}>
              Sandbox Mock Checkout
            </span>
            <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#FFFFFF", margin: "4px 0 0 0" }}>
              Simulador de Pagamento & Invariante Contábil
            </h2>
            <p style={{ fontSize: "12px", color: "#94A3B8", margin: "4px 0 0 0" }}>
              Simule a compensação de frete sem efetuar transações bancárias reais nem gerar cobranças em cartões.
            </p>
          </div>

          <form onSubmit={handleSimulateCheckout} style={{ marginBottom: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label htmlFor="sim-checkout-amount" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                  Valor do Frete (R$):
                </label>
                <input
                  id="sim-checkout-amount"
                  type="number"
                  min="5"
                  step="1"
                  value={simAmount}
                  onChange={(e) => setSimAmount(parseFloat(e.target.value) || 0)}
                  style={inputStyle}
                  required
                />
              </div>

              <div>
                <label htmlFor="sim-checkout-method" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                  Método de Pagamento:
                </label>
                <select
                  id="sim-checkout-method"
                  value={simMethod}
                  onChange={(e) => setSimMethod(e.target.value)}
                  style={inputStyle}
                >
                  <option value="PIX">Pix (Imediato Sandbox)</option>
                  <option value="DEBIT_CARD">Cartão de Débito (Mock Token)</option>
                  <option value="CREDIT_CARD">Cartão de Crédito (Mock Token)</option>
                  <option value="BANK_SLIP">Boleto Bancário (Inativo / Requer Autorização)</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label htmlFor="sim-checkout-plan" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                Plano do Transportador:
              </label>
              <select
                id="sim-checkout-plan"
                value={simPlan}
                onChange={(e) => setSimPlan(e.target.value)}
                style={inputStyle}
              >
                <option value="STANDARD">Standard (13% Comissão)</option>
                <option value="PREMIUM">Premium (7% Comissão)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={simulating}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "6px",
                backgroundColor: "#10B981",
                color: "#FFFFFF",
                border: "none",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer"
              }}
            >
              {simulating ? "Executando Simulação..." : "⚡ Simular Checkout Sandbox"}
            </button>
          </form>

          {/* Resultado da Simulação */}
          {simResult && (
            <div style={{ backgroundColor: "#0F172A", padding: "18px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
              <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#FFFFFF", margin: "0 0 12px 0" }}>
                Extrato da Simulação ({simResult.provider})
              </h4>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1E293B", fontSize: "13px" }}>
                <span style={{ color: "#94A3B8" }}>Valor Bruto:</span>
                <strong style={{ color: "#FFFFFF" }}>
                  {(simResult.grossAmountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1E293B", fontSize: "13px" }}>
                <span style={{ color: "#94A3B8" }}>Taxa Gateway Absorvida (D12):</span>
                <span style={{ color: "#F59E0B" }}>
                  {(simResult.platformAbsorbedGatewayFeeCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (100% Topic Log)
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1E293B", fontSize: "13px" }}>
                <span style={{ color: "#94A3B8" }}>Total Pago pelo Remetente:</span>
                <strong style={{ color: "#10B981" }}>
                  {(simResult.senderTotalCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1E293B", fontSize: "13px" }}>
                <span style={{ color: "#94A3B8" }}>Comissão Topic Log ({simResult.appliedCommissionPercent}%):</span>
                <span style={{ color: "#38BDF8", fontWeight: 700 }}>
                  {(simResult.platformCommissionCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1E293B", fontSize: "13px" }}>
                <span style={{ color: "#94A3B8" }}>Líquido Repassado ao Transportador:</span>
                <span style={{ color: "#10B981", fontWeight: 700 }}>
                  {(simResult.carrierNetCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "12px", borderBottom: "1px solid #1E293B" }}>
                <span style={{ color: "#94A3B8" }}>Invariante Contábil:</span>
                <span style={{ color: simResult.accountingInvariantPreserved ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                  {simResult.accountingInvariantPreserved ? "PRESERVADA (Gross == Com + Net)" : "VIOLADA"}
                </span>
              </div>

              <div style={{ marginTop: "12px", fontSize: "11px", color: "#64748B", wordBreak: "break-all" }}>
                <strong>Instrução Sandbox:</strong> {simResult.sandboxInstructions}
                <br />
                <strong>Referência Mock:</strong> {simResult.sandboxPaymentReference}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const panelCardStyle: React.CSSProperties = {
  backgroundColor: "#1E293B",
  borderRadius: "12px",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  padding: "24px"
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
