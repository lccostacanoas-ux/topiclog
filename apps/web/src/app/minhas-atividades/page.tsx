"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  getDemoShipments,
  clearAllTestData,
  addDemoRating,
  startTripWithPickupCode,
  completeTripWithDeliveryCode,
  type DemoShipment
} from "../../lib/demo-marketplace-store";
import { CITY_CENTROIDS } from "../../components/BrazilianAddressInput";
import { MercadoPagoPixModal } from "../../components/MercadoPagoPixModal";
import { StarRatingDisplay } from "../../components/StarRatingDisplay";

// Carregamento dinâmico do mapa de rotas sem SSR
const TopicLogRouteMap = dynamic(
  () => import("../../components/TopicLogRouteMap"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100%",
          height: "260px",
          backgroundColor: "#F1F5F9",
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#64748B",
          fontSize: "13px",
          fontWeight: 600
        }}
      >
        <span>🧭 Carregando mapa do trajeto...</span>
      </div>
    )
  }
);

const BH_NEIGHBORHOOD_COORDS: Record<string, { lat: number; lon: number }> = {
  "paqueta": { lat: -19.8647, lon: -43.9922 },
  "santa efigenia": { lat: -19.9250, lon: -43.9230 },
  "savassi": { lat: -19.9386, lon: -43.9333 },
  "lourdes": { lat: -19.9325, lon: -43.9450 },
  "funcionarios": { lat: -19.9338, lon: -43.9288 },
  "pampulha": { lat: -19.8519, lon: -43.9708 },
  "barreiro": { lat: -19.9754, lon: -44.0194 },
  "venda nova": { lat: -19.8155, lon: -43.9612 },
  "centro": { lat: -19.9167, lon: -43.9345 },
  "castelo": { lat: -19.8769, lon: -44.0041 },
  "ouro preto": { lat: -19.8661, lon: -43.9840 },
  "buritis": { lat: -19.9678, lon: -43.9688 },
  "sion": { lat: -19.9536, lon: -43.9317 },
  "anchieta": { lat: -19.9482, lon: -43.9342 },
  "floresta": { lat: -19.9118, lon: -43.9252 },
  "prado": { lat: -19.9242, lon: -43.9625 },
  "gutierrez": { lat: -19.9360, lon: -43.9610 },
  "sagrada familia": { lat: -19.9032, lon: -43.9160 },
  "padre eustaquio": { lat: -19.9077, lon: -43.9663 },
  "carlos prates": { lat: -19.9125, lon: -43.9515 },
  "caicara": { lat: -19.8972, lon: -43.9650 },
  "mangabeiras": { lat: -19.9560, lon: -43.9110 },
  "serra": { lat: -19.9380, lon: -43.9150 }
};

