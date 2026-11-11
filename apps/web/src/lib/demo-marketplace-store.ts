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
  readonly weightGrams?: number | null;
  readonly maxVehicleType: VehicleTypeCode;
  readonly suggestedPriceCents: number;
  readonly deadlineDate: string;
  readonly senderName: string;
  readonly senderKycVerified: boolean;
  readonly status: "OPEN" | "IN_NEGOTIATION" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED";
  readonly interestedInInsurance: boolean;
  readonly photoIcon: string;
  readonly createdAt: string;
  readonly pickupCode?: string;
  readonly deliveryCode?: string;
  readonly tripStartedAt?: string;
  readonly estimatedDeliveryAt?: string;
  readonly deliveredAt?: string;
}

export interface DemoTrip {
  readonly id: string;
  readonly carrierId?: string;
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

export interface DemoRating {
  readonly id: string;
  readonly roleTarget: "CARRIER" | "SENDER";
  readonly stars: number; // 1 to 5
  readonly createdAt: string;
}

export interface RatingsSummary {
  readonly carrierCount: number;
  readonly carrierAvg: number;
  readonly senderCount: number;
  readonly senderAvg: number;
  readonly totalCount: number;
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
    id: "enc-foz-cascavel-01",
    title: "Documentos e Peças Leves (Foz ➔ Cascavel)",
    description: "Envelope lacrado com documentos fiscais e 2 peças leves de reposição. Coleta no Centro de Foz do Iguaçu e entrega em Cascavel.",
    category: "DOCUMENTOS",
    dimensions: { lengthCm: 30, widthCm: 22, heightCm: 8 },
    specialCare: ["Manuseio com cuidado", "Manter seco"],
    originCity: "Foz do Iguaçu",
    originNeighborhood: "Centro",
    destinationCity: "Cascavel",
    destinationNeighborhood: "Centro",
    weightGrams: 1500,
    maxVehicleType: "CAR",
    suggestedPriceCents: 500, // R$ 5,00 proposto pelo remetente
    deadlineDate: "Hoje até 21h",
    senderName: "Lucas Silveira",
    senderKycVerified: true,
    status: "IN_NEGOTIATION",
    interestedInInsurance: false,
    photoIcon: "📄",
    createdAt: "Hoje às 14:30",
    pickupCode: "4826",
    deliveryCode: "7391"
  }
];

const INITIAL_TRIPS: DemoTrip[] = [
  {
    id: "via-foz-cascavel-01",
    carrierId: "usr-luiz-carrier",
    carrierName: "Luiz Carlos Costa",
    carrierKycVerified: true,
    vehicleType: "CAR",
    vehicleModel: "Fiat Strada Endurance (Placa BRA2E19)",
    originCity: "Foz do Iguaçu",
    destinationCity: "Cascavel",
    intermediateStops: ["Santa Terezinha de Itaipu", "Medianeira"],
    departureDate: "Hoje",
    departureTime: "17:00",
    availableCapacityGrams: 20000,
    flexiblePickup: true,
    suggestedPricePerKgCents: 600, // R$ 6,00 tarifa da viagem
    status: "SCHEDULED",
    createdAt: "Hoje às 15:00"
  }
];

const INITIAL_PROPOSALS: DemoProposal[] = [
  {
    id: "prop-foz-cascavel-01",
    shipmentId: "enc-foz-cascavel-01",
    shipmentTitle: "Documentos e Peças Leves (Foz ➔ Cascavel)",
    route: "Foz do Iguaçu ➔ Cascavel",
    senderName: "Lucas Silveira",
    carrierName: "Luiz Carlos Costa",
    originalPriceCents: 500, // R$ 5,00 proposto pelo remetente
    proposedPriceCents: 600, // R$ 6,00 acordado pelo transportador Luiz
    platformCommissionCents: 120, // 20% TopicLog = R$ 1,20
    carrierNetCents: 480, // Líquido que o Luiz receberá = R$ 4,80
    message: "Olá Lucas! Faço essa rota Foz ➔ Cascavel hoje às 17h na minha Fiat Strada. Consigo levar por R$ 6,00 com entrega direta no seu destino.",
    status: "PENDING",
    isCurrentUserCarrier: false,
    createdAt: new Date().toISOString()
  }
];

