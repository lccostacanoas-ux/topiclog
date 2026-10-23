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

// =========================================================================
// PR-02: CONTRATOS DE ENCOMENDAS (SHIPMENTS), VIAGENS (TRIPS) E REGIÕES MG
// =========================================================================

export type ShipmentCategoryCode =
  | "DOCUMENTOS"
  | "AUTOPECAS"
  | "ELETRONICOS"
  | "SAUDE"
  | "ALIMENTOS"
  | "GERAL";

export interface AddressInputPayload {
  readonly city: string;
  readonly stateUf?: string;
  readonly neighborhood: string;
  readonly streetAndNumber?: string;
  readonly postalCode?: string;
}

export interface CreateShipmentPayload {
  readonly title: string;
  readonly description: string;
  readonly category: ShipmentCategoryCode;
  readonly vehicleType: VehicleTypeCode;
  readonly weightGrams: number;
  readonly dimensionsLengthCm: number;
  readonly dimensionsWidthCm: number;
  readonly dimensionsHeightCm: number;
  readonly declaredValueCents: number;
  readonly suggestedPriceCents: number;
  readonly specialCareNotes?: readonly string[];
  readonly origin: AddressInputPayload;
  readonly destination: AddressInputPayload;
  readonly pickupWindow?: string;
  readonly deliveryWindow?: string;
  readonly interestedInInsurance: boolean;
}

export interface ShipmentAddressDto {
  readonly kind: "ORIGIN" | "DESTINATION";
  readonly city: string;
  readonly stateUf: string;
  readonly neighborhood: string;
  readonly streetAndNumber?: string | null;
  readonly approximateLatitude: number;
  readonly approximateLongitude: number;
  readonly isMaskedForPrivacy: boolean;
}

export interface InsuranceInterestDto {
  readonly interested: boolean;
  readonly chargedAmountCents: number;
  readonly hasActivePolicy: boolean;
  readonly guaranteesCoverage: boolean;
  readonly mandatoryDisclaimer: string;
}

export interface ShipmentDetailDto {
  readonly id: string;
  readonly senderId: string;
  readonly senderName: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly vehicleType: VehicleTypeCode;
  readonly weightGrams: number;
  readonly dimensionsLengthCm: number;
  readonly dimensionsWidthCm: number;
  readonly dimensionsHeightCm: number;
  readonly declaredValueCents: number;
  readonly suggestedPriceCents: number;
  readonly specialCareNotes: readonly string[];
  readonly origin: ShipmentAddressDto;
  readonly destination: ShipmentAddressDto;
  readonly pickupWindow: string;
  readonly deliveryWindow: string;
  readonly insuranceInterest: InsuranceInterestDto;
  readonly status: string;
  readonly photoUrls: readonly string[];
  readonly createdAtUtc: string;
}

export interface ShipmentSummaryDto {
  readonly id: string;
  readonly senderId: string;
  readonly senderName: string;
  readonly title: string;
  readonly category: string;
  readonly vehicleType: VehicleTypeCode;
  readonly weightGrams: number;
  readonly suggestedPriceCents: number;
  readonly originCity: string;
  readonly originNeighborhood: string;
  readonly destinationCity: string;
  readonly destinationNeighborhood: string;
  readonly deliveryWindow: string;
  readonly status: string;
  readonly photoCount: number;
  readonly createdAtUtc: string;
}

export interface CreateTripPayload {
  readonly vehicleType: VehicleTypeCode;
  readonly vehicleModel?: string;
  readonly originCity: string;
  readonly destinationCity: string;
  readonly intermediateStops?: readonly string[];
  readonly departureDate: string;
  readonly departureTime?: string;
  readonly availableCapacityGrams: number;
  readonly flexiblePickup: boolean;
  readonly suggestedPricePerKgCents: number;
}

export interface TripDto {
  readonly id: string;
  readonly carrierId: string;
  readonly carrierName: string;
  readonly carrierKycVerified: boolean;
  readonly vehicleType: VehicleTypeCode;
  readonly vehicleModel: string;
  readonly originCity: string;
  readonly originStateUf: string;
  readonly destinationCity: string;
  readonly destinationStateUf: string;
  readonly intermediateStops: readonly string[];
  readonly departureDate: string;
  readonly departureTime: string;
  readonly availableCapacityGrams: number;
  readonly flexiblePickup: boolean;
  readonly suggestedPricePerKgCents: number;
  readonly status: string;
  readonly createdAtUtc: string;
}

