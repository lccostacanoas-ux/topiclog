import type {
  ApiFetchResult,
  AuthSessionResponse,
  BilateralKycEvaluationResponse,
  CreateShipmentPayload,
  CreateTripPayload,
  EvaluateBilateralKycRequest,
  KycDossierResponse,
  LoginRequest,
  LogoutRequest,
  PrivateUserProfileResponse,
  ProblemDetailsDto,
  PublicUserCardResponse,
  ReanalyzeKycCaseRequest,
  RefreshTokenRequest,
  CompatibleShipmentsResponse,
  CompatibleTripsResponse,
  MatchEvaluationResultDto,
  NearbyShipmentsResponse,
  RegionCityDto,
  RegisterUserRequest,
  ReviewKycDecisionRequest,
  ShipmentDetailDto,
  ShipmentSummaryDto,
  SubmitKycCaseRequest,
  SystemFeatureFlagsResponse,
  TermsResponsibilityManifestResponse,
  TripDto,
  TripSummaryDto,
  UpdateProfileRequest,
  CursorPagedResultDto,
  OpportunityFeedItemDto,
  SearchMunicipalitiesResponse,
  MunicipalitySearchItemDto,
  CancelContractRequest,
  ContractDto,
  CounterProposalRequest,
  CreateProposalRequest,
  PriorityOfferDto,
  ProposalDto,
  ProposalEventDto,
  SandboxTokenResponse,
  DeliveryChallengeDto,
  DeliveryEventDto,
  DeliveryExceptionDto,
  DeliveryOrderDto,
  DeliveryProofDto,
  DeliveryTrackingDto,
  PickupCheckinRequest,
  ConfirmPickupRequest,
  ConfirmDeliveryRequest,
  UploadDeliveryProofRequest,
  ReportDeliveryExceptionRequest,
  RescheduleDeliveryRequest,
  InitiateReturnRequest,
  PostDeliverySuggestionDto,
  CommercialPolicyDto,
  SubscriptionPlanDto,
  CarrierSubscriptionDto,
  AdminDashboardMetricsDto,
  OperationalSettingsDto,
  UpdateOperationalSettingsDto,
  CarrierVehicleDto,
  ModerateVehicleDto,
  PaymentMethodDto,
  TogglePaymentMethodDto,
  CheckoutSimulationDto,
  CheckoutSimulationRequestDto,
  AdminAuditEventDto,
  LegalDocumentTemplateDto,
  CreateLegalTemplateDto,
  UpdateLegalTemplateDto,
  ApproveLegalTemplateDto,
  PublishLegalTemplateDto,
  PreviewLegalTemplateRequestDto,
  PreviewLegalTemplateResponseDto,
  CompareLegalVersionsResponseDto,
  LegalAcceptanceDto
} from "./types";

export type { ApiFetchResult };

export const CORRELATION_ID_HEADER = "X-Correlation-Id";

/**
 * URL base da API .NET 10.
 * No navegador, utiliza URL relativa vazia ("") para que todas as requisições /api/... passem
 * de forma transparente pelo proxy rewrite do Next.js, funcionando perfeitamente em localhost,
 * no IP da rede Wi-Fi local para smartphones (ex: 192.168.0.11:3000) e em produção.
 * No servidor (SSR/Node.js), utiliza o endereço local absoluto do backend.
 */
export function getApiBaseUrl(): string {
  const configured = process.env["NEXT_PUBLIC_API_BASE_URL"];
  if (configured && configured.trim().length > 0) {
    return configured.trim().replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    return "";
  }
  return process.env["API_BASE_URL"] || "http://127.0.0.1:5080";
}

/**
 * Políticas e Feature Flags iniciais padrão (Fallback seguro quando a API não estiver em execução durante build estático).
 * Reflete estritamente as decisões vinculantes D01 a D17.
 */
export const DEFAULT_TOPICLOG_SYSTEM_STATE: SystemFeatureFlagsResponse = {
  productName: "Topic Log",
  intendedDomain: "www.topiclog.com.br",
  targetStateUf: "MG",
  pilotMunicipalities: [
    {
      ibgeCode: "3136207",
      name: "João Monlevade",
      stateUf: "MG",
      priorityOrder: 1,
      isPilot: true,
      isEnabled: true
    },
    {
      ibgeCode: "3106200",
      name: "Belo Horizonte",
      stateUf: "MG",
      priorityOrder: 2,
      isPilot: true,
      isEnabled: true
    }
  ],
  defaultVehicleLimitsGrams: {
    BICYCLE: 5000,
    MOTORCYCLE: 20000,
    CAR: 20000
  },
  commercialPolicies: {
    freePlanCommissionRate: 0.13,
    premiumPlanMonthlyPriceCents: 3990,
    premiumPlanCommissionRate: 0.07,
    platformAbsorbsGatewayFees: true
  },
  insurance: {
    commercializationEnabled: false,
    mandatoryDisclaimer: "Esta manifestação não contrata seguro e não garante cobertura"
  },
  featureFlags: {
    environmentMode: "Testing",
    realPaymentsEnabled: false,
    asaasSandboxEnabled: true,
    bilateralKycRequiredOnContract: true,
    requireCodeAndPhotoForDelivery: true,
    runWorkerInProcess: true
  }
};

