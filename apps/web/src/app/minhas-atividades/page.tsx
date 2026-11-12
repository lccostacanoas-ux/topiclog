"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { CITY_CENTROIDS } from "../../components/BrazilianAddressInput";
import { AuthRequiredGate } from "../../components/AuthRequiredGate";
import { useAuth } from "../../lib/auth-context";
import {
  listMyDeliveryOrdersApi,
  getShipmentByIdApi,
  getOrderCodesApi,
  confirmPickupApi,
  confirmDeliveryApi,
  updateDeliveryLocationApi,
  rateCarrierApi,
  getCancellationPolicyApi,
  cancelContractBySenderApi
} from "../../lib/api-client";
import type {
  DeliveryOrderDto,
  OrderCodesDto,
  ShipmentDetailDto
} from "../../lib/types";

const TopicLogRouteMap = dynamic(
  () => import("../../components/TopicLogRouteMap"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100%",
          height: "280px",
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
        <span>🧭 Carregando mapa da viagem...</span>
      </div>
    )
  }
);

function resolveFallbackCoords(
  city?: string | null,
  isDest?: boolean,
  otherLat?: number,
  otherLon?: number
): { lat: number; lon: number } {
  const norm = (city || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const base = CITY_CENTROIDS[norm] || { lat: -19.9167, lon: -43.9345 };
  if (
    isDest &&
    otherLat !== undefined &&
    otherLon !== undefined &&
    Math.abs(base.lat - otherLat) < 0.002 &&
    Math.abs(base.lon - otherLon) < 0.002
  ) {
    return { lat: base.lat - 0.02, lon: base.lon + 0.03 };
  }
  return base;
}

function getStatusBadge(status: string): { label: string; bg: string; color: string; border: string } {
  switch (status) {
    case "CLOSED":
      return {
        label: "🚫 Viagem Cancelada",
        bg: "#FEE2E2",
        color: "#991B1B",
        border: "#FECACA"
      };
    case "DELIVERED_VERIFIED":
      return {
        label: "✅ Viagem Encerrada • Entrega Confirmada",
        bg: "#DCFCE7",
        color: "#166534",
        border: "#86EFAC"
      };
    case "IN_TRANSIT":
    case "OUT_FOR_DELIVERY":
      return {
        label: "🚚 Viagem Iniciada • Em Deslocamento",
        bg: "#DBEAFE",
        color: "#1E40AF",
        border: "#93C5FD"
      };
    default:
      return {
        label: "📦 Pagamento Confirmado • Aguardando Coleta",
        bg: "#FEF3C7",
        color: "#92400E",
        border: "#FDE68A"
      };
  }
}

export default function MinhasAtividadesPage(): React.JSX.Element {
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth();

  const [orders, setOrders] = useState<DeliveryOrderDto[]>([]);
  const [shipmentsById, setShipmentsById] = useState<Record<string, ShipmentDetailDto>>({});
  const [codesByOrderId, setCodesByOrderId] = useState<Record<string, OrderCodesDto>>({});
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [pickupCodeInputs, setPickupCodeInputs] = useState<Record<string, string>>({});
  const [deliveryCodeInputs, setDeliveryCodeInputs] = useState<Record<string, string>>({});
  const [gpsWatchingOrderId, setGpsWatchingOrderId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [ratingModalOrder, setRatingModalOrder] = useState<DeliveryOrderDto | null>(null);
  const [selectedRatingStars, setSelectedRatingStars] = useState<number>(5);
  const [dismissedRatingIds, setDismissedRatingIds] = useState<Record<string, boolean>>({});
  const [submittingRating, setSubmittingRating] = useState(false);
  const [cancellationPenaltyPercent, setCancellationPenaltyPercent] = useState<number>(10);
  const [cancelModalOrder, setCancelModalOrder] = useState<DeliveryOrderDto | null>(null);
  const [cancelJustification, setCancelJustification] = useState<string>("");
  const [cancelReopen, setCancelReopen] = useState<boolean>(true);
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const loadActivities = useCallback(
    async (silent = false) => {
      if (!token || !user?.userId) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);

      try {
        const res = await listMyDeliveryOrdersApi(token);
        if (res.ok && Array.isArray(res.data)) {
          const list = res.data;
          setOrders(list);

          const shipmentEntries = await Promise.all(
            list.map(async (o) => {
              const sRes = await getShipmentByIdApi(o.shipmentId, token);
              return sRes.ok && sRes.data ? ([o.shipmentId, sRes.data] as const) : null;
            })
          );
          const nextShipments: Record<string, ShipmentDetailDto> = {};
          for (const entry of shipmentEntries) {
            if (entry) nextShipments[entry[0]] = entry[1];
          }
          setShipmentsById(nextShipments);

          const senderOrders = list.filter((o) => o.senderId === user.userId);
          const codeEntries = await Promise.all(
            senderOrders.map(async (o) => {
              const cRes = await getOrderCodesApi(o.id, token);
              return cRes.ok && cRes.data ? ([o.id, cRes.data] as const) : null;
            })
          );
          const nextCodes: Record<string, OrderCodesDto> = {};
          for (const entry of codeEntries) {
            if (entry) nextCodes[entry[0]] = entry[1];
          }
          setCodesByOrderId(nextCodes);
        }
      } catch {
        if (!silent) {
          setBanner({ type: "error", text: "Não foi possível carregar suas entregas no momento." });
        }
      } finally {
        setLoading(false);
      }
    },
    [token, user?.userId]
  );

  useEffect(() => {
    if (isAuthenticated && token) {
      void loadActivities();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [isAuthenticated, token, authLoading, loadActivities]);

  // Atualização contínua para acompanhar deslocamento no mapa e mudanças de status em tempo real
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    const timer = window.setInterval(() => {
      void loadActivities(true);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [isAuthenticated, token, loadActivities]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Pop-up automático para o remetente avaliar o transportador assim que a entrega for concluída
  useEffect(() => {
    if (!user?.userId || ratingModalOrder) return;
    const pendingRating = orders.find(
      (o) =>
        o.senderId === user.userId &&
        o.status === "DELIVERED_VERIFIED" &&
        o.carrierRatingStars == null &&
        !dismissedRatingIds[o.id]
    );
    if (pendingRating) {
      setSelectedRatingStars(5);
      setRatingModalOrder(pendingRating);
    }
  }, [orders, user?.userId, ratingModalOrder, dismissedRatingIds]);

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

  const handleSubmitCarrierRating = async () => {
    if (!token || !ratingModalOrder || submittingRating) return;
    setSubmittingRating(true);
    const res = await rateCarrierApi(ratingModalOrder.id, selectedRatingStars, token);
    if (res.ok) {
      setBanner({
        type: "success",
        text: `⭐ Avaliação de ${selectedRatingStars} estrela(s) registrada para ${ratingModalOrder.carrierName || "o transportador"}!`
      });
      setRatingModalOrder(null);
      await loadActivities(true);
    } else {
      setBanner({
        type: "error",
        text: res.problem?.detail || "Não foi possível registrar sua avaliação no momento."
      });
    }
    setSubmittingRating(false);
  };

  const handleConfirmCancelOrder = async () => {
    if (!token || !cancelModalOrder?.contractId || submittingCancel) return;
    setSubmittingCancel(true);
    const res = await cancelContractBySenderApi(
      cancelModalOrder.contractId,
      {
        justification: cancelJustification.trim() || undefined,
        reopenForBidding: cancelReopen
      },
      token
    );
    if (res.ok && res.data) {
      const penaltyCents = res.data.cancellation?.simulatedPenaltyCents ?? 0;
      const penaltyFormatted = (penaltyCents / 100).toFixed(2).replace(".", ",");
      setBanner({
        type: "success",
        text:
          penaltyCents > 0
            ? `🚫 Viagem cancelada. Multa aplicada conforme política administrativa: R$ ${penaltyFormatted}.`
            : "🚫 Viagem cancelada sem cobrança de multa."
      });
      setCancelModalOrder(null);
      setCancelJustification("");
      await loadActivities(true);
    } else {
      setBanner({
        type: "error",
        text: res.problem?.detail || "Não foi possível cancelar a viagem no momento."
      });
    }
    setSubmittingCancel(false);
  };

  const handleConfirmPickup = async (order: DeliveryOrderDto) => {
    if (!token) return;
    const code = (pickupCodeInputs[order.id] || "").trim();
    if (!/^\d{4}$/.test(code)) {
      setBanner({ type: "error", text: "Digite o código de coleta de 4 dígitos informado pelo remetente." });
      return;
    }

    setSubmittingId(order.id);
    setBanner(null);
    const res = await confirmPickupApi(
      order.id,
      {
        pickupCode: code,
        handoverNotes: "Coleta validada presencialmente com o remetente via código de 4 dígitos."
      },
      token
    );

    if (res.ok) {
      setBanner({
        type: "success",
        text: "🚚 Coleta confirmada! A viagem foi colocada no status INICIADA e o deslocamento no mapa já está ativo."
      });
      await loadActivities(true);
    } else {
      setBanner({
        type: "error",
        text: res.problem?.detail || "Código de início de viagem inválido. Confira o código com o remetente."
      });
    }
    setSubmittingId(null);
  };

  const handleConfirmDelivery = async (order: DeliveryOrderDto) => {
    if (!token) return;
    const code = (deliveryCodeInputs[order.id] || "").trim();
    if (!/^\d{4}$/.test(code)) {
      setBanner({ type: "error", text: "Peça ao destinatário o código de entrega de 4 dígitos antes de encerrar." });
      return;
    }

    setSubmittingId(order.id);
    setBanner(null);
    const res = await confirmDeliveryApi(
      order.id,
      {
        deliveryCode: code,
        recipientSignatureOrNotes: "Entrega validada no destino via código de 4 dígitos do destinatário."
      },
      token
    );

    if (res.ok) {
      if (gpsWatchingOrderId === order.id && watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        setGpsWatchingOrderId(null);
      }
      setBanner({
        type: "success",
        text: "✅ Entrega confirmada e viagem encerrada! O remetente recebeu o alerta de conclusão."
      });
      await loadActivities(true);
    } else {
      setBanner({
        type: "error",
        text: res.problem?.detail || "Código de entrega inválido. Confirme o número de 4 dígitos com quem está recebendo."
      });
    }
    setSubmittingId(null);
  };

  const pushSimulatedOrGpsLocation = async (
    order: DeliveryOrderDto,
    orig: { lat: number; lon: number },
    dest: { lat: number; lon: number }
  ) => {
    if (!token) return;
    const stepForward = async (lat: number, lon: number) => {
      const res = await updateDeliveryLocationApi(order.id, lat, lon, token);
      if (res.ok) {
        setBanner({ type: "success", text: "📍 Posição do deslocamento atualizada no mapa para você e para o remetente." });
        await loadActivities(true);
      }
    };

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void stepForward(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          // Caso navegador bloqueie GPS no desktop, avança um passo interpolado ao longo da rota
          const curLat = order.currentLatitude ?? orig.lat;
          const curLon = order.currentLongitude ?? orig.lon;
          const nextLat = curLat + (dest.lat - curLat) * 0.35;
          const nextLon = curLon + (dest.lon - curLon) * 0.35;
          void stepForward(nextLat, nextLon);
        },
        { enableHighAccuracy: true, timeout: 4000 }
      );
    } else {
      const curLat = order.currentLatitude ?? orig.lat;
      const curLon = order.currentLongitude ?? orig.lon;
      void stepForward(curLat + (dest.lat - curLat) * 0.35, curLon + (dest.lon - curLon) * 0.35);
    }
  };

  const toggleLiveGps = (orderId: string) => {
    if (!token) return;
    if (gpsWatchingOrderId === orderId) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setGpsWatchingOrderId(null);
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setBanner({ type: "error", text: "Seu navegador não suporta geolocalização contínua. Use o botão 'Atualizar Posição no Mapa'." });
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    setGpsWatchingOrderId(orderId);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        void updateDeliveryLocationApi(orderId, pos.coords.latitude, pos.coords.longitude, token);
      },
      () => {
        setGpsWatchingOrderId(null);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  };

  if (authLoading) {
    return (
      <main className="container" style={{ paddingTop: "40px", textAlign: "center" }}>
        <p style={{ color: "#64748B" }}>Carregando suas atividades...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthRequiredGate
        title="Acesse sua conta para acompanhar viagens e códigos"
        description="Faça login para visualizar seus códigos de coleta/entrega, endereços liberados e o mapa de deslocamento em tempo real."
      />
    );
  }

  return (
    <main id="main-content" className="container" style={{ paddingTop: "28px", paddingBottom: "64px", maxWidth: "960px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, margin: "0 0 6px 0", color: "#0F172A" }}>
            Minhas Atividades & Acompanhamento no Mapa
          </h1>
          <p style={{ margin: 0, fontSize: "14px", color: "#64748B" }}>
            Códigos de segurança, endereços liberados após o pagamento e rastreamento ao vivo da viagem.
          </p>
        </div>

        <button
          type="button"
          className="btn btn--outline"
          onClick={() => void loadActivities()}
          style={{ padding: "8px 14px", fontSize: "13px", fontWeight: 700 }}
        >
          🔄 Atualizar Status
        </button>
      </div>

      {banner && (
        <div
          role="status"
          style={{
            padding: "14px 18px",
            borderRadius: "10px",
            marginBottom: "20px",
            fontSize: "14px",
            fontWeight: 600,
            backgroundColor: banner.type === "success" ? "#ECFDF5" : "#FEF2F2",
            color: banner.type === "success" ? "#065F46" : "#991B1B",
            border: banner.type === "success" ? "1px solid #A7F3D0" : "1px solid #FECACA"
          }}
        >
          {banner.text}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: "40px", textAlign: "center" }}>
          <p style={{ color: "#64748B", margin: 0 }}>Carregando contratos e ordens de entrega...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="card" style={{ padding: "40px 24px", textAlign: "center", borderRadius: "14px" }}>
          <div style={{ fontSize: "44px", marginBottom: "10px" }}>🗺️</div>
          <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", margin: "0 0 8px 0" }}>
            Nenhuma viagem ou entrega contratada ainda
          </h2>
          <p style={{ fontSize: "14px", color: "#64748B", maxWidth: "480px", margin: "0 auto 20px auto" }}>
            Assim que uma proposta for aceita e o pagamento Pix for confirmado pelo remetente, os endereços completos, os códigos de 4 dígitos e o mapa em tempo real aparecerão aqui.
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/propostas" className="btn btn--primary" style={{ padding: "10px 18px", textDecoration: "none", fontWeight: 700 }}>
              Ver Negociações & Propostas
            </Link>
            <Link href="/feed" className="btn btn--outline" style={{ padding: "10px 18px", textDecoration: "none", fontWeight: 700 }}>
              Ir ao Mural
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {orders.map((order) => {
            const shipment = shipmentsById[order.shipmentId];
            const codes = codesByOrderId[order.id];
            const isSender = order.senderId === user?.userId;
            const isCarrier = order.carrierId === user?.userId;
            const badge = getStatusBadge(order.status);

            const isAwaitingPickup =
              order.status !== "IN_TRANSIT" &&
              order.status !== "OUT_FOR_DELIVERY" &&
              order.status !== "DELIVERED_VERIFIED";
            const isInTransit =
              order.status === "IN_TRANSIT" || order.status === "OUT_FOR_DELIVERY";
            const isDelivered = order.status === "DELIVERED_VERIFIED";

            const origCoords =
              order.originLatitude != null && order.originLongitude != null
                ? { lat: order.originLatitude, lon: order.originLongitude }
                : shipment?.origin
                  ? {
                      lat: shipment.origin.approximateLatitude,
                      lon: shipment.origin.approximateLongitude
                    }
                  : resolveFallbackCoords(shipment?.origin?.city, false);

            const destCoords =
              order.destinationLatitude != null && order.destinationLongitude != null
                ? { lat: order.destinationLatitude, lon: order.destinationLongitude }
                : shipment?.destination
                  ? {
                      lat: shipment.destination.approximateLatitude,
                      lon: shipment.destination.approximateLongitude
                    }
                  : resolveFallbackCoords(shipment?.destination?.city, true, origCoords.lat, origCoords.lon);

            const carrierLocation =
              order.currentLatitude != null && order.currentLongitude != null
                ? {
                    lat: order.currentLatitude,
                    lon: order.currentLongitude,
                    updatedAtUtc: order.lastLocationUpdatedAtUtc
                  }
                : null;

            const originFullAddress =
              order.originAddressSummary ||
              (shipment?.origin
                ? `${shipment.origin.streetAndNumber || shipment.origin.neighborhood}, ${shipment.origin.city}/${shipment.origin.stateUf}`
                : "Endereço de retirada");

            const destFullAddress =
              order.destinationAddressSummary ||
              (shipment?.destination
                ? `${shipment.destination.streetAndNumber || shipment.destination.neighborhood}, ${shipment.destination.city}/${shipment.destination.stateUf}`
                : "Endereço de entrega");

            const valueReais = ((order.agreedAmountCents ?? order.amountCents ?? 0) / 100)
              .toFixed(2)
              .replace(".", ",");

            return (
              <article
                key={order.id}
                className="card"
                style={{
                  padding: "22px",
                  borderRadius: "16px",
                  border: "1.5px solid #E2E8F0",
                  backgroundColor: "#FFFFFF",
                  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.05)"
                }}
              >
                {/* Topo */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          padding: "4px 10px",
                          borderRadius: "999px",
                          backgroundColor: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`
                        }}
                      >
                        {badge.label}
                      </span>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#475569", backgroundColor: "#F1F5F9", padding: "4px 10px", borderRadius: "999px" }}>
                        {isSender ? "📦 Você é o Remetente" : "🚚 Você é o Transportador"}
                      </span>
                    </div>
                    <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", margin: "4px 0" }}>
                      {shipment?.title || `Encomenda #${order.shipmentId.slice(0, 8)}`}
                    </h2>
                    <div style={{ fontSize: "13px", color: "#64748B" }}>
                      {isSender
                        ? `Transportador contratado: ${order.carrierName || "Parceiro TopicLog"}`
                        : `Remetente: ${order.senderName || "Remetente TopicLog"}`}
                      {order.recipientName ? ` • Destinatário: ${order.recipientName}` : ""}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "11px", color: "#64748B", display: "block" }}>Valor Contratado (Pago)</span>
                    <strong style={{ fontSize: "22px", color: "#059669" }}>R$ {valueReais}</strong>
                  </div>
                </div>

                {/* Endereços Completos Liberados */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px", marginBottom: "16px" }}>
                  <div style={{ padding: "12px 14px", borderRadius: "10px", backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0" }}>
                    <div style={{ fontSize: "11px", fontWeight: 800, color: "#166534", textTransform: "uppercase", marginBottom: "4px" }}>
                      📍 Ponto A — Endereço Completo de Retirada
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A" }}>
                      {originFullAddress}
                    </div>
                  </div>

                  <div style={{ padding: "12px 14px", borderRadius: "10px", backgroundColor: "#FEF2F2", border: "1px solid #FECACA" }}>
                    <div style={{ fontSize: "11px", fontWeight: 800, color: "#991B1B", textTransform: "uppercase", marginBottom: "4px" }}>
                      🏁 Ponto B — Endereço Completo de Entrega
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A" }}>
                      {destFullAddress}
                    </div>
                  </div>
                </div>

                {/* Bloco exclusivo do Remetente: 2 códigos de segurança */}
                {isSender && codes && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                      gap: "12px",
                      marginBottom: "16px"
                    }}
                  >
                    <div
                      style={{
                        padding: "14px",
                        borderRadius: "12px",
                        backgroundColor: codes.pickupConfirmed ? "#F8FAFC" : "#EFF6FF",
                        border: codes.pickupConfirmed ? "1px solid #CBD5E1" : "1.5px solid #93C5FD"
                      }}
                    >
                      <div style={{ fontSize: "11px", fontWeight: 800, color: "#1E40AF", textTransform: "uppercase" }}>
                        🔑 Código 1 — Início de Viagem (Coleta)
                      </div>
                      <div style={{ fontSize: "28px", fontWeight: 900, letterSpacing: "6px", color: "#0F172A", margin: "6px 0" }}>
                        {codes.pickupCode}
                      </div>
                      <div style={{ fontSize: "12px", color: "#475569", lineHeight: 1.4 }}>
                        {codes.pickupConfirmed
                          ? "✓ Coleta confirmada! A viagem já foi iniciada."
                          : "Informe este código ao transportador no ato da retirada para iniciar a viagem."}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "14px",
                        borderRadius: "12px",
                        backgroundColor: codes.deliveryVerified ? "#F8FAFC" : "#ECFDF5",
                        border: codes.deliveryVerified ? "1px solid #CBD5E1" : "1.5px solid #6EE7B7"
                      }}
                    >
                      <div style={{ fontSize: "11px", fontWeight: 800, color: "#065F46", textTransform: "uppercase" }}>
                        🏁 Código 2 — Entrega no Destino
                      </div>
                      <div style={{ fontSize: "28px", fontWeight: 900, letterSpacing: "6px", color: "#0F172A", margin: "6px 0" }}>
                        {codes.deliveryCode}
                      </div>
                      <div style={{ fontSize: "12px", color: "#475569", lineHeight: 1.4 }}>
                        {codes.deliveryVerified
                          ? "✓ Entrega confirmada no destino!"
                          : "Passe este código para quem receberá a encomenda informar ao transportador na chegada."}
                      </div>
                    </div>
                  </div>
                )}

                {/* Controles do Transportador */}
                {isCarrier && isAwaitingPickup && (
                  <div
                    style={{
                      padding: "16px",
                      borderRadius: "12px",
                      backgroundColor: "#EFF6FF",
                      border: "1.5px solid #93C5FD",
                      marginBottom: "16px"
                    }}
                  >
                    <div style={{ fontSize: "14px", fontWeight: 800, color: "#1E40AF", marginBottom: "6px" }}>
                      🔑 Iniciar Viagem — Validação da Retirada
                    </div>
                    <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#334155" }}>
                      No momento de retirar a encomenda, peça ao remetente o <strong>Código de Início de Viagem (4 dígitos)</strong> e digite abaixo:
                    </p>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="0000"
                        value={pickupCodeInputs[order.id] || ""}
                        onChange={(e) =>
                          setPickupCodeInputs((prev) => ({
                            ...prev,
                            [order.id]: e.target.value.replace(/\D/g, "").slice(0, 4)
                          }))
                        }
                        style={{
                          width: "120px",
                          padding: "10px 14px",
                          borderRadius: "8px",
                          border: "1.5px solid #2563EB",
                          fontSize: "18px",
                          fontWeight: 800,
                          textAlign: "center",
                          letterSpacing: "4px"
                        }}
                      />
                      <button
                        type="button"
                        disabled={submittingId === order.id}
                        onClick={() => void handleConfirmPickup(order)}
                        className="btn btn--primary"
                        style={{ padding: "10px 18px", fontSize: "14px", fontWeight: 700 }}
                      >
                        {submittingId === order.id ? "Validando..." : "🚚 Confirmar Coleta & Iniciar Viagem"}
                      </button>
                    </div>
                  </div>
                )}

                {isCarrier && isInTransit && (
                  <div
                    style={{
                      padding: "16px",
                      borderRadius: "12px",
                      backgroundColor: "#ECFDF5",
                      border: "1.5px solid #6EE7B7",
                      marginBottom: "16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "14px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                      <div>
                        <strong style={{ fontSize: "14px", color: "#065F46", display: "block" }}>
                          📡 Deslocamento no Mapa (Viagem Iniciada)
                        </strong>
                        <span style={{ fontSize: "12px", color: "#047857" }}>
                          Você e o remetente acompanham sua movimentação em tempo real no mapa abaixo.
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => toggleLiveGps(order.id)}
                          style={{
                            padding: "8px 14px",
                            borderRadius: "8px",
                            border: "1px solid #059669",
                            backgroundColor: gpsWatchingOrderId === order.id ? "#059669" : "#FFFFFF",
                            color: gpsWatchingOrderId === order.id ? "#FFFFFF" : "#059669",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer"
                          }}
                        >
                          {gpsWatchingOrderId === order.id ? "🟢 GPS Automático Ligado" : "📡 Ativar GPS Contínuo"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void pushSimulatedOrGpsLocation(order, origCoords, destCoords)}
                          style={{
                            padding: "8px 14px",
                            borderRadius: "8px",
                            border: "1px solid #0284C7",
                            backgroundColor: "#E0F2FE",
                            color: "#0369A1",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer"
                          }}
                        >
                          📍 Atualizar Minha Posição Agora
                        </button>
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid #A7F3D0", paddingTop: "12px" }}>
                      <div style={{ fontSize: "14px", fontWeight: 800, color: "#065F46", marginBottom: "6px" }}>
                        🏁 Chegou ao Destino? Encerre a Viagem
                      </div>
                      <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#334155" }}>
                        Peça ao destinatário que está recebendo a encomenda o <strong>Código de Entrega (4 dígitos)</strong>:
                      </p>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="0000"
                          value={deliveryCodeInputs[order.id] || ""}
                          onChange={(e) =>
                            setDeliveryCodeInputs((prev) => ({
                              ...prev,
                              [order.id]: e.target.value.replace(/\D/g, "").slice(0, 4)
                            }))
                          }
                          style={{
                            width: "120px",
                            padding: "10px 14px",
                            borderRadius: "8px",
                            border: "1.5px solid #059669",
                            fontSize: "18px",
                            fontWeight: 800,
                            textAlign: "center",
                            letterSpacing: "4px"
                          }}
                        />
                        <button
                          type="button"
                          disabled={submittingId === order.id}
                          onClick={() => void handleConfirmDelivery(order)}
                          style={{
                            padding: "10px 18px",
                            borderRadius: "8px",
                            border: "none",
                            backgroundColor: "#059669",
                            color: "#FFFFFF",
                            fontSize: "14px",
                            fontWeight: 700,
                            cursor: "pointer"
                          }}
                        >
                          {submittingId === order.id ? "Encerrando..." : "✅ Confirmar Entrega & Encerrar Viagem"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {isDelivered && (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "10px",
                      backgroundColor: "#DCFCE7",
                      border: "1px solid #86EFAC",
                      color: "#166534",
                      fontSize: "13px",
                      fontWeight: 700,
                      marginBottom: "16px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "10px"
                    }}
                  >
                    <span>
                      ✅ Viagem concluída e verificada com sucesso!
                      {order.deliveredAtUtc ? ` Entregue em ${new Date(order.deliveredAtUtc).toLocaleString("pt-BR")}.` : ""}
                    </span>
                    {isSender && order.carrierRatingStars != null && (
                      <span
                        style={{
                          backgroundColor: "#FFFFFF",
                          color: "#B45309",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          border: "1px solid #FDE68A",
                          fontSize: "12px",
                          fontWeight: 800
                        }}
                      >
                        {"★".repeat(order.carrierRatingStars)} {order.carrierRatingStars}/5 avaliado
                      </span>
                    )}
                    {isSender && order.carrierRatingStars == null && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRatingStars(5);
                          setRatingModalOrder(order);
                        }}
                        style={{
                          padding: "6px 14px",
                          borderRadius: "8px",
                          border: "none",
                          backgroundColor: "#F59E0B",
                          color: "#FFFFFF",
                          fontSize: "12px",
                          fontWeight: 800,
                          cursor: "pointer"
                        }}
                      >
                        ⭐ Avaliar Transportador
                      </button>
                    )}
                  </div>
                )}

                {/* Mapa de Rota e Deslocamento */}
                <div style={{ marginBottom: "14px" }}>
                  <TopicLogRouteMap
                    origin={{
                      lat: origCoords.lat,
                      lon: origCoords.lon,
                      label: "Retirada",
                      address: originFullAddress
                    }}
                    destination={{
                      lat: destCoords.lat,
                      lon: destCoords.lon,
                      label: "Entrega",
                      address: destFullAddress
                    }}
                    carrierLocation={carrierLocation}
                    height="290px"
                  />
                </div>

                {/* Aviso claro e botão de Cancelamento pelo Remetente */}
                {isSender && !isDelivered && order.status !== "CLOSED" && order.contractId && (
                  <div
                    style={{
                      marginBottom: "14px",
                      padding: "12px 14px",
                      borderRadius: "10px",
                      backgroundColor: "#FFFBEB",
                      border: "1px solid #FDE68A",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "10px"
                    }}
                  >
                    <div style={{ fontSize: "12px", color: "#78350F", lineHeight: 1.45, maxWidth: "600px" }}>
                      <strong>🚫 Cancelamento pelo Remetente:</strong> Você pode cancelar esta viagem a qualquer momento. Após o pagamento, aplica-se multa de{" "}
                      <strong>{Math.min(10, Math.max(0, cancellationPenaltyPercent)).toFixed(0)}%</strong> (até 10% conforme Console Administrativo) ={" "}
                      <strong>
                        R${" "}
                        {(
                          Math.round(
                            (order.agreedAmountCents ?? order.amountCents ?? 0) *
                              (Math.min(10, Math.max(0, cancellationPenaltyPercent)) / 100)
                          ) / 100
                        )
                          .toFixed(2)
                          .replace(".", ",")}
                      </strong>
                      .
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCancelJustification("");
                        setCancelReopen(true);
                        setCancelModalOrder(order);
                      }}
                      style={{
                        padding: "8px 16px",
                        fontSize: "13px",
                        fontWeight: 700,
                        borderRadius: "8px",
                        border: "1px solid #FCA5A5",
                        backgroundColor: "#DC2626",
                        color: "#FFFFFF",
                        cursor: "pointer",
                        whiteSpace: "nowrap"
                      }}
                    >
                      🚫 Cancelar Viagem
                    </button>
                  </div>
                )}

                {order.status === "CLOSED" && (
                  <div
                    style={{
                      marginBottom: "14px",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      backgroundColor: "#FEF2F2",
                      border: "1px solid #FECACA",
                      color: "#991B1B",
                      fontSize: "13px",
                      fontWeight: 700
                    }}
                  >
                    🚫 Viagem cancelada pelo remetente.
                  </div>
                )}

                {/* Rodapé com atalho do chat privado */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                  <span style={{ fontSize: "12px", color: "#64748B" }}>
                    {carrierLocation?.updatedAtUtc
                      ? `Última posição registrada: ${new Date(carrierLocation.updatedAtUtc).toLocaleTimeString("pt-BR")}`
                      : "O marcador do transportador aparece no mapa assim que a viagem for iniciada."}
                  </span>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <Link
                      href="/mensagens"
                      className="btn btn--outline"
                      style={{ padding: "7px 14px", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}
                    >
                      💬 Abrir Chat Privado
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pop-up de Avaliação Exclusiva em Estrelas (1 a 5, sem comentários) para o Remetente */}
      {ratingModalOrder && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rate-carrier-modal-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
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
              padding: "28px 24px",
              maxWidth: "420px",
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
              textAlign: "center"
            }}
          >
            <div style={{ fontSize: "40px", marginBottom: "8px" }}>⭐</div>
            <h2
              id="rate-carrier-modal-title"
              style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", margin: "0 0 8px 0" }}
            >
              Avalie o Transportador
            </h2>
            <p style={{ fontSize: "14px", color: "#475569", margin: "0 0 18px 0", lineHeight: 1.5 }}>
              Sua entrega foi finalizada! Quantas estrelas você dá para{" "}
              <strong>{ratingModalOrder.carrierName || "o transportador"}</strong>?
            </p>

            <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "12px" }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setSelectedRatingStars(star)}
                  aria-label={`${star} ${star === 1 ? "estrela" : "estrelas"}`}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "2px",
                    cursor: "pointer",
                    fontSize: "34px",
                    lineHeight: 1,
                    color: star <= selectedRatingStars ? "#F59E0B" : "#CBD5E1",
                    transition: "transform 0.1s ease"
                  }}
                >
                  ★
                </button>
              ))}
            </div>

            <div style={{ fontSize: "14px", fontWeight: 700, color: "#B45309", marginBottom: "20px" }}>
              {selectedRatingStars} de 5 {selectedRatingStars === 1 ? "estrela" : "estrelas"}
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button
                type="button"
                disabled={submittingRating}
                onClick={() => {
                  setDismissedRatingIds((prev) => ({ ...prev, [ratingModalOrder.id]: true }));
                  setRatingModalOrder(null);
                }}
                className="btn btn--outline"
                style={{ padding: "10px 16px", fontSize: "13px", fontWeight: 700 }}
              >
                Agora não
              </button>
              <button
                type="button"
                disabled={submittingRating}
                onClick={() => void handleSubmitCarrierRating()}
                className="btn btn--primary"
                style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 700 }}
              >
                {submittingRating ? "Enviando..." : "Confirmar Avaliação"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Pop-up de Cancelamento de Viagem pelo Remetente */}
      {cancelModalOrder && (() => {
        const agreedCents = cancelModalOrder.agreedAmountCents ?? cancelModalOrder.amountCents ?? 0;
        const pct = Math.min(10, Math.max(0, cancellationPenaltyPercent));
        const penaltyCents = Math.min(agreedCents, Math.round(agreedCents * (pct / 100)));
        const refundCents = Math.max(0, agreedCents - penaltyCents);
        const fmt = (c: number) => (c / 100).toFixed(2).replace(".", ",");
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-trip-modal-title"
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
                id="cancel-trip-modal-title"
                style={{ fontSize: "19px", fontWeight: 800, color: "#991B1B", margin: "0 0 8px 0" }}
              >
                🚫 Cancelar Viagem
              </h2>
              <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 14px 0", lineHeight: 1.5 }}>
                Como o pagamento já foi confirmado, o cancelamento está sujeito à multa configurada no Console Administrativo (até 10% do valor acordado).
              </p>

              <div
                style={{
                  backgroundColor: "#FFFBEB",
                  border: "1px solid #FDE68A",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  fontSize: "13px",
                  color: "#78350F",
                  marginBottom: "14px",
                  display: "grid",
                  gap: "6px"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Valor acordado do transporte:</span>
                  <strong>R$ {fmt(agreedCents)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Multa administrativa ({pct.toFixed(0)}%):</span>
                  <strong style={{ color: "#B91C1C" }}>- R$ {fmt(penaltyCents)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed #FCD34D", paddingTop: "6px" }}>
                  <span>Saldo líquido estimado:</span>
                  <strong style={{ color: "#065F46" }}>R$ {fmt(refundCents)}</strong>
                </div>
              </div>

              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Motivo do cancelamento (opcional)
              </label>
              <input
                type="text"
                value={cancelJustification}
                onChange={(e) => setCancelJustification(e.target.value)}
                placeholder="Ex.: Alteração de planos ou indisponibilidade na coleta"
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
                  onClick={() => setCancelModalOrder(null)}
                  className="btn btn--outline"
                  style={{ padding: "9px 16px", fontSize: "13px", fontWeight: 700 }}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={submittingCancel}
                  onClick={() => void handleConfirmCancelOrder()}
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