const INITIAL_THREADS: DemoChatThread[] = [
  {
    id: "chat-foz-cascavel-01",
    contextTitle: "Documentos e Peças Leves (Foz ➔ Cascavel)",
    counterpartName: "Luiz Carlos Costa (Transportador)",
    counterpartRole: "TRANSPORTADOR",
    counterpartKycVerified: true,
    lastMessage: "Acabei de registrar a proposta de R$ 6,00 aqui. Você receberá líquido R$ 4,80 e a taxa TopicLog é R$ 1,20.",
    lastMessageTime: "15:15",
    unreadCount: 1,
    messages: [
      {
        id: "msg-1",
        senderName: "Lucas Silveira",
        isCurrentUser: true,
        text: "Olá Luiz! Preciso enviar um envelope com peças leves de Foz para Cascavel hoje. Sugeri R$ 5,00 no mural.",
        timestamp: "15:05"
      },
      {
        id: "msg-2",
        senderName: "Luiz Carlos Costa",
        isCurrentUser: false,
        text: "Boa tarde Lucas! Estou saindo de Foz do Iguaçu às 17h na minha Strada. Por R$ 6,00 eu entrego em mãos no Centro de Cascavel com código de segurança PIN.",
        timestamp: "15:12"
      },
      {
        id: "msg-3",
        senderName: "Luiz Carlos Costa",
        isCurrentUser: false,
        text: "Acabei de registrar a proposta de R$ 6,00 aqui. A divisão é: R$ 1,20 para a plataforma (20%) e R$ 4,80 para mim em repasse direto na minha conta Mercado Pago / Pix após a entrega!",
        timestamp: "15:15"
      }
    ]
  }
];

const SHIPMENTS_STORAGE_KEY = "topiclog_user_shipments_v4";
const TRIPS_STORAGE_KEY = "topiclog_user_trips_v4";
const PROPOSALS_STORAGE_KEY = "topiclog_user_proposals_v4";
const CHATS_STORAGE_KEY = "topiclog_user_chats_v4";
const RATINGS_STORAGE_KEY = "topiclog_community_ratings_v1";

function safeGetStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSetStorage<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    const str = JSON.stringify(data);
    window.localStorage.setItem(key, str);
    window.sessionStorage.setItem(key, str);
  } catch {
    // Silêncio em caso de restrição de storage
  }
}

