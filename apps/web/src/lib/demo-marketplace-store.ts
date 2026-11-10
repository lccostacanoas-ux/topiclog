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

const INITIAL_SHIPMENTS: DemoShipment[] = [];

const INITIAL_TRIPS: DemoTrip[] = [];

const INITIAL_PROPOSALS: DemoProposal[] = [];

const INITIAL_THREADS: DemoChatThread[] = [];

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

export function removeDemoShipment(id: string): void {
  const current = getDemoShipments().filter((s) => s.id !== id);
  safeSetStorage(SHIPMENTS_STORAGE_KEY, current);
}

export function updateDemoShipment(id: string, updates: Partial<DemoShipment>): readonly DemoShipment[] {
  const current = getDemoShipments().map((s) => (s.id === id ? { ...s, ...updates } : s));
  safeSetStorage(SHIPMENTS_STORAGE_KEY, current);
  return current;
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
  return safeGetStorage<DemoProposal[]>(PROPOSALS_STORAGE_KEY, INITIAL_PROPOSALS);
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
