"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { listTripsApi, updateTripApi, deleteTripApi } from "../../lib/api-client";
import type { TripSummaryDto } from "../../lib/types";
import {
  getDemoTrips,
  removeDemoTrip,
  updateDemoTrip,
  type DemoTrip
} from "../../lib/demo-marketplace-store";
import StarRatingDisplay from "../../components/StarRatingDisplay";

interface UnifiedTrip {
  id: string;
  carrierId: string;
  carrierName: string;
  carrierKycVerified: boolean;
  vehicleType: string;
  vehicleModel: string;
  originCity: string;
  destinationCity: string;
  intermediateStops: readonly string[];
  departureDate: string;
  departureTime: string;
  availableCapacityKg: number;
  suggestedPricePerKgCents?: number;
  status: string;
  isBackend: boolean;
}

const VEHICLE_LABELS: Record<string, { label: string; icon: string }> = {
  BICYCLE: { label: "Bicicleta", icon: "🚲" },
  MOTORCYCLE: { label: "Motocicleta", icon: "🏍️" },
  CAR: { label: "Carro / Porta-malas", icon: "🚗" },
  VAN: { label: "Van / Utilitário", icon: "🚐" },
  TRUCK: { label: "Caminhão Leve", icon: "🚚" }
};

export default function MuralViagensPage(): React.JSX.Element {
  const router = useRouter();
  const { user, token, isAuthenticated } = useAuth();
  const isCarrier = Boolean(user?.roles?.includes("CARRIER"));
  const isSender = Boolean(user?.roles?.includes("SENDER"));

  const [trips, setTrips] = useState<UnifiedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOrigin, setFilterOrigin] = useState("ALL");
  const [filterDestination, setFilterDestination] = useState("ALL");
  const [filterVehicle, setFilterVehicle] = useState("ALL");

  // Estado do Modal de Edição de Viagem
  const [editingTrip, setEditingTrip] = useState<UnifiedTrip | null>(null);
  const [editModel, setEditModel] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editCapacityKg, setEditCapacityKg] = useState("");
  const [editPriceReais, setEditPriceReais] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    const unified: UnifiedTrip[] = [];
    const seenIds = new Set<string>();

    // 1. Carrega do Backend API
    try {
      const res = await listTripsApi();
      if (res.ok && res.data) {
        for (const t of res.data) {
          seenIds.add(t.id);
          const isCurrentUser = (t.carrierId === user?.userId) || (user?.email && t.carrierName === user.email);
          const resolvedCarrierName = isCurrentUser && user?.displayName ? user.displayName : (t.carrierName || "Transportador Parceiro");
          unified.push({
            id: t.id,
            carrierId: t.carrierId,
            carrierName: resolvedCarrierName,
            carrierKycVerified: t.carrierKycVerified ?? true,
            vehicleType: t.vehicleType,
            vehicleModel: t.vehicleModel || "Veículo Cadastrado",
            originCity: t.originCity,
            destinationCity: t.destinationCity,
            intermediateStops: t.intermediateStops || [],
            departureDate: t.departureDate,
            departureTime: t.departureTime,
            availableCapacityKg: Math.round(t.availableCapacityGrams / 1000),
            suggestedPricePerKgCents: t.suggestedPricePerKgCents,
            status: t.status,
            isBackend: !res.isFallback
          });
        }
      }
    } catch (err) {
      console.warn("Aviso ao buscar viagens da API:", err);
    }

    // 2. Mescla com viagens do demo store sem duplicatas
    const localDemos = getDemoTrips();
    for (const d of localDemos) {
      const isDuplicate = unified.some(
        (u) =>
          u.originCity.toLowerCase() === d.originCity.toLowerCase() &&
          u.destinationCity.toLowerCase() === d.destinationCity.toLowerCase() &&
          u.departureDate === d.departureDate
      );
      if (!isDuplicate && !seenIds.has(d.id)) {
        seenIds.add(d.id);
        unified.push({
          id: d.id,
          carrierId: "demo-carrier",
          carrierName: d.carrierName,
          carrierKycVerified: d.carrierKycVerified,
          vehicleType: d.vehicleType,
          vehicleModel: d.vehicleModel,
          originCity: d.originCity,
          destinationCity: d.destinationCity,
          intermediateStops: d.intermediateStops || [],
          departureDate: d.departureDate,
          departureTime: d.departureTime,
          availableCapacityKg: Math.round(d.availableCapacityGrams / 1000),
          suggestedPricePerKgCents: d.suggestedPricePerKgCents,
          status: "OPEN",
          isBackend: false
        });
      }
    }

    setTrips(unified);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadTrips();
  }, [loadTrips]);

  const handleOpenEdit = (t: UnifiedTrip) => {
    setEditingTrip(t);
    setEditModel(t.vehicleModel || "");
    setEditDate(t.departureDate || "");
    setEditTime(t.departureTime || "");
    setEditCapacityKg(String(t.availableCapacityKg || ""));
    setEditPriceReais(
      t.suggestedPricePerKgCents ? (t.suggestedPricePerKgCents / 100).toFixed(2).replace(".", ",") : ""
    );
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrip) return;
    setIsSaving(true);
    setErrorMsg(null);

    const parsedKg = parseFloat(editCapacityKg.replace(",", ".").replace(/[^0-9.]/g, "")) || editingTrip.availableCapacityKg;
    const parsedPrice = parseFloat(editPriceReais.replace(",", ".").replace(/[^0-9.]/g, "")) || 0;
    const priceCents = Math.round(parsedPrice * 100);

    try {
      if (editingTrip.isBackend && token) {
        const res = await updateTripApi(
          editingTrip.id,
          {
            vehicleModel: editModel.trim() || undefined,
            departureDate: editDate.trim() || undefined,
            departureTime: editTime.trim() || undefined,
            availableCapacityGrams: Math.round(parsedKg * 1000),
            suggestedPricePerKgCents: priceCents > 0 ? priceCents : undefined
          },
          token
        );
        if (!res.ok && res.status !== 404 && res.status !== 0 && res.status !== 405) {
          setErrorMsg(res.problem?.detail || "Não foi possível salvar alterações no servidor.");
          setIsSaving(false);
          return;
        }
      }

      // Atualiza também na store local
      updateDemoTrip(editingTrip.id, {
        vehicleModel: editModel.trim() || editingTrip.vehicleModel,
        departureDate: editDate.trim() || editingTrip.departureDate,
        departureTime: editTime.trim() || editingTrip.departureTime,
        availableCapacityGrams: Math.round(parsedKg * 1000),
        suggestedPricePerKgCents: priceCents > 0 ? priceCents : editingTrip.suggestedPricePerKgCents
      });

      setSuccessMsg("✓ Viagem atualizada com sucesso!");
      setEditingTrip(null);
      await loadTrips();
    } catch {
      setErrorMsg("Erro ao salvar alterações da viagem.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTrip = async (t: UnifiedTrip) => {
    if (!window.confirm("Deseja realmente excluir esta viagem programada?")) {
      return;
    }
    try {
      if (t.isBackend && token) {
        await deleteTripApi(t.id, token);
      }
      removeDemoTrip(t.id);
      setSuccessMsg("✓ Viagem removida com sucesso!");
      await loadTrips();
    } catch {
      removeDemoTrip(t.id);
      await loadTrips();
    }
  };

  // Filtragem
  const filteredTrips = trips.filter((t) => {
    if (filterOrigin !== "ALL" && t.originCity.toLowerCase() !== filterOrigin.toLowerCase()) {
      return false;
    }
    if (filterDestination !== "ALL" && t.destinationCity.toLowerCase() !== filterDestination.toLowerCase()) {
      return false;
    }
    if (filterVehicle !== "ALL" && t.vehicleType !== filterVehicle) {
      return false;
    }
    return true;
  });

  return (
    <main
      id="main-content"
      style={{
        backgroundColor: "#F8FAFC",
        minHeight: "calc(100vh - 56px)",
        paddingTop: "24px",
        paddingBottom: "80px"
      }}
    >
      <div className="container" style={{ maxWidth: "860px", padding: "0 16px" }}>
        {/* Cabeçalho da Página */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "14px",
            marginBottom: "20px"
          }}
        >
          <div>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#059669", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              MARKETPLACE DE ROTAS & CARONAS DE CARGA
            </span>
            <h1
              style={{
                fontSize: "26px",
                fontWeight: 800,
                color: "#0F172A",
                margin: "2px 0 0 0",
                letterSpacing: "-0.5px"
              }}
            >
              Mural de Viagens Programadas
            </h1>
            <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#64748B" }}>
              Consulte motoristas com espaço ocioso no veículo ou cadastre sua próxima rota para monetizar o trajeto.
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {isCarrier && (
              <Link
                href="/viagens/cadastrar"
                className="btn btn--primary"
                id="btn-cadastrar-viagem"
                style={{
                  padding: "10px 18px",
                  fontSize: "14px",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <span>+ Cadastrar Minha Viagem</span>
              </Link>
            )}

            {isSender && (
              <Link
                href="/encomendas/publicar"
                className="btn btn--primary"
                id="btn-enviar-encomenda-viagens"
                style={{
                  padding: "10px 18px",
                  fontSize: "14px",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <span>+ Publicar Encomenda</span>
              </Link>
            )}

            {!user && (
              <Link
                href="/viagens/cadastrar"
                className="btn btn--primary"
                style={{
                  padding: "10px 18px",
                  fontSize: "14px",
                  fontWeight: 700
                }}
              >
                <span>+ Oferecer Transporte</span>
              </Link>
            )}
          </div>
        </div>

        {successMsg && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "10px",
              backgroundColor: "#ECFDF5",
              color: "#065F46",
              border: "1px solid #A7F3D0",
              marginBottom: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <span>{successMsg}</span>
            <button
              type="button"
              onClick={() => setSuccessMsg(null)}
              style={{ background: "none", border: "none", color: "#065F46", cursor: "pointer", fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Barra de Filtros Rápidos */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #E2E8F0",
            borderRadius: "14px",
            padding: "14px 18px",
            marginBottom: "20px",
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "center"
          }}
        >
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>
            Filtrar Viagens:
          </span>

          <select
            value={filterOrigin}
            onChange={(e) => setFilterOrigin(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid #CBD5E1",
              fontSize: "13px",
              backgroundColor: "#F8FAFC",
              color: "#334155",
              cursor: "pointer"
            }}
          >
            <option value="ALL">Todas as Origens</option>
            <option value="Belo Horizonte">Belo Horizonte</option>
            <option value="João Monlevade">João Monlevade</option>
            <option value="Ipatinga">Ipatinga</option>
            <option value="Itabira">Itabira</option>
            <option value="Nova Era">Nova Era</option>
          </select>

          <select
            value={filterDestination}
            onChange={(e) => setFilterDestination(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid #CBD5E1",
              fontSize: "13px",
              backgroundColor: "#F8FAFC",
              color: "#334155",
              cursor: "pointer"
            }}
          >
            <option value="ALL">Todos os Destinos</option>
            <option value="Belo Horizonte">Belo Horizonte</option>
            <option value="João Monlevade">João Monlevade</option>
            <option value="Ipatinga">Ipatinga</option>
            <option value="Itabira">Itabira</option>
            <option value="Ouro Preto">Ouro Preto</option>
          </select>

          <select
            value={filterVehicle}
            onChange={(e) => setFilterVehicle(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid #CBD5E1",
              fontSize: "13px",
              backgroundColor: "#F8FAFC",
              color: "#334155",
              cursor: "pointer"
            }}
          >
            <option value="ALL">Todos os Veículos</option>
            <option value="CAR">Carro</option>
            <option value="MOTORCYCLE">Motocicleta</option>
            <option value="VAN">Van / Utilitário</option>
            <option value="TRUCK">Caminhão</option>
            <option value="BICYCLE">Bicicleta</option>
          </select>

          {(filterOrigin !== "ALL" || filterDestination !== "ALL" || filterVehicle !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setFilterOrigin("ALL");
                setFilterDestination("ALL");
                setFilterVehicle("ALL");
              }}
              style={{
                background: "none",
                border: "none",
                color: "#2563EB",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                padding: "4px"
              }}
            >
              Limpar Filtros
            </button>
          )}
        </div>

        {/* Listagem de Viagens */}
        {loading ? (
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "16px",
              padding: "48px 24px",
              textAlign: "center",
              color: "#64748B",
              border: "1px solid #E2E8F0"
            }}
          >
            <span style={{ fontSize: "28px", display: "block", marginBottom: "8px" }}>🚚</span>
            Carregando viagens programadas...
          </div>
        ) : filteredTrips.length === 0 ? (
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "16px",
              padding: "48px 24px",
              textAlign: "center",
              border: "1px solid #E2E8F0",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
            }}
          >
            <div style={{ fontSize: "42px", marginBottom: "12px" }}>🛣️</div>
            <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#0F172A", margin: "0 0 8px 0" }}>
              Nenhuma viagem encontrada com esses filtros
            </h3>
            <p style={{ fontSize: "14px", color: "#64748B", maxWidth: "420px", margin: "0 auto 20px auto" }}>
              Tente redefinir os filtros de origem e destino ou seja o primeiro a cadastrar uma viagem nesta rota!
            </p>
            <Link
              href="/viagens/cadastrar"
              className="btn btn--primary"
              style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 700 }}
            >
              Cadastrar Viagem nesta Rota
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {filteredTrips.map((t) => {
              const isOwner = Boolean(
                user && (
                  (t.carrierId && (t.carrierId === user.userId || t.carrierId === "00000000-0000-0000-0000-000000000002")) ||
                  (user.displayName && t.carrierName.toLowerCase() === user.displayName.toLowerCase()) ||
                  (user.email && t.carrierName.toLowerCase().includes(user.email.toLowerCase())) ||
                  t.carrierName === "Transportador Cadastrado"
                )
              );
              const vehicleInfo = VEHICLE_LABELS[t.vehicleType] || { label: t.vehicleType, icon: "🚗" };

              return (
                <div
                  key={t.id}
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "16px",
                    border: isOwner ? "2px solid #3B82F6" : "1px solid #E2E8F0",
                    padding: "20px 22px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                    position: "relative"
                  }}
                >
                  {isOwner && (
                    <div
                      style={{
                        position: "absolute",
                        top: "14px",
                        right: "14px",
                        backgroundColor: "#EFF6FF",
                        color: "#1D4ED8",
                        border: "1px solid #BFDBFE",
                        padding: "3px 10px",
                        borderRadius: "9999px",
                        fontSize: "11px",
                        fontWeight: 800,
                        textTransform: "uppercase"
                      }}
                    >
                      ★ Sua Viagem
                    </div>
                  )}

                  {/* Informações do Motorista / Transportador */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
                    <div
                      style={{
                        width: "44px",
                        height: "44px",
                        borderRadius: "12px",
                        backgroundColor: "#ECFDF5",
                        color: "#059669",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "22px",
                        fontWeight: 800,
                        border: "1px solid #A7F3D0"
                      }}
                    >
                      {vehicleInfo.icon}
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "16px", fontWeight: 700, color: "#0F172A" }}>
                          {t.carrierName}
                        </span>
                        {t.carrierKycVerified && (
                          <span
                            title="Identidade e CNH Verificadas"
                            style={{
                              backgroundColor: "#DCFCE7",
                              color: "#16A34A",
                              fontSize: "11px",
                              fontWeight: 700,
                              padding: "1px 6px",
                              borderRadius: "4px"
                            }}
                          >
                            ✓ Verificado
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "13px", color: "#64748B", display: "block" }}>
                        {vehicleInfo.label} • {t.vehicleModel}
                      </span>
                      <div style={{ marginTop: "4px" }}>
                        <StarRatingDisplay size="sm" ratingAvg={null} ratingCount={0} />
                      </div>
                    </div>
                  </div>

                  {/* Trajeto da Viagem */}
                  <div
                    style={{
                      backgroundColor: "#F8FAFC",
                      border: "1px solid #EDF2F7",
                      borderRadius: "10px",
                      padding: "12px 14px",
                      marginBottom: "14px"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px" }}>
                      <span style={{ color: "#059669", fontWeight: 700 }}>● {t.originCity}</span>
                      <span style={{ color: "#94A3B8" }}>➔</span>
                      <span style={{ color: "#DC2626", fontWeight: 700 }}>● {t.destinationCity}</span>
                    </div>

                    {t.intermediateStops && t.intermediateStops.length > 0 && (
                      <div style={{ marginTop: "6px", fontSize: "12px", color: "#64748B" }}>
                        <span>Paradas no trajeto: </span>
                        {t.intermediateStops.map((stop, idx) => (
                          <span
                            key={stop}
                            style={{
                              backgroundColor: "#E2E8F0",
                              color: "#334155",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              marginRight: "4px",
                              fontWeight: 600
                            }}
                          >
                            {stop}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Informações de Data, Horário e Capacidade Livre */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "12px",
                      marginBottom: "16px",
                      paddingBottom: "14px",
                      borderBottom: "1px solid #F1F5F9"
                    }}
                  >
                    <div style={{ display: "flex", gap: "16px", fontSize: "13px", color: "#64748B", flexWrap: "wrap" }}>
                      <span>📅 Partida: <strong>{t.departureDate}</strong></span>
                      <span>⏰ Horário: <strong>{t.departureTime}</strong></span>
                      <span>📦 Espaço Livre: <strong style={{ color: "#059669" }}>{t.availableCapacityKg} kg</strong></span>
                    </div>

                    {t.suggestedPricePerKgCents ? (
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: "11px", color: "#64748B", display: "block" }}>Valor do Frete da Viagem</span>
                        <span style={{ fontSize: "16px", fontWeight: 800, color: "#1D4ED8" }}>
                          R$ {(t.suggestedPricePerKgCents / 100).toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {/* Botões de Ação */}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                    {isOwner ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(t)}
                          style={{
                            padding: "8px 14px",
                            backgroundColor: "#EFF6FF",
                            border: "1px solid #BFDBFE",
                            borderRadius: "8px",
                            color: "#1D4ED8",
                            fontSize: "13px",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px"
                          }}
                        >
                          <span>✏️ Editar Minha Viagem</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteTrip(t)}
                          style={{
                            padding: "8px 14px",
                            fontSize: "13px",
                            fontWeight: 700,
                            color: "#DC2626",
                            backgroundColor: "#FEF2F2",
                            border: "1px solid #FECACA",
                            borderRadius: "8px",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px"
                          }}
                        >
                          <span>🗑️ Excluir Minha Viagem</span>
                        </button>

                        <Link
                          href={`/feed?origem=${encodeURIComponent(t.originCity)}&destino=${encodeURIComponent(t.destinationCity)}`}
                          className="btn btn--outline"
                          style={{
                            padding: "8px 14px",
                            fontSize: "13px",
                            fontWeight: 700,
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px"
                          }}
                        >
                          <span>🔍 Ver Encomendas para Esta Rota</span>
                        </Link>
                      </>
                    ) : (
                      <Link
                        href={`/encomendas/publicar?origem=${encodeURIComponent(t.originCity)}&destino=${encodeURIComponent(t.destinationCity)}`}
                        className="btn btn--primary"
                        style={{
                          padding: "8px 16px",
                          fontSize: "13px",
                          fontWeight: 700,
                          textDecoration: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px"
                        }}
                      >
                        <span>📦 Solicitar Frete nesta Rota</span>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal de Edição de Viagem */}
        {editingTrip && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "16px"
            }}
          >
            <div
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: "16px",
                width: "100%",
                maxWidth: "520px",
                padding: "24px",
                boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0F172A", margin: 0 }}>
                  ✏️ Editar Viagem Programada
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingTrip(null)}
                  style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#64748B" }}
                >
                  ✕
                </button>
              </div>

              <p style={{ fontSize: "13px", color: "#64748B", marginBottom: "16px" }}>
                Rota: <strong>{editingTrip.originCity} ➔ {editingTrip.destinationCity}</strong>
              </p>

              <form onSubmit={handleSaveEdit}>
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                      Modelo do Veículo
                    </label>
                    <input
                      type="text"
                      value={editModel}
                      onChange={(e) => setEditModel(e.target.value)}
                      placeholder="Ex: Fiat Strada, Hyundai HB20..."
                      className="form-control"
                      style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #CBD5E1" }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                        Data de Partida
                      </label>
                      <input
                        type="text"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        placeholder="DD/MM/AAAA"
                        className="form-control"
                        style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #CBD5E1" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                        Horário Estimado
                      </label>
                      <input
                        type="text"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        placeholder="Ex: 08:00, 18:00"
                        className="form-control"
                        style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #CBD5E1" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                        Capacidade Livre (kg)
                      </label>
                      <input
                        type="text"
                        value={editCapacityKg}
                        onChange={(e) => setEditCapacityKg(e.target.value)}
                        placeholder="Ex: 50"
                        className="form-control"
                        style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #CBD5E1" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                        Valor do Frete (R$)
                      </label>
                      <input
                        type="text"
                        value={editPriceReais}
                        onChange={(e) => setEditPriceReais(e.target.value)}
                        placeholder="Ex: 50,00"
                        className="form-control"
                        style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #CBD5E1" }}
                      />
                    </div>
                  </div>

                  {errorMsg && (
                    <div style={{ padding: "8px 12px", borderRadius: "8px", backgroundColor: "#FEF2F2", color: "#DC2626", fontSize: "13px" }}>
                      {errorMsg}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                    <button
                      type="button"
                      onClick={() => setEditingTrip(null)}
                      className="btn btn--outline"
                      style={{ padding: "8px 16px", borderRadius: "8px" }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="btn btn--primary"
                      style={{ padding: "8px 20px", borderRadius: "8px" }}
                    >
                      {isSaving ? "Salvando..." : "Salvar Alterações"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
