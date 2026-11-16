"use client";

import React, { useState, useEffect, useRef, useId, useCallback } from "react";

export interface ConfirmedAddress {
  rawInput: string;
  formattedAddress: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city: string;
  stateUf: string;
  postalCode?: string;
  complement?: string;
  lat: number | null;
  lon: number | null;
  isConfirmed: boolean;
  provider?: string;
}

// Catálogo dos 26 estados brasileiros + Distrito Federal
export const BRAZILIAN_STATES = [
  { uf: "AC", name: "Acre" },
  { uf: "AL", name: "Alagoas" },
  { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" },
  { uf: "BA", name: "Bahia" },
  { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" },
  { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" },
  { uf: "MT", name: "Mato Grosso" },
  { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "PA", name: "Pará" },
  { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" },
  { uf: "PE", name: "Pernambuco" },
  { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" },
  { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" }
];

// Centróides de referência para capitais e polos regionais
export const CITY_CENTROIDS: Record<string, { lat: number; lon: number; uf: string }> = {
  // Capitais
  "belo horizonte": { lat: -19.9167, lon: -43.9345, uf: "MG" },
  "sao paulo": { lat: -23.5505, lon: -46.6333, uf: "SP" },
  "rio de janeiro": { lat: -22.9068, lon: -43.1729, uf: "RJ" },
  "brasilia": { lat: -15.7975, lon: -47.8919, uf: "DF" },
  "salvador": { lat: -12.9777, lon: -38.5016, uf: "BA" },
  "fortaleza": { lat: -3.7319, lon: -38.5267, uf: "CE" },
  "curitiba": { lat: -25.4284, lon: -49.2733, uf: "PR" },
  "recife": { lat: -8.0476, lon: -34.8770, uf: "PE" },
  "porto alegre": { lat: -30.0346, lon: -51.2177, uf: "RS" },
  "manaus": { lat: -3.1190, lon: -60.0217, uf: "AM" },
  "belem": { lat: -1.4558, lon: -48.4902, uf: "PA" },
  "goiania": { lat: -16.6869, lon: -49.2648, uf: "GO" },
  "vitoria": { lat: -20.3155, lon: -40.3128, uf: "ES" },
  "florianopolis": { lat: -27.5954, lon: -48.5480, uf: "SC" },
  "cuiaba": { lat: -15.6014, lon: -56.0979, uf: "MT" },
  "campo grande": { lat: -20.4697, lon: -54.6201, uf: "MS" },
  "natal": { lat: -5.7945, lon: -35.2110, uf: "RN" },
  "joao pessoa": { lat: -7.1195, lon: -34.8450, uf: "PB" },
  "maceio": { lat: -9.6498, lon: -35.7089, uf: "AL" },
  "aracaju": { lat: -10.9472, lon: -37.0731, uf: "SE" },
  "teresina": { lat: -5.0920, lon: -42.8038, uf: "PI" },
  "sao luis": { lat: -2.5307, lon: -44.3068, uf: "MA" },
  "palmas": { lat: -10.2128, lon: -48.3603, uf: "TO" },
  "porto velho": { lat: -8.7619, lon: -63.9039, uf: "RO" },
  "rio branco": { lat: -9.9753, lon: -67.8249, uf: "AC" },
  "boa vista": { lat: 2.8235, lon: -60.6758, uf: "RR" },
  "macapa": { lat: 0.0356, lon: -51.0705, uf: "AP" },

  // Polos regionais
  "joao monlevade": { lat: -19.8094, lon: -43.1733, uf: "MG" },
  "contagem": { lat: -19.9317, lon: -44.0536, uf: "MG" },
  "betim": { lat: -19.9678, lon: -44.1983, uf: "MG" },
  "nova lima": { lat: -19.9856, lon: -43.8475, uf: "MG" },
  "ipatinga": { lat: -19.4688, lon: -42.5367, uf: "MG" },
  "itabira": { lat: -19.6178, lon: -43.2269, uf: "MG" },
  "uberlandia": { lat: -18.9186, lon: -48.2772, uf: "MG" },
  "juiz de fora": { lat: -21.7595, lon: -43.3398, uf: "MG" },
  "sete lagoas": { lat: -19.4594, lon: -44.2467, uf: "MG" },
  "montes claros": { lat: -16.7282, lon: -43.8617, uf: "MG" },
  "divinopolis": { lat: -20.1439, lon: -44.8919, uf: "MG" },
  "governador valadares": { lat: -18.8511, lon: -41.9494, uf: "MG" },
  "ouro preto": { lat: -20.3856, lon: -43.5036, uf: "MG" },
  "campinas": { lat: -22.9056, lon: -47.0608, uf: "SP" },
  "santos": { lat: -23.9608, lon: -46.3339, uf: "SP" },
  "ribeirao preto": { lat: -21.1767, lon: -47.8208, uf: "SP" },
  "sao jose dos campos": { lat: -23.2237, lon: -45.9009, uf: "SP" },
  "sorocaba": { lat: -23.5015, lon: -47.4526, uf: "SP" },
  "guarulhos": { lat: -23.4542, lon: -46.5333, uf: "SP" },
  "osasco": { lat: -23.5325, lon: -46.7917, uf: "SP" },
  "niteroi": { lat: -22.8859, lon: -43.1153, uf: "RJ" },
  "petropolis": { lat: -22.5050, lon: -43.1789, uf: "RJ" },
  "duque de caxias": { lat: -22.7856, lon: -43.3117, uf: "RJ" },
  "londrina": { lat: -23.3045, lon: -51.1696, uf: "PR" },
  "maringa": { lat: -23.4205, lon: -51.9333, uf: "PR" },
  "foz do iguacu": { lat: -25.5163, lon: -54.5854, uf: "PR" },
  "joinville": { lat: -26.3045, lon: -48.8487, uf: "SC" },
  "blumenau": { lat: -26.9194, lon: -49.0661, uf: "SC" },
  "caxias do sul": { lat: -29.1678, lon: -51.1794, uf: "RS" },
  "pelotas": { lat: -31.7654, lon: -52.3376, uf: "RS" },
  "feira de santana": { lat: -12.2664, lon: -38.9663, uf: "BA" },
  "vitoria da conquista": { lat: -14.8661, lon: -40.8394, uf: "BA" },
  "anapolis": { lat: -16.3267, lon: -48.9534, uf: "GO" },
  "caruaru": { lat: -8.2833, lon: -35.9667, uf: "PE" }
};

// Cidades populares para exibição rápida no datalist
export const POPULAR_CITIES_BY_UF: Record<string, string[]> = {
  MG: ["Belo Horizonte", "Contagem", "Betim", "Nova Lima", "João Monlevade", "Ipatinga", "Itabira", "Uberlândia", "Juiz de Fora", "Montes Claros", "Sete Lagoas", "Divinópolis", "Governador Valadares", "Santa Luzia", "Ibirité", "Poços de Caldas", "Patos de Minas", "Pouso Alegre", "Ouro Preto"],
  SP: ["São Paulo", "Campinas", "Guarulhos", "São Bernardo do Campo", "Santo André", "Osasco", "Santos", "Ribeirão Preto", "Sorocaba", "São José dos Campos", "Barueri", "Jundiaí", "Piracicaba", "Bauru", "Mogi das Cruzes", "Diadema"],
  RJ: ["Rio de Janeiro", "Niterói", "São Gonçalo", "Duque de Caxias", "Nova Iguaçu", "Belford Roxo", "Petrópolis", "Volta Redonda", "Campos dos Goytacazes", "Macaé", "Cabo Frio"],
  PR: ["Curitiba", "Londrina", "Maringá", "Ponta Grossa", "Cascavel", "São José dos Pinhais", "Foz do Iguaçu"],
  RS: ["Porto Alegre", "Caxias do Sul", "Canoas", "Pelotas", "Santa Maria", "Gravataí", "Novo Hamburgo"],
  SC: ["Florianópolis", "Joinville", "Blumenau", "São José", "Chapecó", "Itajaí", "Criciúma", "Balneário Camboriú"],
  BA: ["Salvador", "Feira de Santana", "Vitória da Conquista", "Camaçari", "Juazeiro", "Itabuna", "Lauro de Freitas"],
  GO: ["Goiânia", "Aparecida de Goiânia", "Anápolis", "Rio Verde", "Luziânia", "Águas Lindas de Goiás"],
  PE: ["Recife", "Jaboatão dos Guararapes", "Olinda", "Caruaru", "Petrolina", "Paulista"],
  CE: ["Fortaleza", "Caucaia", "Juazeiro do Norte", "Maracanaú", "Sobral"],
  DF: ["Brasília", "Taguatinga", "Ceilândia", "Águas Claras", "Samambaia", "Guará"],
  ES: ["Vitória", "Vila Velha", "Serra", "Cariacica", "Cachoeiro de Itapemirim", "Linhares"]
};

// Construtor uniforme do endereço formatado
export function buildFormattedAddress(
  street: string,
  number: string,
  neighborhood: string,
  city: string,
  stateUf: string
): string {
  const cleanStreet = (street || "").trim();
  const cleanNumber = (number || "").trim();
  const cleanNeigh = (neighborhood || "").trim();
  const cleanCity = (city || "").trim();
  const cleanUf = (stateUf || "").trim().toUpperCase();

  const streetAndNumber = cleanNumber ? `${cleanStreet}, ${cleanNumber}` : cleanStreet;
  const parts: string[] = [];

  if (streetAndNumber) parts.push(streetAndNumber);
  if (cleanNeigh) parts.push(cleanNeigh);
  if (cleanCity) {
    parts.push(cleanUf ? `${cleanCity} - ${cleanUf}` : cleanCity);
  }

  return parts.join(" - ");
}

// Timeout helper para chamadas de rede com AbortController
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 7000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export interface GeocodeDetailedResult {
  status: "SUCCESS" | "NOT_FOUND" | "NETWORK_ERROR";
  results: ConfirmedAddress[];
  errorMessage?: string;
}

// Motor detalhado de geocodificação brasileira (Photon + Nominatim com status de erro explícito)
export async function geocodeBrazilianAddressDetailed(
  street: string,
  number: string,
  neighborhood: string,
  city: string,
  stateUf: string
): Promise<GeocodeDetailedResult> {
  const cleanStreet = (street || "").trim();
  const cleanNumber = (number || "").trim();
  const cleanNeigh = (neighborhood || "").trim();
  const cleanCity = (city || "").trim();
  const cleanState = (stateUf || "").trim().toUpperCase();

  if (!cleanStreet && !cleanCity) {
    return { status: "NOT_FOUND", results: [] };
  }

  const streetFull = cleanNumber ? `${cleanStreet}, ${cleanNumber}` : cleanStreet;
  const queryParts = [streetFull, cleanNeigh, cleanCity, cleanState, "Brasil"].filter(Boolean);
  const fullQuery = queryParts.join(", ");
  const fallbackQuery = [cleanStreet, cleanNeigh, cleanCity, cleanState, "Brasil"].filter(Boolean).join(", ");

  const results: ConfirmedAddress[] = [];
  let photonFailed = false;
  let nominatimFailed = false;

  // 1. Tentar Photon (Komoot OpenStreetMap) com fullQuery
  try {
    const normCity = cleanCity.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const cityCoords = CITY_CENTROIDS[normCity];
    const biasParam = cityCoords ? `&lat=${cityCoords.lat}&lon=${cityCoords.lon}` : "";

    let photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(fullQuery)}&limit=6${biasParam}`;
    let res = await fetchWithTimeout(photonUrl, { headers: { Accept: "application/json" } });

    if (res.ok) {
      let data = await res.json();
      // Se não encontrou com número específico, tenta sem o número
      if ((!data?.features || data.features.length === 0) && cleanNumber && fallbackQuery !== fullQuery) {
        photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(fallbackQuery)}&limit=6${biasParam}`;
        res = await fetchWithTimeout(photonUrl, { headers: { Accept: "application/json" } });
        if (res.ok) {
          data = await res.json();
        }
      }

      if (data && Array.isArray(data.features)) {
        for (const feat of data.features) {
          const props = feat.properties || {};
          const coords = feat.geometry?.coordinates;
          if (!coords || coords.length < 2) continue;

          const lon = coords[0];
          const lat = coords[1];

          // Filtrar coordenadas dentro do Brasil
          if (lat < -35 || lat > 6 || lon < -75 || lon > -34) continue;

          const streetName = props.street || props.name || cleanStreet;
          const housenumber = cleanNumber || props.housenumber || "";
          const foundNeigh = cleanNeigh || props.district || props.suburb || props.locality || "";
          const foundCity = props.city || props.town || props.village || props.county || cleanCity;
          const foundState = props.state || cleanState;
          const uf = foundState.length === 2 ? foundState.toUpperCase() : cleanState;

          const formatted = buildFormattedAddress(streetName, housenumber, foundNeigh, foundCity, uf);

          results.push({
            rawInput: formatted,
            formattedAddress: formatted,
            street: streetName,
            number: housenumber || undefined,
            neighborhood: foundNeigh || undefined,
            city: foundCity,
            stateUf: uf,
            postalCode: props.postcode || undefined,
            lat,
            lon,
            isConfirmed: true,
            provider: "OpenStreetMap / Photon"
          });
        }
      }
    } else {
      photonFailed = true;
    }
  } catch {
    photonFailed = true;
  }

  // 2. Se Photon não retornou resultados ou falhou, tentar Nominatim
  if (results.length === 0) {
    try {
      let nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullQuery)}&countrycodes=br&addressdetails=1&limit=6`;
      let res = await fetchWithTimeout(nominatimUrl, {
        headers: { "User-Agent": "TopicLog/1.0", Accept: "application/json" }
      });

      if (res.ok) {
        let data = await res.json();
        if ((!Array.isArray(data) || data.length === 0) && cleanNumber && fallbackQuery !== fullQuery) {
          nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackQuery)}&countrycodes=br&addressdetails=1&limit=6`;
          res = await fetchWithTimeout(nominatimUrl, {
            headers: { "User-Agent": "TopicLog/1.0", Accept: "application/json" }
          });
          if (res.ok) {
            data = await res.json();
          }
        }

        if (Array.isArray(data)) {
          for (const item of data) {
            const lat = parseFloat(item.lat);
            const lon = parseFloat(item.lon);
            if (isNaN(lat) || isNaN(lon)) continue;

            const addr = item.address || {};
            const streetName = addr.road || addr.pedestrian || item.name || cleanStreet;
            const housenumber = cleanNumber || addr.house_number || "";
            const foundNeigh = cleanNeigh || addr.suburb || addr.neighbourhood || addr.city_district || "";
            const foundCity = addr.city || addr.town || addr.municipality || addr.village || cleanCity;

            let foundUf = cleanState;
            if (addr["ISO3166-2-lvl4"]) {
              foundUf = addr["ISO3166-2-lvl4"].replace("BR-", "").toUpperCase();
            }

            const formatted = buildFormattedAddress(streetName, housenumber, foundNeigh, foundCity, foundUf);

            results.push({
              rawInput: formatted,
              formattedAddress: formatted,
              street: streetName,
              number: housenumber || undefined,
              neighborhood: foundNeigh || undefined,
              city: foundCity,
              stateUf: foundUf,
              postalCode: addr.postcode || undefined,
              lat,
              lon,
              isConfirmed: true,
              provider: "OpenStreetMap / Nominatim"
            });
          }
        }
      } else {
        nominatimFailed = true;
      }
    } catch {
      nominatimFailed = true;
    }
  }

  // Se foram encontradas coordenadas válidas
  if (results.length > 0) {
    return { status: "SUCCESS", results };
  }

  // Se ambos os serviços de mapa falharam por rede/timeout/cota
  if (photonFailed && nominatimFailed) {
    return {
      status: "NETWORK_ERROR",
      results: [],
      errorMessage: "Não foi possível carregar o mapa ou validar a rota no momento. Verifique sua conexão e tente novamente."
    };
  }

  // Se os serviços responderam normalmente mas não encontraram o endereço
  return {
    status: "NOT_FOUND",
    results: [],
    errorMessage: "Endereço não encontrado no mapa. Verifique o nome da rua, número e cidade."
  };
}

