"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import "leaflet/dist/leaflet.css";

export interface RoutePoint {
  lat: number;
  lon: number;
  label?: string;
  address?: string;
}

export interface CarrierLivePoint {
  lat: number;
  lon?: number;
  lng?: number;
  updatedAtUtc?: string | null;
}

interface TopicLogRouteMapProps {
  origin: RoutePoint | null;
  destination: RoutePoint | null;
  carrierLocation?: CarrierLivePoint | null;
  onRouteCalculated?: (distanceKm: number, durationMinutes: number) => void;
  height?: string | number;
}

export default function TopicLogRouteMap({
  origin,
  destination,
  carrierLocation,
  onRouteCalculated,
  height = "340px"
}: TopicLogRouteMapProps): React.JSX.Element {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const originMarkerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const carrierMarkerRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const routeRequestIdRef = useRef<number>(0);

  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ km: number; mins: number } | null>(null);

  // Inicialização do mapa Leaflet (sem SSR)
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    let isMounted = true;

    async function initMap() {
      const L = (await import("leaflet")).default;
      if (!isMounted || !mapContainerRef.current) return;

      if (!mapInstanceRef.current) {
        const initialLat = origin?.lat ?? -19.9167;
        const initialLon = origin?.lon ?? -43.9345;

        const map = L.map(mapContainerRef.current, {
          center: [initialLat, initialLon],
          zoom: 12,
          zoomControl: true,
          attributionControl: false
        });

        // Camada de mapa viário de alta definição (sem ícones de aeroportos no trajeto, sem marcas d'água e sem API Key)
        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
          maxZoom: 19,
          maxNativeZoom: 18,
          attribution: "© Esri, OpenStreetMap"
        }).addTo(map);

        mapInstanceRef.current = map;
      }
    }

    initMap();

    return () => {
      isMounted = false;
    };
  }, [origin?.lat, origin?.lon]);

  // Atualização dos 2 únicos marcadores (A verde e B vermelho) e rota viária (OSRM)
  const updateRouteAndMarkers = useCallback(async () => {
    if (typeof window === "undefined" || !mapInstanceRef.current) return;

    const L = (await import("leaflet")).default;
    const map = mapInstanceRef.current;

    // Marcadores estilizados TopicLog (Ponto A: Retirada e Ponto B: Entrega)
    const createPin = (letter: "A" | "B", bgColor: string) =>
      L.divIcon({
        className: `topiclog-pin-${letter.toLowerCase()}`,
        html: `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; width: 70px; pointer-events: none;">
            <div style="
              display: flex;
              align-items: center;
              justify-content: center;
              width: 36px;
              height: 36px;
              background-color: ${bgColor};
              color: #FFFFFF;
              font-size: 16px;
              font-weight: 900;
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
              box-shadow: 0 4px 14px rgba(0,0,0,0.45);
              border: 3px solid #FFFFFF;
            ">
              <span style="transform: rotate(45deg);">${letter}</span>
            </div>
            <div style="
              margin-top: 4px;
              background-color: #0F172A;
              color: #FFFFFF;
              font-size: 11px;
              font-weight: 800;
              padding: 2px 8px;
              border-radius: 10px;
              white-space: nowrap;
              box-shadow: 0 2px 8px rgba(0,0,0,0.35);
              border: 1px solid rgba(255,255,255,0.4);
            ">
              ${letter === "A" ? "A (Coleta)" : "B (Entrega)"}
            </div>
          </div>
        `,
        iconSize: [70, 64],
        iconAnchor: [35, 34],
        popupAnchor: [0, -36]
      });

    // 1. Ponto A (Retirada - Verde)
    if (origin && typeof origin.lat === "number" && typeof origin.lon === "number") {
      if (originMarkerRef.current) {
        originMarkerRef.current.setLatLng([origin.lat, origin.lon]);
      } else {
        originMarkerRef.current = L.marker([origin.lat, origin.lon], {
          icon: createPin("A", "#059669")
        }).addTo(map);
      }
      originMarkerRef.current.bindPopup(
        `<div style="font-size: 13px;"><strong>Ponto A (Retirada)</strong><br/>${origin.address || origin.label || "Endereço de Coleta"}</div>`
      );
    } else if (originMarkerRef.current) {
      map.removeLayer(originMarkerRef.current);
      originMarkerRef.current = null;
    }

    // 2. Ponto B (Entrega - Vermelho)
    if (destination && typeof destination.lat === "number" && typeof destination.lon === "number") {
      if (destMarkerRef.current) {
        destMarkerRef.current.setLatLng([destination.lat, destination.lon]);
      } else {
        destMarkerRef.current = L.marker([destination.lat, destination.lon], {
          icon: createPin("B", "#DC2626")
        }).addTo(map);
      }
      destMarkerRef.current.bindPopup(
        `<div style="font-size: 13px;"><strong>Ponto B (Entrega)</strong><br/>${destination.address || destination.label || "Endereço de Destino"}</div>`
      );
    } else if (destMarkerRef.current) {
      map.removeLayer(destMarkerRef.current);
      destMarkerRef.current = null;
    }

    // 2.5 Posição em tempo real do Transportador (quando em viagem)
    const carrierLat = carrierLocation?.lat;
    const carrierLon = carrierLocation?.lon ?? carrierLocation?.lng;
    if (typeof carrierLat === "number" && typeof carrierLon === "number") {
      const carrierIcon = L.divIcon({
        className: "topiclog-pin-carrier",
        html: `
          <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
            <div style="
              display:flex;align-items:center;justify-content:center;
              width:38px;height:38px;background-color:#2563EB;color:#FFFFFF;
              font-size:18px;border-radius:50%;
              box-shadow:0 4px 14px rgba(37,99,235,0.55);border:3px solid #FFFFFF;
            ">🚚</div>
            <div style="
              margin-top:3px;background-color:#1D4ED8;color:#FFFFFF;
              font-size:10px;font-weight:800;padding:2px 7px;border-radius:10px;
              white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);
            ">Em Rota</div>
          </div>
        `,
        iconSize: [64, 58],
        iconAnchor: [32, 22]
      });
      if (carrierMarkerRef.current) {
        carrierMarkerRef.current.setLatLng([carrierLat, carrierLon]);
      } else {
        carrierMarkerRef.current = L.marker([carrierLat, carrierLon], {
          icon: carrierIcon,
          zIndexOffset: 500
        }).addTo(map);
      }
      const updatedLabel = carrierLocation?.updatedAtUtc
        ? new Date(carrierLocation.updatedAtUtc).toLocaleTimeString("pt-BR")
        : "Agora";
      carrierMarkerRef.current.bindPopup(
        `<div style="font-size: 13px;"><strong>🚚 Transportador em deslocamento</strong><br/>Atualizado: ${updatedLabel}</div>`
      );
    } else if (carrierMarkerRef.current) {
      map.removeLayer(carrierMarkerRef.current);
      carrierMarkerRef.current = null;
    }

    // 3. Limpar traçado viário anterior e abortar requisições pendentes
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    const currentRequestId = ++routeRequestIdRef.current;

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    // 4. Se ambos os pontos A e B existem, traçar rota viária via OSRM
    if (
      origin && typeof origin.lat === "number" && typeof origin.lon === "number" &&
      destination && typeof destination.lat === "number" && typeof destination.lon === "number"
    ) {
      setIsLoadingRoute(true);

      // Distância geodésica direta (Haversine) em km
      const R = 6371;
      const dLatRad = ((destination.lat - origin.lat) * Math.PI) / 180;
      const dLonRad = ((destination.lon - origin.lon) * Math.PI) / 180;
      const aCalc =
        Math.sin(dLatRad / 2) * Math.sin(dLatRad / 2) +
        Math.cos((origin.lat * Math.PI) / 180) *
          Math.cos((destination.lat * Math.PI) / 180) *
          Math.sin(dLonRad / 2) *
          Math.sin(dLonRad / 2);
      const cCalc = 2 * Math.atan2(Math.sqrt(aCalc), Math.sqrt(1 - aCalc));
      const straightKm = Math.round(R * cCalc);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: controller.signal
        });

        if (currentRequestId !== routeRequestIdRef.current) return;

        if (res.ok) {
          const data = await res.json();
          if (data.code === "Ok" && data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const distKm = Math.round(route.distance / 100) / 10;
            const durMins = Math.round(route.duration / 60);

            // Validação de Sanidade da Rota:
            // 1) A distância viária não pode ser absurdamente desproporcional à linha reta.
            // 2) Nenhuma coordenada da rota pode se afastar mais de 3.5 graus (~380 km) do bounding box dos pontos.
            const minAllowedLat = Math.min(origin.lat, destination.lat) - 3.5;
            const maxAllowedLat = Math.max(origin.lat, destination.lat) + 3.5;
            const minAllowedLon = Math.min(origin.lon, destination.lon) - 3.5;
            const maxAllowedLon = Math.max(origin.lon, destination.lon) + 3.5;

            const coordsList = route.geometry?.coordinates || [];
            let isGeographicallySane = true;
            if (straightKm < 150 && distKm > 350) {
              isGeographicallySane = false;
            } else if (distKm > Math.max(straightKm * 3.5, 600)) {
              isGeographicallySane = false;
            } else {
              for (const [lon, lat] of coordsList) {
                if (lat < minAllowedLat || lat > maxAllowedLat || lon < minAllowedLon || lon > maxAllowedLon) {
                  isGeographicallySane = false;
                  break;
                }
              }
            }

            if (isGeographicallySane) {
              setRouteInfo({ km: distKm, mins: durMins });
              if (onRouteCalculated) {
                onRouteCalculated(distKm, durMins);
              }

              // Traçado viário real em azul
              routeLayerRef.current = L.geoJSON(route.geometry, {
                style: {
                  color: "#2563EB",
                  weight: 5,
                  opacity: 0.85,
                  lineCap: "round",
                  lineJoin: "round"
                }
              }).addTo(map);

              const bounds = routeLayerRef.current.getBounds();
              map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
              return;
            }
          }
        }
        throw new Error("OSRM indisponível ou rota fora do limite geográfico");
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        if (currentRequestId !== routeRequestIdRef.current) return;

        // Fallback: traçado direto coerente e cálculo geodésico Haversine com fator viário 1.25x
        const estimatedKm = Math.round(straightKm * 1.25);
        const approxMins = Math.round((estimatedKm / 45) * 60) || 10;

        setRouteInfo({ km: estimatedKm, mins: approxMins });
        if (onRouteCalculated) {
          onRouteCalculated(estimatedKm, approxMins);
        }

        // Desenhar traçado direto limpo e coerente entre A e B
        routeLayerRef.current = L.polyline(
          [
            [origin.lat, origin.lon],
            [destination.lat, destination.lon]
          ],
          {
            color: "#2563EB",
            weight: 4,
            opacity: 0.8,
            dashArray: "6, 8"
          }
        ).addTo(map);

        const group = L.latLngBounds([
          [origin.lat, origin.lon],
          [destination.lat, destination.lon]
        ]);
        map.fitBounds(group, { padding: [50, 50], maxZoom: 14 });
      } finally {
        if (currentRequestId === routeRequestIdRef.current) {
          setIsLoadingRoute(false);
        }
      }
    } else {
      setRouteInfo(null);
      if (onRouteCalculated) {
        onRouteCalculated(0, 0);
      }
      if (origin && typeof origin.lat === "number" && typeof origin.lon === "number") {
        map.setView([origin.lat, origin.lon], 14);
      } else if (destination && typeof destination.lat === "number" && typeof destination.lon === "number") {
        map.setView([destination.lat, destination.lon], 14);
      }
    }
  }, [origin, destination, carrierLocation, onRouteCalculated]);

  useEffect(() => {
    updateRouteAndMarkers();
  }, [updateRouteAndMarkers]);

  useEffect(() => {
    const t1 = setTimeout(() => mapInstanceRef.current?.invalidateSize(), 100);
    const t2 = setTimeout(() => mapInstanceRef.current?.invalidateSize(), 400);
    const t3 = setTimeout(() => mapInstanceRef.current?.invalidateSize(), 800);

    let observer: ResizeObserver | null = null;
    if (mapContainerRef.current && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        mapInstanceRef.current?.invalidateSize();
      });
      observer.observe(mapContainerRef.current);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      observer?.disconnect();
    };
  }, [height]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height,
        borderRadius: "12px",
        overflow: "hidden",
        border: "1.5px solid var(--color-border, #CBD5E1)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.06)"
      }}
    >
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

      {/* Badge flutuante com quilometragem e tempo calculado */}
      {routeInfo && (
        <div
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            zIndex: 1000,
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(6px)",
            padding: "8px 14px",
            borderRadius: "24px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
            fontSize: "13px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "#0F172A",
            border: "1px solid #E2E8F0"
          }}
        >
          <span style={{ color: "#2563EB", fontSize: "14px" }}>🚗 Rota Viária:</span>
          <strong style={{ color: "#0F172A", fontSize: "14px" }}>{routeInfo.km} km</strong>
          <span style={{ color: "#94A3B8" }}>•</span>
          <span style={{ color: "#334155" }}>
            ~{routeInfo.mins >= 60 ? `${Math.floor(routeInfo.mins / 60)}h ${routeInfo.mins % 60}min` : `${routeInfo.mins} min`}
          </span>
          {isLoadingRoute && <span style={{ fontSize: "11px", color: "#2563EB" }}>(calculando...)</span>}
        </div>
      )}

      {/* Legenda simples dos 2 pontos */}
      <div
        style={{
          position: "absolute",
          bottom: "10px",
          left: "12px",
          zIndex: 1000,
          backgroundColor: "rgba(255, 255, 255, 0.92)",
          padding: "4px 10px",
          borderRadius: "6px",
          fontSize: "11px",
          fontWeight: 700,
          display: "flex",
          gap: "12px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.12)"
        }}
      >
        <span style={{ color: "#059669" }}>● Ponto A: Retirada</span>
        <span style={{ color: "#DC2626" }}>● Ponto B: Entrega</span>
        {carrierLocation && <span style={{ color: "#2563EB" }}>🚚 Em Rota</span>}
      </div>
    </div>
  );
}
