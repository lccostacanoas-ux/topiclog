"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import "leaflet/dist/leaflet.css";

export interface RoutePoint {
  lat: number;
  lon: number;
  label?: string;
  address?: string;
}

interface TopicLogRouteMapProps {
  origin: RoutePoint | null;
  destination: RoutePoint | null;
  onRouteCalculated?: (distanceKm: number, durationMinutes: number) => void;
  height?: string | number;
}

export default function TopicLogRouteMap({
  origin,
  destination,
  onRouteCalculated,
  height = "340px"
}: TopicLogRouteMapProps): React.JSX.Element {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const originMarkerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);

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

    // 3. Limpar traçado viário anterior
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

      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });

        if (res.ok) {
          const data = await res.json();
          if (data.code === "Ok" && data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const distKm = Math.round(route.distance / 100) / 10;
            const durMins = Math.round(route.duration / 60);

            setRouteInfo({ km: distKm, mins: durMins });
            if (onRouteCalculated) {
              onRouteCalculated(distKm, durMins);
            }

            // Traçado viário real em azul marinho / primário
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
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
            return;
          }
        }
        throw new Error("OSRM indisponível");
      } catch {
        // Fallback: cálculo geodésico Haversine com fator viário 1.25x
        const R = 6371;
        const dLat = ((destination.lat - origin.lat) * Math.PI) / 180;
        const dLon = ((destination.lon - origin.lon) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((origin.lat * Math.PI) / 180) *
            Math.cos((destination.lat * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const straightKm = Math.round(R * c * 1.25);
        const approxMins = Math.round((straightKm / 45) * 60) || 10;

        setRouteInfo({ km: straightKm, mins: approxMins });
        if (onRouteCalculated) {
          onRouteCalculated(straightKm, approxMins);
        }

        if (originMarkerRef.current && destMarkerRef.current) {
          const group = L.featureGroup([originMarkerRef.current, destMarkerRef.current]);
          map.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 15 });
        }
      } finally {
        setIsLoadingRoute(false);
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
  }, [origin, destination, onRouteCalculated]);

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
      </div>
    </div>
  );
}
