/**
 * Contratos tipados entre o Frontend Next.js (apps/web) e a API .NET 10 (services/api).
 * Todos os valores monetários são representados em centavos inteiros (ADR-0002).
 */

export type VehicleTypeCode = "BICYCLE" | "MOTORCYCLE" | "CAR";

export interface PilotMunicipality {
  readonly ibgeCode: string;
  readonly name: string;
  readonly stateUf: string;
  readonly priorityOrder: number;
  readonly isPilot: boolean;
  readonly isEnabled: boolean;
}

export interface CommercialPoliciesDto {
  readonly freePlanCommissionRate: number;
  readonly premiumPlanMonthlyPriceCents: number;
  readonly premiumPlanCommissionRate: number;
  readonly platformAbsorbsGatewayFees: boolean;
}

export interface InsurancePolicyDto {
  readonly commercializationEnabled: boolean;
  readonly mandatoryDisclaimer: string;
}

export interface FeatureFlagsDto {
  readonly environmentMode: string;
  readonly realPaymentsEnabled: boolean;
  readonly asaasSandboxEnabled: boolean;
  readonly bilateralKycRequiredOnContract: boolean;
  readonly requireCodeAndPhotoForDelivery: boolean;
  readonly runWorkerInProcess: boolean;
}

export interface SystemFeatureFlagsResponse {
  readonly productName: string;
  readonly intendedDomain: string;
  readonly targetStateUf: string;
  readonly pilotMunicipalities: readonly PilotMunicipality[];
  readonly defaultVehicleLimitsGrams: Readonly<Record<VehicleTypeCode, number>>;
  readonly commercialPolicies: CommercialPoliciesDto;
  readonly insurance: InsurancePolicyDto;
  readonly featureFlags: FeatureFlagsDto;
}

export interface ProblemDetailsDto {
  readonly type?: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string;
  readonly correlationId?: string;
  readonly ruleCode?: string;
  readonly timestampUtc?: string;
}
