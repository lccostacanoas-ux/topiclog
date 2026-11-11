"use client";

import React, { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import BrazilianAddressInput, { type ConfirmedAddress, buildFormattedAddress } from "../../../components/BrazilianAddressInput";
import { addDemoShipment } from "../../../lib/demo-marketplace-store";
import { useAuth } from "../../../lib/auth-context";
import type { CreateShipmentPayload } from "../../../lib/types";
import { createShipmentApi } from "../../../lib/api-client";

// Carregamento dinâmico do mapa Leaflet sem SSR
const TopicLogRouteMap = dynamic(
  () => import("../../../components/TopicLogRouteMap"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100%",
          height: "340px",
          backgroundColor: "#F1F5F9",
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#64748B",
          fontSize: "14px",
          fontWeight: 600
        }}
      >
        <span>🧭 Carregando mapa interativo TopicLog...</span>
      </div>
    )
  }
);

// Catálogo oficial de itens proibidos e regras de segurança TopicLog
const PROHIBITED_ITEMS_CATALOG = [
  {
    category: "1. Explosivos, Pólvoras e Artigos Pirotécnicos",
    icon: "💥",
    examples: "Fogos de artifício, rojões, pólvora negra, munições de qualquer calibre, espoletas, dinamite, detonadores e sinalizadores náuticos."
  },
  {
    category: "2. Gases, Combustíveis e Líquidos Inflamáveis",
    icon: "🔥",
    examples: "Gasolina, diesel, querosene, álcool combustível, solventes, tintas à base de solvente, botijões de gás (GLP ou oxigênio), aerossóis pressurizados e fósforos."
  },
  {
    category: "3. Armas de Fogo, Réplicas e Artigos Perigosos",
    icon: "🗡️",
    examples: "Armas de fogo (mesmo com porte/registro ou desmontadas), réplicas ou simulacros de armas, armas brancas de combate (facas táticas, adagas, espadas), tasers e sprays paralisantes."
  },
  {
    category: "4. Entorpecentes, Drogas e Substâncias Ilícitas",
    icon: "🚫",
    examples: "Drogas ilícitas, entorpecentes, matérias-primas químicas controladas pela Polícia Federal e medicamentos tarja preta sem prescrição médica."
  },
  {
    category: "5. Animais Vivos ou Silvestres",
    icon: "🐾",
    examples: "Cães, gatos, aves, répteis, insetos, peixes ou espécimes da fauna silvestre protegidos pelo IBAMA (transporte animal exige autorização e gaiola climatizada)."
  },
  {
    category: "6. Dinheiro em Espécie, Joias e Documentos Negociáveis",
    icon: "💰",
    examples: "Moeda corrente ou cédulas em espécie, barras de ouro, pedras preciosas, joias de alto valor, cheques ao portador, bilhetes de loteria e cartões bancários."
  },
  {
    category: "7. Materiais Biológicos, Tóxicos, Corrosivos e Hospitalares",
    icon: "☣️",
    examples: "Amostras de sangue, vírus, bactérias vivas, resíduos infectantes/hospitalares, pesticidas, venenos agrícolas, ácidos corrosivos e materiais radioativos."
  },
  {
    category: "8. Cargas que Excedam os Limites Físicos da Plataforma",
    icon: "⚖️",
    examples: "Pacotes com peso superior a 20 kg ou dimensões superiores a 60cm x 50cm x 40cm, ou que não caibam com segurança no porta-malas de um veículo de passeio."
  }
];

