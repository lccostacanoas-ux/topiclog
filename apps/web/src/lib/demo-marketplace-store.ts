import type { VehicleTypeCode } from "./types";

export type ShipmentCategory =
  | "DOCUMENTOS"
  | "AUTOPECAS"
  | "ELETRONICOS"
  | "SAUDE"
  | "ALIMENTOS"
  | "GERAL";

export interface ShipmentDimensions {
  readonly lengthCm: number;
  readonly widthCm: number;
  readonly heightCm: number;
}

export interface DemoShipment {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: ShipmentCategory;
  readonly dimensions: ShipmentDimensions;
  readonly specialCare: readonly string[];
  readonly originCity: string;
  readonly originNeighborhood: string;
  readonly destinationCity: string;
  readonly destinationNeighborhood: string;
  readonly weightGrams: number;
  readonly maxVehicleType: VehicleTypeCode;
  readonly suggestedPriceCents: number;
  readonly deadlineDate: string;
  readonly senderName: string;
  readonly senderKycVerified: boolean;
  readonly status: "OPEN" | "IN_NEGOTIATION" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED";
  readonly interestedInInsurance: boolean;
  readonly photoIcon: string;
  readonly createdAt: string;
}

export interface DemoTrip {
  readonly id: string;
  readonly carrierName: string;
  readonly carrierKycVerified: boolean;
  readonly vehicleType: VehicleTypeCode;
  readonly vehicleModel: string;
  readonly originCity: string;
  readonly destinationCity: string;
  readonly intermediateStops: readonly string[];
  readonly departureDate: string;
  readonly departureTime: string;
  readonly availableCapacityGrams: number;
  readonly flexiblePickup: boolean;
  readonly suggestedPricePerKgCents: number;
  readonly status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  readonly createdAt: string;
}

export interface DemoProposal {
  readonly id: string;
  readonly shipmentId: string;
  readonly shipmentTitle: string;
  readonly route: string;
  readonly senderName: string;
  readonly carrierName: string;
  readonly originalPriceCents: number;
  readonly proposedPriceCents: number;
  readonly platformCommissionCents: number;
  readonly carrierNetCents: number;
  readonly message: string;
  readonly status: "PENDING" | "ACCEPTED" | "COUNTER_PROPOSED" | "REJECTED";
  readonly isCurrentUserCarrier: boolean;
  readonly createdAt: string;
}

export interface DemoChatMessage {
  readonly id: string;
  readonly senderName: string;
  readonly isCurrentUser: boolean;
  readonly text: string;
  readonly timestamp: string;
}

export interface DemoChatThread {
  readonly id: string;
  readonly contextTitle: string;
  readonly counterpartName: string;
  readonly counterpartRole: "REMETENTE" | "TRANSPORTADOR";
  readonly counterpartKycVerified: boolean;
  readonly lastMessage: string;
  readonly lastMessageTime: string;
  readonly unreadCount: number;
  readonly messages: readonly DemoChatMessage[];
}

