"use client";

import React, { useEffect, useState } from "react";
import { useAdminRole } from "../admin-context";
import { getOperationalSettingsApi, updateOperationalSettingsApi } from "@/lib/api-client";
import type { OperationalSettingsDto } from "@/lib/types";

export default function AdminOperacoesPage(): React.JSX.Element {
  const { role, token } = useAdminRole();
  const [settings, setSettings] = useState<OperationalSettingsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Campos do formulário
  const [bikeWeight, setBikeWeight] = useState(5000);
  const [motoWeight, setMotoWeight] = useState(20000);
  const [carWeight, setCarWeight] = useState(20000);
  const [carAge, setCarAge] = useState(7);
  const [geoCompat, setGeoCompat] = useState(10.0);
  const [geoReqEval, setGeoReqEval] = useState(20.0);
  const [postDeliveryRadius, setPostDeliveryRadius] = useState(2.0);
  const [propStandardHours, setPropStandardHours] = useState(24);
  const [propSameDayHours, setPropSameDayHours] = useState(2);
  const [priorityMinutes, setPriorityMinutes] = useState(10);
  const [cancelPenalty, setCancelPenalty] = useState(10.0);
  const [cancelMinFee, setCancelMinFee] = useState(7.0);
  const [cancelShare, setCancelShare] = useState(80.0);
  const [justification, setJustification] = useState("");

  useEffect(() => {
    async function loadSettings() {
      if (!token) return;
      setLoading(true);
      setMessage(null);
      const res = await getOperationalSettingsApi(token);
      if (res.ok && res.data) {
        const s = res.data;
        setSettings(s);
        setBikeWeight(s.bicycleMaxWeightGrams);
        setMotoWeight(s.motorcycleMaxWeightGrams);
        setCarWeight(s.carMaxWeightGrams);
        setCarAge(s.carMaxAgeYears);
        setGeoCompat(s.geoDeviationCompatibleKm);
        setGeoReqEval(s.geoDeviationRequiresEvalKm);
        setPostDeliveryRadius(s.postDeliveryRadiusKm);
        setPropStandardHours(s.proposalStandardValidityHours);
        setPropSameDayHours(s.proposalSameDayValidityHours);
        setPriorityMinutes(s.prioritySecondShipmentMinutes);
        setCancelPenalty(s.cancellationPenaltyPercent);
        setCancelMinFee(s.cancellationMinFeeCents / 100);
        setCancelShare(s.cancellationInjuredPartySharePercent);
      } else {
        setMessage({ text: res.problem?.detail ?? "Falha ao carregar configurações operacionais.", isError: true });
      }
      setLoading(false);
    }
    loadSettings();
  }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (role !== "GENERAL_ADMIN") {
      setMessage({
        text: `Ação bloqueada por RBAC: o perfil '${role}' possui acesso somente-leitura às operações. Apenas GENERAL_ADMIN pode alterar configurações.`,
        isError: true
      });
      return;
    }

    if (!justification.trim()) {
      setMessage({ text: "Justificativa obrigatória para registrar a alteração de parâmetros operacionais na auditoria.", isError: true });
      return;
    }

    // Validação de hierarquia no front
    if (bikeWeight > motoWeight || motoWeight > carWeight) {
      setMessage({ text: "Violação de hierarquia de peso: Bicicleta deve ser menor ou igual a Moto, e Moto menor ou igual a Carro.", isError: true });
      return;
    }

    setSaving(true);
    setMessage(null);

    const res = await updateOperationalSettingsApi({
      bicycleMaxWeightGrams: bikeWeight,
      motorcycleMaxWeightGrams: motoWeight,
      carMaxWeightGrams: carWeight,
      carMaxAgeYears: carAge,
      geoDeviationCompatibleKm: geoCompat,
      geoDeviationRequiresEvalKm: geoReqEval,
      postDeliveryRadiusKm: postDeliveryRadius,
      proposalStandardValidityHours: propStandardHours,
      proposalSameDayValidityHours: propSameDayHours,
      prioritySecondShipmentMinutes: priorityMinutes,
      cancellationPenaltyPercent: cancelPenalty,
      cancellationMinFeeCents: Math.round(cancelMinFee * 100),
      cancellationInjuredPartySharePercent: cancelShare,
      justification: justification.trim()
    }, token);

    if (res.ok && res.data) {
      setSettings(res.data);
      setMessage({ text: `Configurações operacionais atualizadas com sucesso! Versão ativa: ${res.data.version}.`, isError: false });
      setJustification("");
    } else {
      setMessage({ text: res.problem?.detail ?? "Falha ao atualizar parâmetros operacionais.", isError: true });
    }
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#FFFFFF", margin: "0 0 6px 0" }}>
          Configurações Operacionais & Parâmetros da Plataforma
        </h1>
        <p style={{ fontSize: "14px", color: "#94A3B8", margin: 0 }}>
          Controle de pesos por modal, idade veicular regulatória, raios de busca espacial e janelas de negociação.
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
          Carregando configurações operacionais...
        </div>
      ) : (
        <form onSubmit={handleSave}>
          {/* Seção 1: Limites Modais de Peso */}
          <div style={sectionCardStyle}>
            <div style={{ marginBottom: "16px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#38BDF8", textTransform: "uppercase" }}>
                Modais de Transporte (D03, D04)
              </span>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#FFFFFF", margin: "4px 0 0 0" }}>
                Limites Máximos de Peso por Modal
              </h2>
              <p style={{ fontSize: "12px", color: "#94A3B8", margin: "4px 0 0 0" }}>
                Padrão vinculante: Bicicleta até 5 kg (5.000g), Motocicleta e Carro até 20 kg (20.000g). A hierarquia Bicicleta &le; Moto &le; Carro é estritamente fiscalizada.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
              <div>
                <label htmlFor="bike-weight" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                  Bicicleta (gramas):
                </label>
                <input
                  id="bike-weight"
                  type="number"
                  min="500"
                  step="100"
                  value={bikeWeight}
                  onChange={(e) => setBikeWeight(parseInt(e.target.value, 10))}
                  style={inputStyle}
                  required
                />
                <span style={{ fontSize: "11px", color: "#64748B" }}>Equivale a {(bikeWeight / 1000).toFixed(1)} kg</span>
              </div>

              <div>
                <label htmlFor="moto-weight" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                  Motocicleta (gramas):
                </label>
                <input
                  id="moto-weight"
                  type="number"
                  min="1000"
                  step="500"
                  value={motoWeight}
                  onChange={(e) => setMotoWeight(parseInt(e.target.value, 10))}
                  style={inputStyle}
                  required
                />
                <span style={{ fontSize: "11px", color: "#64748B" }}>Equivale a {(motoWeight / 1000).toFixed(1)} kg</span>
              </div>

              <div>
                <label htmlFor="car-weight" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                  Automóvel / Utilitário (gramas):
                </label>
                <input
                  id="car-weight"
                  type="number"
                  min="1000"
                  step="500"
                  value={carWeight}
                  onChange={(e) => setCarWeight(parseInt(e.target.value, 10))}
                  style={inputStyle}
                  required
                />
                <span style={{ fontSize: "11px", color: "#64748B" }}>Equivale a {(carWeight / 1000).toFixed(1)} kg</span>
              </div>
            </div>
          </div>

          {/* Seção 2: Idade Veicular & Desvios Geográficos */}
          <div style={sectionCardStyle}>
            <div style={{ marginBottom: "16px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#F59E0B", textTransform: "uppercase" }}>
                Regulamentação & Geografia (PR-03, PR-ADM-01)
              </span>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#FFFFFF", margin: "4px 0 0 0" }}>
                Idade Veicular & Desvios Espaciais
              </h2>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
              <div>
                <label htmlFor="car-age" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                  Idade Máxima Recomendada de Carros (anos):
                </label>
                <input
                  id="car-age"
                  type="number"
                  min="1"
                  max="30"
                  value={carAge}
                  onChange={(e) => setCarAge(parseInt(e.target.value, 10))}
                  style={inputStyle}
                  required
                />
                <span style={{ fontSize: "11px", color: "#64748B" }}>Parâmetro proposto: 7 anos (gera alerta na moderação)</span>
              </div>

              <div>
                <label htmlFor="geo-compat" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                  Desvio Compatível Direto (km):
                </label>
                <input
                  id="geo-compat"
                  type="number"
                  step="0.5"
                  value={geoCompat}
                  onChange={(e) => setGeoCompat(parseFloat(e.target.value))}
                  style={inputStyle}
                  required
                />
                <span style={{ fontSize: "11px", color: "#64748B" }}>Até {geoCompat} km = COMPATIBLE</span>
              </div>

              <div>
                <label htmlFor="geo-eval" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                  Desvio Máximo com Avaliação (km):
                </label>
                <input
                  id="geo-eval"
                  type="number"
                  step="0.5"
                  value={geoReqEval}
                  onChange={(e) => setGeoReqEval(parseFloat(e.target.value))}
                  style={inputStyle}
                  required
                />
                <span style={{ fontSize: "11px", color: "#64748B" }}>Até {geoReqEval} km = REQUIRES_EVALUATION</span>
              </div>

              <div>
                <label htmlFor="post-radius" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                  Raio Pós-Entrega (km):
                </label>
                <input
                  id="post-radius"
                  type="number"
                  step="0.5"
                  value={postDeliveryRadius}
                  onChange={(e) => setPostDeliveryRadius(parseFloat(e.target.value))}
                  style={inputStyle}
                  required
                />
                <span style={{ fontSize: "11px", color: "#64748B" }}>Oportunidades próximas (Regra 3 = 2 km)</span>
              </div>
            </div>
          </div>

          {/* Seção 3: Validades de Proposta & Cancelamento */}
          <div style={sectionCardStyle}>
            <div style={{ marginBottom: "16px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#10B981", textTransform: "uppercase" }}>
                Negociação & Governança (PR-04)
              </span>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#FFFFFF", margin: "4px 0 0 0" }}>
                Prazos de Propostas & Regras de Cancelamento
              </h2>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
              <div>
                <label htmlFor="prop-std" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                  Validade Padrão de Proposta (horas):
                </label>
                <input
                  id="prop-std"
                  type="number"
                  min="1"
                  value={propStandardHours}
                  onChange={(e) => setPropStandardHours(parseInt(e.target.value, 10))}
                  style={inputStyle}
                  required
                />
                <span style={{ fontSize: "11px", color: "#64748B" }}>Regra: 24 horas</span>
              </div>

              <div>
                <label htmlFor="prop-same" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                  Validade Mesma Data (horas):
                </label>
                <input
                  id="prop-same"
                  type="number"
                  min="1"
                  value={propSameDayHours}
                  onChange={(e) => setPropSameDayHours(parseInt(e.target.value, 10))}
                  style={inputStyle}
                  required
                />
                <span style={{ fontSize: "11px", color: "#64748B" }}>Para coletas no mesmo dia: 2 horas</span>
              </div>

              <div>
                <label htmlFor="prio-min" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                  Janela da 2ª Encomenda (minutos):
                </label>
                <input
                  id="prio-min"
                  type="number"
                  min="1"
                  value={priorityMinutes}
                  onChange={(e) => setPriorityMinutes(parseInt(e.target.value, 10))}
                  style={inputStyle}
                  required
                />
                <span style={{ fontSize: "11px", color: "#64748B" }}>Oferta prioritária: 10 minutos (Regra 2)</span>
              </div>

              <div>
                <label htmlFor="cancel-penalty" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                  Multa Cancelamento Injustificado (%):
                </label>
                <input
                  id="cancel-penalty"
                  type="number"
                  step="0.5"
                  value={cancelPenalty}
                  onChange={(e) => setCancelPenalty(parseFloat(e.target.value))}
                  style={inputStyle}
                  required
                />
                <span style={{ fontSize: "11px", color: "#64748B" }}>Proposta: 10% (Piso R$ 7,00)</span>
              </div>
            </div>
          </div>

          {/* Justificativa e Ação de Salvar */}
          <div style={{ ...sectionCardStyle, border: "1px solid rgba(37, 99, 235, 0.4)" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#FFFFFF", margin: "0 0 8px 0" }}>
              Auditoria de Alteração Operacional
            </h3>
            <p style={{ fontSize: "12px", color: "#94A3B8", margin: "0 0 16px 0" }}>
              Todas as modificações de limites e prazos operacionais geram evento na trilha de auditoria imutável com versionamento sem retroatividade.
            </p>

            <div style={{ marginBottom: "16px" }}>
              <label htmlFor="op-justification" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                Justificativa Obrigatória:
              </label>
              <textarea
                id="op-justification"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Ex: Ajuste na tolerância de desvio viário para atender rotas rurais no polo de Monlevade..."
                rows={2}
                style={{ ...inputStyle, resize: "vertical" }}
                required
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "10px 24px",
                  borderRadius: "6px",
                  backgroundColor: role === "GENERAL_ADMIN" ? "#2563EB" : "#475569",
                  color: "#FFFFFF",
                  border: "none",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: role === "GENERAL_ADMIN" ? "pointer" : "not-allowed"
                }}
              >
                {saving ? "Salvando parâmetros..." : "Salvar Configurações Operacionais"}
              </button>
              {role !== "GENERAL_ADMIN" && (
                <span style={{ fontSize: "12px", color: "#F87171" }}>
                  Apenas administradores gerais (GENERAL_ADMIN) podem salvar parâmetros operacionais.
                </span>
              )}
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

const sectionCardStyle: React.CSSProperties = {
  backgroundColor: "#1E293B",
  borderRadius: "12px",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  padding: "24px",
  marginBottom: "24px"
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
