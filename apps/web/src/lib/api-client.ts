import type {
  ApiFetchResult,
  AuthSessionResponse,
  BilateralKycEvaluationResponse,
  EvaluateBilateralKycRequest,
  KycDossierResponse,
  LoginRequest,
  LogoutRequest,
  PrivateUserProfileResponse,
  ProblemDetailsDto,
  PublicUserCardResponse,
  ReanalyzeKycCaseRequest,
  RefreshTokenRequest,
  RegisterUserRequest,
  ReviewKycDecisionRequest,
  SubmitKycCaseRequest,
  SystemFeatureFlagsResponse,
  TermsResponsibilityManifestResponse,
  UpdateProfileRequest
} from "./types";

export type { ApiFetchResult };

export const CORRELATION_ID_HEADER = "X-Correlation-Id";

/**
 * URL base da API .NET 10 configurada exclusivamente por variável de ambiente pública,
 * com fallback seguro para o endereço local de desenvolvimento (http://localhost:5080).
 */
export function getApiBaseUrl(): string {
  const configured = process.env["NEXT_PUBLIC_API_BASE_URL"];
  if (configured && configured.trim().length > 0) {
    return configured.trim().replace(/\/+$/, "");
  }
  return "http://localhost:5080";
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
    readonly method?: "GET" | "POST" | "PATCH" | "DELETE";
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
