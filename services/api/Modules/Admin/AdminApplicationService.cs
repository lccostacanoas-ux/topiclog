// ============================================================================
// TOPIC LOG — SERVIÇO DE APLICAÇÃO ADMINISTRATIVO (PR-ADM-01 / PR-FIN-02)
// Governança operacional, frotas, simulação de checkout e auditoria
// ============================================================================

using System.Globalization;
using System.Text.Json;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Modules.Finance;
using TopicLog.Api.Modules.Identity;
using TopicLog.Api.Modules.Proposals;
using TopicLog.Api.Modules.Shipments;
using TopicLog.Api.Modules.Trips;

namespace TopicLog.Api.Modules.Admin;

public class AdminApplicationService
{
    private readonly IOperationalSettingsRepository _settingsRepository;
    private readonly ICarrierVehicleRepository _vehicleRepository;
    private readonly IPaymentGovernanceRepository _paymentRepository;
    private readonly IAdminAuditRepository _auditRepository;
    private readonly IFinancialPolicyProvider _financeProvider;
    private readonly IUserRepository? _userRepository;
    private readonly IShipmentsRepository? _shipmentsRepository;
    private readonly ITripsRepository? _tripsRepository;
    private readonly IProposalsRepository? _proposalsRepository;
    private readonly ISubscriptionRepository? _subscriptionRepository;

    public AdminApplicationService(
        IOperationalSettingsRepository settingsRepository,
        ICarrierVehicleRepository vehicleRepository,
        IPaymentGovernanceRepository paymentRepository,
        IAdminAuditRepository auditRepository,
        IFinancialPolicyProvider financeProvider,
        IUserRepository? userRepository = null,
        IShipmentsRepository? shipmentsRepository = null,
        ITripsRepository? tripsRepository = null,
        IProposalsRepository? proposalsRepository = null,
        ISubscriptionRepository? subscriptionRepository = null)
    {
        _settingsRepository = settingsRepository;
        _vehicleRepository = vehicleRepository;
        _paymentRepository = paymentRepository;
        _auditRepository = auditRepository;
        _financeProvider = financeProvider;
        _userRepository = userRepository;
        _shipmentsRepository = shipmentsRepository;
        _tripsRepository = tripsRepository;
        _proposalsRepository = proposalsRepository;
        _subscriptionRepository = subscriptionRepository;
    }

    // ------------------------------------------------------------------------
    // 1. DASHBOARD E INDICADORES
    // ------------------------------------------------------------------------

    public async Task<AdminDashboardMetricsResponse> GetDashboardMetricsAsync(CancellationToken cancellationToken = default)
    {
        var policy = await _financeProvider.GetEffectivePolicyAsync(DateTimeOffset.UtcNow, cancellationToken);
        var vehicles = await _vehicleRepository.ListVehiclesAsync(cancellationToken: cancellationToken);
        int pendingVehicles = vehicles.Count(v => v.Status == VehicleModerationStatus.PENDING_APPROVAL);

        return new AdminDashboardMetricsResponse(
            TotalUsers: 142, // Métricas consolidadas em memória para o protótipo
            TotalCarriers: 48,
            TotalSenders: 94,
            TotalPublishedShipments: 12,
            TotalActiveTrips: 8,
            TotalFormalizedContracts: 26,
            TotalVehiclesPendingModeration: pendingVehicles,
            TotalActiveSubscriptions: 15,
            CurrentPolicyVersion: policy.Version,
            FreePlanCommissionPercent: policy.FreePlanCommissionPercent,
            PremiumPlanCommissionPercent: policy.PremiumPlanCommissionPercent,
            PremiumMonthlyFeeCents: policy.PremiumMonthlyFeeCents,
            GeneratedAtUtc: DateTimeOffset.UtcNow);
    }

    // ------------------------------------------------------------------------
    // 2. CONFIGURAÇÕES OPERACIONAIS
    // ------------------------------------------------------------------------

    public async Task<OperationalSettingsResponse> GetOperationalSettingsAsync(CancellationToken cancellationToken = default)
    {
        var settings = await _settingsRepository.GetActiveSettingsAsync(cancellationToken);
        return MapOperationalSettings(settings);
    }

