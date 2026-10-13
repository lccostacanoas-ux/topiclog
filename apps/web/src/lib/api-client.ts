import type { ProblemDetailsDto, SystemFeatureFlagsResponse } from "./types";

export const CORRELATION_ID_HEADER = "X-Correlation-Id";

/**
 * URL base da API .NET 10 configurada exclusivamente por variável de ambiente pública,
 * com fallback seguro para o endereço local de desenvolvimento.
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

export interface ApiFetchResult<T> {
  readonly ok: boolean;
  readonly data?: T;
  readonly problem?: ProblemDetailsDto;
  readonly correlationId: string;
  readonly isFallback: boolean;
}

/**
 * Consulta o endpoint /api/v1/system/feature-flags propagando X-Correlation-Id.
 */
export async function fetchSystemFeatureFlags(
  customCorrelationId?: string
): Promise<ApiFetchResult<SystemFeatureFlagsResponse>> {
  const correlationId = customCorrelationId ?? `web-${Date.now()}`;
  const url = `${getApiBaseUrl()}/api/v1/system/feature-flags`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        [CORRELATION_ID_HEADER]: correlationId
      },
      cache: "no-store"
    });

    const returnedCorrelationId =
      response.headers.get(CORRELATION_ID_HEADER) ?? correlationId;

    if (!response.ok) {
      const problem = (await response.json()) as ProblemDetailsDto;
      return {
        ok: false,
        problem,
        correlationId: returnedCorrelationId,
        isFallback: false
      };
    }

    const data = (await response.json()) as SystemFeatureFlagsResponse;
    return {
      ok: true,
      data,
      correlationId: returnedCorrelationId,
      isFallback: false
    };
  } catch {
    return {
      ok: true,
      data: DEFAULT_TOPICLOG_SYSTEM_STATE,
      correlationId,
      isFallback: true
    };
  }
}
