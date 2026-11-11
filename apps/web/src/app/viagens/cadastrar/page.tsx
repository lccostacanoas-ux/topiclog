"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "../../../lib/auth-context";
import type { VehicleTypeCode, CreateTripPayload } from "../../../lib/types";
import { createTripApi } from "../../../lib/api-client";
import { CITY_CENTROIDS } from "../../../components/BrazilianAddressInput";

// Carregamento dinâmico do mapa de rotas TopicLog (apenas client-side sem SSR)
const TopicLogRouteMap = dynamic(
  () => import("../../../components/TopicLogRouteMap"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: "320px",
          backgroundColor: "#F8FAFC",
          borderRadius: "14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#64748B",
          fontWeight: 600,
          border: "1.5px dashed #CBD5E1"
        }}
      >
        <span>🗺️ Carregando visualização do mapa da rota...</span>
      </div>
    )
  }
);

interface IntermediateStopItem {
  name: string;
  ibgeCode?: string;
  stateUf?: string;
}

const KNOWN_MUNICIPALITIES: Record<string, { name: string; ibgeCode: string; stateUf: string }> = {
  "JOAO MONLEVADE": { name: "João Monlevade", ibgeCode: "3136207", stateUf: "MG" },
  "BELO HORIZONTE": { name: "Belo Horizonte", ibgeCode: "3106200", stateUf: "MG" },
  "BARAO DE COCAIS": { name: "Barão de Cocais", ibgeCode: "3105400", stateUf: "MG" },
  "CAETE": { name: "Caeté", ibgeCode: "3110004", stateUf: "MG" },
  "NOVA UNIAO": { name: "Nova União", ibgeCode: "3144805", stateUf: "MG" },
  "SABARA": { name: "Sabará", ibgeCode: "3156700", stateUf: "MG" },
  "SANTA BARBARA": { name: "Santa Bárbara", ibgeCode: "3157203", stateUf: "MG" },
  "IPATINGA": { name: "Ipatinga", ibgeCode: "3131307", stateUf: "MG" },
  "CORONEL FABRICIANO": { name: "Coronel Fabriciano", ibgeCode: "3119401", stateUf: "MG" },
  "TIMOTEO": { name: "Timóteo", ibgeCode: "3168705", stateUf: "MG" },
  "ITABIRA": { name: "Itabira", ibgeCode: "3131703", stateUf: "MG" },
  "NOVA ERA": { name: "Nova Era", ibgeCode: "3144706", stateUf: "MG" },
  "OURO PRETO": { name: "Ouro Preto", ibgeCode: "3146107", stateUf: "MG" },
  "MARIANA": { name: "Mariana", ibgeCode: "3140001", stateUf: "MG" },
  "CONTAGEM": { name: "Contagem", ibgeCode: "3118601", stateUf: "MG" },
  "BETIM": { name: "Betim", ibgeCode: "3106705", stateUf: "MG" },
  "NOVA LIMA": { name: "Nova Lima", ibgeCode: "3144607", stateUf: "MG" },
  "SETE LAGOAS": { name: "Sete Lagoas", ibgeCode: "3167202", stateUf: "MG" },
  "DIVINOPOLIS": { name: "Divinópolis", ibgeCode: "3122306", stateUf: "MG" },
  "JUIZ DE FORA": { name: "Juiz de Fora", ibgeCode: "3136702", stateUf: "MG" },
  "UBERLANDIA": { name: "Uberlândia", ibgeCode: "3170206", stateUf: "MG" },
  "MONTES CLAROS": { name: "Montes Claros", ibgeCode: "3143302", stateUf: "MG" },
  "GOVERNADOR VALADARES": { name: "Governador Valadares", ibgeCode: "3127701", stateUf: "MG" },
  "POUSO ALEGRE": { name: "Pouso Alegre", ibgeCode: "3152501", stateUf: "MG" },
  "SAO PAULO": { name: "São Paulo", ibgeCode: "3550308", stateUf: "SP" },
  "CAMPINAS": { name: "Campinas", ibgeCode: "3509502", stateUf: "SP" },
  "SANTOS": { name: "Santos", ibgeCode: "3548500", stateUf: "SP" },
  "RIBEIRAO PRETO": { name: "Ribeirão Preto", ibgeCode: "3543402", stateUf: "SP" },
  "SAO JOSE DOS CAMPOS": { name: "São José dos Campos", ibgeCode: "3549904", stateUf: "SP" },
  "RIO DE JANEIRO": { name: "Rio de Janeiro", ibgeCode: "3304557", stateUf: "RJ" },
  "NITEROI": { name: "Niterói", ibgeCode: "3303302", stateUf: "RJ" },
  "PETROPOLIS": { name: "Petrópolis", ibgeCode: "3303906", stateUf: "RJ" },
  "CURITIBA": { name: "Curitiba", ibgeCode: "4106902", stateUf: "PR" },
  "LONDRINA": { name: "Londrina", ibgeCode: "4113700", stateUf: "PR" },
  "MARINGA": { name: "Maringá", ibgeCode: "4115200", stateUf: "PR" },
  "FOZ DO IGUACU": { name: "Foz do Iguaçu", ibgeCode: "4108304", stateUf: "PR" },
  "CASCAVEL": { name: "Cascavel", ibgeCode: "4104808", stateUf: "PR" },
  "PORTO ALEGRE": { name: "Porto Alegre", ibgeCode: "4314902", stateUf: "RS" },
  "CAXIAS DO SUL": { name: "Caxias do Sul", ibgeCode: "4305108", stateUf: "RS" },
  "FLORIANOPOLIS": { name: "Florianópolis", ibgeCode: "4205407", stateUf: "SC" },
  "JOINVILLE": { name: "Joinville", ibgeCode: "4209102", stateUf: "SC" },
  "BLUMENAU": { name: "Blumenau", ibgeCode: "4202404", stateUf: "SC" },
  "BRASILIA": { name: "Brasília", ibgeCode: "5300108", stateUf: "DF" },
  "GOIANIA": { name: "Goiânia", ibgeCode: "5208707", stateUf: "GO" },
  "ANAPOLIS": { name: "Anápolis", ibgeCode: "5201108", stateUf: "GO" },
  "SALVADOR": { name: "Salvador", ibgeCode: "2927408", stateUf: "BA" },
  "FEIRA DE SANTANA": { name: "Feira de Santana", ibgeCode: "2910800", stateUf: "BA" },
  "VITORIA": { name: "Vitória", ibgeCode: "3205309", stateUf: "ES" },
  "VILA VELHA": { name: "Vila Velha", ibgeCode: "3205200", stateUf: "ES" },
  "RECIFE": { name: "Recife", ibgeCode: "2611606", stateUf: "PE" },
  "FORTALEZA": { name: "Fortaleza", ibgeCode: "2304400", stateUf: "CE" },
  "MANAUS": { name: "Manaus", ibgeCode: "1302603", stateUf: "AM" },
  "BELEM": { name: "Belém", ibgeCode: "1501402", stateUf: "PA" },
  "CUIABA": { name: "Cuiabá", ibgeCode: "5103403", stateUf: "MT" },
  "CAMPO GRANDE": { name: "Campo Grande", ibgeCode: "5002704", stateUf: "MS" }
};