/**
 * Função genérica para efetuar chamadas HTTP à API Topic Log propagando X-Correlation-Id
 * e decodificando respostas bem-sucedidas ou ProblemDetails (RFC 9457).
 */
export async function apiRequest<T>(
  endpoint: string,
  options: {
    readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    readonly token?: string;
    readonly body?: unknown;
    readonly customCorrelationId?: string;
  } = {}
): Promise<ApiFetchResult<T>> {
  const method = options.method ?? "GET";
  const correlationId = options.customCorrelationId ?? `web-${Date.now()}`;
  const url = `${getApiBaseUrl()}${endpoint}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    [CORRELATION_ID_HEADER]: correlationId
  };

  if (options.token && options.token.trim().length > 0) {
    headers["Authorization"] = `Bearer ${options.token.trim()}`;
  }

  let requestBody: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: requestBody,
      cache: "no-store"
    });

    const returnedCorrelationId =
      response.headers.get(CORRELATION_ID_HEADER) ?? correlationId;

    if (!response.ok) {
      let problem: ProblemDetailsDto | undefined;
      try {
        problem = (await response.json()) as ProblemDetailsDto;
      } catch {
        problem = {
          title: "Erro inesperado na resposta da API",
          status: response.status,
          detail: `A API retornou status HTTP ${response.status}`,
          correlationId: returnedCorrelationId
        };
      }

      return {
        ok: false,
        status: response.status,
        problem,
        correlationId: returnedCorrelationId,
        isFallback: false
      };
    }

    if (response.status === 204) {
      return {
        ok: true,
        status: response.status,
        correlationId: returnedCorrelationId,
        isFallback: false
      };
    }

    const data = (await response.json()) as T;
    return {
      ok: true,
      status: response.status,
      data,
      correlationId: returnedCorrelationId,
      isFallback: false
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      problem: {
        title: "Falha de conexão com a API",
        status: 0,
        detail: `Não foi possível conectar a ${url}: ${errorMessage}`,
        correlationId
      },
      correlationId,
      isFallback: true
    };
  }
}

/* --------------------------------------------------------------------------
   FUNÇÕES ESPECÍFICAS DE API
   -------------------------------------------------------------------------- */

export async function fetchSystemFeatureFlags(
  customCorrelationId?: string
): Promise<ApiFetchResult<SystemFeatureFlagsResponse>> {
  const result = await apiRequest<SystemFeatureFlagsResponse>("/api/v1/system/feature-flags", {
    method: "GET",
    customCorrelationId
  });

  if (!result.ok && result.isFallback) {
    return {
      ok: true,
      status: 200,
      data: DEFAULT_TOPICLOG_SYSTEM_STATE,
      correlationId: result.correlationId,
      isFallback: true
    };
  }

  return result;
}

export async function registerUserApi(
  request: RegisterUserRequest,
  customCorrelationId?: string
): Promise<ApiFetchResult<AuthSessionResponse>> {
  return apiRequest<AuthSessionResponse>("/api/v1/auth/register", {
    method: "POST",
    body: request,
    customCorrelationId
  });
}

export async function loginUserApi(
  request: LoginRequest,
  customCorrelationId?: string
): Promise<ApiFetchResult<AuthSessionResponse>> {
  return apiRequest<AuthSessionResponse>("/api/v1/auth/login", {
    method: "POST",
    body: request,
    customCorrelationId
  });
}

export async function refreshSessionApi(
  request: RefreshTokenRequest,
  customCorrelationId?: string
): Promise<ApiFetchResult<AuthSessionResponse>> {
  return apiRequest<AuthSessionResponse>("/api/v1/auth/refresh", {
    method: "POST",
    body: request,
    customCorrelationId
  });
}

/**
 * Emite token JWT de teste assinado exclusivamente em ambiente Testing (Sandbox)
 * para persona Remetente ou Transportador, eliminando qualquer spoofing não autenticado.
 */
export async function getSandboxTokenApi(
  role: "SENDER" | "CARRIER",
  customCorrelationId?: string
): Promise<ApiFetchResult<SandboxTokenResponse>> {
  return apiRequest<SandboxTokenResponse>("/api/v1/auth/sandbox-token", {
    method: "POST",
    body: { role },
    customCorrelationId
  });
}


export async function logoutUserApi(
  token: string,
  request: LogoutRequest,
  customCorrelationId?: string
): Promise<ApiFetchResult<void>> {
  return apiRequest<void>("/api/v1/auth/logout", {
    method: "POST",
    token,
    body: request,
    customCorrelationId
  });
}

export async function getPrivateProfileApi(
  token: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<PrivateUserProfileResponse>> {
  return apiRequest<PrivateUserProfileResponse>("/api/v1/me", {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function updatePrivateProfileApi(
  token: string,
  request: UpdateProfileRequest,
  customCorrelationId?: string
): Promise<ApiFetchResult<PrivateUserProfileResponse>> {
  return apiRequest<PrivateUserProfileResponse>("/api/v1/me", {
    method: "PATCH",
    token,
    body: request,
    customCorrelationId
  });
}

export async function getPublicUserCardApi(
  token: string,
  userId: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<PublicUserCardResponse>> {
  return apiRequest<PublicUserCardResponse>(`/api/v1/users/${userId}/public-card`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function getTermsManifestApi(
  customCorrelationId?: string
): Promise<ApiFetchResult<TermsResponsibilityManifestResponse>> {
  return apiRequest<TermsResponsibilityManifestResponse>("/api/v1/terms/current", {
    method: "GET",
    customCorrelationId
  });
}

export async function getKycDossierApi(
  token: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<KycDossierResponse>> {
  return apiRequest<KycDossierResponse>("/api/v1/kyc/me", {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function submitKycCaseApi(
  token: string,
  request: SubmitKycCaseRequest,
  customCorrelationId?: string
): Promise<ApiFetchResult<KycDossierResponse>> {
  return apiRequest<KycDossierResponse>("/api/v1/kyc/cases/submit", {
    method: "POST",
    token,
    body: request,
    customCorrelationId
  });
}

export async function reanalyzeKycCaseApi(
  token: string,
  caseId: string,
  request: ReanalyzeKycCaseRequest,
  customCorrelationId?: string
): Promise<ApiFetchResult<KycDossierResponse>> {
  return apiRequest<KycDossierResponse>(`/api/v1/kyc/cases/${caseId}/reanalysis`, {
    method: "POST",
    token,
    body: request,
    customCorrelationId
  });
}

export async function reviewKycDecisionApi(
  token: string,
  caseId: string,
  request: ReviewKycDecisionRequest,
  customCorrelationId?: string
): Promise<ApiFetchResult<KycDossierResponse>> {
  return apiRequest<KycDossierResponse>(`/api/v1/kyc/cases/${caseId}/review-decision`, {
    method: "POST",
    token,
    body: request,
    customCorrelationId
  });
}

export async function evaluateBilateralKycApi(
  token: string,
  request: EvaluateBilateralKycRequest,
  customCorrelationId?: string
): Promise<ApiFetchResult<BilateralKycEvaluationResponse>> {
  return apiRequest<BilateralKycEvaluationResponse>("/api/v1/kyc/evaluate-bilateral", {
    method: "POST",
    token,
    body: request,
    customCorrelationId
  });
}

// =========================================================================
// PR-02: MÉTODOS HTTP DE ENCOMENDAS, VIAGENS E MUNICÍPIOS MG
// =========================================================================

export async function createShipmentApi(
  payload: CreateShipmentPayload,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<ShipmentDetailDto>> {
  return apiRequest<ShipmentDetailDto>("/api/v1/shipments", {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}

export async function listShipmentsApi(
  params?: { originCity?: string; destinationCity?: string },
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<ShipmentSummaryDto[]>> {
  const searchParams = new URLSearchParams();
  if (params?.originCity) searchParams.set("originCity", params.originCity);
  if (params?.destinationCity) searchParams.set("destinationCity", params.destinationCity);
  const qs = searchParams.toString();
  const endpoint = qs ? `/api/v1/shipments?${qs}` : "/api/v1/shipments";

  return apiRequest<ShipmentSummaryDto[]>(endpoint, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function getShipmentByIdApi(
  id: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<ShipmentDetailDto>> {
  return apiRequest<ShipmentDetailDto>(`/api/v1/shipments/${id}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function createTripApi(
  payload: CreateTripPayload,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<TripDto>> {
  return apiRequest<TripDto>("/api/v1/trips", {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}

export async function listTripsApi(
  params?: { originCity?: string; destinationCity?: string },
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<TripSummaryDto[]>> {
  const searchParams = new URLSearchParams();
  if (params?.originCity) searchParams.set("originCity", params.originCity);
  if (params?.destinationCity) searchParams.set("destinationCity", params.destinationCity);
  const qs = searchParams.toString();
  const endpoint = qs ? `/api/v1/trips?${qs}` : "/api/v1/trips";

  return apiRequest<TripSummaryDto[]>(endpoint, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function getTripByIdApi(
  id: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<TripDto>> {
  return apiRequest<TripDto>(`/api/v1/trips/${id}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function listRegionsCitiesApi(
  customCorrelationId?: string
): Promise<ApiFetchResult<RegionCityDto[]>> {
  return apiRequest<RegionCityDto[]>("/api/v1/regions/cities", {
    method: "GET",
    customCorrelationId
  });
}

// =========================================================================
// PR-03: MÉTODOS HTTP DE MATCHING GEOESPACIAL E OPORTUNIDADES EM RAIO DE 2 KM
// =========================================================================

function normalizeToApiUuid(id: string): string {
  if (!id) return id;
  if (id.startsWith("enc-00")) {
    const num = id.replace("enc-00", "");
    return `e0000001-0000-0000-0000-00000000000${num}`;
  }
  if (id.startsWith("via-00")) {
    const num = id.replace("via-00", "");
    return `b0000001-0000-0000-0000-00000000000${num}`;
  }
  return id;
}

export async function getCompatibleTripsForShipmentApi(
  shipmentId: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<CompatibleTripsResponse>> {
  const normalizedId = normalizeToApiUuid(shipmentId);
  return apiRequest<CompatibleTripsResponse>(`/api/v1/matching/shipments/${normalizedId}/trips`, {
    method: "GET",
    customCorrelationId
  });
}

export async function getCompatibleShipmentsForTripApi(
  tripId: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<CompatibleShipmentsResponse>> {
  const normalizedId = normalizeToApiUuid(tripId);
  return apiRequest<CompatibleShipmentsResponse>(`/api/v1/matching/trips/${normalizedId}/shipments`, {
    method: "GET",
    customCorrelationId
  });
}

export async function evaluateMatchingApi(
  shipmentId: string,
  tripId: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<MatchEvaluationResultDto>> {
  const normShipmentId = normalizeToApiUuid(shipmentId);
  const normTripId = normalizeToApiUuid(tripId);
  return apiRequest<MatchEvaluationResultDto>("/api/v1/matching/evaluate", {
    method: "POST",
    body: { shipmentId: normShipmentId, tripId: normTripId },
    customCorrelationId
  });
}

export async function getNearbyShipmentsApi(
  params: {
    lat: number;
    lon: number;
    radiusMeters?: number;
    vehicleType?: string;
    availableCapacityGrams?: number;
  },
  customCorrelationId?: string
): Promise<ApiFetchResult<NearbyShipmentsResponse>> {
  const searchParams = new URLSearchParams();
  searchParams.set("lat", params.lat.toString());
  searchParams.set("lon", params.lon.toString());
  if (params.radiusMeters) searchParams.set("radiusMeters", params.radiusMeters.toString());
  if (params.vehicleType) searchParams.set("vehicleType", params.vehicleType);
  if (params.availableCapacityGrams) searchParams.set("availableCapacityGrams", params.availableCapacityGrams.toString());

  return apiRequest<NearbyShipmentsResponse>(`/api/v1/matching/nearby-shipments?${searchParams.toString()}`, {
    method: "GET",
    customCorrelationId
  });
}

export async function fetchOnMyRouteFeedApi(
  params: {
    tripId?: string;
    originCity?: string;
    destinationCity?: string;
    stops?: string;
    maxDetourKm?: number;
    includeExtendedDetours?: boolean;
    cursor?: string;
    limit?: number;
  },
  customCorrelationId?: string
): Promise<ApiFetchResult<CursorPagedResultDto<OpportunityFeedItemDto>>> {
  const searchParams = new URLSearchParams();
  if (params.tripId) searchParams.set("tripId", normalizeToApiUuid(params.tripId));
  if (params.originCity) searchParams.set("originCity", params.originCity);
  if (params.destinationCity) searchParams.set("destinationCity", params.destinationCity);
  if (params.stops) searchParams.set("stops", params.stops);
  if (params.maxDetourKm) searchParams.set("maxDetourKm", params.maxDetourKm.toString());
  if (params.includeExtendedDetours) searchParams.set("includeExtendedDetours", "true");
  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.limit) searchParams.set("limit", params.limit.toString());

  return apiRequest<CursorPagedResultDto<OpportunityFeedItemDto>>(
    `/api/v1/opportunities/feed/on-my-route?${searchParams.toString()}`,
    {
      method: "GET",
      customCorrelationId
    }
  );
}

export async function fetchNearbyFeedApi(
  params: {
    lat: number;
    lon: number;
    radiusKm?: number;
    vehicleType?: string;
    cursor?: string;
    limit?: number;
  },
  customCorrelationId?: string
): Promise<ApiFetchResult<CursorPagedResultDto<OpportunityFeedItemDto>>> {
  const searchParams = new URLSearchParams();
  searchParams.set("lat", params.lat.toString());
  searchParams.set("lon", params.lon.toString());
  if (params.radiusKm) searchParams.set("radiusKm", params.radiusKm.toString());
  if (params.vehicleType) searchParams.set("vehicleType", params.vehicleType);
  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.limit) searchParams.set("limit", params.limit.toString());

  return apiRequest<CursorPagedResultDto<OpportunityFeedItemDto>>(
    `/api/v1/opportunities/feed/nearby?${searchParams.toString()}`,
    {
      method: "GET",
      customCorrelationId
    }
  );
}

export async function fetchRegionalFeedApi(
  params: {
    uf?: string;
    city?: string;
    neighborhood?: string;
    type?: string;
    cursor?: string;
    limit?: number;
  },
  customCorrelationId?: string
): Promise<ApiFetchResult<CursorPagedResultDto<OpportunityFeedItemDto>>> {
  const searchParams = new URLSearchParams();
  if (params.uf) searchParams.set("uf", params.uf);
  if (params.city) searchParams.set("city", params.city);
  if (params.neighborhood) searchParams.set("neighborhood", params.neighborhood);
  if (params.type) searchParams.set("type", params.type);
  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.limit) searchParams.set("limit", params.limit.toString());

  return apiRequest<CursorPagedResultDto<OpportunityFeedItemDto>>(
    `/api/v1/opportunities/feed/regional?${searchParams.toString()}`,
    {
      method: "GET",
      customCorrelationId
    }
  );
}

export async function searchMunicipalitiesApi(
  params: {
    q?: string;
    uf?: string;
    limit?: number;
  },
  customCorrelationId?: string
): Promise<ApiFetchResult<SearchMunicipalitiesResponse>> {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set("q", params.q);
  if (params.uf) searchParams.set("uf", params.uf);
  if (params.limit) searchParams.set("limit", params.limit.toString());

  return apiRequest<SearchMunicipalitiesResponse>(
    `/api/v1/regions/search?${searchParams.toString()}`,
    {
      method: "GET",
      customCorrelationId
    }
  );
}

/* --------------------------------------------------------------------------
   MÓDULO PROPOSTAS, CONTRATOS E NEGOCIAÇÃO (PR-04)
   -------------------------------------------------------------------------- */

export async function createProposalApi(
  payload: CreateProposalRequest,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<ProposalDto>> {
  return apiRequest<ProposalDto>("/api/v1/proposals", {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}

export async function getProposalByIdApi(
  id: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<ProposalDto>> {
  return apiRequest<ProposalDto>(`/api/v1/proposals/${id}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function listProposalsByShipmentApi(
  shipmentId: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<ProposalDto[]>> {
  return apiRequest<ProposalDto[]>(`/api/v1/proposals/shipment/${shipmentId}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function listProposalsByCarrierApi(
  carrierId: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<ProposalDto[]>> {
  return apiRequest<ProposalDto[]>(`/api/v1/proposals/carrier/${carrierId}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function listProposalsForSenderApi(
  senderId: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<ProposalDto[]>> {
  return apiRequest<ProposalDto[]>(`/api/v1/proposals/sender/${senderId}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function counterProposalApi(
  id: string,
  payload: CounterProposalRequest,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<ProposalDto>> {
  return apiRequest<ProposalDto>(`/api/v1/proposals/${id}/counter`, {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}

export async function acceptProposalApi(
  id: string,
  expectedVersion: number = 1,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<ContractDto>> {
  return apiRequest<ContractDto>(`/api/v1/proposals/${id}/accept`, {
    method: "POST",
    token,
    body: { expectedVersion },
    customCorrelationId
  });
}

export async function rejectProposalApi(
  id: string,
  reason?: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<ProposalDto>> {
  return apiRequest<ProposalDto>(`/api/v1/proposals/${id}/reject`, {
    method: "POST",
    token,
    body: { reason },
    customCorrelationId
  });
}

export async function cancelProposalApi(
  id: string,
  reason?: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<ProposalDto>> {
  return apiRequest<ProposalDto>(`/api/v1/proposals/${id}/cancel`, {
    method: "POST",
    token,
    body: { reason },
    customCorrelationId
  });
}

export async function getProposalEventsApi(
  id: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<ProposalEventDto[]>> {
  return apiRequest<ProposalEventDto[]>(`/api/v1/proposals/${id}/events`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function getContractByIdApi(
  id: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<ContractDto>> {
  return apiRequest<ContractDto>(`/api/v1/contracts/${id}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function getContractByShipmentApi(
  shipmentId: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<ContractDto>> {
  return apiRequest<ContractDto>(`/api/v1/contracts/shipment/${shipmentId}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function cancelContractPrePickupApi(
  id: string,
  payload: CancelContractRequest,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<ContractDto>> {
  return apiRequest<ContractDto>(`/api/v1/contracts/${id}/cancel-pre-pickup`, {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}

export async function getActivePriorityOfferApi(
  shipmentId: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<PriorityOfferDto>> {
  return apiRequest<PriorityOfferDto>(`/api/v1/priority-offers/shipment/${shipmentId}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function listPriorityOffersForCarrierApi(
  carrierId: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<PriorityOfferDto[]>> {
  return apiRequest<PriorityOfferDto[]>(`/api/v1/priority-offers/carrier/${carrierId}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function respondPriorityOfferApi(
  shipmentId: string,
  accept: boolean,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<PriorityOfferDto>> {
  return apiRequest<PriorityOfferDto>(`/api/v1/priority-offers/${shipmentId}/respond`, {
    method: "POST",
    token,
    body: { accept },
    customCorrelationId
  });
}

/* --------------------------------------------------------------------------
   MÓDULO FULFILLMENT & EXECUÇÃO DE ENTREGAS (PR-05 - GATE G3)
   -------------------------------------------------------------------------- */

export async function getDeliveryOrderApi(
  id: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<DeliveryOrderDto>> {
  return apiRequest<DeliveryOrderDto>(`/api/v1/deliveries/${id}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function getDeliveryOrderByShipmentApi(
  shipmentId: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<DeliveryOrderDto>> {
  return apiRequest<DeliveryOrderDto>(`/api/v1/deliveries/shipment/${shipmentId}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function getDeliveryTrackingApi(
  id: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<DeliveryTrackingDto>> {
  return apiRequest<DeliveryTrackingDto>(`/api/v1/deliveries/${id}/tracking`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function getDeliveryCodeApi(
  id: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<DeliveryChallengeDto>> {
  return apiRequest<DeliveryChallengeDto>(`/api/v1/deliveries/${id}/delivery-code`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function regenerateDeliveryCodeApi(
  id: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<DeliveryChallengeDto>> {
  return apiRequest<DeliveryChallengeDto>(`/api/v1/deliveries/${id}/regenerate-delivery-code`, {
    method: "POST",
    token,
    customCorrelationId
  });
}

export async function pickupCheckinApi(
  id: string,
  payload: PickupCheckinRequest,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<DeliveryOrderDto>> {
  return apiRequest<DeliveryOrderDto>(`/api/v1/deliveries/${id}/pickup-checkin`, {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}

export async function confirmPickupApi(
  id: string,
  payload: ConfirmPickupRequest,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<DeliveryOrderDto>> {
  return apiRequest<DeliveryOrderDto>(`/api/v1/deliveries/${id}/confirm-pickup`, {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}

export async function uploadDeliveryProofApi(
  id: string,
  payload: UploadDeliveryProofRequest,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<DeliveryProofDto>> {
  return apiRequest<DeliveryProofDto>(`/api/v1/deliveries/${id}/proofs`, {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}

export async function confirmDeliveryApi(
  id: string,
  payload: ConfirmDeliveryRequest,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<DeliveryOrderDto>> {
  return apiRequest<DeliveryOrderDto>(`/api/v1/deliveries/${id}/confirm-delivery`, {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}

export async function reportDeliveryExceptionApi(
  id: string,
  payload: ReportDeliveryExceptionRequest,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<DeliveryOrderDto>> {
  return apiRequest<DeliveryOrderDto>(`/api/v1/deliveries/${id}/exceptions`, {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}

export async function rescheduleDeliveryApi(
  id: string,
  payload: RescheduleDeliveryRequest,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<DeliveryOrderDto>> {
  return apiRequest<DeliveryOrderDto>(`/api/v1/deliveries/${id}/reschedule`, {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}

export async function initiateReturnApi(
  id: string,
  payload: InitiateReturnRequest,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<DeliveryOrderDto>> {
  return apiRequest<DeliveryOrderDto>(`/api/v1/deliveries/${id}/initiate-return`, {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}

export async function getPostDeliverySuggestionsApi(
  id: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<PostDeliverySuggestionDto[]>> {
  return apiRequest<PostDeliverySuggestionDto[]>(`/api/v1/deliveries/${id}/post-delivery-suggestions`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

/* --------------------------------------------------------------------------
   MÓDULO FINANCEIRO: POLÍTICAS E ASSINATURAS (PR-FIN-01)
   -------------------------------------------------------------------------- */

export async function getCommercialPolicyCurrentApi(
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<CommercialPolicyDto>> {
  return apiRequest<CommercialPolicyDto>("/api/v1/finance/policies/current", {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function getCommercialPoliciesHistoryApi(
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<CommercialPolicyDto[]>> {
  return apiRequest<CommercialPolicyDto[]>("/api/v1/finance/policies/history", {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function createCommercialPolicyApi(
  payload: {
    version: string;
    name: string;
    freePlanCommissionPercent: number;
    premiumPlanCommissionPercent: number;
    premiumMonthlyFeeCents: number;
    cancellationPenaltyPercent: number;
    cancellationMinFeeCents: number;
    cancellationInjuredPartySharePercent: number;
    validFrom: string;
    justification: string;
  },
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<CommercialPolicyDto>> {
  return apiRequest<CommercialPolicyDto>("/api/v1/finance/policies", {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}

export async function revokeCommercialPolicyApi(
  id: string,
  reason?: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<CommercialPolicyDto>> {
  return apiRequest<CommercialPolicyDto>(`/api/v1/finance/policies/${id}/revoke`, {
    method: "POST",
    token,
    body: { reason },
    customCorrelationId
  });
}

export async function getSubscriptionPlansApi(
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<SubscriptionPlanDto[]>> {
  return apiRequest<SubscriptionPlanDto[]>("/api/v1/finance/subscriptions/plans", {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function getCurrentSubscriptionApi(
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<CarrierSubscriptionDto>> {
  return apiRequest<CarrierSubscriptionDto>("/api/v1/finance/subscriptions/current", {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function subscribePlanApi(
  planCode: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<CarrierSubscriptionDto>> {
  return apiRequest<CarrierSubscriptionDto>("/api/v1/finance/subscriptions/subscribe", {
    method: "POST",
    token,
    body: { planCode },
    customCorrelationId
  });
}

export async function cancelSubscriptionApi(
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<CarrierSubscriptionDto>> {
  return apiRequest<CarrierSubscriptionDto>("/api/v1/finance/subscriptions/cancel", {
    method: "POST",
    token,
    customCorrelationId
  });
}

export async function simulateSplitApi(
  payload: {
    transportAmountCents: number;
    carrierId?: string;
    planCodeOverride?: string;
  },
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<{
  transportAmountCents: number;
  planApplied: string;
  commissionRatePercent: number;
  platformCommissionCents: number;
  carrierNetCents: number;
  gatewayFeeAbsorbedByPlatform: boolean;
  policyVersionApplied: string;
}>> {
  return apiRequest("/api/v1/finance/split/simulate", {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}

/* --------------------------------------------------------------------------
   MÓDULO ADMIN & GOVERNANÇA (PR-ADM-01 / PR-FIN-02)
   -------------------------------------------------------------------------- */

export async function getAdminDashboardMetricsApi(
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<AdminDashboardMetricsDto>> {
  return apiRequest<AdminDashboardMetricsDto>("/api/v1/admin/dashboard", {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function getOperationalSettingsApi(
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<OperationalSettingsDto>> {
  return apiRequest<OperationalSettingsDto>("/api/v1/admin/operations/settings", {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function updateOperationalSettingsApi(
  payload: UpdateOperationalSettingsDto,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<OperationalSettingsDto>> {
  return apiRequest<OperationalSettingsDto>("/api/v1/admin/operations/settings", {
    method: "PATCH",
    token,
    body: payload,
    customCorrelationId
  });
}

export async function listCarrierVehiclesApi(
  params?: { status?: string; carrierId?: string },
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<CarrierVehicleDto[]>> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.carrierId) q.set("carrierId", params.carrierId);
  const queryStr = q.toString() ? `?${q.toString()}` : "";

  return apiRequest<CarrierVehicleDto[]>(`/api/v1/admin/vehicles${queryStr}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function moderateCarrierVehicleApi(
  vehicleId: string,
  payload: ModerateVehicleDto,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<CarrierVehicleDto>> {
  return apiRequest<CarrierVehicleDto>(`/api/v1/admin/vehicles/${vehicleId}/moderate`, {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}

export async function listPaymentMethodsApi(
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<PaymentMethodDto[]>> {
  return apiRequest<PaymentMethodDto[]>("/api/v1/admin/governance/payment-methods", {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function togglePaymentMethodApi(
  methodCode: string,
  payload: TogglePaymentMethodDto,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<PaymentMethodDto>> {
  return apiRequest<PaymentMethodDto>(`/api/v1/admin/governance/payment-methods/${methodCode}/toggle`, {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}

export async function simulateCheckoutApi(
  payload: CheckoutSimulationRequestDto,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<CheckoutSimulationDto>> {
  return apiRequest<CheckoutSimulationDto>("/api/v1/admin/governance/simulate-checkout", {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}

export async function listAdminAuditEventsApi(
  params?: { category?: string; limit?: number },
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<AdminAuditEventDto[]>> {
  const q = new URLSearchParams();
  if (params?.category) q.set("category", params.category);
  if (params?.limit) q.set("limit", params.limit.toString());
  const queryStr = q.toString() ? `?${q.toString()}` : "";

  return apiRequest<AdminAuditEventDto[]>(`/api/v1/admin/audit/events${queryStr}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

// =========================================================================
// PR-LEG-01: GESTÃO JURÍDICA E CONTRATOS DIGITAIS
// =========================================================================

export async function listLegalTemplatesApi(
  params?: { category?: string; status?: string },
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<LegalDocumentTemplateDto[]>> {
  const q = new URLSearchParams();
  if (params?.category) q.set("category", params.category);
  if (params?.status) q.set("status", params.status);
  const qs = q.toString() ? `?${q.toString()}` : "";

  return apiRequest<LegalDocumentTemplateDto[]>(`/api/v1/admin/legal/templates${qs}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function getLegalTemplateByIdApi(
  id: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<LegalDocumentTemplateDto>> {
  return apiRequest<LegalDocumentTemplateDto>(`/api/v1/admin/legal/templates/${id}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function createLegalTemplateApi(
  payload: CreateLegalTemplateDto,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<LegalDocumentTemplateDto>> {
  return apiRequest<LegalDocumentTemplateDto>("/api/v1/admin/legal/templates", {
    method: "POST",
    token,
    body: {
      category: payload.category,
      title: payload.title,
      description: payload.changeNotes || payload.title,
      scopeType: payload.scopeType,
      scopeStateUf: payload.stateUf,
      scopeMunicipalityIbge: payload.ibgeCityCode,
      version: "1.0.0",
      contentMarkdown: payload.content,
      changeSummary: payload.changeNotes
    },
    customCorrelationId
  });
}

export async function updateLegalTemplateApi(
  id: string,
  payload: UpdateLegalTemplateDto,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<LegalDocumentTemplateDto>> {
  return apiRequest<LegalDocumentTemplateDto>(`/api/v1/admin/legal/templates/${id}`, {
    method: "PUT",
    token,
    body: {
      title: payload.title,
      description: payload.changeNotes || payload.title,
      contentMarkdown: payload.content,
      changeSummary: payload.changeNotes
    },
    customCorrelationId
  });
}

export async function approveLegalTemplateApi(
  id: string,
  payload: ApproveLegalTemplateDto,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<LegalDocumentTemplateDto>> {
  return apiRequest<LegalDocumentTemplateDto>(`/api/v1/admin/legal/templates/${id}/approve`, {
    method: "POST",
    token,
    body: {
      approvalNotes: payload.legalNotes
    },
    customCorrelationId
  });
}

export async function publishLegalTemplateApi(
  id: string,
  payload: PublishLegalTemplateDto,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<LegalDocumentTemplateDto>> {
  return apiRequest<LegalDocumentTemplateDto>(`/api/v1/admin/legal/templates/${id}/publish`, {
    method: "POST",
    token,
    body: {
      validFromUtc: payload.effectiveDateUtc,
      publicationJustification: "Publicação aprovada formalmente"
    },
    customCorrelationId
  });
}

export async function previewLegalTemplateApi(
  payload: PreviewLegalTemplateRequestDto,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<PreviewLegalTemplateResponseDto>> {
  return apiRequest<PreviewLegalTemplateResponseDto>("/api/v1/admin/legal/templates/preview", {
    method: "POST",
    token,
    body: {
      contentMarkdown: payload.content,
      userName: payload.sampleData["USER_NAME"],
      userCpf: payload.sampleData["USER_CPF"],
      municipalityName: payload.sampleData["MUNICIPALITY_NAME"],
      stateUf: payload.sampleData["STATE_UF"],
      carrierPlan: payload.sampleData["CARRIER_PLAN"]
    },
    customCorrelationId
  });
}

export async function compareLegalVersionsApi(
  id: string,
  targetVersion: string,
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<CompareLegalVersionsResponseDto>> {
  return apiRequest<CompareLegalVersionsResponseDto>(`/api/v1/admin/legal/templates/${id}/compare/${targetVersion}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function listLegalAcceptancesApi(
  params?: { templateId?: string; userId?: string },
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<LegalAcceptanceDto[]>> {
  const q = new URLSearchParams();
  if (params?.templateId) q.set("templateId", params.templateId);
  if (params?.userId) q.set("userId", params.userId);
  const qs = q.toString() ? `?${q.toString()}` : "";

  return apiRequest<LegalAcceptanceDto[]>(`/api/v1/admin/legal/acceptances${qs}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function getApplicableTermsApi(
  params: { role: string; stateUf?: string; ibgeCityCode?: string },
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<LegalDocumentTemplateDto[]>> {
  const q = new URLSearchParams();
  q.set("role", params.role);
  if (params.stateUf) q.set("state", params.stateUf);
  if (params.ibgeCityCode) q.set("ibgeCityCode", params.ibgeCityCode);

  return apiRequest<LegalDocumentTemplateDto[]>(`/api/v1/legal/applicable-terms?${q.toString()}`, {
    method: "GET",
    token,
    customCorrelationId
  });
}

export async function acceptLegalTermApi(
  payload: { templateId: string; version: string; documentHashSha256: string },
  token?: string,
  customCorrelationId?: string
): Promise<ApiFetchResult<LegalAcceptanceDto>> {
  return apiRequest<LegalAcceptanceDto>("/api/v1/legal/accept-term", {
    method: "POST",
    token,
    body: payload,
    customCorrelationId
  });
}




