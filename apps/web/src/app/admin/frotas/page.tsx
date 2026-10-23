"use client";

import React, { useEffect, useState } from "react";
import { useAdminRole } from "../admin-context";
import { listCarrierVehiclesApi, moderateCarrierVehicleApi } from "@/lib/api-client";
import type { CarrierVehicleDto } from "@/lib/types";

export default function AdminFrotasPage(): React.JSX.Element {
  const { role, token } = useAdminRole();
  const [vehicles, setVehicles] = useState<CarrierVehicleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Modal / Prompt de Reprovação
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [actionLoading, setActionLoading] = useState(false);

  // Simulador de Cadastro de Veículo para testes
  const [showSimModal, setShowSimModal] = useState(false);
  const [simType, setSimType] = useState("CAR");
  const [simBrand, setSimBrand] = useState("Volkswagen Gol 1.0");
  const [simYear, setSimYear] = useState(2017);
  const [simPlate, setSimPlate] = useState("BRA-2E19");
  const [simCap, setSimCap] = useState(20000);

  const loadVehicles = async () => {
    if (!token) return;
    setLoading(true);
    const filter = statusFilter === "ALL" ? undefined : statusFilter;
    const res = await listCarrierVehiclesApi({ status: filter }, token);
    if (res.ok && res.data) {
      setVehicles(res.data);
    } else {
      setMessage({ text: res.problem?.detail ?? "Falha ao listar veículos.", isError: true });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadVehicles();
  }, [token, statusFilter]);

  const handleApprove = async (id: string) => {
    setActionLoading(true);
    setMessage(null);
    const res = await moderateCarrierVehicleApi(id, { status: "APPROVED" }, token);
    if (res.ok && res.data) {
      setMessage({ text: `Veículo aprovado com sucesso! Status: ${res.data.status}.`, isError: false });
      loadVehicles();
    } else {
      setMessage({ text: res.problem?.detail ?? "Falha ao aprovar veículo.", isError: true });
    }
    setActionLoading(false);
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingId) return;

    if (!rejectionReason.trim()) {
      setMessage({ text: "A fundamentação administrativa é obrigatória para reprovar o veículo.", isError: true });
      return;
    }

    setActionLoading(true);
    setMessage(null);
    const res = await moderateCarrierVehicleApi(rejectingId, {
      status: "REJECTED",
      rejectionReason: rejectionReason.trim()
    }, token);

    if (res.ok && res.data) {
      setMessage({ text: `Veículo reprovado. Motivo registrado: "${res.data.rejectionReason}".`, isError: false });
      setRejectingId(null);
      setRejectionReason("");
      loadVehicles();
    } else {
      setMessage({ text: res.problem?.detail ?? "Falha ao reprovar veículo.", isError: true });
    }
    setActionLoading(false);
  };

  const handleSimulateRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await fetch("/api/v1/admin/vehicles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          vehicleType: simType,
          brandModel: simBrand.trim(),
          manufacturingYear: simYear,
          plate: simPlate.trim(),
          declaredCapacityGrams: simCap,
          crlvDocumentKey: "crlv-mock-sim.pdf"
        })
      });

      if (res.ok) {
        setMessage({ text: "Veículo simulado cadastrado com sucesso! Status: PENDING_APPROVAL.", isError: false });
        setShowSimModal(false);
        loadVehicles();
      } else {
        const err = await res.json();
        setMessage({ text: err.detail ?? "Erro ao cadastrar veículo simulado.", isError: true });
      }
    } catch {
      setMessage({ text: "Falha de rede ao cadastrar veículo simulado.", isError: true });
    }
    setActionLoading(false);
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#FFFFFF", margin: "0 0 6px 0" }}>
            Frotas & Moderação de Veículos
          </h1>
          <p style={{ fontSize: "14px", color: "#94A3B8", margin: 0 }}>
            Verificação de documentos CRLV, conformidade de idade veicular e mascaramento de placas para proteção de privacidade.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSimModal(true)}
          style={{
            padding: "8px 16px",
            backgroundColor: "#2563EB",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "6px",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer"
          }}
        >
          + Cadastrar Veículo Simulado
        </button>
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

      {/* Tabs de Filtro */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {[
          { key: "ALL", label: "Todos os Veículos" },
          { key: "PENDING_APPROVAL", label: "Aguardando Moderação" },
          { key: "APPROVED", label: "Aprovados" },
          { key: "REJECTED", label: "Reprovados" }
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatusFilter(tab.key)}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid",
              borderColor: statusFilter === tab.key ? "#2563EB" : "#334155",
              backgroundColor: statusFilter === tab.key ? "#2563EB" : "#1E293B",
              color: statusFilter === tab.key ? "#FFFFFF" : "#94A3B8",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Modal de Reprovação */}
      {rejectingId && (
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
              Reprovação Administrativa de Veículo
            </h3>
            <p style={{ fontSize: "13px", color: "#94A3B8", margin: "0 0 16px 0" }}>
              Informe o motivo da reprovação. Esta fundamentação será registrada na auditoria e comunicada ao transportador.
            </p>

            <form onSubmit={handleReject}>
              <div style={{ marginBottom: "16px" }}>
                <label htmlFor="modal-rejection-reason" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "6px" }}>
                  Justificativa Obrigatória:
                </label>
                <textarea
                  id="modal-rejection-reason"
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Ex: Documento CRLV ilegível ou vencido, placa incompatível com cadastro..."
                  style={inputStyle}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => { setRejectingId(null); setRejectionReason(""); }}
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
                    backgroundColor: "#EF4444",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer"
                  }}
                >
                  {actionLoading ? "Processando..." : "Confirmar Reprovação"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Simulação de Cadastro */}
      {showSimModal && (
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
              maxWidth: "520px",
              border: "1px solid rgba(255, 255, 255, 0.1)"
            }}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#FFFFFF", margin: "0 0 8px 0" }}>
              Cadastrar Veículo para Simulação de Moderação
            </h3>
            <p style={{ fontSize: "13px", color: "#94A3B8", margin: "0 0 16px 0" }}>
              Insira os dados do veículo para avaliar as regras de moderação, limite de idade (7 anos) e mascaramento.
            </p>

            <form onSubmit={handleSimulateRegister}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label htmlFor="sim-type" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                    Tipo de Modal:
                  </label>
                  <select
                    id="sim-type"
                    value={simType}
                    onChange={(e) => setSimType(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="BICYCLE">Bicicleta</option>
                    <option value="MOTORCYCLE">Motocicleta</option>
                    <option value="CAR">Automóvel (Carro)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="sim-year" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                    Ano de Fabricação:
                  </label>
                  <input
                    id="sim-year"
                    type="number"
                    min="1990"
                    max={new Date().getFullYear() + 1}
                    value={simYear}
                    onChange={(e) => setSimYear(parseInt(e.target.value, 10))}
                    style={inputStyle}
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label htmlFor="sim-brand" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                  Marca e Modelo:
                </label>
                <input
                  id="sim-brand"
                  type="text"
                  value={simBrand}
                  onChange={(e) => setSimBrand(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
                <div>
                  <label htmlFor="sim-plate" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                    Placa (Mercosul/Antiga):
                  </label>
                  <input
                    id="sim-plate"
                    type="text"
                    value={simPlate}
                    onChange={(e) => setSimPlate(e.target.value)}
                    style={inputStyle}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="sim-cap" style={{ display: "block", fontSize: "12px", color: "#94A3B8", marginBottom: "4px" }}>
                    Capacidade Declarada (g):
                  </label>
                  <input
                    id="sim-cap"
                    type="number"
                    step="500"
                    value={simCap}
                    onChange={(e) => setSimCap(parseInt(e.target.value, 10))}
                    style={inputStyle}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowSimModal(false)}
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
                    backgroundColor: "#2563EB",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer"
                  }}
                >
                  {actionLoading ? "Cadastrando..." : "Cadastrar Veículo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tabela de Veículos */}
      <div style={panelCardStyle}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "36px 0", color: "#94A3B8" }}>
            Carregando frota de veículos...
          </div>
        ) : vehicles.length === 0 ? (
          <div style={{ textAlign: "center", padding: "36px 0", color: "#94A3B8" }}>
            Nenhum veículo encontrado para o filtro selecionado.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "#94A3B8" }}>
                  <th style={{ padding: "10px 12px" }}>Transportador</th>
                  <th style={{ padding: "10px 12px" }}>Modal</th>
                  <th style={{ padding: "10px 12px" }}>Marca / Modelo</th>
                  <th style={{ padding: "10px 12px" }}>Ano / Idade</th>
                  <th style={{ padding: "10px 12px" }}>Placa Mascarada</th>
                  <th style={{ padding: "10px 12px" }}>Capacidade</th>
                  <th style={{ padding: "10px 12px" }}>Status</th>
                  <th style={{ padding: "10px 12px" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                    <td style={{ padding: "12px", color: "#FFFFFF", fontWeight: 600 }}>{v.carrierName}</td>
                    <td style={{ padding: "12px", color: "#CBD5E1" }}>
                      {v.vehicleType === "CAR" && "🚗 Automóvel"}
                      {v.vehicleType === "MOTORCYCLE" && "🏍️ Motocicleta"}
                      {v.vehicleType === "BICYCLE" && "🚲 Bicicleta"}
                    </td>
                    <td style={{ padding: "12px", color: "#CBD5E1" }}>{v.brandModel}</td>
                    <td style={{ padding: "12px" }}>
                      <span style={{ color: "#FFFFFF" }}>{v.manufacturingYear}</span>
                      <span style={{ fontSize: "11px", color: "#94A3B8", marginLeft: "6px" }}>({v.ageYears} anos)</span>
                      {v.regulatoryAgeWarning && (
                        <div
                          style={{
                            marginTop: "4px",
                            display: "inline-block",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "10px",
                            fontWeight: 700,
                            backgroundColor: "rgba(245, 158, 11, 0.15)",
                            color: "#FBBF24",
                            border: "1px solid rgba(245, 158, 11, 0.3)"
                          }}
                          title="Veículo com idade superior ao parâmetro regulatório de 7 anos"
                        >
                          ⚠️ Idade &gt; 7 anos
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px", fontFamily: "monospace", color: "#94A3B8" }}>
                      {v.plateMasked}
                    </td>
                    <td style={{ padding: "12px", color: "#CBD5E1" }}>
                      {(v.declaredCapacityGrams / 1000).toFixed(1)} kg
                    </td>
                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 700,
                          backgroundColor:
                            v.status === "APPROVED"
                              ? "rgba(16, 185, 129, 0.15)"
                              : v.status === "REJECTED"
                              ? "rgba(239, 68, 68, 0.15)"
                              : "rgba(245, 158, 11, 0.15)",
                          color:
                            v.status === "APPROVED"
                              ? "#10B981"
                              : v.status === "REJECTED"
                              ? "#EF4444"
                              : "#FBBF24"
                        }}
                      >
                        {v.status === "PENDING_APPROVAL" && "PENDENTE"}
                        {v.status === "APPROVED" && "APROVADO"}
                        {v.status === "REJECTED" && "REPROVADO"}
                        {v.status === "INACTIVE" && "INATIVO"}
                      </span>
                      {v.rejectionReason && (
                        <div style={{ fontSize: "11px", color: "#F87171", marginTop: "4px" }}>
                          Motivo: {v.rejectionReason}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px" }}>
                      {v.status === "PENDING_APPROVAL" ? (
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            type="button"
                            onClick={() => handleApprove(v.id)}
                            disabled={actionLoading}
                            style={{
                              padding: "4px 8px",
                              backgroundColor: "#10B981",
                              color: "#FFFFFF",
                              border: "none",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 700,
                              cursor: "pointer"
                            }}
                          >
                            Aprovar
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectingId(v.id)}
                            disabled={actionLoading}
                            style={{
                              padding: "4px 8px",
                              backgroundColor: "#EF4444",
                              color: "#FFFFFF",
                              border: "none",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 700,
                              cursor: "pointer"
                            }}
                          >
                            Reprovar
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: "11px", color: "#64748B" }}>
                          {v.moderatedAtUtc ? new Date(v.moderatedAtUtc).toLocaleDateString("pt-BR") : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