function resolveShipmentCoordinates(
  city: string,
  neighborhood: string,
  isDestination: boolean,
  otherLat?: number,
  otherLon?: number
): { lat: number; lon: number } {
  const normCity = (city || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const normNeigh = (neighborhood || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (normCity.includes("belo horizonte") && BH_NEIGHBORHOOD_COORDS[normNeigh]) {
    return BH_NEIGHBORHOOD_COORDS[normNeigh];
  }

  const base = CITY_CENTROIDS[normCity] || { lat: -19.9167, lon: -43.9345 };
  if (isDestination && otherLat !== undefined && otherLon !== undefined) {
    if (Math.abs(base.lat - otherLat) < 0.001 && Math.abs(base.lon - otherLon) < 0.001) {
      return { lat: base.lat - 0.025, lon: base.lon + 0.035 };
    }
  }

  return { lat: base.lat, lon: base.lon };
}

interface ShipmentTrackingState {
  status: "PUBLICADA" | "NEGOCIANDO" | "COLETA_AGENDADA" | "EM_TRANSITO" | "ENTREGUE";
  pickupCode: string;
  deliveryCode: string;
  distanceKm: number;
  durationMins: number;
  expandedMap: boolean;
  tripStartedAt?: string;
  estimatedDeliveryAt?: string;
  deliveredAt?: string;
}

export default function AcompanheSuaEncomendaPage(): React.JSX.Element {
  const [shipments, setShipments] = useState<readonly DemoShipment[]>([]);
  const [trackingStates, setTrackingStates] = useState<Record<string, ShipmentTrackingState>>({});
  const [copiedPinId, setCopiedPinId] = useState<string | null>(null);
  const [payingShipment, setPayingShipment] = useState<DemoShipment | null>(null);
  const [paidShipmentIds, setPaidShipmentIds] = useState<Set<string>>(new Set());

  // Controle de visão de perfil (Remetente vs Transportador para testes em tempo real)
  const [activeRoleView, setActiveRoleView] = useState<"REMETENTE" | "TRANSPORTADOR">("REMETENTE");
  const [carrierPickupInput, setCarrierPickupInput] = useState<Record<string, string>>({});
  const [carrierDeliveryInput, setCarrierDeliveryInput] = useState<Record<string, string>>({});
  const [actionFeedback, setActionFeedback] = useState<Record<string, { success: boolean; message: string }>>({});

  // Carrega encomendas publicadas do store local
  useEffect(() => {
    const list = getDemoShipments();
    setShipments(list);

    // Inicializa estados de rastreamento e distâncias para cada encomenda
    const states: Record<string, ShipmentTrackingState> = {};
    list.forEach((s, idx) => {
      // Determina códigos de coleta (início) e entrega
      const pickupNum = s.pickupCode || String((Math.abs(s.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 1000) * 31) % 9000) + 1000);
      const deliveryNum = s.deliveryCode || String((Math.abs(s.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 2000) * 17) % 9000) + 1000);

      // Determina distância aproximada entre cidades
      const origCoords = resolveShipmentCoordinates(s.originCity, s.originNeighborhood, false);
      const destCoords = resolveShipmentCoordinates(s.destinationCity, s.destinationNeighborhood, true, origCoords.lat, origCoords.lon);

      const R = 6371;
      const dLat = ((destCoords.lat - origCoords.lat) * Math.PI) / 180;
      const dLon = ((destCoords.lon - origCoords.lon) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((origCoords.lat * Math.PI) / 180) *
          Math.cos((destCoords.lat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const dist = Math.max(5, Math.round(R * c * 1.25));
      const duration = Math.max(15, Math.round((dist / 50) * 60));

      // Status padrão da esteira
      let status: ShipmentTrackingState["status"] = "PUBLICADA";
      if (s.status === "DELIVERED") status = "ENTREGUE";
      else if (s.status === "IN_TRANSIT") status = "EM_TRANSITO";
      else if (s.status === "IN_NEGOTIATION") status = "NEGOCIANDO";
      else if (idx === 0) status = "PUBLICADA";

      states[s.id] = {
        status,
        pickupCode: pickupNum,
        deliveryCode: deliveryNum,
        distanceKm: dist,
        durationMins: duration,
        expandedMap: idx === 0, // expande o mapa da primeira encomenda por padrão
        tripStartedAt: s.tripStartedAt,
        estimatedDeliveryAt: s.estimatedDeliveryAt,
        deliveredAt: s.deliveredAt
      };
    });

    setTrackingStates(states);
  }, []);

  const toggleMap = (id: string) => {
    setTrackingStates((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return {
        ...prev,
        [id]: {
          ...current,
          expandedMap: !current.expandedMap
        }
      };
    });
  };

  const handleCopyCode = (shipmentId: string, code: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedPinId(shipmentId);
      setTimeout(() => setCopiedPinId(null), 2000);
    }
  };

  const handleCarrierStartTrip = (shipmentId: string, durationMins: number) => {
    const inputCode = carrierPickupInput[shipmentId] || "";
    const res = startTripWithPickupCode(shipmentId, inputCode, durationMins);
    setActionFeedback((prev) => ({
      ...prev,
      [shipmentId]: { success: res.success, message: res.message }
    }));

    if (res.success) {
      setTrackingStates((prev) => {
        const cur = prev[shipmentId];
        if (!cur) return prev;
        return {
          ...prev,
          [shipmentId]: {
            ...cur,
            status: "EM_TRANSITO",
            tripStartedAt: res.startedAt,
            estimatedDeliveryAt: res.estimatedDeliveryAt
          }
        };
      });
      setShipments(getDemoShipments());
    }
  };

  const handleCarrierCompleteTrip = (shipmentId: string) => {
    const inputCode = carrierDeliveryInput[shipmentId] || "";
    const res = completeTripWithDeliveryCode(shipmentId, inputCode);
    setActionFeedback((prev) => ({
      ...prev,
      [shipmentId]: { success: res.success, message: res.message }
    }));

    if (res.success) {
      setTrackingStates((prev) => {
        const cur = prev[shipmentId];
        if (!cur) return prev;
        return {
          ...prev,
          [shipmentId]: {
            ...cur,
            status: "ENTREGUE",
            deliveredAt: res.deliveredAt
          }
        };
      });
      setShipments(getDemoShipments());
    }
  };

  const getStatusStepIndex = (status: ShipmentTrackingState["status"]) => {
    switch (status) {
      case "PUBLICADA":
        return 1;
      case "NEGOCIANDO":
        return 2;
      case "COLETA_AGENDADA":
        return 3;
      case "EM_TRANSITO":
        return 4;
      case "ENTREGUE":
        return 5;
      default:
        return 1;
    }
  };

  return (
    <main className="container" style={{ paddingTop: "24px", paddingBottom: "64px", maxWidth: "900px" }}>
      {/* Cabeçalho da Página */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-primary, #2563EB)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Controle de Viagens & Entregas (Rastreamento Bilateral)
          </span>
          <h1 style={{ fontSize: "28px", fontWeight: 800, margin: "4px 0 6px 0", color: "var(--color-brand-deep-navy, #0F172A)" }}>
            📍 Rastreamento & Códigos de Viagem
          </h1>
          <p style={{ margin: 0, fontSize: "14px", color: "var(--color-muted, #64748B)" }}>
            Controle o início da viagem na coleta e a conclusão na entrega através dos códigos gerados pela plataforma.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <Link
            href="/encomendas/publicar"
            className="btn btn--primary"
            style={{
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 700,
              borderRadius: "8px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <span>➕</span> Publicar Nova Encomenda
          </Link>
        </div>
      </div>

      {/* Seletor de Modo de Visualização (Simulador Bilateral Remetente / Transportador) */}
      <div
        style={{
          backgroundColor: "#F8FAFC",
          border: "1.5px solid #E2E8F0",
          borderRadius: "12px",
          padding: "12px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "24px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>
            👤 Alternar Visão no Marketplace:
          </span>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              onClick={() => setActiveRoleView("REMETENTE")}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 700,
                border: activeRoleView === "REMETENTE" ? "1.5px solid #2563EB" : "1px solid #CBD5E1",
                backgroundColor: activeRoleView === "REMETENTE" ? "#EFF6FF" : "#FFFFFF",
                color: activeRoleView === "REMETENTE" ? "#1D4ED8" : "#64748B",
                cursor: "pointer"
              }}
            >
              📦 Sou Remetente (Ver Códigos & Notificações)
            </button>
            <button
              type="button"
              onClick={() => setActiveRoleView("TRANSPORTADOR")}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 700,
                border: activeRoleView === "TRANSPORTADOR" ? "1.5px solid #059669" : "1px solid #CBD5E1",
                backgroundColor: activeRoleView === "TRANSPORTADOR" ? "#ECFDF5" : "#FFFFFF",
                color: activeRoleView === "TRANSPORTADOR" ? "#047857" : "#64748B",
                cursor: "pointer"
              }}
            >
              🚚 Sou Transportador (Digitar Códigos & Disparar Viagem)
            </button>
          </div>
        </div>

        <span style={{ fontSize: "11px", color: "#64748B" }}>
          💡 Teste a experiência completa de entrega e liberação de valores
        </span>
      </div>

      {/* Caso não haja encomendas cadastradas */}
      {shipments.length === 0 ? (
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1.5px dashed #CBD5E1",
            borderRadius: "16px",
            padding: "48px 24px",
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
          }}
        >
          <div style={{ fontSize: "54px", marginBottom: "12px" }}>📦</div>
          <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", margin: "0 0 8px 0" }}>
            Você não possui encomendas ativas
          </h2>
          <p style={{ fontSize: "14px", color: "#64748B", maxWidth: "480px", margin: "0 auto 24px auto", lineHeight: 1.5 }}>
            Publique sua primeira encomenda informando o endereço de retirada, o destino e o valor que deseja pagar. Os transportadores cadastrados verão sua postagem imediatamente.
          </p>
          <Link
            href="/encomendas/publicar"
            className="btn btn--primary"
            style={{ padding: "12px 28px", fontSize: "15px", fontWeight: 700, borderRadius: "8px" }}
          >
            Publicar Encomenda Agora ➔
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {shipments.map((item) => {
            const tr: ShipmentTrackingState = trackingStates[item.id] || {
              status: "PUBLICADA",
              pickupCode: "4826",
              deliveryCode: "7391",
              distanceKm: 32,
              durationMins: 40,
              expandedMap: false
            };

            const step = getStatusStepIndex(tr.status);

            const origCoords = resolveShipmentCoordinates(item.originCity, item.originNeighborhood, false);
            const destCoords = resolveShipmentCoordinates(item.destinationCity, item.destinationNeighborhood, true, origCoords.lat, origCoords.lon);

            return (
              <article
                key={item.id}
                style={{
                  backgroundColor: "#FFFFFF",
                  border: "1.5px solid #E2E8F0",
                  borderRadius: "16px",
                  padding: "24px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.05)"
                }}
              >
                {/* Linha Superior: Data, Título e Valor do Frete */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
                  <div>
                    <span style={{ fontSize: "12px", color: "#64748B", fontWeight: 600 }}>
                      Postada em {item.createdAt} • ID #{item.id}
                    </span>
                    <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", margin: "4px 0 0 0" }}>
                      {item.title}
                    </h2>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "11px", color: "#64748B", display: "block", fontWeight: 600 }}>
                      Valor Sugerido para o Frete
                    </span>
                    <strong style={{ fontSize: "20px", color: "#2563EB", fontWeight: 800 }}>
                      R$ {(item.suggestedPriceCents / 100).toFixed(2).replace(".", ",")}
                    </strong>
                  </div>
                </div>

                {/* Trajeto com Distância em Quilômetros e Tempo */}
                <div
                  style={{
                    backgroundColor: "#F8FAFC",
                    border: "1px solid #E2E8F0",
                    borderRadius: "10px",
                    padding: "12px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                    marginBottom: "20px"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: "240px" }}>
                    <span style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "#059669" }} />
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#065F46" }}>
                      {item.originCity} ({item.originNeighborhood})
                    </span>
                    <span style={{ color: "#94A3B8" }}>➔</span>
                    <span style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "#DC2626" }} />
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#991B1B" }}>
                      {item.destinationCity} ({item.destinationNeighborhood})
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        backgroundColor: "#EFF6FF",
                        color: "#1D4ED8",
                        padding: "4px 10px",
                        borderRadius: "6px",
                        border: "1px solid #BFDBFE"
                      }}
                    >
                      🚗 ~{tr.distanceKm} km • ~{tr.durationMins >= 60 ? `${Math.floor(tr.durationMins / 60)}h ${tr.durationMins % 60}min` : `${tr.durationMins} min`}
                    </span>

                    <button
                      type="button"
                      onClick={() => toggleMap(item.id)}
                      style={{
                        background: tr.expandedMap ? "#0F172A" : "#FFFFFF",
                        color: tr.expandedMap ? "#FFFFFF" : "#334155",
                        border: "1px solid #CBD5E1",
                        borderRadius: "6px",
                        padding: "4px 10px",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                    >
                      {tr.expandedMap ? "▲ Ocultar Mapa" : "▼ Ver no Mapa"}
                    </button>
                  </div>
                </div>

                {/* Mapa Interativo Expansível */}
                {tr.expandedMap && (
                  <div style={{ marginBottom: "20px" }}>
                    <TopicLogRouteMap
                      origin={{ lat: origCoords.lat, lon: origCoords.lon, address: `${item.originCity} - ${item.originNeighborhood}` }}
                      destination={{ lat: destCoords.lat, lon: destCoords.lon, address: `${item.destinationCity} - ${item.destinationNeighborhood}` }}
                      height="260px"
                    />
                  </div>
                )}

                {/* Esteira Visual de Status (5 Etapas do Remetente) */}
                <div style={{ marginBottom: "24px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#64748B", marginBottom: "8px" }}>
                    Status da Encomenda
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "6px" }}>
                    {[
                      { num: 1, title: "Publicada", icon: "📝" },
                      { num: 2, title: "Negociando", icon: "🤝" },
                      { num: 3, title: "Coleta Agendada", icon: "📦" },
                      { num: 4, title: "A Caminho", icon: "🚗" },
                      { num: 5, title: "Entregue", icon: "✅" }
                    ].map((s) => {
                      const isPast = step >= s.num;
                      const isCurrent = step === s.num;
                      return (
                        <div
                          key={s.num}
                          style={{
                            textAlign: "center",
                            padding: "8px 4px",
                            borderRadius: "8px",
                            backgroundColor: isCurrent ? "#EFF6FF" : isPast ? "#F0FDF4" : "#F8FAFC",
                            border: `1.5px solid ${isCurrent ? "#3B82F6" : isPast ? "#86EFAC" : "#E2E8F0"}`
                          }}
                        >
                          <div style={{ fontSize: "16px", marginBottom: "2px" }}>{s.icon}</div>
                          <div style={{ fontSize: "11px", fontWeight: isCurrent ? 800 : 600, color: isCurrent ? "#1D4ED8" : isPast ? "#166534" : "#94A3B8" }}>
                            {s.title}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Mensagem em Destaque: Viagem Iniciada com Previsão de Entrega */}
                {tr.status === "EM_TRANSITO" && (
                  <div
                    style={{
                      backgroundColor: "#DCFCE7",
                      border: "2px solid #22C55E",
                      borderRadius: "12px",
                      padding: "16px 20px",
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      marginBottom: "20px",
                      boxShadow: "0 4px 12px rgba(34, 197, 94, 0.18)"
                    }}
                  >
                    <div style={{ fontSize: "36px" }}>🚀</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "17px", fontWeight: 900, color: "#15803D" }}>
                        VIAGEM INICIADA!
                      </div>
                      <div style={{ fontSize: "13px", color: "#166534", marginTop: "2px" }}>
                        O transportador realizou a coleta presencial e iniciou o deslocamento às <strong>{tr.tripStartedAt || "15:00"}</strong>.
                      </div>
                      <div style={{ display: "flex", gap: "16px", marginTop: "8px", flexWrap: "wrap", fontSize: "12px", color: "#14532D" }}>
                        <span>⏱️ <strong>Duração estimada do percurso:</strong> ~{tr.durationMins} minutos</span>
                        <span>🏁 <strong>Previsão de entrega no destino:</strong> ~{tr.estimatedDeliveryAt || "15:40"}</span>
                        <span>🛡️ <strong>Rastreamento ativo com controle de início e fim</strong></span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Mensagem em Destaque: Entrega Concluída com Sucesso */}
                {tr.status === "ENTREGUE" && (
                  <div
                    style={{
                      backgroundColor: "#F0FDF4",
                      border: "2px solid #16A34A",
                      borderRadius: "12px",
                      padding: "16px 20px",
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      marginBottom: "20px"
                    }}
                  >
                    <div style={{ fontSize: "36px" }}>✅</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "17px", fontWeight: 900, color: "#15803D" }}>
                        ENCOMENDA ENTREGUE COM SUCESSO!
                      </div>
                      <div style={{ fontSize: "13px", color: "#166534", marginTop: "2px" }}>
                        A viagem foi finalizada com êxito às <strong>{tr.deliveredAt || "15:45"}</strong> mediante conferência do código de entrega.
                      </div>
                      <div style={{ fontSize: "12px", color: "#047857", marginTop: "6px" }}>
                        💳 <strong>Split Financeiro Concluído:</strong> Repasse líquido de 80% liberado na subconta Mercado Pago do transportador.
                      </div>
                    </div>
                  </div>
                )}

                {/* PAINEL DO REMETENTE: Códigos Gerados pela Plataforma */}
                {(activeRoleView === "REMETENTE" || tr.status !== "ENTREGUE") && (
                  <div style={{ marginBottom: "20px" }}>
                    {/* Código de Início da Viagem (Coleta) */}
                    {tr.status !== "EM_TRANSITO" && tr.status !== "ENTREGUE" && (
                      <div
                        style={{
                          backgroundColor: "#FEFCE8",
                          border: "1.5px solid #FACC15",
                          borderRadius: "10px",
                          padding: "16px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "12px"
                        }}
                      >
                        <div>
                          <span style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", color: "#854D0E", display: "block" }}>
                            🚀 Código de Início da Viagem (Coleta)
                          </span>
                          <span style={{ fontSize: "13px", color: "#713F12" }}>
                            Informe este código gerado pela plataforma ao motorista <strong>no momento da entrega física do pacote</strong> para que ele dispare a viagem.
                          </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span
                            style={{
                              fontSize: "24px",
                              fontWeight: 900,
                              letterSpacing: "4px",
                              backgroundColor: "#FFFFFF",
                              border: "2px solid #EAB308",
                              padding: "4px 16px",
                              borderRadius: "8px",
                              color: "#0F172A"
                            }}
                          >
                            {tr.pickupCode}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyCode(item.id, tr.pickupCode)}
                            style={{
                              background: "#FFFFFF",
                              border: "1px solid #CBD5E1",
                              borderRadius: "6px",
                              padding: "8px 12px",
                              fontSize: "12px",
                              fontWeight: 700,
                              color: "#334155",
                              cursor: "pointer"
                            }}
                          >
                            {copiedPinId === item.id ? "✓ Copiado!" : "Copiar Código"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Código de Conclusão da Entrega */}
                    {tr.status === "EM_TRANSITO" && (
                      <div
                        style={{
                          backgroundColor: "#EFF6FF",
                          border: "1.5px solid #60A5FA",
                          borderRadius: "10px",
                          padding: "16px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "12px"
                        }}
                      >
                        <div>
                          <span style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", color: "#1E40AF", display: "block" }}>
                            🔑 Código de Conclusão da Entrega (PIN Final)
                          </span>
                          <span style={{ fontSize: "13px", color: "#1E3A8A" }}>
                            Forneça este código ao destinatário. O transportador precisará dele para finalizar a entrega e receber o frete.
                          </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span
                            style={{
                              fontSize: "24px",
                              fontWeight: 900,
                              letterSpacing: "4px",
                              backgroundColor: "#FFFFFF",
                              border: "2px solid #3B82F6",
                              padding: "4px 16px",
                              borderRadius: "8px",
                              color: "#0F172A"
                            }}
                          >
                            {tr.deliveryCode}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyCode(item.id, tr.deliveryCode)}
                            style={{
                              background: "#FFFFFF",
                              border: "1px solid #CBD5E1",
                              borderRadius: "6px",
                              padding: "8px 12px",
                              fontSize: "12px",
                              fontWeight: 700,
                              color: "#334155",
                              cursor: "pointer"
                            }}
                          >
                            {copiedPinId === item.id ? "✓ Copiado!" : "Copiar PIN"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* PAINEL DE AÇÃO DO TRANSPORTADOR: Campo Apropriado para Digitar Códigos */}
                <div
                  style={{
                    backgroundColor: "#F8FAFC",
                    border: "1.5px solid #CBD5E1",
                    borderRadius: "10px",
                    padding: "16px",
                    marginBottom: "20px"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "18px" }}>🚚</span>
                      <strong style={{ fontSize: "14px", color: "#0F172A" }}>
                        Painel do Transportador — Validação de Viagem Presencial
                      </strong>
                    </div>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748B", backgroundColor: "#E2E8F0", padding: "2px 8px", borderRadius: "4px" }}>
                      Split Mercado Pago Obrigatório (Banco 323)
                    </span>
                  </div>

                  {/* Feedback de ação do transportador */}
                  {Boolean(actionFeedback[item.id]) && (
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        marginBottom: "12px",
                        backgroundColor: actionFeedback[item.id]?.success ? "#DCFCE7" : "#FEE2E2",
                        color: actionFeedback[item.id]?.success ? "#166534" : "#991B1B",
                        border: `1px solid ${actionFeedback[item.id]?.success ? "#86EFAC" : "#FCA5A5"}`
                      }}
                    >
                      {actionFeedback[item.id]?.success ? "✓ " : "⚠️ "}
                      {actionFeedback[item.id]?.message}
                    </div>
                  )}

                  {/* Etapa 1: Iniciar Viagem na Coleta */}
                  {tr.status !== "EM_TRANSITO" && tr.status !== "ENTREGUE" && (
                    <div>
                      <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 10px 0" }}>
                        Recebeu a encomenda das mãos do remetente? Solicite o <strong>Código de Início de 4 dígitos</strong> informado por ele e digite no campo abaixo para disparar a viagem:
                      </p>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          type="text"
                          maxLength={4}
                          placeholder="Digite o código (ex: 4826)"
                          value={carrierPickupInput[item.id] || ""}
                          onChange={(e) =>
                            setCarrierPickupInput((prev) => ({
                              ...prev,
                              [item.id]: e.target.value.replace(/\D/g, "")
                            }))
                          }
                          style={{
                            fontSize: "16px",
                            fontWeight: 800,
                            letterSpacing: "3px",
                            textAlign: "center",
                            width: "160px",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: "1.5px solid #94A3B8"
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleCarrierStartTrip(item.id, tr.durationMins)}
                          style={{
                            padding: "10px 18px",
                            backgroundColor: "#2563EB",
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
                          ▶️ Confirmar Coleta & Disparar Viagem
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Etapa 2: Finalizar Entrega no Destino */}
                  {tr.status === "EM_TRANSITO" && (
                    <div>
                      <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 10px 0" }}>
                        Chegou ao destino da entrega? Solicite o <strong>Código de Entrega de 4 dígitos</strong> ao destinatário e digite no campo abaixo para concluir e liberar o repasse financeiro:
                      </p>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          type="text"
                          maxLength={4}
                          placeholder="Digite o código (ex: 7391)"
                          value={carrierDeliveryInput[item.id] || ""}
                          onChange={(e) =>
                            setCarrierDeliveryInput((prev) => ({
                              ...prev,
                              [item.id]: e.target.value.replace(/\D/g, "")
                            }))
                          }
                          style={{
                            fontSize: "16px",
                            fontWeight: 800,
                            letterSpacing: "3px",
                            textAlign: "center",
                            width: "160px",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: "1.5px solid #94A3B8"
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleCarrierCompleteTrip(item.id)}
                          style={{
                            padding: "10px 18px",
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
                          ✓ Confirmar Entrega & Liberar Split Mercado Pago
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Etapa 3: Viagem Concluída */}
                  {tr.status === "ENTREGUE" && (
                    <div style={{ fontSize: "13px", color: "#166534", fontWeight: 600 }}>
                      ✓ Esta viagem foi concluída com sucesso. O repasse líquido conforme política vigente foi creditado na conta Mercado Pago do transportador.
                    </div>
                  )}
                </div>

                {/* Avaliação Pública em Estrelas (liberada somente após entrega concluída) */}
                {tr.status === "ENTREGUE" && (
                  <div
                    style={{
                      backgroundColor: "#F8FAFC",
                      border: "1px dashed #CBD5E1",
                      borderRadius: "10px",
                      padding: "10px 14px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "10px",
                      marginBottom: "16px"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                        ⭐ Avaliação do Transportador Parceiro:
                      </span>
                      <StarRatingDisplay
                        size="sm"
                        interactive={true}
                        showBadgeWhenEmpty={true}
                        onRate={(stars) => {
                          addDemoRating({
                            roleTarget: "CARRIER",
                            stars
                          });
                        }}
                      />
                    </div>
                    <span style={{ fontSize: "11px", color: "#64748B", fontStyle: "italic" }}>
                      (Avaliação bilateral pública em estrelas • 1 a 5)
                    </span>
                  </div>
                )}

                {/* Ações Rápidas: Pagamento Pix, Propostas e Mensagens */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid #F1F5F9", paddingTop: "14px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setPayingShipment(item)}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: paidShipmentIds.has(item.id) ? "#10B981" : "#059669",
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
                    {paidShipmentIds.has(item.id) ? "✓ Frete Pago (Custódia)" : "⚡ Pagar Frete via Pix"}
                  </button>

                  <Link
                    href="/propostas"
                    className="btn btn--outline"
                    style={{ fontSize: "13px", fontWeight: 700, padding: "8px 16px" }}
                  >
                    🤝 Ver Propostas
                  </Link>

                  <Link
                    href="/mensagens"
                    className="btn btn--primary"
                    style={{ fontSize: "13px", fontWeight: 700, padding: "8px 16px" }}
                  >
                    💬 Falar com o Transportador
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {payingShipment && (
        <MercadoPagoPixModal
          isOpen={Boolean(payingShipment)}
          onClose={() => setPayingShipment(null)}
          amountReais={payingShipment.suggestedPriceCents / 100}
          description={`Frete TopicLog #${payingShipment.id}`}
          orderId={payingShipment.id}
          onPaymentSuccess={() => {
            setPaidShipmentIds((prev) => new Set([...prev, payingShipment.id]));
          }}
        />
      )}
    </main>
  );
}