export interface TripSummaryDto {
  readonly id: string;
  readonly carrierId: string;
  readonly carrierName: string;
  readonly carrierKycVerified: boolean;
  readonly vehicleType: VehicleTypeCode;
  readonly vehicleModel: string;
  readonly originCity: string;
  readonly destinationCity: string;
  readonly stopCount: number;
  readonly departureDate: string;
  readonly departureTime: string;
  readonly availableCapacityGrams: number;
  readonly suggestedPricePerKgCents: number;
  readonly status: string;
  readonly createdAtUtc: string;
}

export interface RegionCityDto {
  readonly ibgeCode: string;
  readonly name: string;
  readonly stateUf: string;
  readonly isPilotPriority: boolean;
  readonly pilotPriorityOrder?: number | null;
  readonly approximateLatitude: number;
  readonly approximateLongitude: number;
}

/* --------------------------------------------------------------------------
   MÓDULO MATCHING (PR-03)
   -------------------------------------------------------------------------- */

export interface MatchEvaluationResultDto {
  readonly isCompatible: boolean;
  readonly matchScore: number;
  readonly matchType: string;
  readonly directionStatus: string;
  readonly rejectionReason: string;
  readonly reasonDescription: string;
  readonly estimatedDistanceKm: number;
  readonly detourDistanceKm?: number | null;
  readonly shipmentId: string;
  readonly shipmentTitle: string;
  readonly tripId: string;
  readonly carrierId: string;
  readonly carrierName: string;
  readonly vehicleType: string;
  readonly shipmentWeightGrams: number;
  readonly availableCapacityGrams: number;
  readonly pickupPoint: string;
  readonly deliveryPoint: string;
}

export interface NearbyShipmentOpportunityDto {
  readonly shipmentId: string;
  readonly title: string;
  readonly category: string;
  readonly vehicleType: string;
  readonly weightGrams: number;
  readonly suggestedPriceCents: number;
  readonly originCity: string;
  readonly originNeighborhood: string;
  readonly destinationCity: string;
  readonly distanceMeters: number;
  readonly isWithin2Km: boolean;
  readonly createdAtUtc: string;
}

export interface NearbyShipmentsResponse {
  readonly center: { readonly latitude: number; readonly longitude: number };
  readonly radiusMeters: number;
  readonly totalFound: number;
  readonly opportunities: readonly NearbyShipmentOpportunityDto[];
}

export interface CompatibleTripsResponse {
  readonly shipmentId: string;
  readonly totalCompatibleTrips: number;
  readonly matches: readonly MatchEvaluationResultDto[];
}

export interface CompatibleShipmentsResponse {
  readonly tripId: string;
  readonly totalCompatibleShipments: number;
  readonly matches: readonly MatchEvaluationResultDto[];
}

export type DetourClassification = "COMPATIBLE" | "REQUIRES_EVALUATION" | "EXCLUDED_BY_DEFAULT" | "INSUFFICIENT_LOCATION";

export interface RoadDetourInfoDto {
  readonly additionalDistanceKm: number;
  readonly additionalDurationMinutes: number;
  readonly classification: DetourClassification;
  readonly badgeLabel: string;
  readonly reasons: readonly string[];
  readonly isDistanceEstimated?: boolean;
}

export interface OpportunityFeedItemDto {
  readonly id: string;
  readonly type: "SHIPMENT" | "TRIP";
  readonly title: string;
  readonly category: string;
  readonly vehicleType: string;
  readonly weightGrams: number;
  readonly volumeLiters?: number | null;
  readonly suggestedPriceCents: number;
  readonly originCity: string;
  readonly originNeighborhood: string;
  readonly originLatitude?: number | null;
  readonly originLongitude?: number | null;
  readonly destinationCity: string;
  readonly destinationNeighborhood: string;
  readonly destinationLatitude?: number | null;
  readonly destinationLongitude?: number | null;
  readonly detour?: RoadDetourInfoDto | null;
  readonly isCapacityAvailable: boolean;
  readonly availableCapacityInLegsGrams: number;
  readonly createdAtUtc: string;
  readonly originIbgeCode?: string | null;
  readonly destinationIbgeCode?: string | null;
  readonly georeferenceStatus?: "RESOLVED" | "PENDING" | "UNRESOLVED" | "INVALID";
  readonly isDistanceEstimated?: boolean;
}