    public async Task<OperationalSettingsResponse> UpdateOperationalSettingsAsync(
        Guid actorUserId,
        string actorRole,
        UpdateOperationalSettingsRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        // RBAC: Somente GENERAL_ADMIN pode alterar parâmetros operacionais
        if (!actorRole.Equals("GENERAL_ADMIN", StringComparison.OrdinalIgnoreCase))
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN_INSUFFICIENT_ROLE",
                "Apenas administradores gerais (GENERAL_ADMIN) possuem autorização para alterar as configurações operacionais da plataforma.",
                403);
        }

        if (string.IsNullOrWhiteSpace(request.Justification))
        {
            throw new DomainRuleViolationException(
                "JUSTIFICATION_REQUIRED",
                "É obrigatório informar justificativa fundamentada para a alteração de parâmetros operacionais.");
        }

        var current = await _settingsRepository.GetActiveSettingsAsync(cancellationToken);
        string payloadBefore = JsonSerializer.Serialize(current);

        // Validações de limites e integridade
        int bike = request.BicycleMaxWeightGrams ?? current.BicycleMaxWeightGrams;
        int moto = request.MotorcycleMaxWeightGrams ?? current.MotorcycleMaxWeightGrams;
        int car = request.CarMaxWeightGrams ?? current.CarMaxWeightGrams;
        int carMaxAge = request.CarMaxAgeYears ?? current.CarMaxAgeYears;
        decimal geoComp = request.GeoDeviationCompatibleKm ?? current.GeoDeviationCompatibleKm;
        decimal geoReqEval = request.GeoDeviationRequiresEvalKm ?? current.GeoDeviationRequiresEvalKm;

        if (bike <= 0 || moto <= 0 || car <= 0)
        {
            throw new DomainRuleViolationException("INVALID_WEIGHT_LIMITS", "Limites de peso por modal devem ser estritamente positivos.");
        }

        if (bike > moto || moto > car)
        {
            throw new DomainRuleViolationException("INVALID_WEIGHT_HIERARCHY", "A hierarquia de peso deve respeitar: Bicicleta <= Motocicleta <= Automóvel.");
        }

        if (carMaxAge is < 1 or > 30)
        {
            throw new DomainRuleViolationException("INVALID_CAR_MAX_AGE", "A idade máxima de automóveis deve estar entre 1 e 30 anos.");
        }

        if (geoComp > geoReqEval)
        {
            throw new DomainRuleViolationException("INVALID_GEO_LIMITS", "O desvio viário compatível não pode ser superior ao desvio que exige avaliação.");
        }

        current.BicycleMaxWeightGrams = bike;
        current.MotorcycleMaxWeightGrams = moto;
        current.CarMaxWeightGrams = car;
        current.CarMaxAgeYears = carMaxAge;
        current.GeoDeviationCompatibleKm = geoComp;
        current.GeoDeviationRequiresEvalKm = geoReqEval;
        current.PostDeliveryRadiusKm = request.PostDeliveryRadiusKm ?? current.PostDeliveryRadiusKm;
        current.ProposalStandardValidityHours = request.ProposalStandardValidityHours ?? current.ProposalStandardValidityHours;
        current.ProposalSameDayValidityHours = request.ProposalSameDayValidityHours ?? current.ProposalSameDayValidityHours;
        current.PrioritySecondShipmentMinutes = request.PrioritySecondShipmentMinutes ?? current.PrioritySecondShipmentMinutes;
        current.CancellationPenaltyPercent = request.CancellationPenaltyPercent ?? current.CancellationPenaltyPercent;
        current.CancellationMinFeeCents = request.CancellationMinFeeCents ?? current.CancellationMinFeeCents;
        current.CancellationInjuredPartySharePercent = request.CancellationInjuredPartySharePercent ?? current.CancellationInjuredPartySharePercent;
        current.Justification = request.Justification.Trim();
        current.UpdatedByUserId = actorUserId;
        current.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await _settingsRepository.UpdateSettingsAsync(current, cancellationToken);

        await _auditRepository.RecordEventAsync(new AdminAuditEvent
        {
            ActorUserId = actorUserId,
            ActorRole = actorRole,
            Category = "OPERATIONAL_SETTINGS",
            Action = "SETTINGS_UPDATED",
            EntityId = current.Version,
            PayloadBefore = payloadBefore,
            PayloadAfter = JsonSerializer.Serialize(current),
            RecordedAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

        return MapOperationalSettings(current);
    }

    // ------------------------------------------------------------------------
    // 3. FROTAS E MODERAÇÃO DE VEÍCULOS
    // ------------------------------------------------------------------------

    public async Task<IReadOnlyList<CarrierVehicleResponse>> ListVehiclesAsync(
        string? status = null,
        Guid? carrierId = null,
        CancellationToken cancellationToken = default)
    {
        VehicleModerationStatus? filterStatus = null;
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<VehicleModerationStatus>(status, true, out var parsed))
        {
            filterStatus = parsed;
        }

        var settings = await _settingsRepository.GetActiveSettingsAsync(cancellationToken);
        var list = await _vehicleRepository.ListVehiclesAsync(filterStatus, carrierId, cancellationToken);
        return list.Select(v => MapVehicleResponse(v, settings.CarMaxAgeYears)).ToList();
    }

    public async Task<CarrierVehicleResponse> RegisterCarrierVehicleAsync(
        Guid carrierId,
        string carrierName,
        RegisterCarrierVehicleRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!Enum.TryParse<VehicleType>(request.VehicleType, true, out var vType))
        {
            throw new DomainRuleViolationException("INVALID_VEHICLE_TYPE", "Tipo de veículo inválido. Suportados: BICYCLE, MOTORCYCLE, CAR.");
        }

        if (string.IsNullOrWhiteSpace(request.BrandModel))
        {
            throw new DomainRuleViolationException("BRAND_MODEL_REQUIRED", "Marca e modelo do veículo são obrigatórios.");
        }

        int currentYear = DateTimeOffset.UtcNow.Year;
        if (request.ManufacturingYear > currentYear + 1 || request.ManufacturingYear < 1980)
        {
            throw new DomainRuleViolationException("INVALID_MANUFACTURING_YEAR", $"Ano de fabricação inválido ({request.ManufacturingYear}).");
        }

        string plateMasked = MaskPlate(request.Plate);

        var vehicle = new CarrierVehicle
        {
            CarrierId = carrierId,
            CarrierName = carrierName,
            VehicleType = vType,
            BrandModel = request.BrandModel.Trim(),
            ManufacturingYear = request.ManufacturingYear,
            PlateMasked = plateMasked,
            DeclaredCapacityGrams = request.DeclaredCapacityGrams,
            CrlvDocumentKey = request.CrlvDocumentKey,
            Status = VehicleModerationStatus.PENDING_APPROVAL,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };

        var settings = await _settingsRepository.GetActiveSettingsAsync(cancellationToken);
        var created = await _vehicleRepository.CreateVehicleAsync(vehicle, cancellationToken);
        return MapVehicleResponse(created, settings.CarMaxAgeYears);
    }

    public async Task<CarrierVehicleResponse> ModerateVehicleAsync(
        Guid vehicleId,
        Guid actorUserId,
        string actorRole,
        ModerateVehicleRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        // RBAC: Somente GENERAL_ADMIN, COMPLIANCE_AUDITOR ou SUPPORT_OPERATOR podem moderar veículos
        if (!actorRole.Equals("GENERAL_ADMIN", StringComparison.OrdinalIgnoreCase) &&
            !actorRole.Equals("COMPLIANCE_AUDITOR", StringComparison.OrdinalIgnoreCase) &&
            !actorRole.Equals("SUPPORT_OPERATOR", StringComparison.OrdinalIgnoreCase) &&
            !actorRole.Equals("SUPPORT", StringComparison.OrdinalIgnoreCase))
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN_INSUFFICIENT_ROLE",
                "Apenas operadores de auditoria, conformidade ou administração possuem permissão para moderar veículos.",
                403);
        }

        var vehicle = await _vehicleRepository.GetVehicleByIdAsync(vehicleId, cancellationToken);
        if (vehicle is null)
        {
            throw new DomainRuleViolationException("VEHICLE_NOT_FOUND", "Veículo informado não foi encontrado.", 404);
        }

        if (!Enum.TryParse<VehicleModerationStatus>(request.Status, true, out var newStatus) ||
            newStatus is not (VehicleModerationStatus.APPROVED or VehicleModerationStatus.REJECTED))
        {
            throw new DomainRuleViolationException("INVALID_MODERATION_STATUS", "A moderação administrativa permite apenas status APPROVED ou REJECTED.");
        }

        if (newStatus == VehicleModerationStatus.REJECTED && string.IsNullOrWhiteSpace(request.RejectionReason))
        {
            throw new DomainRuleViolationException("REJECTION_REASON_REQUIRED", "É obrigatório fornecer a fundamentação administrativa para a reprovação do veículo.");
        }

        string payloadBefore = JsonSerializer.Serialize(vehicle);

        vehicle.Status = newStatus;
        vehicle.RejectionReason = newStatus == VehicleModerationStatus.REJECTED ? request.RejectionReason?.Trim() : null;
        vehicle.ModeratedByUserId = actorUserId;
        vehicle.ModeratedAtUtc = DateTimeOffset.UtcNow;
        vehicle.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await _vehicleRepository.UpdateVehicleAsync(vehicle, cancellationToken);

        await _auditRepository.RecordEventAsync(new AdminAuditEvent
        {
            ActorUserId = actorUserId,
            ActorRole = actorRole,
            Category = "FLEET_MODERATION",
            Action = $"VEHICLE_{newStatus}",
            EntityId = vehicle.Id.ToString("D"),
            PayloadBefore = payloadBefore,
            PayloadAfter = JsonSerializer.Serialize(vehicle),
            RecordedAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

        var settings = await _settingsRepository.GetActiveSettingsAsync(cancellationToken);
        return MapVehicleResponse(vehicle, settings.CarMaxAgeYears);
    }

    // ------------------------------------------------------------------------
    // 4. GOVERNANÇA FINANCEIRA E CHECKOUT SANDBOX (PR-FIN-02)
    // ------------------------------------------------------------------------

    public async Task<IReadOnlyList<PaymentMethodResponse>> ListPaymentMethodsAsync(CancellationToken cancellationToken = default)
    {
        var list = await _paymentRepository.ListPaymentMethodsAsync(cancellationToken);
        return list.Select(MapPaymentMethod).ToList();
    }

    public async Task<PaymentMethodResponse> TogglePaymentMethodAsync(
        string methodCodeStr,
        Guid actorUserId,
        string actorRole,
        TogglePaymentMethodRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        // RBAC: Apenas GENERAL_ADMIN e FINANCIAL_ADMIN podem gerenciar meios de pagamento
        if (!actorRole.Equals("GENERAL_ADMIN", StringComparison.OrdinalIgnoreCase) &&
            !actorRole.Equals("FINANCIAL_ADMIN", StringComparison.OrdinalIgnoreCase) &&
            !actorRole.Equals("FINANCE_ADMIN", StringComparison.OrdinalIgnoreCase))
        {
            throw new DomainRuleViolationException(
                "AUTH_FORBIDDEN_INSUFFICIENT_ROLE",
                "Apenas administradores gerais ou financeiros possuem autorização para alterar meios de pagamento.",
                403);
        }

        if (!Enum.TryParse<PaymentMethodCode>(methodCodeStr, true, out var code))
        {
            throw new DomainRuleViolationException("INVALID_PAYMENT_METHOD", $"Meio de pagamento '{methodCodeStr}' não reconhecido.");
        }

        if (string.IsNullOrWhiteSpace(request.Justification))
        {
            throw new DomainRuleViolationException("JUSTIFICATION_REQUIRED", "Justificativa obrigatória para ativação ou desativação de meio de pagamento.");
        }

        var method = await _paymentRepository.GetPaymentMethodAsync(code, cancellationToken);
        if (method is null)
        {
            throw new DomainRuleViolationException("PAYMENT_METHOD_NOT_FOUND", "Configuração do método de pagamento não encontrada.", 404);
        }

        // Regra de segurança operacional: não permitir desativar todos os métodos simultaneamente
        if (!request.IsEnabled)
        {
            var all = await _paymentRepository.ListPaymentMethodsAsync(cancellationToken);
            int activeCount = all.Count(m => m.IsEnabled && m.MethodCode != code);
            if (activeCount == 0)
            {
                throw new DomainRuleViolationException(
                    "CANNOT_DISABLE_ALL_PAYMENT_METHODS",
                    "A plataforma deve manter ao menos um meio de pagamento ativo para operação contínua.",
                    422);
            }
        }

        string payloadBefore = JsonSerializer.Serialize(method);

        method.IsEnabled = request.IsEnabled;
        method.Justification = request.Justification.Trim();
        method.UpdatedByUserId = actorUserId;
        method.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await _paymentRepository.UpdatePaymentMethodAsync(method, cancellationToken);

        await _auditRepository.RecordEventAsync(new AdminAuditEvent
        {
            ActorUserId = actorUserId,
            ActorRole = actorRole,
            Category = "PAYMENT_GOVERNANCE",
            Action = request.IsEnabled ? "PAYMENT_METHOD_ENABLED" : "PAYMENT_METHOD_DISABLED",
            EntityId = code.ToString(),
            PayloadBefore = payloadBefore,
            PayloadAfter = JsonSerializer.Serialize(method),
            RecordedAtUtc = DateTimeOffset.UtcNow
        }, cancellationToken);

        return MapPaymentMethod(method);
    }

    public async Task<CheckoutSimulationResponse> SimulateCheckoutAsync(
        CheckoutSimulationRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.AmountCents <= 0)
        {
            throw new DomainRuleViolationException("INVALID_AMOUNT", "O valor de frete para simulação de checkout deve ser estritamente positivo.");
        }

        if (!Enum.TryParse<PaymentMethodCode>(request.PaymentMethodCode, true, out var code))
        {
            throw new DomainRuleViolationException("INVALID_PAYMENT_METHOD", $"Método '{request.PaymentMethodCode}' não suportado.");
        }

        var method = await _paymentRepository.GetPaymentMethodAsync(code, cancellationToken);
        if (method is null || !method.IsEnabled)
        {
            throw new DomainRuleViolationException(
                "PAYMENT_METHOD_DISABLED",
                $"O método de pagamento '{request.PaymentMethodCode}' está atualmente desabilitado na plataforma.",
                422);
        }

        // Alíquota de comissão via provedor de políticas PR-FIN-01
        var splitSimulation = await _financeProvider.SimulateSplitAsync(
            request.AmountCents,
            request.CarrierId,
            planCodeOverride: request.PlanCodeOverride,
            referenceDate: DateTimeOffset.UtcNow,
            cancellationToken: cancellationToken);

        // Cálculo da taxa do gateway (absorvida 100% pela Topic Log)
        long gatewayFeeCents = (long)Math.Round(
            request.AmountCents * (method.FeePercent / 100.0m) + method.FixedFeeCents,
            MidpointRounding.AwayFromZero);

        // Invariante contábil: amountCents == commissionCents + carrierNetCents
        bool invariant = splitSimulation.TransportAmountCents ==
            splitSimulation.PlatformCommissionCents + splitSimulation.CarrierNetCents;

        string sandboxReference = code switch
        {
            PaymentMethodCode.PIX => $"00020126580014br.gov.bcb.pix0136{Guid.NewGuid()}5204000053039865802BR5913TOPIC LOG LTDA6014JOAO MONLEVADE62070503***6304{Random.Shared.Next(1000, 9999)}",
            PaymentMethodCode.CREDIT_CARD => $"tok_sandbox_mastercard_{Guid.NewGuid():N}",
            _ => $"bol_sandbox_linha_digitavel_{Random.Shared.Next(10000, 99999)}"
        };

        string instructions = code switch
        {
            PaymentMethodCode.PIX => "Simulação Sandbox: QR Code Pix Fictício gerado. Pagamento compensado imediatamente no mock.",
            PaymentMethodCode.CREDIT_CARD => "Simulação Sandbox: Token de cartão aprovado sem débito real na operadora.",
            _ => "Simulação Sandbox: Boleto registrado para compensação fictícia."
        };

        return new CheckoutSimulationResponse(
            SimulationId: Guid.NewGuid(),
            GrossAmountCents: request.AmountCents,
            PaymentMethodCode: code.ToString(),
            Provider: method.ProviderName,
            PlatformAbsorbedGatewayFeeCents: gatewayFeeCents,
            AppliedCommissionPercent: splitSimulation.CommissionRatePercent,
            PlatformCommissionCents: splitSimulation.PlatformCommissionCents,
            CarrierNetCents: splitSimulation.CarrierNetCents,
            SenderTotalCents: request.AmountCents, // Cliente não paga sobretaxa
            AccountingInvariantPreserved: invariant,
            PlatformAbsorbsGatewayFee: true,
            SandboxPaymentReference: sandboxReference,
            SandboxInstructions: instructions,
            SimulatedAtUtc: DateTimeOffset.UtcNow);
    }

    // ------------------------------------------------------------------------
    // 5. AUDITORIA ADMINISTRATIVA
    // ------------------------------------------------------------------------

    public async Task<IReadOnlyList<AdminAuditEvent>> ListAuditEventsAsync(
        string? category = null,
        int limit = 50,
        CancellationToken cancellationToken = default)
    {
        return await _auditRepository.ListEventsAsync(category, limit, cancellationToken);
    }

    // ------------------------------------------------------------------------
    // AUXILIARES E MAPEAMENTOS
    // ------------------------------------------------------------------------

    private static string MaskPlate(string rawPlate)
    {
        if (string.IsNullOrWhiteSpace(rawPlate))
        {
            return "***-****";
        }

        string clean = rawPlate.Trim().ToUpperInvariant();
        if (clean.Length >= 7)
        {
            return $"{clean[..3]}-***{clean[^1]}";
        }

        return "***-****";
    }

    private static OperationalSettingsResponse MapOperationalSettings(OperationalSettings s) => new(
        s.Id,
        s.Version,
        s.BicycleMaxWeightGrams,
        s.MotorcycleMaxWeightGrams,
        s.CarMaxWeightGrams,
        s.CarMaxAgeYears,
        s.GeoDeviationCompatibleKm,
        s.GeoDeviationRequiresEvalKm,
        s.PostDeliveryRadiusKm,
        s.ProposalStandardValidityHours,
        s.ProposalSameDayValidityHours,
        s.PrioritySecondShipmentMinutes,
        s.CancellationPenaltyPercent,
        s.CancellationMinFeeCents,
        s.CancellationInjuredPartySharePercent,
        s.IsActive,
        s.Justification,
        s.UpdatedAtUtc);

    private static CarrierVehicleResponse MapVehicleResponse(CarrierVehicle v, int carMaxAgeYears = 7)
    {
        int currentYear = DateTimeOffset.UtcNow.Year;
        int ageYears = Math.Max(0, currentYear - v.ManufacturingYear);
        bool regulatoryAgeWarning = v.VehicleType == VehicleType.CAR && ageYears > carMaxAgeYears;

        return new(
            v.Id,
            v.CarrierId,
            v.CarrierName,
            v.VehicleType.ToString(),
            v.BrandModel,
            v.ManufacturingYear,
            v.PlateMasked,
            v.DeclaredCapacityGrams,
            v.Status.ToString(),
            v.RejectionReason,
            v.ModeratedByUserId,
            v.ModeratedAtUtc,
            ageYears,
            regulatoryAgeWarning,
            v.CreatedAtUtc);
    }

    private static PaymentMethodResponse MapPaymentMethod(PaymentMethodSetting m) => new(
        m.MethodCode.ToString(),
        m.DisplayName,
        m.ProviderName,
        m.IsEnabled,
        m.FeePercent,
        m.FixedFeeCents,
        m.PlatformAbsorbsFee,
        m.MinAmountCents,
        m.MaxAmountCents,
        m.Justification,
        m.UpdatedAtUtc);
}
