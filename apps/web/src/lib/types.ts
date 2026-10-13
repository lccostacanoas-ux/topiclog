/**
 * Contratos tipados entre o Frontend Next.js (apps/web) e a API .NET 10 (services/api).
 * Reflete estritamente IdentityModels.cs, VerificationModels.cs e as decisões D01 a D17.
 * Todos os valores monetários são representados em centavos inteiros (ADR-0002).
 */

export type VehicleTypeCode = "BICYCLE" | "MOTORCYCLE" | "CAR";

export type UserRole =
  | "SENDER"
  | "CARRIER"
  | "RECIPIENT"
  | "SUPPORT"
  | "FINANCIAL_ADMIN"
  | "GENERAL_ADMIN";

export type KycStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "IN_REVIEW"
  | "VERIFIED"
  | "REJECTED"
  | "EXPIRED";

export type KycCheckType =
  | "CPF_STATUS"
  | "IDENTITY_DOCUMENT"
  | "ADDRESS_PROOF"
  | "FACIAL_BIOMETRY_PARTNER";

export type KycCheckStatus = "PENDING" | "PASSED" | "FAILED";

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

export interface ApiFetchResult<T> {
  readonly ok: boolean;
  readonly status: number;
  readonly data?: T;
  readonly problem?: ProblemDetailsDto;
  readonly correlationId: string;
  readonly isFallback: boolean;
}

/* --------------------------------------------------------------------------
   MÓDULO IDENTITY (PR-01.1)
   -------------------------------------------------------------------------- */

export interface RegisterUserRequest {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly phone: string;
  readonly cpf?: string;
  readonly city?: string;
  readonly stateUf?: string;
  readonly initialRoles?: readonly UserRole[];
  readonly acceptTerms: boolean;
  readonly termsVersion?: string;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface RefreshTokenRequest {
  readonly refreshToken: string;
}

export interface LogoutRequest {
  readonly refreshToken: string;
}

export interface UpdateProfileRequest {
  readonly displayName?: string;
  readonly phone?: string;
  readonly cpf?: string;
  readonly city?: string;
  readonly stateUf?: string;
  readonly roles?: readonly UserRole[];
}

export interface PrivateUserProfileResponse {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly phoneMasked: string;
  readonly cpfMasked?: string;
  readonly city: string;
  readonly stateUf: string;
  readonly roles: readonly UserRole[];
  readonly kycStatus: KycStatus;
  readonly canNavigatePlatform: boolean;
  readonly canContractDelivery: boolean;
  readonly termsAcceptedVersion: string;
  readonly termsAcceptedAtUtc: string;
  readonly ratingAvg: number;
  readonly ratingCount: number;
  readonly createdAtUtc: string;
  readonly updatedAtUtc: string;
}

export interface AuthSessionResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInSeconds: number;
  readonly tokenType: string;
  readonly profile: PrivateUserProfileResponse;
}

export interface PublicUserCardResponse {
  readonly userId: string;
  readonly abbreviatedDisplayName: string;
  readonly city: string;
  readonly stateUf: string;
  readonly publicRoles: readonly string[];
  readonly isKycVerified: boolean;
  readonly ratingAvg: number;
  readonly ratingCount: number;
}

/* --------------------------------------------------------------------------
   MÓDULO VERIFICATION (PR-01.2)
   -------------------------------------------------------------------------- */

export interface SubmitKycCaseRequest {
  readonly cpf: string;
  readonly identityDocumentRef: string;
  readonly addressProofRef: string;
  readonly partnerFacialSessionRef: string;
  readonly consentGiven: boolean;
}

export interface KycCheckReviewInput {
  readonly checkType: KycCheckType;
  readonly status: KycCheckStatus;
}

export interface ReviewKycDecisionRequest {
  readonly targetStatus: "VERIFIED" | "REJECTED" | "EXPIRED";
  readonly checkResults?: readonly KycCheckReviewInput[];
  readonly justificationOrRejectionReason?: string;
  readonly validityDays?: number;
}

export interface ReanalyzeKycCaseRequest {
  readonly identityDocumentRef: string;
  readonly addressProofRef: string;
  readonly partnerFacialSessionRef: string;
  readonly appealJustification: string;
}

export interface EvaluateBilateralKycRequest {
  readonly senderUserId: string;
  readonly carrierUserId: string;
}

export interface KycCheckItemResponse {
  readonly checkId: string;
  readonly checkType: KycCheckType;
  readonly status: KycCheckStatus;
  readonly evidenceReference: string;
  readonly verifiedAtUtc?: string;
}

export interface KycDossierResponse {
  readonly userId: string;
  readonly currentKycStatus: KycStatus;
  readonly canNavigatePlatform: boolean;
  readonly canContractDelivery: boolean;
  readonly activeCaseId?: string;
  readonly provider?: string;
  readonly providerReferenceId?: string;
  readonly rejectionReason?: string;
  readonly submittedAtUtc?: string;
  readonly decidedAtUtc?: string;
  readonly expiresAtUtc?: string;
  readonly checks: readonly KycCheckItemResponse[];
}

export interface PartyKycEligibilitySummary {
  readonly userId: string;
  readonly requiredRole: string;
  readonly currentKycStatus: string;
  readonly isAccountActive: boolean;
  readonly hasRequiredRole: boolean;
  readonly hasAcceptedCurrentTerms: boolean;
  readonly hasAllFourChecksPassed: boolean;
  readonly isNotExpired: boolean;
  readonly isEligible: boolean;
  readonly blockingCodes: readonly string[];
}

export interface BilateralKycEvaluationResponse {
  readonly isEligible: boolean;
  readonly sender: PartyKycEligibilitySummary;
  readonly carrier: PartyKycEligibilitySummary;
  readonly blockingCodes: readonly string[];
  readonly summaryMessage: string;
  readonly evaluatedAtUtc: string;
}

export interface ActorResponsibilityClause {
  readonly actor: string;
  readonly legalSummary: string;
  readonly obligations: readonly string[];
}

export interface TermsResponsibilityManifestResponse {
  readonly termsVersion: string;
  readonly decisionCode: string;
  readonly hasAbsolutePlatformExemptionClause: boolean;
  readonly legalPrinciple: string;
  readonly responsibilities: readonly ActorResponsibilityClause[];
}