export interface CursorPagedResultDto<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string | null;
  readonly hasMore: boolean;
  readonly totalMatching: number;
  readonly limit: number;
}

export interface MunicipalitySearchItemDto {
  readonly ibgeCode: string;
  readonly name: string;
  readonly stateUf: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly isPilotPriority: boolean;
}

export interface SearchMunicipalitiesResponse {
  readonly totalFound: number;
  readonly municipalities: readonly MunicipalitySearchItemDto[];
}

/* --------------------------------------------------------------------------
   MÓDULO PROPOSTAS, CONTRATOS E NEGOCIAÇÃO (PR-04)
   -------------------------------------------------------------------------- */

export type ProposalStatusCode =
  | "PENDING"
  | "COUNTERED"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "SUPERSEDED"
  | "CANCELLED";

export type ContractStatusCode =
  | "ACTIVE"
  | "CANCELLED_PRE_PICKUP"
  | "CANCELLED_POST_PICKUP"
  | "COMPLETED";

export type CancellationReasonCode =
  | "MUTUAL_AGREEMENT"
  | "CARRIER_UNAVAILABLE"
  | "SENDER_CHANGE_OF_PLANS"
  | "OPERATIONAL_IMPOSSIBILITY"
  | "FORCE_MAJEURE"
  | "UNJUSTIFIED_CANCELLATION";

export interface CommissionSnapshotDto {
  readonly policyVersionId: string;
  readonly planCode: string;
  readonly commissionRate: number;
  readonly commissionCents: number;
  readonly carrierDueCents: number;
  readonly amountCents: number;
  readonly platformAbsorbsGatewayFees: boolean;
  readonly snapshottedAtUtc: string;
}

export interface LegReservationDto {
  readonly legIndex: number;
  readonly fromCity: string;
  readonly toCity: string;
  readonly reservedGrams: number;
}

export interface CancellationRecordDto {
  readonly cancelledAtUtc: string;
  readonly cancelledByUserId: string;
  readonly reasonCode: CancellationReasonCode;
  readonly justification: string;
  readonly reopenedForBidding: boolean;
  readonly simulatedPenaltyCents: number;
  readonly policyDisclaimer: string;
}

export interface ProposalDto {
  readonly id: string;
  readonly shipmentId: string;
  readonly tripId?: string | null;
  readonly carrierId: string;
  readonly carrierName: string;
  readonly senderId: string;
  readonly senderName: string;
  readonly amountCents: number;
  readonly status: ProposalStatusCode;
  readonly estimatedPickup?: string | null;
  readonly estimatedDelivery?: string | null;
  readonly notes?: string | null;
  readonly parentProposalId?: string | null;
  readonly counterCount: number;
  readonly expiresAtUtc: string;
  readonly isExpired: boolean;
  readonly version: number;
  readonly createdAtUtc: string;
}

export interface ContractDto {
  readonly id: string;
  readonly shipmentId: string;
  readonly tripId: string;
  readonly proposalId: string;
  readonly senderId: string;
  readonly senderName: string;
  readonly carrierId: string;
  readonly carrierName: string;
  readonly amountCents: number;
  readonly commissionSnapshot: CommissionSnapshotDto;
  readonly legReservations: readonly LegReservationDto[];
  readonly status: ContractStatusCode;
  readonly cancellation?: CancellationRecordDto | null;
  readonly contractedAtUtc: string;
}

export interface ProposalEventDto {
  readonly id: string;
  readonly proposalId: string;
  readonly shipmentId: string;
  readonly actorId: string;
  readonly actorRole: string;
  readonly eventType: string;
  readonly previousStatus: string;
  readonly newStatus: string;
  readonly amountCents: number;
  readonly justification?: string | null;
  readonly occurredAtUtc: string;
}