const INITIAL_SHIPMENTS: DemoShipment[] = [
  {
    id: "enc-001",
    title: "Documentos e Contratos Jurídicos Lacrados",
    description: "Envelope pardo impermeável contendo 3 vias assinadas de contrato societário. Não dobrar nem expor ao calor.",
    category: "DOCUMENTOS",
    dimensions: { lengthCm: 32, widthCm: 24, heightCm: 4 },
    specialCare: ["Não Dobrar", "Protegido de Chuva", "Lacrado"],
    originCity: "João Monlevade",
    originNeighborhood: "Carneirinhos",
    destinationCity: "Belo Horizonte",
    destinationNeighborhood: "Savassi",
    weightGrams: 800,
    maxVehicleType: "MOTORCYCLE",
    suggestedPriceCents: 4500,
    deadlineDate: "Hoje até 18h",
    senderName: "Carlos M.",
    senderKycVerified: true,
    status: "OPEN",
    interestedInInsurance: false,
    photoIcon: "📄",
    createdAt: "Hoje às 08:30"
  },
  {
    id: "enc-002",
    title: "Válvula Reguladora de Pressão Mecânica",
    description: "Caixa reforçada com espuma interna contendo válvula metálica de precisão para linha de produção siderúrgica.",
    category: "AUTOPECAS",
    dimensions: { lengthCm: 25, widthCm: 20, heightCm: 15 },
    specialCare: ["Carga Mecânica", "Manter na Horizontal", "Caixa Lacrada"],
    originCity: "João Monlevade",
    originNeighborhood: "Distrito Industrial",
    destinationCity: "Ipatinga",
    destinationNeighborhood: "Horto",
    weightGrams: 7500,
    maxVehicleType: "CAR",
    suggestedPriceCents: 9000,
    deadlineDate: "Amanhã até 12h",
    senderName: "Metalúrgica Vale",
    senderKycVerified: true,
    status: "OPEN",
    interestedInInsurance: true,
    photoIcon: "⚙️",
    createdAt: "Hoje às 09:15"
  },
  {
    id: "enc-003",
    title: "Frascos Térmicos com Amostras de Solo Inertes",
    description: "Caixa de isopor pequena com 6 frascos lacrados de amostras minerais para laboratório agronômico. Carga não perigosa.",
    category: "SAUDE",
    dimensions: { lengthCm: 28, widthCm: 18, heightCm: 14 },
    specialCare: ["Frágil", "Isopor Térmico", "Inerte"],
    originCity: "Belo Horizonte",
    originNeighborhood: "Pampulha",
    destinationCity: "João Monlevade",
    destinationNeighborhood: "Centro",
    weightGrams: 2300,
    maxVehicleType: "CAR",
    suggestedPriceCents: 6500,
    deadlineDate: "Amanhã até 16h",
    senderName: "Laboratório Minas Agrícola",
    senderKycVerified: true,
    status: "IN_NEGOTIATION",
    interestedInInsurance: false,
    photoIcon: "🧪",
    createdAt: "Ontem às 17:40"
  },
  {
    id: "enc-004",
    title: "Coleção de Apostilas e Cadernos Didáticos",
    description: "Dois pacotes amarrados com fita contendo apostilas escolares para centro de formação comunitário.",
    category: "GERAL",
    dimensions: { lengthCm: 30, widthCm: 22, heightCm: 20 },
    specialCare: ["Manter Seco", "Amarrado com Fita"],
    originCity: "João Monlevade",
    originNeighborhood: "Castelo",
    destinationCity: "Itabira",
    destinationNeighborhood: "Campestre",
    weightGrams: 4500,
    maxVehicleType: "MOTORCYCLE",
    suggestedPriceCents: 4000,
    deadlineDate: "Em até 2 dias",
    senderName: "Prof. Mariana S.",
    senderKycVerified: false,
    status: "OPEN",
    interestedInInsurance: false,
    photoIcon: "📚",
    createdAt: "Hoje às 07:10"
  },
  {
    id: "enc-005",
    title: "Medicamentos e Suplementos Especiais",
    description: "Embalagem farmacêutica lacrada com suplementação e medicamentos não controlados. Não exige refrigeração contínua.",
    category: "SAUDE",
    dimensions: { lengthCm: 20, widthCm: 15, heightCm: 10 },
    specialCare: ["Protegido da Luz", "Caixa Lacrada"],
    originCity: "Belo Horizonte",
    originNeighborhood: "Barro Preto",
    destinationCity: "Nova Era",
    destinationNeighborhood: "Centro",
    weightGrams: 1500,
    maxVehicleType: "MOTORCYCLE",
    suggestedPriceCents: 5500,
    deadlineDate: "Hoje até 20h",
    senderName: "Drogaria Central BH",
    senderKycVerified: true,
    status: "OPEN",
    interestedInInsurance: true,
    photoIcon: "💊",
    createdAt: "Hoje às 10:00"
  },
  {
    id: "enc-006",
    title: "Cesta de Doces Artesanais e Compotas Típicas",
    description: "Cesta de madeira revestida com plástico bolha contendo potes de compotas e queijos artesanais de Ouro Preto.",
    category: "ALIMENTOS",
    dimensions: { lengthCm: 35, widthCm: 25, heightCm: 18 },
    specialCare: ["Frágil (Vidro)", "Plástico Bolha", "Manter em Pé"],
    originCity: "Ouro Preto",
    originNeighborhood: "Barra",
    destinationCity: "Belo Horizonte",
    destinationNeighborhood: "Lourdes",
    weightGrams: 3800,
    maxVehicleType: "CAR",
    suggestedPriceCents: 5000,
    deadlineDate: "Sexta-feira até 15h",
    senderName: "Artesanato Estrada Real",
    senderKycVerified: true,
    status: "OPEN",
    interestedInInsurance: false,
    photoIcon: "🎁",
    createdAt: "Ontem às 14:20"
  }
];