// Catálogo com cidades do Brasil para sugestão rápida (o usuário pode digitar qualquer município)
const BRAZIL_POPULAR_CITIES = [
  "Belo Horizonte - MG", "João Monlevade - MG", "Contagem - MG", "Betim - MG", "Nova Lima - MG",
  "Ipatinga - MG", "Coronel Fabriciano - MG", "Timóteo - MG", "Itabira - MG", "Nova Era - MG",
  "Ouro Preto - MG", "Mariana - MG", "Barão de Cocais - MG", "Caeté - MG", "Sabará - MG",
  "Santa Bárbara - MG", "Uberlândia - MG", "Juiz de Fora - MG", "Montes Claros - MG", "Sete Lagoas - MG",
  "Divinópolis - MG", "Governador Valadares - MG", "Poços de Caldas - MG", "Pouso Alegre - MG",
  "São Paulo - SP", "Campinas - SP", "Guarulhos - SP", "São Bernardo do Campo - SP", "Santos - SP",
  "Ribeirão Preto - SP", "Sorocaba - SP", "São José dos Campos - SP", "Jundiaí - SP", "Piracicaba - SP",
  "Rio de Janeiro - RJ", "Niterói - RJ", "Petrópolis - RJ", "Duque de Caxias - RJ", "Volta Redonda - RJ",
  "Curitiba - PR", "Londrina - PR", "Maringá - PR", "Foz do Iguaçu - PR", "Cascavel - PR",
  "Porto Alegre - RS", "Caxias do Sul - RS", "Canoas - RS", "Pelotas - RS",
  "Florianópolis - SC", "Joinville - SC", "Blumenau - SC", "Itajaí - SC", "Balneário Camboriú - SC",
  "Brasília - DF", "Goiânia - GO", "Anápolis - GO", "Rio Verde - GO",
  "Salvador - BA", "Feira de Santana - BA", "Vitória da Conquista - BA",
  "Vitória - ES", "Vila Velha - ES", "Serra - ES", "Cachoeiro de Itapemirim - ES",
  "Recife - PE", "Caruaru - PE", "Petrolina - PE",
  "Fortaleza - CE", "Juazeiro do Norte - CE", "Sobral - CE",
  "Manaus - AM", "Belém - PA", "Cuiabá - MT", "Campo Grande - MS",
  "Natal - RN", "João Pessoa - PB", "Maceió - AL", "Aracaju - SE", "Teresina - PI", "São Luís - MA",
  "Palmas - TO", "Porto Velho - RO", "Rio Branco - AC", "Boa Vista - RR", "Macapá - AP"
];