export default function PublicarEncomendaPage(): React.JSX.Element {
  const router = useRouter();
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth();
  const isSubmittingRef = useRef(false);

  // 1. Endereço de Retirada (Ponto A) — Inicialmente vazio para digitação real do usuário
  const [origin, setOrigin] = useState<ConfirmedAddress>({
    rawInput: "",
    formattedAddress: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "Belo Horizonte",
    stateUf: "MG",
    postalCode: "",
    lat: null,
    lon: null,
    isConfirmed: false,
    provider: ""
  });

  // 2. Endereço de Entrega (Ponto B) — Inicialmente vazio
  const [destination, setDestination] = useState<ConfirmedAddress>({
    rawInput: "",
    formattedAddress: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "Belo Horizonte",
    stateUf: "MG",
    postalCode: "",
    lat: null,
    lon: null,
    isConfirmed: false,
    provider: ""
  });

  const [hasUserCustomizedDestCity, setHasUserCustomizedDestCity] = useState(false);

  // 3. Peso Opcional (sem presunção automática nem valores fictícios)
  const [weightKg, setWeightKg] = useState("");

  // 4. Observações Opcionais
  const [observations, setObservations] = useState("");

  // 5. Valor Sugerido para o Transporte (R$) — Livre e sem teto
  const [suggestedPriceReais, setSuggestedPriceReais] = useState("35,00");

  // 6. Aceite dos Termos (DESMARCADO POR PADRÃO conforme diretriz estrita)
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Modal com a lista completa de itens proibidos
  const [showProhibitedModal, setShowProhibitedModal] = useState(false);

  // Rota calculada via OSRM (Km e Tempo) — Inicialmente 0 até que ambos os pontos sejam confirmados
  const [routeDistanceKm, setRouteDistanceKm] = useState<number>(0);
  const [routeDurationMins, setRouteDurationMins] = useState<number>(0);

  // Estados de feedback
  const [isLocatingOriginGps, setIsLocatingOriginGps] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedPrice = parseFloat(suggestedPriceReais.replace(",", ".").replace(/[^0-9.]/g, "")) || 0;

  // Atualização da rota viária quando calculada pelo componente do mapa
  const handleRouteCalculated = useCallback((distanceKm: number, durationMins: number) => {
    setRouteDistanceKm(distanceKm);
    setRouteDurationMins(durationMins);
  }, []);

  // Manipulador quando a origem muda:
  // Se o destino estiver configurado para a mesma cidade da retirada, sincroniza automaticamente
  const handleOriginChange = (newOrigin: ConfirmedAddress) => {
    setOrigin(newOrigin);

    if (!hasUserCustomizedDestCity) {
      setDestination((prev) => ({
        ...prev,
        city: newOrigin.city,
        stateUf: newOrigin.stateUf
      }));
    }
  };

  // Manipulador quando o destino muda
  const handleDestinationChange = (newDest: ConfirmedAddress) => {
    if (newDest.city.toLowerCase() !== origin.city.toLowerCase() || newDest.stateUf.toUpperCase() !== origin.stateUf.toUpperCase()) {
      setHasUserCustomizedDestCity(true);
    }
    setDestination(newDest);
  };

  // Redefinir destino para a mesma cidade da retirada
  const handleSyncDestinationWithOrigin = () => {
    setHasUserCustomizedDestCity(false);
    setDestination((prev) => ({
      ...prev,
      city: origin.city,
      stateUf: origin.stateUf,
      formattedAddress: buildFormattedAddress(prev.street || "", prev.number || "", prev.neighborhood || "", origin.city, origin.stateUf),
      isConfirmed: false
    }));
  };

  // Obter localização via GPS com Geocodificação Reversa
  const handleUseGpsOrigin = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setErrorMsg("Geolocalização não suportada no seu dispositivo. Preencha o Estado, Cidade e Endereço manualmente.");
      return;
    }

    setIsLocatingOriginGps(true);
    setErrorMsg(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;

        try {
          const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
          const res = await fetch(nominatimUrl, {
            headers: { "User-Agent": "TopicLog/1.0", Accept: "application/json" }
          });

          if (res.ok) {
            const data = await res.json();
            const addr = data.address || {};
            const foundCity = addr.city || addr.town || addr.municipality || addr.village || addr.city_district || origin.city;

            let foundUf = origin.stateUf;
            if (addr["ISO3166-2-lvl4"]) {
              foundUf = addr["ISO3166-2-lvl4"].replace("BR-", "").toUpperCase();
            }

            const road = addr.road || addr.pedestrian || "Localização Atual";
            const houseNumber = addr.house_number || "";
            const neighborhood = addr.suburb || addr.neighbourhood || addr.district || "";
            const formatted = buildFormattedAddress(road, houseNumber, neighborhood, foundCity, foundUf);

            const updatedOrigin: ConfirmedAddress = {
              rawInput: formatted,
              formattedAddress: formatted,
              street: road,
              number: houseNumber || undefined,
              neighborhood: neighborhood || undefined,
              city: foundCity,
              stateUf: foundUf,
              postalCode: addr.postcode || undefined,
              lat,
              lon,
              isConfirmed: true,
              provider: "GPS do Dispositivo + OpenStreetMap"
            };

            setOrigin(updatedOrigin);

            if (!hasUserCustomizedDestCity) {
              setDestination((prev) => ({
                ...prev,
                city: foundCity,
                stateUf: foundUf
              }));
            }
          }
        } catch {
          const raw = `Localização Atual (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
          setOrigin((prev) => ({
            ...prev,
            rawInput: raw,
            formattedAddress: raw,
            lat,
            lon,
            isConfirmed: true,
            provider: "GPS Direto"
          }));
        } finally {
          setIsLocatingOriginGps(false);
        }
      },
      (err) => {
        setIsLocatingOriginGps(false);
        setErrorMsg(`Não foi possível acessar o GPS (${err.message}). A digitação manual funciona normalmente.`);
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  // Ajuste do valor sugerido com botões +5 / -5
  const adjustPrice = (delta: number) => {
    const current = parsedPrice;
    const nextVal = Math.max(10, current + delta);
    setSuggestedPriceReais(nextVal.toFixed(2).replace(".", ","));
  };

  // Submissão da encomenda
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    // Validação de autenticação de Remetente
    if (!token || !user) {
      setErrorMsg("Você precisa estar conectado à sua conta de Remetente para publicar a encomenda e acompanhar as propostas recebidas. Clique em 'Entrar na conta' acima.");
      return;
    }

    if (user?.roles && !user.roles.includes("SENDER") && user.roles.includes("CARRIER")) {
      setErrorMsg("Sua conta atual está cadastrada exclusivamente como Transportador. Para publicar encomendas e receber propostas, acesse com uma conta de Remetente.");
      return;
    }

    // Validação estrita dos termos
    if (!acceptedTerms) {
      setErrorMsg("Você deve ler e aceitar os Termos de Uso declarando que a encomenda cumpre os limites e não contém itens proibidos.");
      return;
    }

    if (!origin.isConfirmed || !destination.isConfirmed) {
      setErrorMsg("Confirme a localização dos endereços de retirada e entrega clicando em '🔍 Localizar' em cada campo.");
      return;
    }

    const priceCents = Math.round(parsedPrice * 100);
    if (priceCents < 500) {
      setErrorMsg("O valor sugerido para o frete deve ser de no mínimo R$ 5,00.");
      return;
    }

    setIsSubmitting(true);
    isSubmittingRef.current = true;

    try {
      const title = observations.trim()
        ? `Encomenda: ${observations.trim().slice(0, 40)}${observations.length > 40 ? "..." : ""}`
        : `Encomenda de ${origin.city} para ${destination.city}`;

      const desc = observations.trim() || `Encomenda postada via TopicLog. Rota: ${origin.formattedAddress} até ${destination.formattedAddress}.`;

      // Regra de peso e volume: máximo 20 kg por encomenda (volume único)
      const rawWeight = weightKg.trim() ? parseFloat(weightKg.replace(",", ".")) : null;
      if (rawWeight !== null && !isNaN(rawWeight)) {
        if (rawWeight <= 0) {
          setErrorMsg("O peso da encomenda deve ser maior que zero kg.");
          setIsSubmitting(false);
          isSubmittingRef.current = false;
          return;
        }
        if (rawWeight > 20) {
          setErrorMsg("O peso máximo permitido na Topic Log é de 20 kg por encomenda (volume único).");
          setIsSubmitting(false);
          isSubmittingRef.current = false;
          return;
        }
      }
      const weightGrams = rawWeight && !isNaN(rawWeight) && rawWeight > 0 ? Math.round(rawWeight * 1000) : undefined;

      // Salva localmente garantindo persistência imediata com os dados reais do remetente
      addDemoShipment({
        title,
        description: desc,
        category: "GERAL",
        dimensions: { lengthCm: 30, widthCm: 25, heightCm: 20 },
        specialCare: observations.trim() ? [observations.trim()] : ["Pacote embalado"],
        originCity: origin.city,
        originNeighborhood: origin.neighborhood || origin.street || "Centro",
        destinationCity: destination.city,
        destinationNeighborhood: destination.neighborhood || destination.street || "Centro",
        weightGrams: weightGrams ?? null,
        maxVehicleType: "CAR",
        suggestedPriceCents: priceCents,
        deadlineDate: "Hoje ou a combinar",
        senderName: user?.displayName || "Remetente",
        senderKycVerified: Boolean(user?.kycStatus === "VERIFIED" || user?.canContractDelivery),
        interestedInInsurance: false,
        photoIcon: "📦"
      });

      if (token) {
        // Envia para o backend caso ativo
        try {
          const apiPayload: CreateShipmentPayload = {
            title,
            description: desc,
            category: "GERAL",
            weightGrams: weightGrams,
            dimensionsLengthCm: 30,
            dimensionsWidthCm: 25,
            dimensionsHeightCm: 20,
            suggestedPriceCents: priceCents,
            origin: {
              streetAndNumber: origin.number ? `${origin.street}, ${origin.number}` : origin.street || "Rua Principal",
              neighborhood: origin.neighborhood || "Centro",
              city: origin.city,
              stateUf: origin.stateUf,
              postalCode: origin.postalCode || "30000-000",
              latitude: origin.lat,
              longitude: origin.lon,
              formattedAddress: origin.formattedAddress,
              complement: origin.complement
            },
            destination: {
              streetAndNumber: destination.number ? `${destination.street}, ${destination.number}` : destination.street || "Rua Principal",
              neighborhood: destination.neighborhood || "Centro",
              city: destination.city,
              stateUf: destination.stateUf,
              postalCode: destination.postalCode || "30000-000",
              latitude: destination.lat,
              longitude: destination.lon,
              formattedAddress: destination.formattedAddress,
              complement: destination.complement
            }
          };

          await createShipmentApi(apiPayload, token);
        } catch (apiErr) {
          console.warn("Backend API offline, encomenda persistida localmente com sucesso:", apiErr);
        }
      }

      setSuccessMsg("✓ Encomenda publicada com sucesso! Redirecionando para suas encomendas...");
      setTimeout(() => {
        router.push("/encomendas");
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao publicar a encomenda. Tente novamente.";
      setErrorMsg(msg);
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  if (!authLoading && !isAuthenticated) {
    return (
      <main className="container" style={{ paddingTop: "40px", paddingBottom: "60px", maxWidth: "560px" }}>
        <div className="card" style={{ textAlign: "center", padding: "40px 24px", borderRadius: "16px", boxShadow: "var(--shadow-md)" }}>
          <div style={{ fontSize: "52px", marginBottom: "16px" }}>🔒</div>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Autenticação Necessária
          </span>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--color-brand-deep-navy)", margin: "8px 0 12px 0" }}>
            Acesse sua conta para publicar uma encomenda
          </h1>
          <p style={{ color: "var(--color-muted)", fontSize: "14px", lineHeight: "1.5", marginBottom: "28px" }}>
            Para solicitar o envio de uma carga, calcular rotas com precisão e receber propostas de motoristas parceiros com garantia de custódia, você precisa estar conectado à sua conta de Remetente.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Link
              href="/entrar"
              className="btn btn--primary"
              style={{ padding: "12px 20px", fontSize: "14px", fontWeight: 700, textDecoration: "none" }}
            >
              Fazer Login na Conta
            </Link>
            <Link
              href="/cadastro"
              className="btn btn--outline"
              style={{ padding: "12px 20px", fontSize: "14px", fontWeight: 700, textDecoration: "none" }}
            >
              Criar Conta Gratuita de Remetente
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!authLoading && isAuthenticated && user?.roles && !user.roles.includes("SENDER") && user.roles.includes("CARRIER")) {
    return (
      <main className="container" style={{ paddingTop: "40px", paddingBottom: "60px", maxWidth: "560px" }}>
        <div className="card" style={{ textAlign: "center", padding: "40px 24px", borderRadius: "16px", boxShadow: "var(--shadow-md)" }}>
          <div style={{ fontSize: "52px", marginBottom: "16px" }}>🚚</div>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#1D4ED8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Perfil de Transportador
          </span>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--color-brand-deep-navy)", margin: "8px 0 12px 0" }}>
            Publicação restrita a Remetentes
          </h1>
          <p style={{ color: "var(--color-muted)", fontSize: "14px", lineHeight: "1.5", marginBottom: "28px" }}>
            Você está conectado como <strong>Transportador</strong> ({user.displayName}). A publicação de novas encomendas é exclusiva para Remetentes. Ative o papel de Remetente em Minha Conta ou acesse o mural para enviar propostas de transporte.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Link
              href="/minha-conta"
              className="btn btn--primary"
              style={{ padding: "12px 20px", fontSize: "14px", fontWeight: 700, textDecoration: "none" }}
            >
              Ativar Remetente em Minha Conta
            </Link>
            <Link
              href="/feed"
              className="btn btn--outline"
              style={{ padding: "12px 20px", fontSize: "14px", fontWeight: 700, textDecoration: "none" }}
            >
              Ver Mural de Encomendas
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="uber-publish-container" style={{ maxWidth: "860px", margin: "0 auto", padding: "16px 12px 100px 12px" }}>
      {/* Mensagens de Sucesso ou Erro */}
      {errorMsg && (
        <div style={{ backgroundColor: "#FEE2E2", border: "1.5px solid #EF4444", color: "#991B1B", padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", fontSize: "14px", fontWeight: 600 }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {successMsg && (
        <div style={{ backgroundColor: "#DCFCE7", border: "1.5px solid #10B981", color: "#166534", padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", fontSize: "14px", fontWeight: 700 }}>
          {successMsg}
        </div>
      )}

      {isAuthenticated && user && (!user.roles || user.roles.includes("SENDER")) && (
        <div
          style={{
            backgroundColor: "#F0FDF4",
            border: "1px solid #86EFAC",
            borderRadius: "8px",
            padding: "10px 14px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "13px",
            color: "#166534"
          }}
        >
          <span>
            ✓ Conectado como Remetente: <strong>{user.displayName || user.email}</strong>
          </span>
          <span style={{ fontSize: "11px", color: "#15803D" }}>
            Propostas serão direcionadas para você
          </span>
        </div>
      )}

      {/* =========================================================================
          MAPA INTERATIVO NO TOPO COM OS 2 PONTOS EXATOS (A e B) E ROTA OSRM
          ========================================================================= */}
      <div style={{ marginBottom: "20px" }}>
        <TopicLogRouteMap
          origin={origin.isConfirmed && origin.lat && origin.lon ? { lat: origin.lat, lon: origin.lon, label: "Ponto A (Retirada)", address: origin.formattedAddress } : null}
          destination={destination.isConfirmed && destination.lat && destination.lon ? { lat: destination.lat, lon: destination.lon, label: "Ponto B (Entrega)", address: destination.formattedAddress } : null}
          onRouteCalculated={handleRouteCalculated}
          height="340px"
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", padding: "0 4px", flexWrap: "wrap", gap: "8px" }}>
          <button
            type="button"
            onClick={() => {
              const temp = origin;
              setOrigin(destination);
              setDestination(temp);
            }}
            style={{
              background: "#F1F5F9",
              border: "1px solid #CBD5E1",
              borderRadius: "6px",
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 700,
              color: "#334155",
              cursor: "pointer"
            }}
            title="Inverter endereço de retirada e entrega"
          >
            ⇅ Inverter Pontos A e B
          </button>

          <span style={{ fontSize: "12px", color: "var(--color-muted, #64748B)" }}>
            📍 Trajeto viário calculado: <strong>~{routeDistanceKm} km</strong> (~{routeDurationMins >= 60 ? `${Math.floor(routeDurationMins / 60)}h ${routeDurationMins % 60}min` : `${routeDurationMins} min`})
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* =========================================================================
            BLOCO 1: ENDEREÇOS COM NÚMERO SEPARADO (ORIGEM E DESTINO)
            ========================================================================= */}
        <div className="uber-card" style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
            <h1 className="uber-card-title" style={{ fontSize: "18px", margin: 0 }}>
              <span>📍</span> Endereços da Encomenda
            </h1>
          </div>
          <p className="uber-card-subtitle" style={{ marginBottom: "14px" }}>
            Informe o logradouro e o número da casa. O mapa localiza os 2 pontos exatos (A e B) com traçado viário.
          </p>

          <div className="uber-connected-inputs">
            {/* 1. Endereço de Retirada (Ponto A) */}
            <BrazilianAddressInput
              id="input-origin-address"
              label="Endereço de Retirada (Origem)"
              badgeType="origin"
              value={origin}
              onChange={handleOriginChange}
              onGpsClick={handleUseGpsOrigin}
              isGpsLocating={isLocatingOriginGps}
              placeholder="Rua, avenida, praça..."
            />

            {/* 2. Endereço de Entrega (Ponto B) */}
            <BrazilianAddressInput
              id="input-dest-address"
              label="Endereço de Entrega (Destino)"
              badgeType="destination"
              value={destination}
              onChange={handleDestinationChange}
              originCity={origin.city}
              originStateUf={origin.stateUf}
              onSyncWithOriginCity={handleSyncDestinationWithOrigin}
              placeholder="Rua, avenida, praça..."
            />
          </div>

          <div style={{ marginTop: "12px", padding: "10px 14px", backgroundColor: "#F8FAFC", borderRadius: "8px", border: "1px solid #E2E8F0", fontSize: "12px", color: "#475569", lineHeight: 1.4 }}>
            🌐 <strong>Cobertura em todo o Brasil:</strong> Você pode enviar de e para qualquer município brasileiro. A encomenda é publicada instantaneamente no marketplace para os transportadores da região.
          </div>
        </div>

        {/* =========================================================================
            BLOCO 2: VOLUME, PESO (MÁX. 20 KG) & OBSERVAÇÕES
            ========================================================================= */}
        <div className="uber-card" style={{ marginBottom: "20px" }}>
          <h2 className="uber-card-title" style={{ fontSize: "16px", margin: "0 0 4px 0" }}>
            <span>📦</span> Volume & Detalhes da Carga
          </h2>
          <p className="uber-card-subtitle" style={{ marginBottom: "12px" }}>
            Regra da plataforma: 1 volume e até 20 kg por pedido. Para mais volumes, cadastre um pedido separado.
          </p>

          {/* Destaque de Volume Único por Pedido */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: "#EFF6FF",
              border: "1.5px solid #BFDBFE",
              borderRadius: "10px",
              padding: "12px 14px",
              marginBottom: "16px",
              gap: "12px"
            }}
          >
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#1E40AF" }}>
                📦 Quantidade: 1 Volume por Pedido (Volume Único)
              </div>
              <div style={{ fontSize: "11px", color: "#3B82F6", marginTop: "2px", lineHeight: "1.3" }}>
                Cada encomenda cadastrada gera seu próprio código PIN individual de 4 dígitos para liberação do pagamento na entrega.
              </div>
            </div>
            <span
              style={{
                backgroundColor: "#2563EB",
                color: "#FFFFFF",
                fontWeight: 800,
                fontSize: "12px",
                padding: "4px 10px",
                borderRadius: "20px",
                whiteSpace: "nowrap"
              }}
            >
              1 Volume
            </span>
          </div>

          {/* Campo de Peso (Máximo 20 kg) */}
          <div className="form-group" style={{ marginBottom: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
              <label htmlFor="input-weight" style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-brand-deep-navy, #0F172A)" }}>
                ⚖️ Peso da Encomenda em kg (Máx. 20 kg • Opcional)
              </label>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#1E40AF" }}>
                Limite: até 20 kg
              </span>
            </div>
            <input
              id="input-weight"
              type="text"
              inputMode="decimal"
              placeholder="Ex.: 2.5 (máx. 20 kg • deixe em branco se não souber)"
              value={weightKg}
              onChange={(e) => {
                setWeightKg(e.target.value);
                const w = parseFloat(e.target.value.replace(",", "."));
                if (!isNaN(w) && w > 20) {
                  setErrorMsg("Atenção: O peso máximo permitido por envio na Topic Log é de 20 kg por volume.");
                } else if (errorMsg && errorMsg.includes("20 kg")) {
                  setErrorMsg(null);
                }
              }}
              className="form-control"
              style={{
                fontSize: "14px",
                borderRadius: "8px",
                height: "42px",
                borderColor: parseFloat(weightKg.replace(",", ".")) > 20 ? "#EF4444" : undefined
              }}
            />
            {parseFloat(weightKg.replace(",", ".")) > 20 && (
              <div style={{ fontSize: "12px", color: "#DC2626", fontWeight: 600, marginTop: "4px" }}>
                ⚠️ O peso informado excede o limite máximo permitido de 20 kg por pedido.
              </div>
            )}
            <div style={{ fontSize: "12px", color: "var(--color-muted, #64748B)", marginTop: "4px" }}>
              💡 Deixe em branco se não souber o peso exato. O Topic Log aceita encomendas de até 20 kg por volume.
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "4px" }}>
            <label htmlFor="input-observations" style={{ display: "block", fontSize: "13px", fontWeight: 700, marginBottom: "4px", color: "var(--color-brand-deep-navy, #0F172A)" }}>
              Instruções ou Cuidados Especiais (Opcional)
            </label>
            <textarea
              id="input-observations"
              rows={3}
              placeholder="Ex.: Pacote frágil com louças embaladas, procurar por D. Maria na portaria..."
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              className="form-control"
              style={{ fontSize: "14px", lineHeight: 1.4, borderRadius: "8px" }}
            />
          </div>
        </div>

        {/* =========================================================================
            BLOCO 3: VALOR SUGERIDO PARA O TRANSPORTE (R$) — SEM TETO
            ========================================================================= */}
        <div className="uber-card" style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 className="uber-card-title" style={{ fontSize: "16px", margin: 0 }}>
              <span>💰</span> Valor Sugerido para o Transporte (Frete)
            </h2>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#166534", background: "#DCFCE7", padding: "2px 8px", borderRadius: "4px" }}>
              Valor Livre • Sem Teto Máximo
            </span>
          </div>

          <p className="uber-card-subtitle" style={{ marginBottom: "14px" }}>
            Quanto você deseja pagar pelo transporte? O valor é totalmente livre. Os transportadores verão sua oferta e poderão aceitar ou enviar uma contraproposta.
          </p>

          <div className="uber-price-stepper-box">
            <button
              type="button"
              onClick={() => adjustPrice(-5)}
              className="uber-btn-back"
              style={{ width: "48px", height: "48px", fontSize: "18px", fontWeight: 800, padding: 0 }}
              aria-label="Diminuir 5 reais"
            >
              -5
            </button>

            <div style={{ flex: 1, position: "relative" }}>
              <span style={{ position: "absolute", left: "16px", top: "14px", fontSize: "16px", color: "var(--color-muted)", fontWeight: 700 }}>
                R$
              </span>
              <input
                id="input-suggested-price"
                type="text"
                required
                value={suggestedPriceReais}
                onChange={(e) => setSuggestedPriceReais(e.target.value)}
                className="form-control"
                style={{ textAlign: "center", fontSize: "24px", fontWeight: 800, height: "50px", color: "var(--color-brand-deep-navy, #0F172A)" }}
              />
            </div>

            <button
              type="button"
              onClick={() => adjustPrice(5)}
              className="uber-btn-back"
              style={{ width: "48px", height: "48px", fontSize: "18px", fontWeight: 800, padding: 0 }}
              aria-label="Aumentar 5 reais"
            >
              +5
            </button>
          </div>

          {/* Chips Rápidos de Preço */}
          <div className="uber-chip-group" style={{ justifyContent: "center", marginTop: "12px", marginBottom: "8px" }}>
            {["35,00", "50,00", "80,00", "120,00", "200,00"].map((p) => {
              const chipNum = parseFloat(p.replace(",", "."));
              const isActive = Math.abs(parsedPrice - chipNum) < 0.01;
              return (
                <button
                  key={`chip-price-${p}`}
                  type="button"
                  onClick={() => setSuggestedPriceReais(p)}
                  className={`uber-quick-chip ${isActive ? "uber-quick-chip--active" : ""}`}
                >
                  R$ {p}
                </button>
              );
            })}
          </div>

          <div style={{ backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "8px", padding: "12px 14px", marginTop: "12px", fontSize: "12px", color: "#166534" }}>
            <div style={{ fontWeight: 800, marginBottom: "4px", fontSize: "13px" }}>
              💡 Distinção Importante:
            </div>
            <div style={{ marginBottom: "3px" }}>
              • <strong>Valor Sugerido para o Transporte (Frete):</strong> Totalmente livre e <strong>sem teto</strong>. Você informa livremente quanto deseja pagar pelo serviço.
            </div>
            <div>
              • <strong>Valor do Objeto Declarado:</strong> Limite de cobertura padrão de até R$ 500,00 sobre a encomenda nos Termos de Uso.
            </div>
          </div>
        </div>

        {/* =========================================================================
            BLOCO 4: RESUMO SIMPLES NA PRÓPRIA TELA ANTES DE PUBLICAR
            ========================================================================= */}
        <div
          style={{
            backgroundColor: "#F8FAFC",
            border: "1px solid #CBD5E1",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "20px"
          }}
        >
          <div style={{ fontSize: "13px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-brand-deep-navy, #0F172A)", marginBottom: "10px" }}>
            📋 Resumo da Solicitação
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <span style={{ color: "var(--color-muted, #64748B)" }}>Retirada (A):</span>
              <strong style={{ textAlign: "right", color: "#065F46" }}>
                {origin.isConfirmed ? origin.formattedAddress : "Não confirmada"}
                {origin.complement ? ` (Compl.: ${origin.complement})` : ""}
              </strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <span style={{ color: "var(--color-muted, #64748B)" }}>Entrega (B):</span>
              <strong style={{ textAlign: "right", color: "#991B1B" }}>
                {destination.isConfirmed ? destination.formattedAddress : "Não confirmada"}
                {destination.complement ? ` (Compl.: ${destination.complement})` : ""}
              </strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <span style={{ color: "var(--color-muted, #64748B)" }}>Distância Estimada:</span>
              <strong>~{routeDistanceKm} km ({routeDurationMins >= 60 ? `${Math.floor(routeDurationMins / 60)}h ${routeDurationMins % 60}min` : `${routeDurationMins} min`})</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <span style={{ color: "var(--color-muted, #64748B)" }}>Peso:</span>
              <strong>
                {weightKg.trim() && parseFloat(weightKg.replace(",", ".")) > 0 ? (
                  `${parseFloat(weightKg.replace(",", ".")).toFixed(1)} kg`
                ) : (
                  <span style={{ color: "#94A3B8", fontStyle: "italic", fontWeight: 500 }}>Peso não informado</span>
                )}
              </strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <span style={{ color: "var(--color-muted, #64748B)" }}>Valor Sugerido (Frete):</span>
              <strong style={{ fontSize: "16px", color: "var(--color-primary, #2563EB)" }}>
                R$ {suggestedPriceReais} <span style={{ fontSize: "12px", fontWeight: 700, color: "#166534" }}>(Livre • Sem teto)</span>
              </strong>
            </div>

            {observations.trim() && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <span style={{ color: "var(--color-muted, #64748B)" }}>Observações:</span>
                <span style={{ textAlign: "right", fontStyle: "italic" }}>{observations.trim()}</span>
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            BLOCO 5: TERMOS DE ACEITE & DESCRIÇÃO DETALHADA DE ITENS PROIBIDOS
            ========================================================================= */}
        <div
          className="uber-terms-box"
          style={{
            marginBottom: "24px",
            backgroundColor: "#FFFFFF",
            border: "1.5px solid #CBD5E1",
            borderRadius: "12px",
            padding: "16px"
          }}
        >
          <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer", fontSize: "13px", lineHeight: 1.5 }}>
            <input
              id="check-terms"
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              style={{ marginTop: "3px", width: "22px", height: "22px", cursor: "pointer", accentColor: "#2563EB" }}
            />
            <div>
              <strong style={{ color: "#0F172A", display: "block" }}>
                Declaro que a encomenda pesa até 20 kg, tem valor de até R$ 500,00, está devidamente embalada e NÃO contém itens proibidos (como explosivos, combustíveis, armas, entorpecentes, animais ou dinheiro em espécie). Li e concordo com os{" "}
                <Link href="/termos" target="_blank" style={{ color: "#2563EB", textDecoration: "underline" }}>
                  Termos de Uso
                </Link>.
              </strong>
            </div>
          </label>

          {/* Botão de Destaque para Ver a Lista Completa de Itens Proibidos */}
          <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setShowProhibitedModal(true)}
              style={{
                background: "#FEF2F2",
                border: "1px solid #FCA5A5",
                color: "#991B1B",
                fontSize: "12px",
                fontWeight: 700,
                padding: "6px 12px",
                borderRadius: "6px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              🚫 Ver lista completa de itens proibidos e regras de transporte
            </button>

            <span style={{ fontSize: "11px", color: "#64748B" }}>
              Regras oficiais de segurança TopicLog
            </span>
          </div>
        </div>

        {/* =========================================================================
            MODAL INTERATIVO: LISTA COMPLETA DE ITENS PROIBIDOS
            ========================================================================= */}
        {showProhibitedModal && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(15, 23, 42, 0.75)",
              backdropFilter: "blur(4px)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px"
            }}
            onClick={() => setShowProhibitedModal(false)}
          >
            <div
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: "16px",
                maxWidth: "680px",
                width: "100%",
                maxHeight: "85vh",
                overflowY: "auto",
                padding: "24px",
                boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
                border: "1px solid #CBD5E1"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", borderBottom: "1px solid #E2E8F0", paddingBottom: "12px" }}>
                <div>
                  <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#991B1B", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>🚫</span> Itens com Transporte Proibido na TopicLog
                  </h2>
                  <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748B" }}>
                    Regulamento Oficial de Segurança e Diretrizes de Transporte da TopicLog.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowProhibitedModal(false)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "22px",
                    fontWeight: 700,
                    cursor: "pointer",
                    color: "#64748B",
                    padding: "4px"
                  }}
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
                {PROHIBITED_ITEMS_CATALOG.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "12px",
                      borderRadius: "8px",
                      backgroundColor: "#FFF5F5",
                      border: "1px solid #FED7D7",
                      display: "flex",
                      gap: "12px"
                    }}
                  >
                    <span style={{ fontSize: "24px" }}>{item.icon}</span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: "13px", color: "#9B2C2C", display: "block", marginBottom: "2px" }}>
                        {item.category}
                      </strong>
                      <span style={{ fontSize: "12px", color: "#4A5568", lineHeight: 1.4, display: "block" }}>
                        {item.examples}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "8px", padding: "12px", marginBottom: "16px", fontSize: "12px", color: "#166534" }}>
                ✓ <strong>O que pode ser transportado?</strong> Encomendas lícitas, documentos, peças de vestuário, livros, pequenos eletrônicos e encomendas comuns devidamente embaladas, pesando até 20 kg e no valor de até R$ 500,00.
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowProhibitedModal(false)}
                  className="uber-btn-primary"
                  style={{ padding: "10px 24px", fontSize: "14px", fontWeight: 700 }}
                >
                  Entendi e Estou Ciente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            DOCK INFERIOR FIXO COM O BOTÃO “Publicar Encomenda”
            ========================================================================= */}
        <div className="uber-action-dock">
          <div className="uber-action-dock-inner">
            <div className="uber-dock-summary">
              <span className="uber-dock-summary-label">
                Valor Sugerido • ~{routeDistanceKm} km
              </span>
              <span className="uber-dock-summary-value" style={{ color: "var(--color-primary, #2563EB)" }}>
                R$ {suggestedPriceReais}
              </span>
            </div>

            <div className="uber-dock-buttons">
              <button
                type="submit"
                className="uber-btn-primary"
                disabled={isSubmitting || !acceptedTerms || !origin.isConfirmed || !destination.isConfirmed}
                style={{
                  padding: "14px 28px",
                  fontSize: "16px",
                  fontWeight: 800,
                  opacity: (!acceptedTerms || !origin.isConfirmed || !destination.isConfirmed) ? 0.65 : 1
                }}
              >
                {isSubmitting ? "Publicando Encomenda..." : "Publicar Encomenda ➔"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