export interface PriorityOfferDto {
  readonly shipmentId: string;
  readonly eligibleCarrierId: string;
  readonly firstShipmentId: string;
  readonly tripId: string;
  readonly issuedAtUtc: string;
  readonly expiresAtUtc: string;
  readonly isActive: boolean;
  readonly isDeclined: boolean;
  readonly isAccepted: boolean;
  readonly notes: string;
}

export interface CreateProposalRequest {
  readonly shipmentId: string;
  readonly tripId?: string | null;
  readonly amountCents: number;
  readonly estimatedPickup?: string | null;
  readonly estimatedDelivery?: string | null;
  readonly notes?: string | null;
  readonly customExpirationHours?: number | null;
}

export interface CounterProposalRequest {
  readonly amountCents: number;
  readonly estimatedPickup?: string | null;
  readonly estimatedDelivery?: string | null;
  readonly notes?: string | null;
  readonly customExpirationHours?: number | null;
}

export interface CancelContractRequest {
  readonly reasonCode: CancellationReasonCode;
  readonly justification: string;
  readonly reopenForBidding: boolean;
}

export interface SandboxTokenResponse {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly expiresInSeconds: number;
  readonly userId: string;
  readonly role: string;
  readonly fullName: string;
  readonly email: string;
}

/* --------------------------------------------------------------------------
   MÓDULO FULFILLMENT & EXECUÇÃO DE ENTREGAS (PR-05 - GATE G3)
   -------------------------------------------------------------------------- */

export type DeliveryOrderStatus =
  | "CREATED"
  | "ASSIGNED"
  | "PICKUP_CHECKIN"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "EXCEPTION_REPORTED"
  | "RESCHEDULED"
  | "RETURN_TO_SENDER_INITIATED"
  | "RETURNED_TO_SENDER"
  | "DELIVERED_VERIFIED"
  | "CANCELLED";

export type DeliveryProofType =
  | "CODE_CONFIRMATION"
  | "DELIVERY_PHOTO"
  | "PICKUP_PHOTO"
  | "EXCEPTION_PHOTO";

export type DeliveryEventType =
  | "ORDER_CREATED"
  | "PICKUP_CHECKED_IN"
  | "PICKUP_CONFIRMED"
  | "TRANSIT_CHECKPOINT"
  | "CHALLENGE_GENERATED"
  | "CHALLENGE_VERIFIED"
  | "CHALLENGE_FAILED"
  | "CHALLENGE_LOCKED"
  | "CHALLENGE_REGENERATED"
  | "PROOF_UPLOADED"
  | "EXCEPTION_LOGGED"
  | "RESCHEDULED"
  | "RETURN_INITIATED"
  | "RETURN_CONFIRMED"
  | "DELIVERY_COMPLETED";

export type DeliveryExceptionReasonCode =
  | "RECIPIENT_ABSENT"
  | "WRONG_ADDRESS"
  | "REFUSED_BY_RECIPIENT"
  | "ACCIDENT_OR_BREAKDOWN"
  | "WEATHER_OR_BLOCKED_ROAD"
  | "OTHER";

export interface DeliveryOrderDto {
  readonly id: string;
  readonly proposalId: string;
  readonly shipmentId: string;
  readonly tripId?: string | null;
  readonly senderId: string;
  readonly carrierId: string;
  readonly status: DeliveryOrderStatus;
  readonly pickupCityIbge: string;
  readonly deliveryCityIbge: string;
  readonly agreedAmountCents: number;
  readonly platformFeeCents: number;
  readonly carrierNetCents: number;
  readonly requiresPhotoProof: boolean;
  readonly requiresCodeVerification: boolean;
  readonly hasValidPhotoProof: boolean;
  readonly hasValidCodeVerification: boolean;
  readonly remainingChallengeAttempts: number;
  readonly isChallengeLocked: boolean;
  readonly exceptionReasonCode?: string | null;
  readonly exceptionNotes?: string | null;
  readonly exceptionReportedAtUtc?: string | null;
  readonly scheduledDeliveryWindowStartUtc?: string | null;
  readonly scheduledDeliveryWindowEndUtc?: string | null;
  readonly createdAtUtc: string;
  readonly inTransitAtUtc?: string | null;
  readonly completedAtUtc?: string | null;
}

