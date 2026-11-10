"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getDemoShipments, clearAllTestData, type DemoShipment } from "../../lib/demo-marketplace-store";
import { CITY_CENTROIDS } from "../../components/BrazilianAddressInput";
import { MercadoPagoPixModal } from "../../components/MercadoPagoPixModal";

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
  pinCode: string;
  distanceKm: number;
  durationMins: number;
  expandedMap: boolean;
}

export default function AcompanheSuaEncomendaPage(): React.JSX.Element {
  const [shipments, setShipments] = useState<readonly DemoShipment[]>([]);
  const [trackingStates, setTrackingStates] = useState<Record<string, ShipmentTrackingState>>({});
  const [copiedPinId, setCopiedPinId] = useState<string | null>(null);
  const [payingShipment, setPayingShipment] = useState<DemoShipment | null>(null);
  const [paidShipmentIds, setPaidShipmentIds] = useState<Set<string>>(new Set());

  // Carrega encomendas publicadas do store local
  useEffect(() => {
    const list = getDemoShipments();
    setShipments(list);

    // Inicializa estados de rastreamento e distâncias para cada encomenda
    const states: Record<string, ShipmentTrackingState> = {};
    list.forEach((s, idx) => {
      // Gera ou recupera PIN de 4 dígitos determinístico baseado no ID
      const pinNum = (Math.abs(s.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 1000) * 31) % 9000) + 1000;

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
        pinCode: String(pinNum),
        distanceKm: dist,
        durationMins: duration,
        expandedMap: idx === 0 // expande o mapa da primeira encomenda por padrão
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

  const handleCopyPin = (shipmentId: string, pin: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(pin);
      setCopiedPinId(shipmentId);
      setTimeout(() => setCopiedPinId(null), 2000);
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
      {/* Cabeçalho da Página do Remetente */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-primary, #2563EB)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Painel do Remetente (Cliente)
          </span>
          <h1 style={{ fontSize: "28px", fontWeight: 800, margin: "4px 0 6px 0", color: "var(--color-brand-deep-navy, #0F172A)" }}>
            📍 Acompanhe sua Encomenda
          </h1>
          <p style={{ margin: 0, fontSize: "14px", color: "var(--color-muted, #64748B)" }}>
            Rastreie o status, a quilometragem viária e os códigos de segurança PIN de todas as suas remessas.
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
            const tr = trackingStates[item.id] || {
              status: "PUBLICADA",
              pinCode: "5821",
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

                {/* Bloco de Segurança do PIN (Código de 4 dígitos) */}
                <div
                  style={{
                    backgroundColor: "#FEFCE8",
                    border: "1.5px solid #FEF08A",
                    borderRadius: "10px",
                    padding: "14px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                    marginBottom: "20px"
                  }}
                >
                  <div>
                    <span style={{ fontSize: "11px", fontWeight: 800, textTransform: "uppercase", color: "#854D0E", display: "block" }}>
                      🔑 Código PIN de Segurança da Entrega
                    </span>
                    <span style={{ fontSize: "12px", color: "#713F12" }}>
                      Informe este código de 4 dígitos exclusivamente ao motorista no momento da coleta ou entrega física.
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        fontSize: "22px",
                        fontWeight: 900,
                        letterSpacing: "4px",
                        backgroundColor: "#FFFFFF",
                        border: "1.5px solid #FACC15",
                        padding: "4px 14px",
                        borderRadius: "8px",
                        color: "#0F172A"
                      }}
                    >
                      {tr.pinCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyPin(item.id, tr.pinCode)}
                      style={{
                        background: "#FFFFFF",
                        border: "1px solid #CBD5E1",
                        borderRadius: "6px",
                        padding: "6px 10px",
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