const INITIAL_TRIPS: DemoTrip[] = [
  {
    id: "via-001",
    carrierName: "Marcos Vinícius",
    carrierKycVerified: true,
    vehicleType: "CAR",
    vehicleModel: "Fiat Strada 2023 (Caçamba fechada com capota marítima)",
    originCity: "João Monlevade",
    destinationCity: "Belo Horizonte",
    intermediateStops: ["Barão de Cocais", "Caeté"],
    departureDate: "Amanhã (14/10)",
    departureTime: "07:30",
    availableCapacityGrams: 16000,
    flexiblePickup: true,
    suggestedPricePerKgCents: 800,
    status: "SCHEDULED",
    createdAt: "Hoje às 08:00"
  },
  {
    id: "via-002",
    carrierName: "Rodrigo Almeida",
    carrierKycVerified: true,
    vehicleType: "MOTORCYCLE",
    vehicleModel: "Honda CG 160 (Baú reforçado impermeável 45L)",
    originCity: "Belo Horizonte",
    destinationCity: "João Monlevade",
    intermediateStops: [],
    departureDate: "Hoje (13/10)",
    departureTime: "14:00",
    availableCapacityGrams: 10000,
    flexiblePickup: false,
    suggestedPricePerKgCents: 1200,
    status: "SCHEDULED",
    createdAt: "Hoje às 09:30"
  },
  {
    id: "via-003",
    carrierName: "Gabriel Ciclista",
    carrierKycVerified: true,
    vehicleType: "BICYCLE",
    vehicleModel: "Bicicleta Urbana Cargueira (Bolsas laterais impermeáveis)",
    originCity: "João Monlevade",
    destinationCity: "João Monlevade (Urbano)",
    intermediateStops: ["Carneirinhos", "Loanda", "Areia Preta"],
    departureDate: "Diário (Seg a Sex)",
    departureTime: "09:00 às 17:00",
    availableCapacityGrams: 5000,
    flexiblePickup: true,
    suggestedPricePerKgCents: 500,
    status: "SCHEDULED",
    createdAt: "Ontem às 11:00"
  },
  {
    id: "via-004",
    carrierName: "Eduardo Silveira",
    carrierKycVerified: true,
    vehicleType: "CAR",
    vehicleModel: "Renault Duster (Porta-malas 475L livre)",
    originCity: "Ipatinga",
    destinationCity: "Belo Horizonte",
    intermediateStops: ["Coronel Fabriciano", "João Monlevade"],
    departureDate: "Quinta-feira (15/10)",
    departureTime: "06:00",
    availableCapacityGrams: 20000,
    flexiblePickup: true,
    suggestedPricePerKgCents: 750,
    status: "SCHEDULED",
    createdAt: "Hoje às 06:45"
  }
];