export interface DeliveryChallengeDto {
  readonly deliveryOrderId: string;
  readonly failedAttempts: number;
  readonly maxAttempts: number;
  readonly remainingAttempts: number;
  readonly isLocked: boolean;
  readonly isVerified: boolean;
  readonly issuedAtUtc: string;
  readonly expiresAtUtc: string;
  readonly plainCode?: string | null;
}

export interface DeliveryProofDto {
  readonly id: string;
  readonly deliveryOrderId: string;
  readonly proofType: DeliveryProofType;
  readonly fileUrl: string;
  readonly notes?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly recordedAtUtc: string;
}

export interface DeliveryEventDto {
  readonly id: string;
  readonly deliveryOrderId: string;
  readonly actorId: string;
  readonly actorRole: string;
  readonly eventType: DeliveryEventType;
  readonly previousStatus: string;
  readonly newStatus: string;
  readonly details?: string | null;
  readonly occurredAtUtc: string;
}

export interface DeliveryExceptionDto {
  readonly id: string;
  readonly deliveryOrderId: string;
  readonly reasonCode: DeliveryExceptionReasonCode;
  readonly notes: string;
  readonly proofUrl?: string | null;
  readonly occurredAtUtc: string;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
}

export interface DeliveryTrackingDto {
  readonly order: DeliveryOrderDto;
  readonly events: readonly DeliveryEventDto[];
  readonly proofs: readonly DeliveryProofDto[];
  readonly exceptions: readonly DeliveryExceptionDto[];
  readonly remainingChallengeAttempts: number;
  readonly isChallengeLocked: boolean;
}

export interface PostDeliverySuggestionDto {
  readonly shipmentId: string;
  readonly title: string;
  readonly originCity: string;
  readonly destinationCity: string;
  readonly suggestedPriceCents: number;
  readonly distanceKmFromDestination: number;
  readonly weightGrams: number;
  readonly urgencyHours: number;
}

export interface PickupCheckinRequest {
  readonly notes?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
}

export interface ConfirmPickupRequest {
  readonly notes?: string | null;
  readonly photoUrl?: string | null;
}

export interface UploadDeliveryProofRequest {
  readonly proofType: DeliveryProofType;
  readonly fileUrl: string;
  readonly notes?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
}

export interface ConfirmDeliveryRequest {
  readonly verificationCode: string;
  readonly photoUrl?: string | null;
  readonly notes?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
}

export interface ReportDeliveryExceptionRequest {
  readonly reasonCode: DeliveryExceptionReasonCode;
  readonly notes: string;
  readonly photoProofUrl?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
}

export interface RescheduleDeliveryRequest {
  readonly newScheduledWindowStartUtc: string;
  readonly newScheduledWindowEndUtc?: string | null;
  readonly justification: string;
}

export interface InitiateReturnRequest {
  readonly justification: string;
}

/* --------------------------------------------------------------------------
   MÓDULO POLÍTICAS COMERCIAIS & ASSINATURAS (PR-FIN-01)
   -------------------------------------------------------------------------- */

export interface CommercialPolicyDto {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly freePlanCommissionPercent: number;
  readonly premiumPlanCommissionPercent: number;
  readonly premiumMonthlyFeeCents: number;
  readonly cancellationPenaltyPercent: number;
  readonly cancellationMinFeeCents: number;
  readonly cancellationInjuredPartySharePercent: number;
  readonly validFrom: string;
  readonly validUntil?: string | null;
  readonly isActive: boolean;
  readonly justification: string;
  readonly createdAtUtc: string;
  readonly status?: string;
}

export interface SubscriptionPlanDto {
  readonly code: string;
  readonly name: string;
  readonly commissionRatePercent: number;
  readonly monthlyFeeCents: number;
  readonly description: string;
}

export interface CarrierSubscriptionDto {
  readonly id: string;
  readonly carrierId: string;
  readonly planCode: string;
  readonly status: string;
  readonly monthlyFeeCents: number;
  readonly commissionRatePercent: number;
  readonly currentPeriodStartUtc: string;
  readonly currentPeriodEndUtc: string;
  readonly canceledAtUtc?: string | null;
}

/* --------------------------------------------------------------------------
   MÓDULO ADMIN & GOVERNANÇA FINANCEIRA (PR-ADM-01 / PR-FIN-02)
   -------------------------------------------------------------------------- */