function normalizeCityKey(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

function findIbgeCode(cityName: string): string | undefined {
  const firstPart = (cityName.split("-")[0] || "").trim();
  const key = normalizeCityKey(firstPart);
  return KNOWN_MUNICIPALITIES[key]?.ibgeCode;
}

// Resolução de coordenadas geográficas de qualquer cidade brasileira
async function resolveCityCoordinates(cityName: string): Promise<{ lat: number; lon: number } | null> {
  if (!cityName || !cityName.trim()) return null;
  const cleanName = (cityName.split("-")[0] || "").trim();
  const norm = cleanName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1. Tentar catálogo estático de centróides
  if (CITY_CENTROIDS[norm]) {
    return { lat: CITY_CENTROIDS[norm].lat, lon: CITY_CENTROIDS[norm].lon };
  }

  // 2. Tentar catálogo de municípios conhecidos
  const knownKey = normalizeCityKey(cleanName);
  if (KNOWN_MUNICIPALITIES[knownKey]) {
    const knownNorm = KNOWN_MUNICIPALITIES[knownKey].name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (CITY_CENTROIDS[knownNorm]) {
      return { lat: CITY_CENTROIDS[knownNorm].lat, lon: CITY_CENTROIDS[knownNorm].lon };
    }
  }

  // 3. Busca online dinâmica via Photon OpenStreetMap (cobertura total nacional de 5.570 municípios)
  try {
    const query = encodeURIComponent(`${cleanName}, Brasil`);
    const res = await fetch(`https://photon.komoot.io/api/?q=${query}&limit=1`);
    if (res.ok) {
      const data = await res.json();
      if (data?.features?.[0]?.geometry?.coordinates) {
        const [lon, lat] = data.features[0].geometry.coordinates;
        return { lat, lon };
      }
    }
  } catch {
    // Fallback silencioso caso offline
  }

  return null;
}

function getContextualSuggestions(orig: string, dest: string): IntermediateStopItem[] {
  const o = normalizeCityKey(orig);
  const d = normalizeCityKey(dest);

  if ((o.includes("MONLEVADE") && d.includes("BELO HORIZONTE")) ||
      (o.includes("BELO HORIZONTE") && d.includes("MONLEVADE"))) {
    return [
      { name: "Barão de Cocais", ibgeCode: "3105400" },
      { name: "Caeté", ibgeCode: "3110004" },
      { name: "Nova União", ibgeCode: "3144805" },
      { name: "Sabará", ibgeCode: "3156700" },
      { name: "Santa Bárbara", ibgeCode: "3157203" }
    ];
  }
  if ((o.includes("MONLEVADE") && d.includes("IPATINGA")) ||
      (o.includes("IPATINGA") && d.includes("MONLEVADE"))) {
    return [
      { name: "Nova Era", ibgeCode: "3144706" },
      { name: "Coronel Fabriciano", ibgeCode: "3119401" },
      { name: "Timóteo", ibgeCode: "3168705" }
    ];
  }
  if (o.includes("BELO HORIZONTE") && d.includes("SAO PAULO")) {
    return [
      { name: "Betim", ibgeCode: "3106705" },
      { name: "Pouso Alegre", ibgeCode: "3152501" },
      { name: "Campinas", ibgeCode: "3509502" }
    ];
  }
  return [
    { name: "Contagem", ibgeCode: "3118601" },
    { name: "Betim", ibgeCode: "3106705" },
    { name: "Itabira", ibgeCode: "3131703" },
    { name: "Ouro Preto", ibgeCode: "3146107" }
  ];
}

export default function CadastrarViagemPage(): React.JSX.Element {
  const router = useRouter();
  const { user, token, isAuthenticated, isLoading } = useAuth();
  const isCarrier = Boolean(user?.roles?.includes("CARRIER"));
  const isSenderOnly = Boolean(user && user.roles?.includes("SENDER") && !user.roles?.includes("CARRIER"));
  const isSubmittingRef = useRef(false);

  const [vehicleType, setVehicleType] = useState<VehicleTypeCode>("CAR");
  const [vehicleModel, setVehicleModel] = useState("");
  const [originCity, setOriginCity] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [stopsList, setStopsList] = useState<IntermediateStopItem[]>([]);
  const [newStopInput, setNewStopInput] = useState("");

  // Data padrão pré-preenchida com hoje
  const todayFormatted = (() => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  })();

  const [departureDate, setDepartureDate] = useState(todayFormatted);
  const [departureTime, setDepartureTime] = useState("08:00");
  const [availableKg, setAvailableKg] = useState("");
  const [flexiblePickup, setFlexiblePickup] = useState(true);
  const [tripPriceReais, setTripPriceReais] = useState("50,00");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Coordenadas geográficas para os 2 pontos exclusivos do mapa (Ponto A e Ponto B)
  const [originCoords, setOriginCoords] = useState<{ lat: number; lon: number } | null>({
    lat: -19.9167,
    lon: -43.9345
  });
  const [destCoords, setDestCoords] = useState<{ lat: number; lon: number } | null>({
    lat: -19.8094,
    lon: -43.1733
  });
  const [calculatedDistanceKm, setCalculatedDistanceKm] = useState<number | null>(null);
  const [calculatedDurationMins, setCalculatedDurationMins] = useState<number | null>(null);

  // Atualização reativa de coordenadas ao alterar cidades de Origem e Destino
  const updateOriginCoords = useCallback(async (city: string) => {
    const coords = await resolveCityCoordinates(city);
    if (coords) setOriginCoords(coords);
  }, []);

  const updateDestCoords = useCallback(async (city: string) => {
    const coords = await resolveCityCoordinates(city);
    if (coords) setDestCoords(coords);
  }, []);

  useEffect(() => {
    updateOriginCoords(originCity);
  }, [originCity, updateOriginCoords]);

  useEffect(() => {
    updateDestCoords(destinationCity);
  }, [destinationCity, updateDestCoords]);

  const parsedCapacityKg = parseFloat(availableKg.replace(",", "."));

  const handleAddStop = (cityToAdd?: string) => {
    const raw = (cityToAdd ?? newStopInput).trim();
    if (!raw) return;

    const ibge = findIbgeCode(raw);
    const existing = stopsList.some(
      (s) => normalizeCityKey(s.name) === normalizeCityKey(raw)
    );

    if (!existing) {
      setStopsList((prev) => [
        ...prev,
        {
          name: raw,
          ibgeCode: ibge,
          stateUf: "MG"
        }
      ]);
    }
    if (!cityToAdd) {
      setNewStopInput("");
    }
  };

  const handleRemoveStop = (stopName: string) => {
    setStopsList((prev) => prev.filter((s) => s.name !== stopName));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) {
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    if (isSenderOnly) {
      setErrorMsg("Sua conta é de Remetente. Apenas Transportadores parceiros podem cadastrar viagens e rotas.");
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const cleanOrigin = originCity.trim().replace(/\s*-\s*[A-Z]{2}$/, "");
    const cleanDest = destinationCity.trim().replace(/\s*-\s*[A-Z]{2}$/, "");

    if (!cleanOrigin) {
      setErrorMsg("Informe a cidade de partida (Origem) da viagem.");
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (!cleanDest) {
      setErrorMsg("Informe a cidade de destino (Chegada) da viagem.");
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (!departureDate.trim()) {
      setErrorMsg("Informe a data prevista de saída da viagem.");
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const cleanPrice = parseFloat(tripPriceReais.replace(",", ".").replace(/[^0-9.]/g, ""));
    if (isNaN(cleanPrice) || cleanPrice <= 0) {
      setErrorMsg("Informe o valor do frete da viagem em Reais.");
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const resolvedModel = vehicleModel.trim() || (vehicleType === "CAR" ? "Carro de Passeio" : vehicleType === "MOTORCYCLE" ? "Motocicleta" : "Bicicleta");
    const resolvedKg = !isNaN(parsedCapacityKg) && parsedCapacityKg > 0 ? parsedCapacityKg : (vehicleType === "CAR" ? 50 : vehicleType === "MOTORCYCLE" ? 20 : 10);

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const tripPriceCents = Math.round(cleanPrice * 100);
    const stringStops = stopsList.map((s) => s.name);

    try {
      const payload: CreateTripPayload = {
        vehicleType,
        vehicleModel: resolvedModel,
        originCity: cleanOrigin,
        destinationCity: cleanDest,
        intermediateStops: stringStops,
        departureDate: departureDate.trim(),
        departureTime: departureTime.trim() || "08:00",
        availableCapacityGrams: Math.round(resolvedKg * 1000),
        flexiblePickup,
        suggestedPricePerKgCents: tripPriceCents
      };

      const result = await createTripApi(payload, token ?? undefined);

      if (!result.ok) {
        const errorDetail = result.problem?.detail || result.problem?.title || "Erro ao registrar viagem na API.";
        setErrorMsg(errorDetail);
        setIsSubmitting(false);
        isSubmittingRef.current = false;
        if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      setSuccessMsg("Viagem publicada com sucesso! Sua rota já está disponível no feed da Topic Log.");
      setShowSuccessModal(true);
      setTimeout(() => {
        router.push("/viagens");
      }, 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha inesperada ao registrar viagem.";
      setErrorMsg(msg);
      setIsSubmitting(false);
      isSubmittingRef.current = false;
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  if (!isLoading && !isAuthenticated) {
    return (
      <main className="container" style={{ paddingTop: "40px", paddingBottom: "60px", maxWidth: "600px" }}>
        <div className="card" style={{ textAlign: "center", padding: "40px 24px", borderRadius: "16px", boxShadow: "var(--shadow-md)" }}>
          <div style={{ fontSize: "52px", marginBottom: "16px" }}>🔒</div>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Autenticação Necessária
          </span>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--color-brand-deep-navy)", margin: "8px 0 12px 0" }}>
            Acesse sua conta para cadastrar viagens
          </h1>
          <p style={{ color: "var(--color-muted)", fontSize: "14px", lineHeight: "1.5", marginBottom: "28px" }}>
            Para disponibilizar viagens, rotas e capacidade de transporte no mural da Topic Log, você precisa estar conectado à sua conta de Transportador com veículo e CNH válidos.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Link
              href="/entrar"
              className="btn btn--primary"
              style={{ padding: "12px 20px", fontSize: "14px", fontWeight: 700, textDecoration: "none" }}
            >
              Fazer Login como Transportador
            </Link>
            <Link
              href="/cadastro"
              className="btn btn--outline"
              style={{ padding: "12px 20px", fontSize: "14px", fontWeight: 700, textDecoration: "none" }}
            >
              Criar Conta Gratuita de Transportador
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!isLoading && isSenderOnly) {
    return (
      <main className="container" style={{ paddingTop: "40px", paddingBottom: "60px", maxWidth: "680px" }}>
        <div className="card" style={{ textAlign: "center", padding: "48px 28px", borderRadius: "18px", boxShadow: "var(--shadow-md)" }}>
          <div style={{ fontSize: "56px", marginBottom: "16px" }}>🚫</div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--color-brand-deep-navy)", marginBottom: "12px" }}>
            Cadastro de Viagens Restrito a Transportadores
          </h1>
          <div
            style={{
              backgroundColor: "#EFF6FF",
              border: "1.5px solid #BFDBFE",
              borderRadius: "12px",
              padding: "16px 20px",
              marginBottom: "24px",
              textAlign: "left"
            }}
          >
            <div style={{ fontSize: "14px", color: "#1E40AF", lineHeight: "1.6" }}>
              Olá, <strong>{user?.displayName || "Remetente"}</strong>! Sua conta está registrada com o papel de <strong>Remetente</strong>.
              <br /><br />
              📌 <strong>Regra da Plataforma TopicLog:</strong>
              <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
                <li><strong>Transportadores:</strong> Cadastram rotas e viagens com espaço livre no veículo.</li>
                <li><strong>Remetentes:</strong> Publicam encomendas e <strong>contratam viagens</strong> solicitando o envio diretamente aos motoristas.</li>
              </ul>
            </div>
          </div>
          <p style={{ fontSize: "14px", color: "#64748B", marginBottom: "28px", lineHeight: "1.5" }}>
            Você pode consultar todas as viagens no Mural e solicitar o envio da sua carga para qualquer rota disponível!
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/viagens"
              className="btn btn--primary"
              style={{ padding: "12px 24px", fontSize: "14px", fontWeight: 700 }}
            >
              🗺️ Consultar Mural de Viagens
            </Link>
            <Link
              href="/encomendas/publicar"
              className="btn btn--outline"
              style={{ padding: "12px 24px", fontSize: "14px", fontWeight: 700 }}
            >
              📦 Publicar Nova Encomenda
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container" style={{ paddingTop: "28px", paddingBottom: "56px", maxWidth: "840px" }}>
      {/* Datalist com catálogo nacional de cidades brasileiras */}
      <datalist id="brazil-cities-list">
        {BRAZIL_POPULAR_CITIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div style={{ marginBottom: "24px" }}>
        <Link href="/feed" style={{ fontSize: "14px", color: "var(--color-primary)", textDecoration: "none", fontWeight: 600 }}>
          ← Voltar para o Feed de Oportunidades
        </Link>
        <h1 style={{ fontSize: "28px", fontWeight: 800, marginTop: "10px", marginBottom: "6px", color: "var(--color-brand-deep-navy)" }}>
          Cadastrar Viagem / Rota com Espaço Livre
        </h1>
        <p style={{ color: "var(--color-muted)", margin: 0, fontSize: "15px" }}>
          Monetize seu deslocamento habitual em qualquer cidade ou estado do Brasil aproveitando o bagageiro, baú ou porta-malas do seu veículo.
        </p>
      </div>

      {errorMsg && (
        <div className="alert alert--danger" role="alert" style={{ marginBottom: "20px" }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="alert alert--success" role="status" style={{ marginBottom: "20px" }}>
          ✅ {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="card" style={{ padding: "28px", boxShadow: "var(--shadow-md)" }}>
        {/* Bloco 1: Modal de Transporte & Capacidade */}
        <fieldset style={{ border: "none", padding: 0, margin: "0 0 28px 0" }}>
          <legend style={{ fontSize: "17px", fontWeight: 700, marginBottom: "16px", borderBottom: "1px solid var(--color-border)", width: "100%", paddingBottom: "8px", color: "var(--color-brand-deep-navy)" }}>
            1. Modal de Transporte & Capacidade Disponível
          </legend>

          <div
            style={{
              backgroundColor: "#F0FDF4",
              border: "1.5px solid #BBF7D0",
              borderRadius: "10px",
              padding: "12px 16px",
              marginBottom: "18px",
              display: "flex",
              alignItems: "center",
              gap: "12px"
            }}
          >
            <span style={{ fontSize: "24px", flexShrink: 0 }}>📦</span>
            <div style={{ fontSize: "13px", color: "#166534", lineHeight: "1.4" }}>
              <strong>Volumes Ilimitados & Peso Livre:</strong> Como transportador parceiro, você define quantos volumes levar conforme o espaço disponível no seu veículo.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ marginBottom: "8px" }}>
              Selecione o seu modal para esta rota:
            </label>
            <div className="vehicle-selector-grid">
              <div
                className={`vehicle-card-option ${vehicleType === "CAR" ? "vehicle-card-option--selected" : ""}`}
                onClick={() => setVehicleType("CAR")}
                role="button"
                tabIndex={0}
              >
                <div>
                  <span style={{ fontSize: "28px" }}>🚗</span>
                  <div style={{ fontWeight: 700, fontSize: "15px", marginTop: "4px" }}>Carro de Passeio</div>
                  <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>Porta-malas / Utilitário</div>
                </div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#1E40AF", marginTop: "8px" }}>
                  Volumes Ilimitados • Padrão 50 kg
                </div>
              </div>

              <div
                className={`vehicle-card-option ${vehicleType === "MOTORCYCLE" ? "vehicle-card-option--selected" : ""}`}
                onClick={() => setVehicleType("MOTORCYCLE")}
                role="button"
                tabIndex={0}
              >
                <div>
                  <span style={{ fontSize: "28px" }}>🏍️</span>
                  <div style={{ fontWeight: 700, fontSize: "15px", marginTop: "4px" }}>Motocicleta</div>
                  <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>Baú / Mochila Cargueira</div>
                </div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#92400E", marginTop: "8px" }}>
                  Múltiplos Volumes • Padrão 20 kg
                </div>
              </div>

              <div
                className={`vehicle-card-option ${vehicleType === "BICYCLE" ? "vehicle-card-option--selected" : ""}`}
                onClick={() => setVehicleType("BICYCLE")}
                role="button"
                tabIndex={0}
              >
                <div>
                  <span style={{ fontSize: "28px" }}>🚲</span>
                  <div style={{ fontWeight: 700, fontSize: "15px", marginTop: "4px" }}>Bicicleta</div>
                  <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>Alforjes e Mochilas</div>
                </div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#065F46", marginTop: "8px" }}>
                  Volumes Leves • Padrão 10 kg
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "12px" }}>
            <div className="form-group">
              <label htmlFor="trip-model" className="form-label">
                Modelo do Veículo (Opcional)
              </label>
              <input
                id="trip-model"
                type="text"
                placeholder="Ex: Fiat Strada, Hyundai HB20, Honda CG..."
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="trip-capacity" className="form-label">
                Capacidade Estimada para Cargas (kg)
              </label>
              <input
                id="trip-capacity"
                type="text"
                placeholder="Ex: 50 kg (Deixe em branco para o padrão)"
                value={availableKg}
                onChange={(e) => setAvailableKg(e.target.value)}
                className="form-control"
              />
              <span style={{ fontSize: "11px", color: "var(--color-muted)" }}>
                💡 Se deixar em branco, adotamos 50 kg para carro, 20 kg para moto ou 10 kg para bike.
              </span>
            </div>
          </div>
        </fieldset>

        {/* Bloco 2: Trajeto Nacional, Mapa Interativo e Paradas */}
        <fieldset style={{ border: "none", padding: 0, margin: "0 0 28px 0" }}>
          <legend style={{ fontSize: "17px", fontWeight: 700, marginBottom: "16px", borderBottom: "1px solid var(--color-border)", width: "100%", paddingBottom: "8px", color: "var(--color-brand-deep-navy)" }}>
            2. Trajeto da Viagem & Mapa da Rota (Cobertura Nacional)
          </legend>

          <p style={{ fontSize: "13px", color: "var(--color-muted)", marginTop: "-8px", marginBottom: "16px" }}>
            Você pode digitar qualquer município do Brasil ou escolher na lista de sugestões.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div className="form-group">
              <label htmlFor="trip-orig" className="form-label">
                Cidade de Partida (Origem - Ponto A) *
              </label>
              <input
                id="trip-orig"
                type="text"
                list="brazil-cities-list"
                placeholder="Digite ou escolha qualquer cidade (Ex: Belo Horizonte, Campinas, Salvador...)"
                value={originCity}
                onChange={(e) => setOriginCity(e.target.value)}
                className="form-control"
                autoComplete="off"
              />
            </div>

            <div className="form-group">
              <label htmlFor="trip-dest" className="form-label">
                Cidade de Chegada (Destino - Ponto B) *
              </label>
              <input
                id="trip-dest"
                type="text"
                list="brazil-cities-list"
                placeholder="Digite ou escolha qualquer cidade (Ex: João Monlevade, Rio de Janeiro, Curitiba...)"
                value={destinationCity}
                onChange={(e) => setDestinationCity(e.target.value)}
                className="form-control"
                autoComplete="off"
              />
            </div>
          </div>

          {/* =========================================================================
              MAPA INTERATIVO COM OS 2 PONTOS EXATOS (A e B) E TRAÇADO VIÁRIO REAL
              ========================================================================= */}
          <div style={{ marginTop: "8px", marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-brand-deep-navy)", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>🗺️</span>
                <span>Visualização da Rota no Mapa (Ponto A ➔ Ponto B)</span>
              </div>
              {calculatedDistanceKm !== null && calculatedDistanceKm > 0 && (
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    backgroundColor: "#EFF6FF",
                    color: "#1D4ED8",
                    padding: "3px 10px",
                    borderRadius: "6px",
                    border: "1px solid #BFDBFE"
                  }}
                >
                  🚗 ~{calculatedDistanceKm} km • ~{calculatedDurationMins ? (calculatedDurationMins >= 60 ? `${Math.floor(calculatedDurationMins / 60)}h ${calculatedDurationMins % 60}min` : `${calculatedDurationMins} min`) : ""}
                </span>
              )}
            </div>

            <TopicLogRouteMap
              origin={originCoords ? { lat: originCoords.lat, lon: originCoords.lon, label: "Ponto A (Origem)", address: originCity } : null}
              destination={destCoords ? { lat: destCoords.lat, lon: destCoords.lon, label: "Ponto B (Destino)", address: destinationCity } : null}
              onRouteCalculated={(km, mins) => {
                setCalculatedDistanceKm(km);
                setCalculatedDurationMins(mins);
              }}
              height="320px"
            />
          </div>

          {/* Paradas Intermediárias ao Longo da Rota */}
          <div className="form-group">
            <label className="form-label" style={{ marginBottom: "4px" }}>
              Paradas Intermediárias ao Longo da Rota (Opcional):
            </label>
            <span style={{ fontSize: "12px", color: "var(--color-muted)", display: "block", marginBottom: "8px" }}>
              Adicione cidades no caminho da sua rota para receber encomendas intermediárias.
            </span>

            <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
              <input
                type="text"
                list="brazil-cities-list"
                placeholder="Ex: Barão de Cocais, Caeté, Betim, Campinas..."
                value={newStopInput}
                onChange={(e) => setNewStopInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddStop();
                  }
                }}
                className="form-control"
                style={{ maxWidth: "380px", flex: "1 1 240px" }}
              />
              <button
                type="button"
                onClick={() => handleAddStop()}
                className="btn btn--outline"
                style={{ fontSize: "13px", padding: "8px 16px" }}
              >
                + Adicionar Parada
              </button>
            </div>

            {/* Sugestões no trajeto selecionado */}
            {(() => {
              const suggestions = getContextualSuggestions(originCity, destinationCity).filter(
                (sug) => !stopsList.some((existing) => normalizeCityKey(existing.name) === normalizeCityKey(sug.name))
              );
              if (suggestions.length === 0) return null;

              return (
                <div style={{ marginTop: "6px", marginBottom: "12px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#1E40AF", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Sugestões de Parada ({originCity} ➔ {destinationCity}):
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {suggestions.map((sug) => (
                      <button
                        key={sug.name}
                        type="button"
                        onClick={() => handleAddStop(sug.name)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "4px 9px",
                          borderRadius: "var(--radius-full)",
                          border: "1px dashed #93C5FD",
                          backgroundColor: "#F0F9FF",
                          color: "#0369A1",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.15s ease"
                        }}
                        title={`Adicionar ${sug.name} ao trajeto`}
                      >
                        <span>+ {sug.name}</span>
                        {sug.ibgeCode && (
                          <span style={{ fontSize: "9px", color: "#0284C7", opacity: 0.85 }}>
                            ({sug.ibgeCode})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Chips Removíveis de Paradas */}
            {stopsList.length > 0 ? (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                {stopsList.map((stop) => (
                  <span
                    key={stop.name}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "5px 12px",
                      background: "#EFF6FF",
                      color: "#1E40AF",
                      border: "1px solid #BFDBFE",
                      borderRadius: "var(--radius-full)",
                      fontSize: "12px",
                      fontWeight: 600
                    }}
                  >
                    <span>📍 {stop.name}</span>
                    {stop.ibgeCode && (
                      <span
                        style={{
                          fontSize: "10px",
                          backgroundColor: "#DBEAFE",
                          color: "#1D4ED8",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          fontWeight: 700
                        }}
                      >
                        IBGE {stop.ibgeCode}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveStop(stop.name)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#DC2626",
                        cursor: "pointer",
                        fontWeight: 800,
                        padding: "0 2px",
                        fontSize: "13px",
                        lineHeight: 1
                      }}
                      title={`Remover parada ${stop.name}`}
                      aria-label={`Remover parada ${stop.name}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: "11px", color: "var(--color-muted)", fontStyle: "italic" }}>
                Nenhuma parada intermediária adicionada (viagem direta de {originCity} para {destinationCity}).
              </div>
            )}
          </div>
        </fieldset>

        {/* Bloco 3: Horários e Remuneração */}
        <fieldset style={{ border: "none", padding: 0, margin: "0 0 28px 0" }}>
          <legend style={{ fontSize: "17px", fontWeight: 700, marginBottom: "16px", borderBottom: "1px solid var(--color-border)", width: "100%", paddingBottom: "8px", color: "var(--color-brand-deep-navy)" }}>
            3. Datas, Horários e Remuneração Estimada
          </legend>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div className="form-group">
              <label htmlFor="trip-date" className="form-label">
                Data Prevista de Saída *
              </label>
              <input
                id="trip-date"
                type="text"
                placeholder="Ex: 15/11/2026"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="trip-time" className="form-label">
                Horário de Partida *
              </label>
              <input
                id="trip-time"
                type="text"
                placeholder="Ex: 08:00"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="trip-price" className="form-label">
                Valor Base do Frete (R$) *
              </label>
              <input
                id="trip-price"
                type="text"
                placeholder="Ex: 50,00"
                value={tripPriceReais}
                onChange={(e) => setTripPriceReais(e.target.value)}
                className="form-control"
              />
            </div>
          </div>

          <div style={{ backgroundColor: "#F8FAFC", padding: "14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "13px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={flexiblePickup}
                onChange={(e) => setFlexiblePickup(e.target.checked)}
                style={{ marginTop: "3px" }}
              />
              <div>
                <strong>Disponibilidade para coleta em endereço (Coleta Flexível):</strong>
                <div style={{ color: "var(--color-muted)", fontSize: "12px", marginTop: "2px" }}>
                  Se desmarcado, os remetentes deverão entregar o pacote no seu ponto de partida ou em ponto de encontro combinado.
                </div>
              </div>
            </label>
          </div>
        </fieldset>

        {/* Rodapé com Botões */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--color-border)", paddingTop: "20px" }}>
          <Link href="/feed" className="btn btn--outline">
            Cancelar
          </Link>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={isSubmitting}
            style={{
              padding: "12px 28px",
              fontSize: "15px",
              fontWeight: 700,
              opacity: isSubmitting ? 0.7 : 1,
              cursor: isSubmitting ? "not-allowed" : "pointer"
            }}
          >
            {isSubmitting ? "Publicando..." : "Publicar Viagem no Feed →"}
          </button>
        </div>
      </form>

      {/* Modal de Confirmação de Viagem */}
      {showSuccessModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "460px",
              width: "100%",
              textAlign: "center",
              padding: "32px 24px",
              borderRadius: "20px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              border: "1px solid #10B981"
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                backgroundColor: "#DCFCE7",
                color: "#16A34A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "32px",
                margin: "0 auto 16px auto"
              }}
            >
              🚗
            </div>
            <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0F172A", margin: "0 0 8px 0" }}>
              Viagem publicada com sucesso!
            </h2>
            <p style={{ fontSize: "14px", color: "#64748B", margin: "0 0 24px 0", lineHeight: "1.5" }}>
              Sua rota de <strong>{originCity}</strong> para <strong>{destinationCity}</strong> já está visível para remetentes enviarem solicitações e propostas de frete.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href="/feed"
                className="btn btn--primary"
                style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 700 }}
              >
                Ver no Feed
              </Link>
              <Link
                href="/viagens"
                className="btn btn--outline"
                style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 600 }}
              >
                Minhas Viagens
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
