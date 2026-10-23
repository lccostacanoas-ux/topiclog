"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useAdminRole } from "./admin-context";
import { getAdminDashboardMetricsApi } from "@/lib/api-client";
import type { AdminDashboardMetricsDto } from "@/lib/types";

export default function AdminDashboardPage(): React.JSX.Element {
  const { role, token } = useAdminRole();
  const [metrics, setMetrics] = useState<AdminDashboardMetricsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadMetrics() {
      if (!token) return;
      setLoading(true);
      setError(null);
      const res = await getAdminDashboardMetricsApi(token);
      if (res.ok && res.data) {
        setMetrics(res.data);
      } else {
        setError(res.problem?.detail ?? "Não foi possível carregar métricas administrativas.");
      }
      setLoading(false);
    }
    loadMetrics();
  }, [token]);

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#FFFFFF", margin: "0 0 6px 0" }}>
          Visão Geral & Indicadores da Plataforma
        </h1>
        <p style={{ fontSize: "14px", color: "#94A3B8", margin: 0 }}>
          Painel central de governança técnica, operacional e financeira da Topic Log (Minas Gerais).
        </p>
      </div>

      {/* Alerta de Perfil RBAC */}
      <div
        style={{
          padding: "14px 18px",
          borderRadius: "8px",
          backgroundColor: "rgba(37, 99, 235, 0.12)",
          border: "1px solid rgba(37, 99, 235, 0.3)",
          color: "#93C5FD",
          fontSize: "13px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <div>
          <strong>Sessão Administrativa Ativa:</strong> Você está operando com permissões de <code>{role}</code>.
          {role === "GENERAL_ADMIN" && " Acesso irrestrito a configurações, aprovação de veículos e governança."}
          {role === "FINANCIAL_ADMIN" && " Foco em comissões, planos e métodos de pagamento."}
          {role === "COMPLIANCE_AUDITOR" && " Visualização de diagnósticos e logs imutáveis de auditoria."}
          {role === "SUPPORT_OPERATOR" && " Atendimento e acompanhamento operacional de viagens e frotas."}
          {role === "LEGAL_OPERATOR" && " Gestão de modelos contratuais, minutas regulatórias e aprovação jurídica."}
        </div>
        <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", backgroundColor: "#1E293B", borderRadius: "4px" }}>
          D14 SANDBOX
        </span>
      </div>

      {error && (
        <div
          style={{
            padding: "16px",
            borderRadius: "8px",
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#FCA5A5",
            fontSize: "13px",
            marginBottom: "24px"
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#94A3B8" }}>
          Carregando indicadores do painel administrativo...
        </div>
      )}

      {metrics && !loading && (
        <>
          {/* Grid de KPIs Operacionais */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "16px",
              marginBottom: "28px"
            }}
          >
            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Total de Usuários</div>
              <div style={kpiValueStyle}>{metrics.totalUsers}</div>
              <div style={kpiSubStyle}>{metrics.totalCarriers} transportadores • {metrics.totalSenders} remetentes</div>
            </div>

            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Operação Ativa</div>
              <div style={kpiValueStyle}>{metrics.totalPublishedShipments}</div>
              <div style={kpiSubStyle}>{metrics.totalActiveTrips} viagens ativas • {metrics.totalFormalizedContracts} contratos</div>
            </div>

            <div style={{ ...kpiCardStyle, borderColor: metrics.totalVehiclesPendingModeration > 0 ? "#F59E0B" : "rgba(255, 255, 255, 0.08)" }}>
              <div style={kpiLabelStyle}>Moderação de Frotas</div>
              <div style={{ ...kpiValueStyle, color: metrics.totalVehiclesPendingModeration > 0 ? "#FBBF24" : "#FFFFFF" }}>
                {metrics.totalVehiclesPendingModeration}
              </div>
              <div style={kpiSubStyle}>
                <Link href="/admin/frotas" style={{ color: "#38BDF8", textDecoration: "none", fontWeight: 600 }}>
                  Revisar veículos pendentes →
                </Link>
              </div>
            </div>

            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Assinaturas Premium</div>
              <div style={kpiValueStyle}>{metrics.totalActiveSubscriptions}</div>
              <div style={kpiSubStyle}>Plano com taxa reduzida (7%)</div>
            </div>
          </div>

          {/* Destaque Política Comercial Vigente (PR-FIN-01) */}
          <div
            style={{
              backgroundColor: "#1E293B",
              borderRadius: "12px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              padding: "24px",
              marginBottom: "28px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#10B981", textTransform: "uppercase" }}>
                  Política Comercial Vigente
                </span>
                <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#FFFFFF", margin: "4px 0 0 0" }}>
                  Versão {metrics.currentPolicyVersion} (Topic Log v2.0)
                </h3>
              </div>
              <Link
                href="/admin/politicas"
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  backgroundColor: "#2563EB",
                  color: "#FFFFFF",
                  textDecoration: "none",
                  fontSize: "12px",
                  fontWeight: 700
                }}
              >
                Gerenciar Políticas & Simular →
              </Link>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
              <div style={policyItemStyle}>
                <div style={policyLabelStyle}>Comissão Free (Standard)</div>
                <div style={policyValueStyle}>{metrics.freePlanCommissionPercent.toFixed(2)}%</div>
                <div style={policySubStyle}>Sem mensalidade fixa (D10)</div>
              </div>
              <div style={policyItemStyle}>
                <div style={policyLabelStyle}>Comissão Premium</div>
                <div style={policyValueStyle}>{metrics.premiumPlanCommissionPercent.toFixed(2)}%</div>
                <div style={policySubStyle}>Alíquota incentivada (D11)</div>
              </div>
              <div style={policyItemStyle}>
                <div style={policyLabelStyle}>Mensalidade Premium</div>
                <div style={policyValueStyle}>
                  {(metrics.premiumMonthlyFeeCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </div>
                <div style={policySubStyle}>Cobrança mensal simulada</div>
              </div>
              <div style={policyItemStyle}>
                <div style={policyLabelStyle}>Taxas de Gateway</div>
                <div style={{ ...policyValueStyle, color: "#10B981" }}>100% Absorvidas</div>
                <div style={policySubStyle}>Remetente não paga taxa (D12)</div>
              </div>
            </div>
          </div>

          {/* Atalhos Rápidos para Módulos */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
            <Link href="/admin/operacoes" style={quickLinkCardStyle}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>⚙️</div>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "#FFFFFF", marginBottom: "4px" }}>
                Configurações Operacionais & Modais
              </div>
              <div style={{ fontSize: "12px", color: "#94A3B8" }}>
                Ajuste os limites de peso (5kg bike, 20kg moto/carro), desvios viários (10km / 20km) e prazos de propostas.
              </div>
            </Link>

            <Link href="/admin/frotas" style={quickLinkCardStyle}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>🚗</div>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "#FFFFFF", marginBottom: "4px" }}>
                Frotas & Moderação de Veículos
              </div>
              <div style={{ fontSize: "12px", color: "#94A3B8" }}>
                Aprove ou reprove veículos cadastrados, consulte o alerta regulatório de 7 anos e visualize placas mascaradas.
              </div>
            </Link>

            <Link href="/admin/governanca" style={quickLinkCardStyle}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>💳</div>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "#FFFFFF", marginBottom: "4px" }}>
                Governança de Pagamentos (PR-FIN-02)
              </div>
              <div style={{ fontSize: "12px", color: "#94A3B8" }}>
                Habilite ou desabilite métodos (PIX, Cartão, Boleto) e execute simulações de checkout com invariante contábil.
              </div>
            </Link>

            <Link href="/admin/auditoria" style={quickLinkCardStyle}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>🛡️</div>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "#FFFFFF", marginBottom: "4px" }}>
                Trilha de Auditoria & Segurança
              </div>
              <div style={{ fontSize: "12px", color: "#94A3B8" }}>
                Consulte registros imutáveis de alterações operacionais, moderações de frotas e governança financeira.
              </div>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

const kpiCardStyle: React.CSSProperties = {
  backgroundColor: "#1E293B",
  borderRadius: "10px",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  padding: "20px"
};

const kpiLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#94A3B8",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  marginBottom: "8px"
};

const kpiValueStyle: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: 800,
  color: "#FFFFFF",
  lineHeight: "1.2",
  marginBottom: "6px"
};

const kpiSubStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#64748B"
};

const policyItemStyle: React.CSSProperties = {
  backgroundColor: "#0F172A",
  padding: "16px",
  borderRadius: "8px",
  border: "1px solid rgba(255, 255, 255, 0.05)"
};

const policyLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#94A3B8",
  fontWeight: 600,
  marginBottom: "4px"
};

const policyValueStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 800,
  color: "#FFFFFF",
  marginBottom: "2px"
};

const policySubStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#64748B"
};

const quickLinkCardStyle: React.CSSProperties = {
  backgroundColor: "#1E293B",
  borderRadius: "10px",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  padding: "20px",
  textDecoration: "none",
  display: "block",
  transition: "all 0.15s ease"
};