export interface AdminDashboardMetricsDto {
  readonly totalUsers: number;
  readonly totalCarriers: number;
  readonly totalSenders: number;
  readonly totalPublishedShipments: number;
  readonly totalActiveTrips: number;
  readonly totalFormalizedContracts: number;
  readonly totalVehiclesPendingModeration: number;
  readonly totalActiveSubscriptions: number;
  readonly currentPolicyVersion: string;
  readonly freePlanCommissionPercent: number;
  readonly premiumPlanCommissionPercent: number;
  readonly premiumMonthlyFeeCents: number;
  readonly generatedAtUtc: string;
}

export interface OperationalSettingsDto {
  readonly id: string;
  readonly version: string;
  readonly bicycleMaxWeightGrams: number;
  readonly motorcycleMaxWeightGrams: number;
  readonly carMaxWeightGrams: number;
  readonly carMaxAgeYears: number;
  readonly geoDeviationCompatibleKm: number;
  readonly geoDeviationRequiresEvalKm: number;
  readonly postDeliveryRadiusKm: number;
  readonly proposalStandardValidityHours: number;
  readonly proposalSameDayValidityHours: number;
  readonly prioritySecondShipmentMinutes: number;
  readonly cancellationPenaltyPercent: number;
  readonly cancellationMinFeeCents: number;
  readonly cancellationInjuredPartySharePercent: number;
  readonly isActive: boolean;
  readonly justification: string;
  readonly updatedAtUtc: string;
}

export interface UpdateOperationalSettingsDto {
  readonly bicycleMaxWeightGrams?: number;
  readonly motorcycleMaxWeightGrams?: number;
  readonly carMaxWeightGrams?: number;
  readonly carMaxAgeYears?: number;
  readonly geoDeviationCompatibleKm?: number;
  readonly geoDeviationRequiresEvalKm?: number;
  readonly postDeliveryRadiusKm?: number;
  readonly proposalStandardValidityHours?: number;
  readonly proposalSameDayValidityHours?: number;
  readonly prioritySecondShipmentMinutes?: number;
  readonly cancellationPenaltyPercent?: number;
  readonly cancellationMinFeeCents?: number;
  readonly cancellationInjuredPartySharePercent?: number;
  readonly justification: string;
}

export interface CarrierVehicleDto {
  readonly id: string;
  readonly carrierId: string;
  readonly carrierName: string;
  readonly vehicleType: string;
  readonly brandModel: string;
  readonly manufacturingYear: number;
  readonly plateMasked: string;
  readonly declaredCapacityGrams: number;
  readonly status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "INACTIVE";
  readonly rejectionReason?: string | null;
  readonly moderatedByUserId?: string | null;
  readonly moderatedAtUtc?: string | null;
  readonly ageYears: number;
  readonly regulatoryAgeWarning: boolean;
  readonly createdAtUtc: string;
}

export interface ModerateVehicleDto {
  readonly status: "APPROVED" | "REJECTED";
  readonly rejectionReason?: string | null;
}

export interface PaymentMethodDto {
  readonly methodCode: string;
  readonly displayName: string;
  readonly providerName: string;
  readonly isEnabled: boolean;
  readonly feePercent: number;
  readonly fixedFeeCents: number;
  readonly platformAbsorbsFee: boolean;
  readonly minAmountCents: number;
  readonly maxAmountCents: number;
  readonly justification: string;
  readonly updatedAtUtc: string;
}

export interface TogglePaymentMethodDto {
  readonly isEnabled: boolean;
  readonly justification: string;
}

export interface CheckoutSimulationDto {
  readonly simulationId: string;
  readonly grossAmountCents: number;
  readonly paymentMethodCode: string;
  readonly provider: string;
  readonly platformAbsorbedGatewayFeeCents: number;
  readonly appliedCommissionPercent: number;
  readonly platformCommissionCents: number;
  readonly carrierNetCents: number;
  readonly senderTotalCents: number;
  readonly accountingInvariantPreserved: boolean;
  readonly platformAbsorbsGatewayFee: boolean;
  readonly sandboxPaymentReference: string;
  readonly sandboxInstructions: string;
  readonly simulatedAtUtc: string;
}

