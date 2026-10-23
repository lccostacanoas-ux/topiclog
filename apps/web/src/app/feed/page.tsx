"use client";

import React, { Suspense, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { EmptyState } from "../../components/EmptyState";
import { StatusPill } from "../../components/StatusPill";
import {
  type DemoShipment,
  type DemoTrip,
  type ShipmentCategory,
  getDemoShipments,
  getDemoTrips
} from "../../lib/demo-marketplace-store";
import {
  getCompatibleTripsForShipmentApi,
  getCompatibleShipmentsForTripApi,
  fetchOnMyRouteFeedApi,
  fetchNearbyFeedApi,
  fetchRegionalFeedApi,
  searchMunicipalitiesApi,
  createProposalApi,
  getSandboxTokenApi
} from "../../lib/api-client";
import type {
  MatchEvaluationResultDto,
  OpportunityFeedItemDto,
  MunicipalitySearchItemDto
} from "../../lib/types";

const CATEGORY_LABELS: Record<ShipmentCategory | "ALL", { label: string; icon: string }> = {
  ALL: { label: "Todas as Categorias", icon: "✨" },
  DOCUMENTOS: { label: "Documentos", icon: "📄" },
  AUTOPECAS: { label: "Autopeças", icon: "⚙️" },
  ELETRONICOS: { label: "Eletrônicos", icon: "💻" },
  SAUDE: { label: "Farmácia / Saúde", icon: "💊" },
  ALIMENTOS: { label: "Alimentos", icon: "🍫" },
  GERAL: { label: "Carga Geral", icon: "📦" }
};

const ALLOWED_CITIES = [
  "ALL",
  "João Monlevade",
  "Belo Horizonte",
  "Ipatinga",
  "Itabira",
  "Nova Era",
  "Ouro Preto"
] as const;

const BRAZILIAN_UFS = [
  "ALL", "MG", "SP", "RJ", "ES", "BA", "PR", "RS", "SC", "GO", "DF", "PE", "CE"
] as const;

type DiscoveryMode = "STANDARD" | "NEARBY" | "ON_MY_ROUTE" | "REGIONAL";

function FeedContent(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlOrigin = searchParams.get("origem")?.trim() || "";
  const urlDest = searchParams.get("destino")?.trim() || "";

  const [isSendingProposal, setIsSendingProposal] = useState(false);

  // Modo de Descoberta do Feed Nacional (Complemento PR-03)
  const [discoveryMode, setDiscoveryMode] = useState<DiscoveryMode>("STANDARD");

  // Filtros Padrão existentes
  const [activeTab, setActiveTab] = useState<"ALL" | "SHIPMENTS" | "TRIPS">("ALL");
  const [selectedCategory, setSelectedCategory] = useState<ShipmentCategory | "ALL">("ALL");
  const [selectedOrigin, setSelectedOrigin] = useState<string>(urlOrigin || "ALL");
  const [selectedDestination, setSelectedDestination] = useState<string>(urlDest || "ALL");
  const [selectedVehicle, setSelectedVehicle] = useState<string>("ALL");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DemoShipment | DemoTrip | null>(null);
  const [matchingResults, setMatchingResults] = useState<readonly MatchEvaluationResultDto[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState<boolean>(false);

  // Estados do Modo "No meu trajeto"
  const trips = getDemoTrips();
  const [selectedTripId, setSelectedTripId] = useState<string>(trips[0]?.id || "via-001");
  const [includeExtendedDetours, setIncludeExtendedDetours] = useState<boolean>(false);
  const [routeItems, setRouteItems] = useState<readonly OpportunityFeedItemDto[]>([]);
  const [routeCursor, setRouteCursor] = useState<string | null>(null);
  const [routeHasMore, setRouteHasMore] = useState<boolean>(false);
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);

  // Estados do Modo "Perto de mim" (GPS)
  const [gpsStatus, setGpsStatus] = useState<"IDLE" | "LOCATING" | "GRANTED" | "DENIED">("IDLE");
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [nearbyRadiusKm, setNearbyRadiusKm] = useState<number>(15);
  const [nearbyItems, setNearbyItems] = useState<readonly OpportunityFeedItemDto[]>([]);
  const [nearbyCursor, setNearbyCursor] = useState<string | null>(null);
  const [nearbyHasMore, setNearbyHasMore] = useState<boolean>(false);
  const [isLoadingNearby, setIsLoadingNearby] = useState<boolean>(false);

  // Estados do Modo "Escolher região" (Nacional)
  const [regionalUf, setRegionalUf] = useState<string>("MG");
  const [regionalCityQuery, setRegionalCityQuery] = useState<string>("");
  const [selectedRegionalCity, setSelectedRegionalCity] = useState<string>("");
  const [regionalCitySuggestions, setRegionalCitySuggestions] = useState<readonly MunicipalitySearchItemDto[]>([]);
  const [regionalItems, setRegionalItems] = useState<readonly OpportunityFeedItemDto[]>([]);
  const [regionalCursor, setRegionalCursor] = useState<string | null>(null);
  const [regionalHasMore, setRegionalHasMore] = useState<boolean>(false);
  const [isLoadingRegional, setIsLoadingRegional] = useState<boolean>(false);

  // Sincroniza estados caso a URL mude ou o usuário atualize a página (F5)
  useEffect(() => {
    const o = searchParams.get("origem")?.trim();
    const d = searchParams.get("destino")?.trim();
    setSelectedOrigin(o || "ALL");
    setSelectedDestination(d || "ALL");
  }, [searchParams]);

  // Carregar dados do modo "No meu trajeto"
  const loadOnMyRoute = useCallback(async (isLoadMore = false) => {
    setIsLoadingRoute(true);
    try {
      const res = await fetchOnMyRouteFeedApi({
        tripId: selectedTripId,
        includeExtendedDetours,
        cursor: isLoadMore ? routeCursor || undefined : undefined,
        limit: 20
      });

      if (res.ok && res.data) {
        const data = res.data;
        setRouteItems((prev) => (isLoadMore ? [...prev, ...data.items] : data.items));
        setRouteCursor(data.nextCursor || null);
        setRouteHasMore(data.hasMore);
      }
    } finally {
      setIsLoadingRoute(false);
    }
  }, [selectedTripId, includeExtendedDetours, routeCursor]);

  useEffect(() => {
    if (discoveryMode === "ON_MY_ROUTE") {
      loadOnMyRoute(false);
    }
  }, [discoveryMode, selectedTripId, includeExtendedDetours]);

  // Carregar dados do modo "Perto de mim"
  const loadNearby = useCallback(async (coords: { lat: number; lon: number }, isLoadMore = false) => {
    setIsLoadingNearby(true);
    try {
      const res = await fetchNearbyFeedApi({
        lat: coords.lat,
        lon: coords.lon,
        radiusKm: nearbyRadiusKm,
        cursor: isLoadMore ? nearbyCursor || undefined : undefined,
        limit: 20
      });

      if (res.ok && res.data) {
        const data = res.data;
        setNearbyItems((prev) => (isLoadMore ? [...prev, ...data.items] : data.items));
        setNearbyCursor(data.nextCursor || null);
        setNearbyHasMore(data.hasMore);
      }
    } finally {
      setIsLoadingNearby(false);
    }
  }, [nearbyRadiusKm, nearbyCursor]);

  const requestGps = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setGpsStatus("DENIED");
      setUserCoords({ lat: -19.8100, lon: -43.1736 }); // Fallback João Monlevade
      return;
    }

    setGpsStatus("LOCATING");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setUserCoords(coords);
        setGpsStatus("GRANTED");
        loadNearby(coords, false);
      },
      () => {
        setGpsStatus("DENIED");
        const fallbackCoords = { lat: -19.8100, lon: -43.1736 }; // Fallback centroide João Monlevade
        setUserCoords(fallbackCoords);
        loadNearby(fallbackCoords, false);
      },
      { timeout: 8000 }
    );
  };

  // Carregar dados do modo "Escolher região"
  const loadRegional = useCallback(async (isLoadMore = false) => {
    setIsLoadingRegional(true);
    try {
      const res = await fetchRegionalFeedApi({
        uf: regionalUf !== "ALL" ? regionalUf : undefined,
        city: selectedRegionalCity || regionalCityQuery || undefined,
        cursor: isLoadMore ? regionalCursor || undefined : undefined,
        limit: 20
      });

      if (res.ok && res.data) {
        const data = res.data;
        setRegionalItems((prev) => (isLoadMore ? [...prev, ...data.items] : data.items));
        setRegionalCursor(data.nextCursor || null);
        setRegionalHasMore(data.hasMore);
      }
    } finally {
      setIsLoadingRegional(false);
    }
  }, [regionalUf, selectedRegionalCity, regionalCityQuery, regionalCursor]);

  // Autocomplete de municípios ao digitar no modo regional
  useEffect(() => {
    if (discoveryMode !== "REGIONAL" || regionalCityQuery.length < 2) {
      setRegionalCitySuggestions([]);
      return;
    }

    let isMounted = true;
    const timer = setTimeout(() => {
      searchMunicipalitiesApi({
        q: regionalCityQuery,
        uf: regionalUf !== "ALL" ? regionalUf : undefined,
        limit: 8
      }).then((res) => {
        if (isMounted && res.ok && res.data) {
          setRegionalCitySuggestions(res.data.municipalities);
        }
      });
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [discoveryMode, regionalCityQuery, regionalUf]);

  // Consulta matching no backend ASP.NET Core quando um item for selecionado para visualização
  useEffect(() => {
    if (!selectedItem) {
      setMatchingResults([]);
      setIsLoadingMatches(false);
      return;
    }

    let isMounted = true;
    setIsLoadingMatches(true);

    if ("weightGrams" in selectedItem) {
      getCompatibleTripsForShipmentApi(selectedItem.id)
        .then((res) => {
          if (isMounted && res.ok && res.data?.matches) {
            setMatchingResults(res.data.matches);
          }
        })
        .finally(() => {
          if (isMounted) setIsLoadingMatches(false);
        });
    } else {
      getCompatibleShipmentsForTripApi(selectedItem.id)
        .then((res) => {
          if (isMounted && res.ok && res.data?.matches) {
            setMatchingResults(res.data.matches);
          }
        })
        .finally(() => {
          if (isMounted) setIsLoadingMatches(false);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [selectedItem]);

  const shipments = getDemoShipments();

  // Filtragem estrita de Encomendas padrão
  const filteredShipments = shipments.filter((s) => {
    if (selectedCategory !== "ALL" && s.category !== selectedCategory) {
      return false;
    }
    if (selectedOrigin !== "ALL" && s.originCity.toLowerCase() !== selectedOrigin.toLowerCase()) {
      return false;
    }
    if (selectedDestination !== "ALL" && s.destinationCity.toLowerCase() !== selectedDestination.toLowerCase()) {
      return false;
    }
    if (selectedVehicle !== "ALL" && s.maxVehicleType !== selectedVehicle) {
      return false;
    }
    return true;
  });

  // Filtragem estrita de Viagens padrão
  const filteredTrips = trips.filter((t) => {
    if (selectedOrigin !== "ALL" && t.originCity.toLowerCase() !== selectedOrigin.toLowerCase()) {
      return false;
    }
    if (selectedDestination !== "ALL" && t.destinationCity.toLowerCase() !== selectedDestination.toLowerCase()) {
      return false;
    }
    if (selectedVehicle !== "ALL" && t.vehicleType !== selectedVehicle) {
      return false;
    }
    return true;
  });

  const isRouteFiltered = selectedOrigin !== "ALL" || selectedDestination !== "ALL";

  // Converter OpportunityFeedItemDto para DemoShipment sob demanda para abrir modal
  const openOpportunityDetail = (opp: OpportunityFeedItemDto) => {
    const synthShipment: DemoShipment = {
      id: opp.id,
      title: opp.title,
      description: `Oportunidade georreferenciada via Feed Nacional. Coleta em ${opp.originCity} (${opp.originNeighborhood}) com destino a ${opp.destinationCity} (${opp.destinationNeighborhood}).`,
      category: (opp.category as ShipmentCategory) || "GERAL",
      dimensions: { lengthCm: 30, widthCm: 25, heightCm: 15 },
      specialCare: ["Carga Verificada", "Lacrado"],
      originCity: opp.originCity,
      originNeighborhood: opp.originNeighborhood,
      destinationCity: opp.destinationCity,
      destinationNeighborhood: opp.destinationNeighborhood,
      weightGrams: opp.weightGrams,
      maxVehicleType: (opp.vehicleType as any) || "CAR",
      suggestedPriceCents: opp.suggestedPriceCents,
      deadlineDate: "Hoje / Flexível",
      senderName: "Remetente Verificado",
      senderKycVerified: true,
      status: "OPEN",
      interestedInInsurance: false,
      photoIcon: "📦",
      createdAt: "Recente"
    };
    setSelectedItem(synthShipment);
  };

  return (
    <main className="container" style={{ paddingTop: "28px", paddingBottom: "64px", maxWidth: "980px" }}>
      {/* Cabeçalho Limpo do Feed */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "20px"
        }}
      >
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, margin: 0, color: "var(--color-brand-deep-navy)" }}>
            Oportunidades em Aberto
          </h1>
          <p style={{ color: "var(--color-muted)", margin: "4px 0 0 0", fontSize: "14px" }}>
            Feed inteligente com busca radial, rotas com desvio viário e filtros regionais.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <Link href="/encomendas/publicar" className="btn btn--primary" style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 700 }}>
            + Enviar Encomenda
          </Link>
          <Link href="/viagens/cadastrar" className="btn btn--secondary" style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 700 }}>
            + Oferecer Transporte
          </Link>
        </div>
      </div>

      {/* Barra de Modos de Descoberta do Feed Nacional (PR-03 Complemento) */}
      <div
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "14px 18px",
          marginBottom: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-brand-deep-navy)" }}>
            Modalidade de Descoberta:
          </span>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setDiscoveryMode("STANDARD")}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius-full)",
                fontSize: "12px",
                fontWeight: 700,
                border: "1px solid",
                borderColor: discoveryMode === "STANDARD" ? "var(--color-primary)" : "var(--color-border)",
                backgroundColor: discoveryMode === "STANDARD" ? "#EFF6FF" : "#FFFFFF",
                color: discoveryMode === "STANDARD" ? "var(--color-primary)" : "var(--color-text)",
                cursor: "pointer"
              }}
            >
              🧭 Feed Geral
            </button>

            <button
              type="button"
              onClick={() => {
                setDiscoveryMode("NEARBY");
                if (!userCoords) requestGps();
              }}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius-full)",
                fontSize: "12px",
                fontWeight: 700,
                border: "1px solid",
                borderColor: discoveryMode === "NEARBY" ? "#10B981" : "var(--color-border)",
                backgroundColor: discoveryMode === "NEARBY" ? "#ECFDF5" : "#FFFFFF",
                color: discoveryMode === "NEARBY" ? "#047857" : "var(--color-text)",
                cursor: "pointer"
              }}
            >
              📍 Perto de mim
            </button>

            <button
              type="button"
              onClick={() => setDiscoveryMode("ON_MY_ROUTE")}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius-full)",
                fontSize: "12px",
                fontWeight: 700,
                border: "1px solid",
                borderColor: discoveryMode === "ON_MY_ROUTE" ? "#8B5CF6" : "var(--color-border)",
                backgroundColor: discoveryMode === "ON_MY_ROUTE" ? "#F5F3FF" : "#FFFFFF",
                color: discoveryMode === "ON_MY_ROUTE" ? "#6D28D9" : "var(--color-text)",
                cursor: "pointer"
              }}
            >
              🛣️ No meu trajeto
            </button>

            <button
              type="button"
              onClick={() => setDiscoveryMode("REGIONAL")}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius-full)",
                fontSize: "12px",
                fontWeight: 700,
                border: "1px solid",
                borderColor: discoveryMode === "REGIONAL" ? "#F59E0B" : "var(--color-border)",
                backgroundColor: discoveryMode === "REGIONAL" ? "#FFFBEB" : "#FFFFFF",
                color: discoveryMode === "REGIONAL" ? "#B45309" : "var(--color-text)",
                cursor: "pointer"
              }}
            >
              🗺️ Escolher região
            </button>
          </div>
        </div>

        {/* Sub-painel: Modo "Perto de mim" */}
        {discoveryMode === "NEARBY" && (
          <div style={{ backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "var(--radius-sm)", padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ fontSize: "13px", color: "#166534" }}>
                {gpsStatus === "LOCATING" && "Buscando localização GPS do seu dispositivo..."}
                {gpsStatus === "GRANTED" && "📍 GPS Conectado com sucesso!"}
                {gpsStatus === "DENIED" && "⚠️ GPS recusado ou indisponível. Utilizando ponto padrão de referência (João Monlevade)."}
                {gpsStatus === "IDLE" && "Clique para buscar oportunidades próximas ao seu local atual."}
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#166534" }}>Raio:</span>
                {[5, 15, 30].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setNearbyRadiusKm(r);
                      if (userCoords) loadNearby(userCoords, false);
                    }}
                    style={{
                      padding: "3px 8px",
                      fontSize: "11px",
                      borderRadius: "4px",
                      fontWeight: nearbyRadiusKm === r ? 700 : 500,
                      backgroundColor: nearbyRadiusKm === r ? "#15803D" : "#DCFCE7",
                      color: nearbyRadiusKm === r ? "#FFFFFF" : "#166534",
                      border: "none",
                      cursor: "pointer"
                    }}
                  >
                    {r} km
                  </button>
                ))}

                <button
                  type="button"
                  onClick={requestGps}
                  className="btn btn--outline"
                  style={{ padding: "4px 10px", fontSize: "12px", borderRadius: "var(--radius-sm)" }}
                >
                  🔄 Atualizar GPS
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sub-painel: Modo "No meu trajeto" */}
        {discoveryMode === "ON_MY_ROUTE" && (
          <div style={{ backgroundColor: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: "var(--radius-sm)", padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#6D28D9" }}>Viagem Selecionada:</span>
                <select
                  value={selectedTripId}
                  onChange={(e) => setSelectedTripId(e.target.value)}
                  style={{ padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid #C4B5FD", fontSize: "13px" }}
                >
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.carrierName} ({t.originCity} ➔ {t.destinationCity})
                    </option>
                  ))}
                </select>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#5B21B6", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={includeExtendedDetours}
                  onChange={(e) => setIncludeExtendedDetours(e.target.checked)}
                />
                <span>Ampliar busca para desvios maiores (&gt; 20 km)</span>
              </label>
            </div>
          </div>
        )}

        {/* Sub-painel: Modo "Escolher região" */}
        {discoveryMode === "REGIONAL" && (
          <div style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "var(--radius-sm)", padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#92400E" }}>UF:</span>
                <select
                  value={regionalUf}
                  onChange={(e) => {
                    setRegionalUf(e.target.value);
                    setSelectedRegionalCity("");
                  }}
                  style={{ padding: "5px 8px", borderRadius: "4px", border: "1px solid #FCD34D", fontSize: "13px" }}
                >
                  {BRAZILIAN_UFS.map((u) => (
                    <option key={u} value={u}>{u === "ALL" ? "Todos os Estados" : u}</option>
                  ))}
                </select>
              </div>

              <div style={{ position: "relative", flex: "1 1 200px" }}>
                <input
                  type="text"
                  placeholder="Digite o município (ex: João Monlevade, Belo Horizonte)..."
                  value={selectedRegionalCity || regionalCityQuery}
                  onChange={(e) => {
                    setSelectedRegionalCity("");
                    setRegionalCityQuery(e.target.value);
                  }}
                  style={{ width: "100%", padding: "6px 10px", borderRadius: "4px", border: "1px solid #FCD34D", fontSize: "13px" }}
                />

                {regionalCitySuggestions.length > 0 && !selectedRegionalCity && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      backgroundColor: "#FFFFFF",
                      border: "1px solid var(--color-border)",
                      borderRadius: "4px",
                      boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                      zIndex: 50,
                      marginTop: "2px"
                    }}
                  >
                    {regionalCitySuggestions.map((s) => (
                      <div
                        key={s.ibgeCode}
                        onClick={() => {
                          setSelectedRegionalCity(s.name);
                          setRegionalCitySuggestions([]);
                        }}
                        style={{ padding: "8px 12px", fontSize: "12px", cursor: "pointer", borderBottom: "1px solid #F1F5F9" }}
                      >
                        <strong>{s.name}</strong> ({s.stateUf})
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => loadRegional(false)}
                className="btn btn--primary"
                style={{ padding: "6px 14px", fontSize: "12px", fontWeight: 700 }}
              >
                🔍 Filtrar Região
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Banner de Rota Ativa (Home -> Feed ou Busca Direta) */}
      {isRouteFiltered && discoveryMode === "STANDARD" && (
        <div
          style={{
            backgroundColor: "#EFF6FF",
            border: "1px solid #BFDBFE",
            borderRadius: "var(--radius-md)",
            padding: "12px 18px",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "15px" }}>📍</span>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#1E40AF" }}>
              Rota Filtrada:
            </span>
            <span style={{ fontSize: "13px", color: "#1E3A8A" }}>
              <strong>{selectedOrigin !== "ALL" ? selectedOrigin : "Qualquer Origem"}</strong> ➔ <strong>{selectedDestination !== "ALL" ? selectedDestination : "Qualquer Destino"}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedOrigin("ALL");
              setSelectedDestination("ALL");
            }}
            style={{
              background: "none",
              border: "none",
              color: "#2563EB",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "underline"
            }}
          >
            Limpar rota (ver todas em MG)
          </button>
        </div>
      )}

      {/* Listagem de Oportunidades Conforme o Modo Ativo */}
      {discoveryMode === "ON_MY_ROUTE" ? (
        <div>
          {isLoadingRoute && routeItems.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--color-muted)" }}>
              Calculando compatibilidade de desvio viário ao longo do itinerário...
            </div>
          ) : routeItems.length === 0 ? (
            <EmptyState
              icon="🛣️"
              title="Nenhuma carga no seu trajeto"
              description="Nenhuma encomenda encontrada dentro do limite de desvio configurado. Experimente marcar 'Ampliar busca para desvios maiores'."
            />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: "16px" }}>
              {routeItems.map((item) => (
                <article key={item.id} className="compact-card">
                  <div>
                    <div className="compact-card__top">
                      <span className="compact-card__route">
                        {item.originCity} ➔ {item.destinationCity}
                      </span>
                      <span className={`badge-vehicle badge-vehicle--${item.vehicleType}`}>
                        {item.vehicleType === "BICYCLE" ? "🚲 Até 5kg" : item.vehicleType === "MOTORCYCLE" ? "🏍️ Até 20kg" : "🚗 Até 20kg"}
                      </span>
                    </div>

                    <h2 className="compact-card__title">{item.title}</h2>

                    {/* Badge de Desvio Viário (10 km / 20 km) */}
                    {item.detour && (
                      <div style={{ margin: "6px 0 8px 0" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: "4px",
                            backgroundColor:
                              item.detour.classification === "COMPATIBLE"
                                ? "#DCFCE7"
                                : item.detour.classification === "REQUIRES_EVALUATION"
                                ? "#FEF3C7"
                                : item.detour.classification === "INSUFFICIENT_LOCATION"
                                ? "#F1F5F9"
                                : "#FEE2E2",
                            color:
                              item.detour.classification === "COMPATIBLE"
                                ? "#15803D"
                                : item.detour.classification === "REQUIRES_EVALUATION"
                                ? "#B45309"
                                : item.detour.classification === "INSUFFICIENT_LOCATION"
                                ? "#475569"
                                : "#B91C1C"
                          }}
                        >
                          {item.detour.badgeLabel}
                        </span>
                        {item.detour.reasons[0] && (
                          <div style={{ fontSize: "11px", color: "var(--color-muted)", marginTop: "3px" }}>
                            {item.detour.reasons[0]}
                          </div>
                        )}
                      </div>
                    )}

                    {(!item.detour && item.georeferenceStatus && item.georeferenceStatus !== "RESOLVED") && (
                      <div style={{ margin: "6px 0 8px 0" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: "4px",
                            backgroundColor: "#F1F5F9",
                            color: "#475569"
                          }}
                        >
                          ⚠️ Localização Pendente
                        </span>
                      </div>
                    )}

                    <div className="compact-card__meta">
                      <span>⚖️ {(item.weightGrams / 1000).toFixed(1)} kg</span>
                      <span>📍 {item.originNeighborhood}</span>
                      {item.volumeLiters && <span>📦 {item.volumeLiters} L</span>}
                    </div>
                  </div>

                  <div className="compact-card__bottom">
                    <div>
                      <span style={{ fontSize: "11px", color: "var(--color-muted)", display: "block" }}>Valor sugerido</span>
                      <span className="compact-card__price">
                        R$ {(item.suggestedPriceCents / 100).toFixed(2).replace(".", ",")}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => openOpportunityDetail(item)}
                      className="compact-card__btn"
                    >
                      Ver detalhes ➔
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {routeHasMore && (
            <div style={{ textAlign: "center", marginTop: "24px" }}>
              <button
                type="button"
                onClick={() => loadOnMyRoute(true)}
                disabled={isLoadingRoute}
                className="btn btn--outline"
                style={{ padding: "8px 24px", fontSize: "13px", fontWeight: 700 }}
              >
                {isLoadingRoute ? "Carregando..." : "Carregar mais oportunidades (+20)"}
              </button>
            </div>
          )}
        </div>
      ) : discoveryMode === "NEARBY" ? (
        <div>
          {isLoadingNearby && nearbyItems.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--color-muted)" }}>
              Buscando oportunidades em raio de {nearbyRadiusKm} km...
            </div>
          ) : nearbyItems.length === 0 ? (
            <EmptyState
              icon="📍"
              title="Nenhuma carga nas proximidades"
              description={`Nenhuma oportunidade encontrada num raio de ${nearbyRadiusKm} km. Tente expandir o raio de pesquisa.`}
            />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: "16px" }}>
              {nearbyItems.map((item) => (
                <article key={item.id} className="compact-card">
                  <div>
                    <div className="compact-card__top">
                      <span className="compact-card__route">
                        {item.originCity} ➔ {item.destinationCity}
                      </span>
                      <span className={`badge-vehicle badge-vehicle--${item.vehicleType}`}>
                        {item.vehicleType === "BICYCLE" ? "🚲 Até 5kg" : item.vehicleType === "MOTORCYCLE" ? "🏍️ Até 20kg" : "🚗 Até 20kg"}
                      </span>
                    </div>

                    <h2 className="compact-card__title">{item.title}</h2>

                    {item.detour && (
                      <div style={{ margin: "6px 0 8px 0" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "4px", backgroundColor: "#EFF6FF", color: "#1D4ED8" }}>
                          📍 {item.detour.badgeLabel}
                        </span>
                      </div>
                    )}

                    <div className="compact-card__meta">
                      <span>⚖️ {(item.weightGrams / 1000).toFixed(1)} kg</span>
                      <span>📍 {item.originNeighborhood}</span>
                    </div>
                  </div>

                  <div className="compact-card__bottom">
                    <div>
                      <span style={{ fontSize: "11px", color: "var(--color-muted)", display: "block" }}>Valor sugerido</span>
                      <span className="compact-card__price">
                        R$ {(item.suggestedPriceCents / 100).toFixed(2).replace(".", ",")}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => openOpportunityDetail(item)}
                      className="compact-card__btn"
                    >
                      Ver detalhes ➔
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {nearbyHasMore && (
            <div style={{ textAlign: "center", marginTop: "24px" }}>
              <button
                type="button"
                onClick={() => userCoords && loadNearby(userCoords, true)}
                disabled={isLoadingNearby}
                className="btn btn--outline"
                style={{ padding: "8px 24px", fontSize: "13px", fontWeight: 700 }}
              >
                {isLoadingNearby ? "Carregando..." : "Carregar mais oportunidades (+20)"}
              </button>
            </div>
          )}
        </div>
      ) : discoveryMode === "REGIONAL" ? (
        <div>
          {isLoadingRegional && regionalItems.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--color-muted)" }}>
              Consultando oportunidades na região...
            </div>
          ) : regionalItems.length === 0 ? (
            <EmptyState
              icon="🗺️"
              title="Nenhuma carga nesta região"
              description="Nenhuma encomenda cadastrada nesta localidade. Tente selecionar outro município ou estado."
            />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: "16px" }}>
              {regionalItems.map((item) => (
                <article key={item.id} className="compact-card">
                  <div>
                    <div className="compact-card__top">
                      <span className="compact-card__route">
                        {item.originCity} ➔ {item.destinationCity}
                      </span>
                      <span className={`badge-vehicle badge-vehicle--${item.vehicleType}`}>
                        {item.vehicleType === "BICYCLE" ? "🚲 Até 5kg" : item.vehicleType === "MOTORCYCLE" ? "🏍️ Até 20kg" : "🚗 Até 20kg"}
                      </span>
                    </div>

                    <h2 className="compact-card__title">{item.title}</h2>

                    <div className="compact-card__meta">
                      <span>⚖️ {(item.weightGrams / 1000).toFixed(1)} kg</span>
                      <span>📍 {item.originNeighborhood}</span>
                    </div>
                  </div>

                  <div className="compact-card__bottom">
                    <div>
                      <span style={{ fontSize: "11px", color: "var(--color-muted)", display: "block" }}>Valor sugerido</span>
                      <span className="compact-card__price">
                        R$ {(item.suggestedPriceCents / 100).toFixed(2).replace(".", ",")}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => openOpportunityDetail(item)}
                      className="compact-card__btn"
                    >
                      Ver detalhes ➔
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {regionalHasMore && (
            <div style={{ textAlign: "center", marginTop: "24px" }}>
              <button
                type="button"
                onClick={() => loadRegional(true)}
                disabled={isLoadingRegional}
                className="btn btn--outline"
                style={{ padding: "8px 24px", fontSize: "13px", fontWeight: 700 }}
              >
                {isLoadingRegional ? "Carregando..." : "Carregar mais oportunidades (+20)"}
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Modo Padrão: Listagem existente com filtros de categoria e abas */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: "16px" }}>
          {(activeTab === "ALL" || activeTab === "SHIPMENTS") &&
            filteredShipments.map((s) => (
              <article key={s.id} className="compact-card">
                <div>
                  <div className="compact-card__top">
                    <span className="compact-card__route">
                      {s.originCity} ➔ {s.destinationCity}
                    </span>
                    <span className={`badge-vehicle badge-vehicle--${s.maxVehicleType}`}>
                      {s.maxVehicleType === "BICYCLE" ? "🚲 Até 5kg" : s.maxVehicleType === "MOTORCYCLE" ? "🏍️ Até 20kg" : "🚗 Até 20kg"}
                    </span>
                  </div>

                  <h2 className="compact-card__title">{s.title}</h2>

                  <div className="compact-card__meta">
                    <span>⚖️ {(s.weightGrams / 1000).toFixed(1)} kg</span>
                    <span>📍 {s.originNeighborhood}</span>
                    <span>⏱️ {s.deadlineDate}</span>
                  </div>
                </div>

                <div className="compact-card__bottom">
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--color-muted)", display: "block" }}>Valor sugerido</span>
                    <span className="compact-card__price">
                      R$ {(s.suggestedPriceCents / 100).toFixed(2).replace(".", ",")}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedItem(s)}
                    className="compact-card__btn"
                    title="Ver detalhes da encomenda"
                  >
                    Ver detalhes ➔
                  </button>
                </div>
              </article>
            ))}

          {(activeTab === "ALL" || activeTab === "TRIPS") &&
            filteredTrips.map((t) => (
              <article key={t.id} className="compact-card">
                <div>
                  <div className="compact-card__top">
                    <span className="compact-card__route">
                      {t.originCity} ➔ {t.destinationCity}
                    </span>
                    <span className={`badge-vehicle badge-vehicle--${t.vehicleType}`}>
                      {t.vehicleType === "BICYCLE" ? "🚲 Até 5kg" : t.vehicleType === "MOTORCYCLE" ? "🏍️ Até 20kg" : "🚗 Até 20kg"}
                    </span>
                  </div>

                  <h2 className="compact-card__title">
                    {t.carrierName} ({t.vehicleModel})
                  </h2>

                  <div className="compact-card__meta">
                    <span>📅 {t.departureDate} às {t.departureTime}</span>
                    <span>📦 {(t.availableCapacityGrams / 1000).toFixed(1)} kg livres</span>
                  </div>
                </div>

                <div className="compact-card__bottom">
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--color-muted)", display: "block" }}>Tarifa por quilo</span>
                    <span className="compact-card__price" style={{ color: "var(--color-primary)" }}>
                      R$ {(t.suggestedPricePerKgCents / 100).toFixed(2).replace(".", ",")}/kg
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedItem(t)}
                    className="compact-card__btn"
                    title="Ver detalhes da viagem"
                  >
                    Enviar carga ➔
                  </button>
                </div>
              </article>
            ))}
        </div>
      )}

      {/* Modal / Drawer com Detalhes Aprofundados */}
      {selectedItem && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(16, 33, 58, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px"
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "580px",
              width: "100%",
              maxHeight: "92vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(16, 33, 58, 0.35)",
              border: "1px solid var(--color-border)",
              padding: "24px"
            }}
          >
            {/* Header do Modal */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {"photoIcon" in selectedItem && (
                  <span style={{ fontSize: "32px" }}>{selectedItem.photoIcon}</span>
                )}
                <div>
                  <h2 style={{ fontSize: "20px", fontWeight: 800, margin: 0, color: "var(--color-brand-deep-navy)" }}>
                    {"title" in selectedItem ? selectedItem.title : `Rota de ${selectedItem.carrierName}`}
                  </h2>
                  <span style={{ fontSize: "12px", color: "var(--color-muted)" }}>
                    {"category" in selectedItem ? `Categoria: ${CATEGORY_LABELS[selectedItem.category]?.label || "Geral"}` : `Veículo: ${selectedItem.vehicleModel}`}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="btn btn--outline"
                style={{ padding: "6px 12px", fontSize: "14px", borderRadius: "var(--radius-full)" }}
                aria-label="Fechar Detalhes"
              >
                ✕
              </button>
            </div>

            {/* Rota com Detalhes de Bairro */}
            <div className="route-path-container" style={{ margin: "12px 0 16px 0", padding: "12px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="route-dot route-dot--origin" />
                <div>
                  <div className="route-text">{selectedItem.originCity}</div>
                  {"originNeighborhood" in selectedItem && (
                    <div className="route-neighborhood">{selectedItem.originNeighborhood}</div>
                  )}
                </div>
              </div>

              <div className="route-line" />

              <div style={{ display: "flex", alignItems: "center", gap: "8px", textAlign: "right" }}>
                <div>
                  <div className="route-text">{selectedItem.destinationCity}</div>
                  {"destinationNeighborhood" in selectedItem && (
                    <div className="route-neighborhood">{selectedItem.destinationNeighborhood}</div>
                  )}
                </div>
                <span className="route-dot route-dot--destination" />
              </div>
            </div>

            {/* Descrição */}
            {"description" in selectedItem && (
              <p style={{ fontSize: "14px", color: "var(--color-text)", lineHeight: 1.5, marginBottom: "16px" }}>
                {selectedItem.description}
              </p>
            )}

            {/* Dimensões Físicas e Cuidados Especiais */}
            {"dimensions" in selectedItem && (
              <div
                style={{
                  backgroundColor: "#F8FAFC",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "14px",
                  marginBottom: "16px"
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-brand-deep-navy)", marginBottom: "8px" }}>
                  Dimensões e Restrições de Manuseio:
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", textAlign: "center", marginBottom: "8px" }}>
                  <div style={{ background: "#FFFFFF", padding: "6px", borderRadius: "4px", border: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: "11px", color: "var(--color-muted)" }}>Peso Real</div>
                    <strong style={{ fontSize: "13px" }}>{(selectedItem.weightGrams / 1000).toFixed(1)} kg</strong>
                  </div>
                  <div style={{ background: "#FFFFFF", padding: "6px", borderRadius: "4px", border: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: "11px", color: "var(--color-muted)" }}>Dimensões</div>
                    <strong style={{ fontSize: "13px" }}>{selectedItem.dimensions.lengthCm}×{selectedItem.dimensions.widthCm}×{selectedItem.dimensions.heightCm} cm</strong>
                  </div>
                  <div style={{ background: "#FFFFFF", padding: "6px", borderRadius: "4px", border: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: "11px", color: "var(--color-muted)" }}>Volume</div>
                    <strong style={{ fontSize: "13px" }}>
                      {((selectedItem.dimensions.lengthCm * selectedItem.dimensions.widthCm * selectedItem.dimensions.heightCm) / 1000).toFixed(1)} L
                    </strong>
                  </div>
                </div>

                {selectedItem.specialCare.length > 0 && (
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                    {selectedItem.specialCare.map((c, i) => (
                      <span key={i} className="chip-tag chip-tag--care" style={{ fontSize: "11px" }}>
                        ⚠️ {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Split Financeiro Transparente (13% Plano Free) */}
            {"suggestedPriceCents" in selectedItem && (
              <div
                style={{
                  backgroundColor: "#FFFFFF",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "14px",
                  marginBottom: "16px"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", marginBottom: "4px" }}>
                  <span style={{ color: "var(--color-muted)" }}>Valor do Frete Proposto:</span>
                  <strong style={{ color: "var(--color-brand-deep-navy)" }}>R$ {(selectedItem.suggestedPriceCents / 100).toFixed(2).replace(".", ",")}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "var(--color-muted)", marginBottom: "4px" }}>
                  <span>Comissão Topic Log (13% Plano Free):</span>
                  <span>- R$ {((selectedItem.suggestedPriceCents * 0.13) / 100).toFixed(2).replace(".", ",")}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", borderTop: "1px dashed var(--color-border)", paddingTop: "6px", color: "var(--color-success)", fontWeight: 700 }}>
                  <span>Repasse Líquido ao Transportador:</span>
                  <span>R$ {((selectedItem.suggestedPriceCents * 0.87) / 100).toFixed(2).replace(".", ",")}</span>
                </div>
              </div>
            )}

            {/* Bloco de Compatibilidade Inteligente / Matching (PR-03) */}
            <div
              style={{
                backgroundColor: "#F0FDF4",
                border: "1px solid #BBF7D0",
                borderRadius: "var(--radius-sm)",
                padding: "14px",
                marginBottom: "16px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#166534" }}>
                  🧭 Compatibilidade de Rota e Capacidade (PR-03):
                </span>
                {isLoadingMatches ? (
                  <span style={{ fontSize: "11px", color: "var(--color-muted)" }}>Calculando...</span>
                ) : (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      backgroundColor: matchingResults.length > 0 ? "#DCFCE7" : "#F1F5F9",
                      color: matchingResults.length > 0 ? "#15803D" : "#64748B",
                      padding: "2px 8px",
                      borderRadius: "var(--radius-full)"
                    }}
                  >
                    {matchingResults.length > 0 ? `${matchingResults.length} match(es) aprovado(s)` : "Nenhum match ativo"}
                  </span>
                )}
              </div>

              {isLoadingMatches ? (
                <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>
                  Consultando rotas, modais e paradas intermediárias...
                </div>
              ) : matchingResults.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {matchingResults.map((m, idx) => (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: "#FFFFFF",
                        border: "1px solid #86EFAC",
                        borderRadius: "var(--radius-sm)",
                        padding: "10px 12px",
                        fontSize: "12px"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <strong style={{ color: "#166534" }}>
                          {"weightGrams" in selectedItem ? `🚗 ${m.carrierName}` : `📦 ${m.shipmentTitle}`}
                        </strong>
                        <span
                          style={{
                            fontWeight: 800,
                            color: "#15803D",
                            backgroundColor: "#DCFCE7",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "11px"
                          }}
                        >
                          {m.matchScore}% Compatível
                        </span>
                      </div>
                      <div style={{ color: "var(--color-text)", fontSize: "12px", marginBottom: "4px" }}>
                        {m.reasonDescription}
                      </div>
                      <div style={{ display: "flex", gap: "10px", color: "var(--color-muted)", fontSize: "11px", flexWrap: "wrap" }}>
                        <span>📍 Coleta: {m.pickupPoint}</span>
                        <span>🏁 Entrega: {m.deliveryPoint}</span>
                        <span>📏 ~{m.estimatedDistanceKm} km</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: "12px", color: "#166534", lineHeight: 1.4 }}>
                  Nenhuma rota ativa com sentido coincidente no momento. Novas oportunidades são calculadas em tempo real conforme transportadores cadastram rotas.
                </div>
              )}
            </div>

            {/* Alerta de Elegibilidade Bilateral (D05) */}
            <div
              style={{
                backgroundColor: "#EFF6FF",
                border: "1px solid #BFDBFE",
                borderRadius: "var(--radius-sm)",
                padding: "12px",
                marginBottom: "20px"
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#1E40AF", marginBottom: "2px" }}>
                🛡️ REGRA VINCULANTE DE ELEGIBILIDADE BILATERAL (D05):
              </div>
              <div style={{ fontSize: "12px", color: "#1E3A8A", lineHeight: 1.4 }}>
                Navegação e negociação preliminar são livres. A contratação definitiva e liberação de pagamento exigem verificação bilateral de KYC (remetente e transportador aprovados).
              </div>
            </div>

            {/* Ações do Modal */}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="btn btn--outline"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={isSendingProposal}
                onClick={async () => {
                  if (!selectedItem) return;
                  setIsSendingProposal(true);
                  try {
                    const isShipment = "weightGrams" in selectedItem;
                    const shipmentId = isShipment ? selectedItem.id : "e0000001-0000-0000-0000-000000000001";
                    const amountCents = isShipment ? selectedItem.suggestedPriceCents : 4200;
                    const tripId = !isShipment ? selectedItem.id : undefined;

                    let carrierToken: string | undefined;
                    const tokenRes = await getSandboxTokenApi("CARRIER");
                    if (tokenRes.ok && tokenRes.data) {
                      carrierToken = tokenRes.data.accessToken;
                    }

                    const res = await createProposalApi({
                      shipmentId,
                      tripId,
                      amountCents,
                      notes: "Proposta formal enviada a partir do Feed de Oportunidades."
                    }, carrierToken);

                    if (res.ok && res.data) {
                      setSelectedItem(null);
                      router.push("/propostas");
                    } else {
                      alert(res.problem?.detail || "Falha ao enviar proposta.");
                    }
                  } catch {
                    alert("Erro ao enviar proposta. Verifique a conexão com o backend.");
                  } finally {
                    setIsSendingProposal(false);
                  }
                }}
                className="btn btn--primary"
              >
                {isSendingProposal
                  ? "Enviando..."
                  : "weightGrams" in selectedItem
                  ? "Propor Transporte ➔"
                  : "Solicitar Envio ➔"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function FeedPage(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <main className="container" style={{ padding: "48px 0", textAlign: "center" }}>
          <p style={{ color: "var(--color-muted)" }}>Carregando oportunidades...</p>
        </main>
      }
    >
      <FeedContent />
    </Suspense>
  );
}