const INITIAL_PROPOSALS: DemoProposal[] = [
  {
    id: "prop-001",
    shipmentId: "enc-001",
    shipmentTitle: "Documentos Jurídicos Lacrados (JM -> BH)",
    route: "João Monlevade ➔ Belo Horizonte",
    senderName: "Carlos M.",
    carrierName: "Marcos Vinícius",
    originalPriceCents: 4500,
    proposedPriceCents: 5000,
    platformCommissionCents: 650, // 13% de 5000 (D10)
    carrierNetCents: 4350,
    message: "Posso coletar no seu escritório em Carneirinhos às 07:15 e entrego na Savassi antes das 10h da manhã.",
    status: "PENDING",
    isCurrentUserCarrier: false,
    createdAt: "Hoje às 09:00"
  },
  {
    id: "prop-002",
    shipmentId: "enc-002",
    shipmentTitle: "Válvula Mecânica de Precisão (JM -> Ipatinga)",
    route: "João Monlevade ➔ Ipatinga",
    senderName: "Metalúrgica Vale",
    carrierName: "Eduardo Silveira",
    originalPriceCents: 9000,
    proposedPriceCents: 9000,
    platformCommissionCents: 1170, // 13% de 9000 (D10)
    carrierNetCents: 7830,
    message: "Passo no Distrito Industrial na manhã de quinta e levo direto ao Horto em Ipatinga pela BR-381.",
    status: "ACCEPTED",
    isCurrentUserCarrier: true,
    createdAt: "Ontem às 18:30"
  },
  {
    id: "prop-003",
    shipmentId: "enc-003",
    shipmentTitle: "Frascos Térmicos com Amostras (BH -> JM)",
    route: "Belo Horizonte ➔ João Monlevade",
    senderName: "Laboratório Minas Agrícola",
    carrierName: "Rodrigo Almeida",
    originalPriceCents: 6500,
    proposedPriceCents: 7500,
    platformCommissionCents: 975, // 13% de 7500 (D10)
    carrierNetCents: 6525,
    message: "Como o item exige baú térmico isolado, proponho R$ 75,00 para garantir a integridade da amostra.",
    status: "COUNTER_PROPOSED",
    isCurrentUserCarrier: false,
    createdAt: "Hoje às 10:15"
  }
];

const INITIAL_THREADS: DemoChatThread[] = [
  {
    id: "chat-001",
    contextTitle: "Documentos Jurídicos (JM -> BH)",
    counterpartName: "Marcos Vinícius",
    counterpartRole: "TRANSPORTADOR",
    counterpartKycVerified: true,
    lastMessage: "Combinado! Estou com o carro preparado para a saída amanhã cedo.",
    lastMessageTime: "10:45",
    unreadCount: 1,
    messages: [
      {
        id: "m-1",
        senderName: "Carlos M.",
        isCurrentUser: true,
        text: "Olá Marcos! Você consegue retirar o envelope na recepção do prédio comercial em Carneirinhos?",
        timestamp: "09:30"
      },
      {
        id: "m-2",
        senderName: "Marcos Vinícius",
        isCurrentUser: false,
        text: "Olá Carlos! Sim, passo aí por volta das 07:15. O envelope já estará pronto?",
        timestamp: "09:42"
      },
      {
        id: "m-3",
        senderName: "Carlos M.",
        isCurrentUser: true,
        text: "Sim, lacrado e identificado. Toda negociação formalizada pela plataforma.",
        timestamp: "10:10"
      },
      {
        id: "m-4",
        senderName: "Marcos Vinícius",
        isCurrentUser: false,
        text: "Combinado! Estou com o carro preparado para a saída amanhã cedo.",
        timestamp: "10:45"
      }
    ]
  },
  {
    id: "chat-002",
    contextTitle: "Válvula Mecânica (JM -> Ipatinga)",
    counterpartName: "Eduardo Silveira",
    counterpartRole: "TRANSPORTADOR",
    counterpartKycVerified: true,
    lastMessage: "Perfeito, vou confirmar a coleta assim que chegar.",
    lastMessageTime: "Ontem",
    unreadCount: 0,
    messages: [
      {
        id: "m-201",
        senderName: "Metalúrgica Vale",
        isCurrentUser: true,
        text: "Eduardo, a peça tem 7,5 kg e já está na caixa de madeira reforçada.",
        timestamp: "Ontem 16:20"
      },
      {
        id: "m-202",
        senderName: "Eduardo Silveira",
        isCurrentUser: false,
        text: "Perfeito, vou confirmar a coleta assim que chegar ao Distrito Industrial.",
        timestamp: "Ontem 17:05"
      }
    ]
  }
];