export interface CheckoutSimulationRequestDto {
  readonly amountCents: number;
  readonly paymentMethodCode: string;
  readonly carrierId?: string | null;
  readonly shipmentId?: string | null;
  readonly planCodeOverride?: string | null;
}

export interface AdminAuditEventDto {
  readonly id: string;
  readonly actorUserId: string;
  readonly actorRole: string;
  readonly category: string;
  readonly action: string;
  readonly entityId: string;
  readonly payloadBefore?: string | null;
  readonly payloadAfter: string;
  readonly correlationId?: string | null;
  readonly recordedAtUtc: string;
}

/* --------------------------------------------------------------------------
   MÓDULO GESTÃO JURÍDICA E CONTRATOS DIGITAIS (PR-LEG-01)
   -------------------------------------------------------------------------- */

export type LegalDocumentCategory =
  | "TERMS_OF_SERVICE"
  | "CARRIER_ADHESION"
  | "SENDER_ADHESION"
  | "PRIVACY_POLICY"
  | "PLATFORM_MEDIATION"
  | "MUNICIPAL_REGULATION";

export type LegalDocumentStatus =
  | "DRAFT"
  | "APPROVED"
  | "PUBLISHED"
  | "ARCHIVED";

export type LegalScopeType =
  | "NATIONAL"
  | "STATE"
  | "MUNICIPAL";

export interface LegalDocumentTemplateDto {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly category: LegalDocumentCategory;
  readonly version: string;
  readonly content: string;
  readonly contentSha256: string;
  readonly scopeType: LegalScopeType;
  readonly stateUf?: string | null;
  readonly ibgeCityCode?: string | null;
  readonly cityName?: string | null;
  readonly status: LegalDocumentStatus;
  readonly effectiveDateUtc?: string | null;
  readonly previousVersionId?: string | null;
  readonly changeNotes?: string | null;
  readonly legalNotes?: string | null;
  readonly createdByUserId: string;
  readonly approvedByUserId?: string | null;
  readonly approvedAtUtc?: string | null;
  readonly publishedAtUtc?: string | null;
  readonly createdAtUtc: string;
  readonly updatedAtUtc: string;
  readonly detectedPlaceholders: readonly string[];
}

export interface LegalAcceptanceDto {
  readonly id: string;
  readonly templateId: string;
  readonly documentCode: string;
  readonly documentTitle: string;
  readonly category: LegalDocumentCategory;
  readonly documentVersion: string;
  readonly contentSha256: string;
  readonly userId: string;
  readonly userRole: string;
  readonly ipAddress: string;
  readonly userAgent: string;
  readonly acceptedAtUtc: string;
}

export interface CreateLegalTemplateDto {
  readonly title: string;
  readonly category: LegalDocumentCategory;
  readonly content: string;
  readonly scopeType: LegalScopeType;
  readonly stateUf?: string | null;
  readonly ibgeCityCode?: string | null;
  readonly cityName?: string | null;
  readonly changeNotes?: string | null;
}

export interface UpdateLegalTemplateDto {
  readonly title: string;
  readonly content: string;
  readonly changeNotes?: string | null;
}

export interface ApproveLegalTemplateDto {
  readonly legalNotes: string;
}

export interface PublishLegalTemplateDto {
  readonly effectiveDateUtc?: string | null;
}

export interface PreviewLegalTemplateRequestDto {
  readonly content: string;
  readonly sampleData: Record<string, string>;
}

export interface PreviewLegalTemplateResponseDto {
  readonly originalContent: string;
  readonly resolvedContent: string;
  readonly detectedPlaceholders: readonly string[];
  readonly missingPlaceholders: readonly string[];
}

export interface DiffChunkDto {
  readonly changeType: "UNCHANGED" | "ADDED" | "REMOVED";
  readonly text: string;
  readonly sourceLineNumber?: number | null;
  readonly targetLineNumber?: number | null;
}

export interface CompareLegalVersionsResponseDto {
  readonly documentCode: string;
  readonly sourceVersion: string;
  readonly targetVersion: string;
  readonly diffChunks: readonly DiffChunkDto[];
  readonly totalAdditions: number;
  readonly totalDeletions: number;
}