// Wrapper retrocompatível
export async function geocodeBrazilianAddress(
  street: string,
  number: string,
  neighborhood: string,
  city: string,
  stateUf: string
): Promise<ConfirmedAddress[]> {
  const res = await geocodeBrazilianAddressDetailed(street, number, neighborhood, city, stateUf);
  return res.results;
}

interface BrazilianAddressInputProps {
  id: string;
  label: string;
  badgeType: "origin" | "destination";
  value: ConfirmedAddress;
  onChange: (address: ConfirmedAddress) => void;
  onGpsClick?: () => void;
  isGpsLocating?: boolean;
  originCity?: string;
  originStateUf?: string;
  onSyncWithOriginCity?: () => void;
  placeholder?: string;
  required?: boolean;
}

type GeocodeStatus = "idle" | "locating" | "success" | "not_found" | "network_error";

export default function BrazilianAddressInput({
  id,
  label,
  badgeType,
  value,
  onChange,
  onGpsClick,
  isGpsLocating = false,
  originCity,
  originStateUf,
  onSyncWithOriginCity,
  placeholder = "Ex.: Av. Afonso Pena, Rua Goiás...",
  required = true
}: BrazilianAddressInputProps): React.JSX.Element {
  const componentInstanceId = useId();
  const datalistId = `cities-list-${id}-${componentInstanceId}`;

  // Estados locais dos campos decompostos
  const [postalCode, setPostalCode] = useState(value.postalCode || "");
  const [isCepLoading, setIsCepLoading] = useState(false);
  const [stateUf, setStateUf] = useState(value.stateUf || "");
  const [city, setCity] = useState(value.city || "");
  const [streetQuery, setStreetQuery] = useState(value.street || "");
  const [houseNumber, setHouseNumber] = useState(value.number || "");
  const [neighborhood, setNeighborhood] = useState(value.neighborhood || "");
  const [complement, setComplement] = useState(value.complement || "");

  const [suggestions, setSuggestions] = useState<ConfirmedAddress[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState<GeocodeStatus>(() => {
    return value.isConfirmed && value.lat && value.lon ? "success" : "idle";
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastGeocodedKeyRef = useRef<string>("");
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Sincroniza estados internos quando as props mudam
  useEffect(() => {
    setPostalCode(value.postalCode || "");
  }, [value.postalCode]);

  useEffect(() => {
    setStateUf(value.stateUf || "");
  }, [value.stateUf]);

  useEffect(() => {
    setCity(value.city || "");
  }, [value.city]);

  useEffect(() => {
    if (value.street !== undefined) {
      setStreetQuery(value.street);
    }
  }, [value.street]);

  useEffect(() => {
    if (value.number !== undefined) {
      setHouseNumber(value.number);
    }
  }, [value.number]);

  useEffect(() => {
    if (value.neighborhood !== undefined) {
      setNeighborhood(value.neighborhood);
    }
  }, [value.neighborhood]);

  useEffect(() => {
    setComplement(value.complement || "");
  }, [value.complement]);

  // Se o valor externo estiver confirmado (ex: via GPS), reflete status success
  useEffect(() => {
    if (value.isConfirmed && value.lat && value.lon) {
      setGeocodeStatus("success");
      const key = [value.street, value.number, value.neighborhood, value.city, value.stateUf].filter(Boolean).join(", ");
      lastGeocodedKeyRef.current = key;
    }
  }, [value.isConfirmed, value.lat, value.lon, value.street, value.number, value.neighborhood, value.city, value.stateUf]);

  // Fechar dropdown de sugestões ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Função centralizada para executar a localização e validação no mapa
  const executeLocate = useCallback(
    async (
      overrideStreet?: string,
      overrideNumber?: string,
      overrideNeigh?: string,
      overrideCity?: string,
      overrideUf?: string,
      force = false
    ) => {
      if (!isMountedRef.current) return;

      const s = (overrideStreet ?? streetQuery).trim();
      const num = (overrideNumber ?? houseNumber).trim();
      const neigh = (overrideNeigh ?? neighborhood).trim();
      const c = (overrideCity ?? city).trim();
      const uf = (overrideUf ?? stateUf).trim().toUpperCase();

      const fullKey = [s, num, neigh, c, uf].filter(Boolean).join(", ");

      // Requisito: mínimo 8 caracteres no endereço e cidade válida
      if (fullKey.length < 8 || s.length < 3 || c.length < 2) {
        if (!force) {
          setGeocodeStatus("idle");
          return;
        }
      }

      // Evita requisição duplicada idêntica se já confirmado
      if (!force && fullKey === lastGeocodedKeyRef.current && value.isConfirmed && value.lat && value.lon) {
        setGeocodeStatus("success");
        return;
      }

      setIsLoading(true);
      setGeocodeStatus("locating");

      try {
        const res = await geocodeBrazilianAddressDetailed(s, num, neigh, c, uf);

        if (!isMountedRef.current) return;

        if (res.status === "SUCCESS" && res.results.length > 0 && res.results[0]) {
          const best = res.results[0];
          lastGeocodedKeyRef.current = fullKey;
          setSuggestions(res.results);
          setGeocodeStatus("success");

          const finalStreet = best.street || s;
          const finalNumber = num || best.number || "";
          const finalNeigh = best.neighborhood || neigh || "";
          const finalCity = best.city || c;
          const finalState = best.stateUf || uf;
          const formatted = buildFormattedAddress(finalStreet, finalNumber, finalNeigh, finalCity, finalState);

          onChange({
            ...best,
            street: finalStreet,
            number: finalNumber || undefined,
            neighborhood: finalNeigh || undefined,
            city: finalCity,
            stateUf: finalState,
            formattedAddress: formatted,
            rawInput: formatted,
            complement,
            lat: best.lat,
            lon: best.lon,
            isConfirmed: true
          });
        } else if (res.status === "NOT_FOUND") {
          lastGeocodedKeyRef.current = "";
          setSuggestions([]);
          setGeocodeStatus("not_found");

          // Invalida/limpa as coordenadas anteriores do ponto
          const formatted = buildFormattedAddress(s, num, neigh, c, uf);
          onChange({
            ...value,
            street: s,
            number: num || undefined,
            neighborhood: neigh || undefined,
            city: c,
            stateUf: uf,
            formattedAddress: formatted,
            rawInput: formatted,
            lat: null,
            lon: null,
            isConfirmed: false
          });
        } else if (res.status === "NETWORK_ERROR") {
          lastGeocodedKeyRef.current = "";
          setGeocodeStatus("network_error");

          // Invalida/limpa as coordenadas anteriores do ponto
          const formatted = buildFormattedAddress(s, num, neigh, c, uf);
          onChange({
            ...value,
            street: s,
            number: num || undefined,
            neighborhood: neigh || undefined,
            city: c,
            stateUf: uf,
            formattedAddress: formatted,
            rawInput: formatted,
            lat: null,
            lon: null,
            isConfirmed: false
          });
        }
      } catch {
        if (!isMountedRef.current) return;
        lastGeocodedKeyRef.current = "";
        setGeocodeStatus("network_error");
        onChange({
          ...value,
          lat: null,
          lon: null,
          isConfirmed: false
        });
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [streetQuery, houseNumber, neighborhood, city, stateUf, value, complement, onChange]
  );

  // Gatilho inteligente com debounce de 1000ms (1 segundo)
  const scheduleDebounceLocate = useCallback(
    (nextStreet: string, nextNum: string, nextNeigh: string, nextCity: string, nextUf: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      const fullKey = [nextStreet.trim(), nextNum.trim(), nextNeigh.trim(), nextCity.trim(), nextUf.trim()]
        .filter(Boolean)
        .join(", ");

      if (fullKey.length >= 8 && nextStreet.trim().length >= 3 && nextCity.trim().length >= 2) {
        setGeocodeStatus("locating");
        debounceTimerRef.current = setTimeout(() => {
          executeLocate(nextStreet, nextNum, nextNeigh, nextCity, nextUf);
        }, 1000);
      } else {
        setGeocodeStatus("idle");
      }
    },
    [executeLocate]
  );

  // Manipulador de saída do campo (onBlur): valida imediatamente se atingiu tamanho mínimo
  const handleFieldBlur = useCallback(() => {
    const fullKey = [streetQuery.trim(), houseNumber.trim(), neighborhood.trim(), city.trim(), stateUf.trim()]
      .filter(Boolean)
      .join(", ");

    if (fullKey.length >= 8 && streetQuery.trim().length >= 3 && city.trim().length >= 2) {
      if (fullKey !== lastGeocodedKeyRef.current || !value.isConfirmed || !value.lat || !value.lon) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        executeLocate();
      }
    }
  }, [streetQuery, houseNumber, neighborhood, city, stateUf, value.isConfirmed, value.lat, value.lon, executeLocate]);

  // Manipulador de CEP com preenchimento automático via ViaCEP
  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    const formattedCep = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    setPostalCode(formattedCep);

    if (digits.length === 8) {
      setIsCepLoading(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
          headers: { Accept: "application/json" }
        });
        if (res.ok) {
          const data = (await res.json()) as {
            erro?: boolean;
            logradouro?: string;
            bairro?: string;
            localidade?: string;
            uf?: string;
          };
          if (!data.erro && data.localidade && data.uf) {
            const nextStreet = (data.logradouro || streetQuery).trim();
            const nextNeigh = (data.bairro || neighborhood).trim();
            const nextCity = data.localidade.trim();
            const nextUf = data.uf.trim().toUpperCase();

            setStreetQuery(nextStreet);
            setNeighborhood(nextNeigh);
            setCity(nextCity);
            setStateUf(nextUf);
            setIsOpen(false);

            const formattedAddr = buildFormattedAddress(nextStreet, houseNumber, nextNeigh, nextCity, nextUf);
            onChange({
              ...value,
              postalCode: formattedCep,
              street: nextStreet,
              neighborhood: nextNeigh || undefined,
              city: nextCity,
              stateUf: nextUf,
              formattedAddress: formattedAddr,
              rawInput: formattedAddr,
              lat: null,
              lon: null,
              isConfirmed: false
            });

            // Dispara localização automática com os novos dados do CEP
            if (nextStreet.length >= 3 && nextCity.length >= 2) {
              executeLocate(nextStreet, houseNumber, nextNeigh, nextCity, nextUf);
            }
            setIsCepLoading(false);
            return;
          }
        }
      } catch {
        // segue permitindo edição manual
      } finally {
        setIsCepLoading(false);
      }
    }

    onChange({
      ...value,
      postalCode: formattedCep
    });
  };

  // Manipulador de troca de Estado (UF)
  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newUf = e.target.value;
    setStateUf(newUf);
    const formatted = buildFormattedAddress(streetQuery, houseNumber, neighborhood, city, newUf);

    onChange({
      ...value,
      stateUf: newUf,
      city,
      formattedAddress: formatted,
      lat: null,
      lon: null,
      isConfirmed: false
    });

    scheduleDebounceLocate(streetQuery, houseNumber, neighborhood, city, newUf);
  };

  // Manipulador de troca de Cidade
  const handleCityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCity = e.target.value;
    setCity(newCity);

    const formatted = buildFormattedAddress(streetQuery, houseNumber, neighborhood, newCity, stateUf);
    onChange({
      ...value,
      city: newCity,
      stateUf,
      formattedAddress: formatted,
      lat: null,
      lon: null,
      isConfirmed: false
    });

    scheduleDebounceLocate(streetQuery, houseNumber, neighborhood, newCity, stateUf);
  };

  // Manipulador da Rua / Logradouro (Debounce 1s)
  const handleStreetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setStreetQuery(text);

    const formatted = buildFormattedAddress(text, houseNumber, neighborhood, city, stateUf);
    onChange({
      ...value,
      street: text,
      formattedAddress: formatted,
      rawInput: formatted,
      lat: null,
      lon: null,
      isConfirmed: false
    });

    scheduleDebounceLocate(text, houseNumber, neighborhood, city, stateUf);
  };

  // Manipulador do Número da Casa (Debounce 1s)
  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const num = e.target.value;
    setHouseNumber(num);

    const formatted = buildFormattedAddress(streetQuery, num, neighborhood, city, stateUf);
    onChange({
      ...value,
      number: num,
      formattedAddress: formatted,
      rawInput: formatted,
      lat: null,
      lon: null,
      isConfirmed: false
    });

    scheduleDebounceLocate(streetQuery, num, neighborhood, city, stateUf);
  };

  // Manipulador do Bairro (Debounce 1s)
  const handleNeighborhoodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const neigh = e.target.value;
    setNeighborhood(neigh);

    const formatted = buildFormattedAddress(streetQuery, houseNumber, neigh, city, stateUf);
    onChange({
      ...value,
      neighborhood: neigh,
      formattedAddress: formatted,
      rawInput: formatted,
      lat: null,
      lon: null,
      isConfirmed: false
    });

    scheduleDebounceLocate(streetQuery, houseNumber, neigh, city, stateUf);
  };

  // Selecionar sugestão do dropdown
  const handleSelectSuggestion = (sug: ConfirmedAddress) => {
    const finalStreet = sug.street || streetQuery;
    const finalNumber = houseNumber || sug.number || "";
    const finalNeigh = sug.neighborhood || neighborhood || "";
    const finalCity = sug.city || city;
    const finalState = sug.stateUf || stateUf;

    setStreetQuery(finalStreet);
    if (finalNumber) setHouseNumber(finalNumber);
    if (finalNeigh) setNeighborhood(finalNeigh);
    setCity(finalCity);
    setStateUf(finalState);
    setIsOpen(false);

    const formatted = buildFormattedAddress(finalStreet, finalNumber, finalNeigh, finalCity, finalState);
    lastGeocodedKeyRef.current = [finalStreet, finalNumber, finalNeigh, finalCity, finalState].filter(Boolean).join(", ");
    setGeocodeStatus("success");

    onChange({
      ...sug,
      street: finalStreet,
      number: finalNumber || undefined,
      neighborhood: finalNeigh || undefined,
      city: finalCity,
      stateUf: finalState,
      formattedAddress: formatted,
      rawInput: formatted,
      complement,
      lat: sug.lat,
      lon: sug.lon,
      isConfirmed: true
    });
  };

  const isOrigin = badgeType === "origin";
  const isSameCityAsOrigin =
    !isOrigin &&
    originCity &&
    originStateUf &&
    city.toLowerCase() === originCity.toLowerCase() &&
    stateUf.toUpperCase() === originStateUf.toUpperCase();
  const popularCities = POPULAR_CITIES_BY_UF[stateUf] || [];

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        marginBottom: "18px",
        padding: "16px",
        backgroundColor: isOrigin ? "#F0FDF4" : "#F8FAFC",
        border: `1.5px solid ${isOrigin ? "#86EFAC" : "#CBD5E1"}`,
        borderRadius: "12px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
      }}
    >
      {/* Cabeçalho do Endereço */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
          flexWrap: "wrap",
          gap: "8px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "26px",
              height: "26px",
              borderRadius: isOrigin ? "50%" : "6px",
              backgroundColor: isOrigin ? "#059669" : "#DC2626",
              color: "#FFFFFF",
              fontSize: "13px",
              fontWeight: 800
            }}
          >
            {isOrigin ? "A" : "B"}
          </span>
          <strong
            style={{
              fontSize: "13px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              color: isOrigin ? "#065F46" : "#991B1B"
            }}
          >
            {label} {required && "*"}
          </strong>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {/* Botão de Localização Atual (GPS) na Retirada */}
          {isOrigin && onGpsClick && (
            <button
              type="button"
              onClick={onGpsClick}
              disabled={isGpsLocating}
              style={{
                background: "#DCFCE7",
                border: "1px solid #86EFAC",
                color: "#166534",
                fontSize: "12px",
                fontWeight: 700,
                padding: "5px 12px",
                borderRadius: "6px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px"
              }}
              title="Obter endereço e cidade automaticamente pelo GPS do aparelho"
            >
              {isGpsLocating ? "📍 Obtendo GPS..." : "📍 Usar localização atual"}
            </button>
          )}

          {/* Indicação e ação de mesma cidade no Destino */}
          {!isOrigin &&
            (isSameCityAsOrigin ? (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#166534",
                  backgroundColor: "#DCFCE7",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "1px solid #86EFAC"
                }}
              >
                ✓ Mesma cidade da retirada
              </span>
            ) : onSyncWithOriginCity ? (
              <button
                type="button"
                onClick={onSyncWithOriginCity}
                style={{
                  background: "#F1F5F9",
                  border: "1px solid #CBD5E1",
                  color: "#334155",
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "6px",
                  cursor: "pointer"
                }}
                title="Redefinir destino para a mesma cidade da retirada"
              >
                ↩ Mesma cidade da retirada
              </button>
            ) : null)}
        </div>
      </div>

      {/* Linha 1: CEP, Estado (UF) e Cidade (Município) */}
      <div className="address-grid-uf-city" style={{ marginBottom: "10px" }}>
        <div>
          <label
            htmlFor={`cep-input-${id}`}
            style={{
              fontSize: "11px",
              fontWeight: 800,
              textTransform: "uppercase",
              color: "#475569",
              display: "block",
              marginBottom: "3px"
            }}
          >
            CEP {isCepLoading ? "..." : ""}
          </label>
          <input
            id={`cep-input-${id}`}
            type="text"
            inputMode="numeric"
            maxLength={9}
            value={postalCode}
            onChange={handleCepChange}
            onBlur={handleFieldBlur}
            placeholder="00000-000"
            style={{
              width: "100%",
              minHeight: "42px",
              padding: "6px 10px",
              fontSize: "16px",
              fontWeight: 700,
              color: "#0F172A",
              backgroundColor: "#FFFFFF",
              border: "1.5px solid #CBD5E1",
              borderRadius: "8px",
              outline: "none"
            }}
          />
        </div>

        <div>
          <label
            htmlFor={`state-select-${id}`}
            style={{
              fontSize: "11px",
              fontWeight: 800,
              textTransform: "uppercase",
              color: "#475569",
              display: "block",
              marginBottom: "3px"
            }}
          >
            Estado (UF) *
          </label>
          <select
            id={`state-select-${id}`}
            value={stateUf}
            onChange={handleStateChange}
            onBlur={handleFieldBlur}
            style={{
              width: "100%",
              minHeight: "42px",
              padding: "6px 8px",
              fontSize: "16px",
              fontWeight: 700,
              color: "#0F172A",
              backgroundColor: "#FFFFFF",
              border: "1.5px solid #CBD5E1",
              borderRadius: "8px",
              outline: "none",
              cursor: "pointer"
            }}
          >
            <option value="">UF...</option>
            {BRAZILIAN_STATES.map((st) => (
              <option key={st.uf} value={st.uf}>
                {st.uf} - {st.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor={`city-input-${id}`}
            style={{
              fontSize: "11px",
              fontWeight: 800,
              textTransform: "uppercase",
              color: "#475569",
              display: "block",
              marginBottom: "3px"
            }}
          >
            Cidade / Município (Todo o Brasil) *
          </label>
          <input
            id={`city-input-${id}`}
            type="text"
            list={datalistId}
            value={city}
            onChange={handleCityChange}
            onBlur={handleFieldBlur}
            placeholder="Digite qualquer cidade do Brasil..."
            style={{
              width: "100%",
              minHeight: "42px",
              padding: "6px 10px",
              fontSize: "16px",
              fontWeight: 700,
              color: "#0F172A",
              backgroundColor: "#FFFFFF",
              border: "1.5px solid #CBD5E1",
              borderRadius: "8px",
              outline: "none"
            }}
          />
          <datalist id={datalistId}>
            {popularCities.map((cName) => (
              <option key={cName} value={cName} />
            ))}
          </datalist>
        </div>
      </div>

      {/* Linha 2: Rua / Logradouro + Número da Casa + Botão Discreto de Atualização */}
      <div style={{ marginBottom: "10px" }}>
        <div className="address-grid-street">
          <div>
            <label
              htmlFor={`street-input-${id}`}
              style={{
                fontSize: "11px",
                fontWeight: 800,
                textTransform: "uppercase",
                color: "#475569",
                display: "block",
                marginBottom: "3px"
              }}
            >
              Rua / Logradouro *
            </label>
            <input
              id={`street-input-${id}`}
              type="text"
              required={required}
              value={streetQuery}
              onChange={handleStreetChange}
              onBlur={handleFieldBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  executeLocate(streetQuery, houseNumber, neighborhood, city, stateUf, true);
                }
              }}
              onFocus={() => {
                if (suggestions.length > 0) setIsOpen(true);
              }}
              placeholder={placeholder}
              autoComplete="off"
              style={{
                width: "100%",
                minHeight: "44px",
                padding: "8px 12px",
                fontSize: "16px",
                fontWeight: 600,
                color: "#0F172A",
                backgroundColor: value.isConfirmed ? "#FFFFFF" : "#FFFBEB",
                border: `1.5px solid ${
                  geocodeStatus === "not_found"
                    ? "#EF4444"
                    : geocodeStatus === "network_error"
                    ? "#F59E0B"
                    : value.isConfirmed
                    ? "#10B981"
                    : "#F59E0B"
                }`,
                borderRadius: "8px",
                outline: "none"
              }}
            />
          </div>

          <div>
            <label
              htmlFor={`number-input-${id}`}
              style={{
                fontSize: "11px",
                fontWeight: 800,
                textTransform: "uppercase",
                color: "#475569",
                display: "block",
                marginBottom: "3px"
              }}
            >
              Número *
            </label>
            <input
              id={`number-input-${id}`}
              type="text"
              required={required}
              value={houseNumber}
              onChange={handleNumberChange}
              onBlur={handleFieldBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  executeLocate(streetQuery, houseNumber, neighborhood, city, stateUf, true);
                }
              }}
              placeholder="1200 ou S/N"
              style={{
                width: "100%",
                minHeight: "44px",
                padding: "8px 10px",
                fontSize: "16px",
                fontWeight: 700,
                color: "#0F172A",
                backgroundColor: "#FFFFFF",
                border: "1.5px solid #CBD5E1",
                borderRadius: "8px",
                outline: "none",
                textAlign: "center"
              }}
            />
          </div>
        </div>

        {/* Dropdown de sugestões do endereço */}
        {isOpen && suggestions.length > 0 && (
          <div
            style={{
              marginTop: "8px",
              backgroundColor: "#FFFFFF",
              border: "1.5px solid #CBD5E1",
              borderRadius: "10px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              overflow: "hidden"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                backgroundColor: "#F8FAFC",
                borderBottom: "1px solid #E2E8F0",
                fontSize: "11px",
                fontWeight: 700,
                color: "#475569"
              }}
            >
              <span>Selecione o endereço encontrado ({suggestions.length})</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: "#E2E8F0",
                  border: "none",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#0F172A",
                  cursor: "pointer"
                }}
              >
                ✕ Fechar
              </button>
            </div>
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                maxHeight: "220px",
                overflowY: "auto"
              }}
            >
              {suggestions.map((sug, idx) => (
                <li
                  key={idx}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectSuggestion(sug);
                  }}
                  style={{
                    padding: "10px 12px",
                    fontSize: "13px",
                    cursor: "pointer",
                    borderBottom: idx < suggestions.length - 1 ? "1px solid #F1F5F9" : "none",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px",
                    flexWrap: "wrap"
                  }}
                >
                  <span style={{ fontSize: "16px", marginTop: "1px" }}>📍</span>
                  <div style={{ flex: 1, minWidth: "160px" }}>
                    <strong style={{ color: "#0F172A", display: "block" }}>
                      {sug.street || sug.formattedAddress}
                    </strong>
                    <span style={{ fontSize: "11px", color: "#64748B" }}>
                      {sug.neighborhood ? `${sug.neighborhood} • ` : ""}
                      {sug.city} - {sug.stateUf}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "#166534",
                      backgroundColor: "#DCFCE7",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      alignSelf: "center"
                    }}
                  >
                    Confirmar
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Linha 3: Bairro e Complemento Opcional */}
      <div className="address-grid-half" style={{ marginBottom: "8px" }}>
        <div>
          <label
            htmlFor={`neighborhood-input-${id}`}
            style={{
              fontSize: "11px",
              fontWeight: 800,
              textTransform: "uppercase",
              color: "#475569",
              display: "block",
              marginBottom: "3px"
            }}
          >
            Bairro
          </label>
          <input
            id={`neighborhood-input-${id}`}
            type="text"
            value={neighborhood}
            onChange={handleNeighborhoodChange}
            onBlur={handleFieldBlur}
            placeholder="Ex.: Centro, Savassi, Funcionários..."
            style={{
              width: "100%",
              minHeight: "42px",
              padding: "6px 10px",
              fontSize: "16px",
              color: "#0F172A",
              backgroundColor: "#FFFFFF",
              border: "1.5px solid #CBD5E1",
              borderRadius: "8px",
              outline: "none"
            }}
          />
        </div>

        <div>
          <label
            htmlFor={`complement-input-${id}`}
            style={{
              fontSize: "11px",
              fontWeight: 800,
              textTransform: "uppercase",
              color: "#475569",
              display: "block",
              marginBottom: "3px"
            }}
          >
            Complemento (Opcional)
          </label>
          <input
            id={`complement-input-${id}`}
            type="text"
            value={complement}
            onChange={(e) => {
              const nextComp = e.target.value;
              setComplement(nextComp);
              onChange({
                ...value,
                complement: nextComp
              });
            }}
            placeholder="Ex.: Apto 402, Bloco B, Galpão 3..."
            style={{
              width: "100%",
              minHeight: "42px",
              padding: "6px 10px",
              fontSize: "16px",
              color: "#0F172A",
              backgroundColor: "#FFFFFF",
              border: "1.5px solid #CBD5E1",
              borderRadius: "8px",
              outline: "none"
            }}
          />
        </div>
      </div>

      {/* Alertas e status de validação no mapa (automático) */}
      <div style={{ marginTop: "6px" }}>
        {geocodeStatus === "locating" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 10px",
              backgroundColor: "#EFF6FF",
              border: "1px solid #BFDBFE",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#1E40AF",
              fontWeight: 600
            }}
          >
            <span>📍</span>
            <span>Localizando endereço no mapa...</span>
          </div>
        )}

        {geocodeStatus === "not_found" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 10px",
              backgroundColor: "#FEF2F2",
              border: "1.5px solid #FCA5A5",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#991B1B",
              fontWeight: 600
            }}
          >
            <span>⚠️</span>
            <span>Endereço não encontrado no mapa. Verifique o nome da rua, número e cidade.</span>
          </div>
        )}

        {geocodeStatus === "network_error" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 10px",
              backgroundColor: "#FFFBEB",
              border: "1.5px solid #FCD34D",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#92400E",
              fontWeight: 600
            }}
          >
            <span>⚠️</span>
            <span>Não foi possível carregar o mapa ou validar a rota no momento. Verifique sua conexão e tente novamente.</span>
          </div>
        )}

        {geocodeStatus === "success" && value.isConfirmed && value.lat && value.lon && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 10px",
              backgroundColor: "#F0FDF4",
              border: "1.5px solid #86EFAC",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#166534",
              fontWeight: 700
            }}
          >
            <span>✅</span>
            <span>
              Endereço localizado no mapa ({value.lat.toFixed(4)}, {value.lon.toFixed(4)}) • {value.formattedAddress}
            </span>
          </div>
        )}

        {geocodeStatus === "idle" && (!value.isConfirmed || !value.lat || !value.lon) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              color: "#64748B",
              padding: "2px 4px"
            }}
          >
            <span>📍</span>
            <span>Digite a rua, número e cidade. A localização no mapa é realizada automaticamente.</span>
          </div>
        )}
      </div>
    </div>
  );
}