const SHIPMENTS_STORAGE_KEY = "topiclog_demo_shipments_v2";
const TRIPS_STORAGE_KEY = "topiclog_demo_trips_v2";
const PROPOSALS_STORAGE_KEY = "topiclog_demo_proposals_v2";
const CHATS_STORAGE_KEY = "topiclog_demo_chats_v2";

function safeGetStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSetStorage<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Silêncio em caso de restrição de storage
  }
}

export function getDemoShipments(): readonly DemoShipment[] {
  return safeGetStorage<DemoShipment[]>(SHIPMENTS_STORAGE_KEY, INITIAL_SHIPMENTS);
}

export function addDemoShipment(shipment: Omit<DemoShipment, "id" | "createdAt" | "status">): DemoShipment {
  const current = [...getDemoShipments()];
  const created: DemoShipment = {
    ...shipment,
    id: `enc-${Date.now().toString(36)}`,
    status: "OPEN",
    createdAt: "Agora mesmo"
  };
  const updated = [created, ...current];
  safeSetStorage(SHIPMENTS_STORAGE_KEY, updated);
  return created;
}

export function getDemoTrips(): readonly DemoTrip[] {
  return safeGetStorage<DemoTrip[]>(TRIPS_STORAGE_KEY, INITIAL_TRIPS);
}

export function addDemoTrip(trip: Omit<DemoTrip, "id" | "createdAt" | "status">): DemoTrip {
  const current = [...getDemoTrips()];
  const created: DemoTrip = {
    ...trip,
    id: `via-${Date.now().toString(36)}`,
    status: "SCHEDULED",
    createdAt: "Agora mesmo"
  };
  const updated = [created, ...current];
  safeSetStorage(TRIPS_STORAGE_KEY, updated);
  return created;
}

export function getDemoProposals(): readonly DemoProposal[] {
  return safeGetStorage<DemoProposal[]>(PROPOSALS_STORAGE_KEY, INITIAL_PROPOSALS);
}

export function updateProposalStatus(
  proposalId: string,
  newStatus: "ACCEPTED" | "REJECTED" | "COUNTER_PROPOSED",
  counterValueCents?: number
): readonly DemoProposal[] {
  const current = getDemoProposals().map((p) => {
    if (p.id !== proposalId) return p;
    if (newStatus === "COUNTER_PROPOSED" && counterValueCents) {
      const commission = Math.round(counterValueCents * 0.13);
      return {
        ...p,
        status: newStatus,
        proposedPriceCents: counterValueCents,
        platformCommissionCents: commission,
        carrierNetCents: counterValueCents - commission
      };
    }
    return { ...p, status: newStatus };
  });
  safeSetStorage(PROPOSALS_STORAGE_KEY, current);
  return current;
}

export function getDemoChatThreads(): readonly DemoChatThread[] {
  return safeGetStorage<DemoChatThread[]>(CHATS_STORAGE_KEY, INITIAL_THREADS);
}

export function sendDemoMessage(threadId: string, text: string, senderName = "Você"): readonly DemoChatThread[] {
  const current = getDemoChatThreads().map((t) => {
    if (t.id !== threadId) return t;
    const newMsg: DemoChatMessage = {
      id: `m-${Date.now().toString(36)}`,
      senderName,
      isCurrentUser: true,
      text,
      timestamp: "Agora"
    };
    return {
      ...t,
      lastMessage: text,
      lastMessageTime: "Agora",
      messages: [...t.messages, newMsg]
    };
  });
  safeSetStorage(CHATS_STORAGE_KEY, current);
  return current;
}