export function getDemoShipments(): readonly DemoShipment[] {
  const stored = safeGetStorage<DemoShipment[]>(SHIPMENTS_STORAGE_KEY, []);
  const map = new Map<string, DemoShipment>();
  INITIAL_SHIPMENTS.forEach((s) => map.set(s.id, s));
  stored.forEach((s) => map.set(s.id, s));
  return Array.from(map.values());
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

export function removeDemoShipment(id: string): void {
  const current = getDemoShipments().filter((s) => s.id !== id);
  safeSetStorage(SHIPMENTS_STORAGE_KEY, current);
}

export function updateDemoShipment(id: string, updates: Partial<DemoShipment>): readonly DemoShipment[] {
  const current = getDemoShipments().map((s) => (s.id === id ? { ...s, ...updates } : s));
  safeSetStorage(SHIPMENTS_STORAGE_KEY, current);
  return current;
}

export function startTripWithPickupCode(
  shipmentId: string,
  providedCode: string,
  durationMins = 40
): { success: boolean; message: string; startedAt?: string; estimatedDeliveryAt?: string } {
  const shipments = getDemoShipments();
  const shipment = shipments.find((s) => s.id === shipmentId);
  if (!shipment) {
    return { success: false, message: "Encomenda não encontrada no sistema." };
  }

  const expectedCode = shipment.pickupCode || "4826";
  const cleanProvided = (providedCode || "").trim().replace(/\D/g, "");
  const cleanExpected = expectedCode.trim().replace(/\D/g, "");

  if (cleanProvided !== cleanExpected) {
    return {
      success: false,
      message: `Código de início incorreto. Solicite ao remetente o código correto gerado pela plataforma.`
    };
  }

  const now = new Date();
  const startedAt = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const arrivalDate = new Date(now.getTime() + durationMins * 60 * 1000);
  const estimatedDeliveryAt = arrivalDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  updateDemoShipment(shipmentId, {
    status: "IN_TRANSIT",
    tripStartedAt: startedAt,
    estimatedDeliveryAt
  });

  return {
    success: true,
    message: `Viagem disparada com sucesso às ${startedAt}! Previsão de entrega: ~${estimatedDeliveryAt}.`,
    startedAt,
    estimatedDeliveryAt
  };
}

export function completeTripWithDeliveryCode(
  shipmentId: string,
  providedCode: string
): { success: boolean; message: string; deliveredAt?: string } {
  const shipments = getDemoShipments();
  const shipment = shipments.find((s) => s.id === shipmentId);
  if (!shipment) {
    return { success: false, message: "Encomenda não encontrada no sistema." };
  }

  const expectedCode = shipment.deliveryCode || "7391";
  const cleanProvided = (providedCode || "").trim().replace(/\D/g, "");
  const cleanExpected = expectedCode.trim().replace(/\D/g, "");

  if (cleanProvided !== cleanExpected) {
    return {
      success: false,
      message: `Código de entrega incorreto. Solicite ao destinatário o código de conclusão fornecido pela plataforma.`
    };
  }

  const now = new Date();
  const deliveredAt = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  updateDemoShipment(shipmentId, {
    status: "DELIVERED",
    deliveredAt
  });

  return {
    success: true,
    message: `Entrega validada com sucesso às ${deliveredAt}! Split financeiro liberado na conta Mercado Pago.`,
    deliveredAt
  };
}

export function getDemoTrips(): readonly DemoTrip[] {
  const stored = safeGetStorage<DemoTrip[]>(TRIPS_STORAGE_KEY, []);
  const map = new Map<string, DemoTrip>();
  INITIAL_TRIPS.forEach((t) => map.set(t.id, t));
  stored.forEach((t) => map.set(t.id, t));
  const trips = Array.from(map.values());
  // Sanitização automática: remove viagens de teste criadas indevidamente por perfil de remetente (Leci)
  const sanitized = trips.filter((t) => !t.carrierName?.toLowerCase().includes("leci"));
  return sanitized;
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

export function removeDemoTrip(id: string): void {
  const current = getDemoTrips().filter((t) => t.id !== id);
  safeSetStorage(TRIPS_STORAGE_KEY, current);
}

export function updateDemoTrip(id: string, updates: Partial<DemoTrip>): readonly DemoTrip[] {
  const current = getDemoTrips().map((t) => (t.id === id ? { ...t, ...updates } : t));
  safeSetStorage(TRIPS_STORAGE_KEY, current);
  return current;
}

export function getDemoProposals(): readonly DemoProposal[] {
  const stored = safeGetStorage<DemoProposal[]>(PROPOSALS_STORAGE_KEY, []);
  const map = new Map<string, DemoProposal>();
  INITIAL_PROPOSALS.forEach((p) => map.set(p.id, p));
  stored.forEach((p) => map.set(p.id, p));
  const proposals = Array.from(map.values());
  // Sanitização automática: remove propostas de teste onde remetente puro (Leci) figurava como transportador
  const sanitized = proposals.filter((p) => !p.carrierName?.toLowerCase().includes("leci"));
  return sanitized;
}

export function addDemoProposal(proposal: Omit<DemoProposal, "id" | "createdAt" | "status">): DemoProposal {
  const current = [...getDemoProposals()];
  // Trava anti-duplicidade: não permite criar nova proposta pendente se já houver uma ativa para a mesma carga
  const existing = current.find(p => p.shipmentId === proposal.shipmentId && (p.status === "PENDING" || p.status === "COUNTER_PROPOSED"));
  if (existing) {
    return existing;
  }
  const created: DemoProposal = {
    ...proposal,
    id: `prop-${Date.now().toString(36)}`,
    status: "PENDING",
    createdAt: "Agora mesmo"
  };
  const updated = [created, ...current];
  safeSetStorage(PROPOSALS_STORAGE_KEY, updated);
  return created;
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

export function removeDemoProposal(proposalId: string): readonly DemoProposal[] {
  const current = getDemoProposals().filter((p) => p.id !== proposalId);
  safeSetStorage(PROPOSALS_STORAGE_KEY, current);
  return current;
}

export function getDemoChatThreads(): readonly DemoChatThread[] {
  const stored = safeGetStorage<DemoChatThread[]>(CHATS_STORAGE_KEY, []);
  const map = new Map<string, DemoChatThread>();
  INITIAL_THREADS.forEach((th) => map.set(th.id, th));
  stored.forEach((th) => map.set(th.id, th));
  return Array.from(map.values());
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

export function getDemoRatings(): readonly DemoRating[] {
  return safeGetStorage<DemoRating[]>(RATINGS_STORAGE_KEY, []);
}

export function addDemoRating(rating: Omit<DemoRating, "id" | "createdAt">): DemoRating {
  const current = [...getDemoRatings()];
  const created: DemoRating = {
    ...rating,
    id: `rat-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString()
  };
  safeSetStorage(RATINGS_STORAGE_KEY, [created, ...current]);
  return created;
}

export function getRatingsSummary(): RatingsSummary {
  const all = getDemoRatings();
  const carrierRatings = all.filter(r => r.roleTarget === "CARRIER");
  const senderRatings = all.filter(r => r.roleTarget === "SENDER");

  const carrierAvg = carrierRatings.length > 0
    ? carrierRatings.reduce((sum, r) => sum + r.stars, 0) / carrierRatings.length
    : 0;
  const senderAvg = senderRatings.length > 0
    ? senderRatings.reduce((sum, r) => sum + r.stars, 0) / senderRatings.length
    : 0;

  return {
    carrierCount: carrierRatings.length,
    carrierAvg,
    senderCount: senderRatings.length,
    senderAvg,
    totalCount: all.length
  };
}

export function clearAllTestData(): void {
  if (typeof window === "undefined") return;
  try {
    const keys = [
      SHIPMENTS_STORAGE_KEY,
      TRIPS_STORAGE_KEY,
      PROPOSALS_STORAGE_KEY,
      CHATS_STORAGE_KEY,
      RATINGS_STORAGE_KEY,
      "topiclog_user_shipments_v3",
      "topiclog_user_trips_v3",
      "topiclog_user_proposals_v3",
      "topiclog_user_chats_v3",
      "topiclog_user_shipments_v2",
      "topiclog_user_shipments",
      "topiclog_user_trips",
      "topiclog_user_proposals"
    ];
    for (const k of keys) {
      window.localStorage.removeItem(k);
      window.sessionStorage.removeItem(k);
    }
  } catch {
    // silencioso
  }
}
