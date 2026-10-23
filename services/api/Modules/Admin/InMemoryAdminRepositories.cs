// ============================================================================
// TOPIC LOG — REPOSITÓRIOS ADMINISTRATIVOS EM MEMÓRIA (PR-ADM-01 / PR-FIN-02)
// Thread-safe, desacoplados e com seeds iniciais auditáveis
// ============================================================================

using System.Collections.Concurrent;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;

namespace TopicLog.Api.Modules.Admin;

public class InMemoryOperationalSettingsRepository : IOperationalSettingsRepository
{
    private readonly Lock _syncLock = new();
    private OperationalSettings _currentSettings;

    public InMemoryOperationalSettingsRepository()
    {
        _currentSettings = new OperationalSettings
        {
            Id = Guid.Parse("b0000001-0000-0000-0000-000000000001"),
            Version = "OP-SET-V1",
            BicycleMaxWeightGrams = 5000,
            MotorcycleMaxWeightGrams = 20000,
            CarMaxWeightGrams = 20000,
            CarMaxAgeYears = 7,
            GeoDeviationCompatibleKm = 10.00m,
            GeoDeviationRequiresEvalKm = 20.00m,
            PostDeliveryRadiusKm = 2.00m,
            ProposalStandardValidityHours = 24,
            ProposalSameDayValidityHours = 2,
            PrioritySecondShipmentMinutes = 10,
            CancellationPenaltyPercent = 10.00m,
            CancellationMinFeeCents = 700,
            CancellationInjuredPartySharePercent = 80.00m,
            IsActive = true,
            Justification = "Configurações operacionais padrão da plataforma Topic Log (D03, D04, D16, PR-03, PR-04, PR-05)",
            UpdatedByUserId = Guid.Parse("00000000-0000-0000-0000-000000000001"),
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };
    }

    public Task<OperationalSettings> GetActiveSettingsAsync(CancellationToken cancellationToken = default)
    {
        lock (_syncLock)
        {
            return Task.FromResult(_currentSettings);
        }
    }

    public Task UpdateSettingsAsync(OperationalSettings settings, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(settings);
        lock (_syncLock)
        {
            _currentSettings = settings;
            return Task.CompletedTask;
        }
    }
}

public class InMemoryCarrierVehicleRepository : ICarrierVehicleRepository
{
    private readonly ConcurrentDictionary<Guid, CarrierVehicle> _vehicles = new();
    private readonly Lock _syncLock = new();

    public InMemoryCarrierVehicleRepository()
    {
        var carrierDemoId = Guid.Parse("00000000-0000-0000-0000-000000000002");

        // Veículo 1: Moto em aprovação pendente (Honda CG 160)
        var v1 = new CarrierVehicle
        {
            Id = Guid.Parse("c0000001-0000-0000-0000-000000000001"),
            CarrierId = carrierDemoId,
            CarrierName = "Transportador Demo",
            VehicleType = VehicleType.MOTORCYCLE,
            BrandModel = "Honda CG 160 Fan",
            ManufacturingYear = 2022,
            PlateMasked = "BRA-***1",
            DeclaredCapacityGrams = 20000,
            CrlvDocumentKey = "crlv/honda_cg160_demo.pdf",
            Status = VehicleModerationStatus.PENDING_APPROVAL,
            RejectionReason = null,
            CreatedAtUtc = DateTimeOffset.UtcNow.AddDays(-2),
            UpdatedAtUtc = DateTimeOffset.UtcNow.AddDays(-2)
        };

        // Veículo 2: Carro aprovado dentro da idade limite (Fiat Strada 2021)
        var v2 = new CarrierVehicle
        {
            Id = Guid.Parse("c0000002-0000-0000-0000-000000000002"),
            CarrierId = carrierDemoId,
            CarrierName = "Transportador Demo",
            VehicleType = VehicleType.CAR,
            BrandModel = "Fiat Strada Endurance 1.4",
            ManufacturingYear = 2021,
            PlateMasked = "MG-****2",
            DeclaredCapacityGrams = 20000,
            CrlvDocumentKey = "crlv/fiat_strada_demo.pdf",
            Status = VehicleModerationStatus.APPROVED,
            RejectionReason = null,
            ModeratedByUserId = Guid.Parse("00000000-0000-0000-0000-000000000099"),
            ModeratedAtUtc = DateTimeOffset.UtcNow.AddDays(-5),
            CreatedAtUtc = DateTimeOffset.UtcNow.AddDays(-6),
            UpdatedAtUtc = DateTimeOffset.UtcNow.AddDays(-5)
        };

        // Veículo 3: Carro reprovado por idade excessiva (> 7 anos)
        var v3 = new CarrierVehicle
        {
            Id = Guid.Parse("c0000003-0000-0000-0000-000000000003"),
            CarrierId = carrierDemoId,
            CarrierName = "Transportador Demo",
            VehicleType = VehicleType.CAR,
            BrandModel = "VW Gol 1.0",
            ManufacturingYear = 2012,
            PlateMasked = "ABC-***3",
            DeclaredCapacityGrams = 20000,
            CrlvDocumentKey = "crlv/vw_gol_demo.pdf",
            Status = VehicleModerationStatus.REJECTED,
            RejectionReason = "Ano de fabricação 2012 excede a idade máxima regulatória de 7 anos para a categoria CAR.",
            ModeratedByUserId = Guid.Parse("00000000-0000-0000-0000-000000000099"),
            ModeratedAtUtc = DateTimeOffset.UtcNow.AddDays(-10),
            CreatedAtUtc = DateTimeOffset.UtcNow.AddDays(-11),
            UpdatedAtUtc = DateTimeOffset.UtcNow.AddDays(-10)
        };

        _vehicles[v1.Id] = v1;
        _vehicles[v2.Id] = v2;
        _vehicles[v3.Id] = v3;
    }

    public Task<CarrierVehicle?> GetVehicleByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        _vehicles.TryGetValue(id, out var vehicle);
        return Task.FromResult(vehicle);
    }

    public Task<IReadOnlyList<CarrierVehicle>> ListVehiclesAsync(
        VehicleModerationStatus? status = null,
        Guid? carrierId = null,
        CancellationToken cancellationToken = default)
    {
        var query = _vehicles.Values.AsEnumerable();

        if (status.HasValue)
        {
            query = query.Where(v => v.Status == status.Value);
        }

        if (carrierId.HasValue)
        {
            query = query.Where(v => v.CarrierId == carrierId.Value);
        }

        IReadOnlyList<CarrierVehicle> result = query.OrderByDescending(v => v.CreatedAtUtc).ToList();
        return Task.FromResult(result);
    }

    public Task<CarrierVehicle> CreateVehicleAsync(CarrierVehicle vehicle, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(vehicle);
        lock (_syncLock)
        {
            _vehicles[vehicle.Id] = vehicle;
            return Task.FromResult(vehicle);
        }
    }

    public Task UpdateVehicleAsync(CarrierVehicle vehicle, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(vehicle);
        lock (_syncLock)
        {
            _vehicles[vehicle.Id] = vehicle;
            return Task.CompletedTask;
        }
    }
}

public class InMemoryPaymentGovernanceRepository : IPaymentGovernanceRepository
{
    private readonly ConcurrentDictionary<PaymentMethodCode, PaymentMethodSetting> _methods = new();
    private readonly Lock _syncLock = new();

    public InMemoryPaymentGovernanceRepository()
    {
        var pix = new PaymentMethodSetting
        {
            Id = Guid.Parse("d0000001-0000-0000-0000-000000000001"),
            MethodCode = PaymentMethodCode.PIX,
            DisplayName = "PIX Instantâneo",
            ProviderName = "Asaas Sandbox",
            IsEnabled = true,
            FeePercent = 0.99m,
            FixedFeeCents = 0,
            PlatformAbsorbsFee = true,
            MinAmountCents = 500,
            MaxAmountCents = 500000,
            Justification = "Método instantâneo padrão com absorção de taxa integral pela Topic Log",
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };

        var card = new PaymentMethodSetting
        {
            Id = Guid.Parse("d0000002-0000-0000-0000-000000000002"),
            MethodCode = PaymentMethodCode.CREDIT_CARD,
            DisplayName = "Cartão de Crédito",
            ProviderName = "Asaas Sandbox",
            IsEnabled = true,
            FeePercent = 2.99m,
            FixedFeeCents = 49,
            PlatformAbsorbsFee = true,
            MinAmountCents = 1000,
            MaxAmountCents = 500000,
            Justification = "Cartão de crédito para remetentes com absorção de taxa integral pela Topic Log",
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };

        var debit = new PaymentMethodSetting
        {
            Id = Guid.Parse("d0000004-0000-0000-0000-000000000004"),
            MethodCode = PaymentMethodCode.DEBIT_CARD,
            DisplayName = "Cartão de Débito",
            ProviderName = "Asaas Sandbox",
            IsEnabled = true,
            FeePercent = 1.49m,
            FixedFeeCents = 0,
            PlatformAbsorbsFee = true,
            MinAmountCents = 500,
            MaxAmountCents = 500000,
            Justification = "Cartão de débito aprovado para remetentes com absorção de taxa integral pela Topic Log",
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };

        var slip = new PaymentMethodSetting
        {
            Id = Guid.Parse("d0000003-0000-0000-0000-000000000003"),
            MethodCode = PaymentMethodCode.BANK_SLIP,
            DisplayName = "Boleto Bancário (Inativo)",
            ProviderName = "Asaas Sandbox",
            IsEnabled = false,
            FeePercent = 0.00m,
            FixedFeeCents = 199,
            PlatformAbsorbsFee = true,
            MinAmountCents = 2000,
            MaxAmountCents = 500000,
            Justification = "Boleto inativo por diretriz comercial. Requer autorização expressa para ativação.",
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };

        _methods[pix.MethodCode] = pix;
        _methods[debit.MethodCode] = debit;
        _methods[card.MethodCode] = card;
        _methods[slip.MethodCode] = slip;
    }

    public Task<IReadOnlyList<PaymentMethodSetting>> ListPaymentMethodsAsync(CancellationToken cancellationToken = default)
    {
        IReadOnlyList<PaymentMethodSetting> list = _methods.Values.OrderBy(m => m.MethodCode).ToList();
        return Task.FromResult(list);
    }

    public Task<PaymentMethodSetting?> GetPaymentMethodAsync(PaymentMethodCode code, CancellationToken cancellationToken = default)
    {
        _methods.TryGetValue(code, out var method);
        return Task.FromResult(method);
    }

    public Task UpdatePaymentMethodAsync(PaymentMethodSetting method, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(method);
        lock (_syncLock)
        {
            _methods[method.MethodCode] = method;
            return Task.CompletedTask;
        }
    }
}

public class InMemoryAdminAuditRepository : IAdminAuditRepository
{
    private readonly ConcurrentBag<AdminAuditEvent> _events = [];

    public InMemoryAdminAuditRepository()
    {
        _events.Add(new AdminAuditEvent
        {
            Id = Guid.NewGuid(),
            ActorUserId = Guid.Parse("00000000-0000-0000-0000-000000000001"),
            ActorRole = "SYSTEM",
            Category = "BOOTSTRAP",
            Action = "SYSTEM_INITIALIZED",
            EntityId = "SYSTEM",
            PayloadBefore = null,
            PayloadAfter = "{\"status\": \"READY\", \"architecture\": \"Modular Monolith v2.0\"}",
            CorrelationId = "bootstrap-audit",
            RecordedAtUtc = DateTimeOffset.UtcNow
        });
    }

    public Task RecordEventAsync(AdminAuditEvent auditEvent, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(auditEvent);
        _events.Add(auditEvent);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<AdminAuditEvent>> ListEventsAsync(
        string? category = null,
        int limit = 50,
        CancellationToken cancellationToken = default)
    {
        var query = _events.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(category))
        {
            query = query.Where(e => e.Category.Equals(category, StringComparison.OrdinalIgnoreCase));
        }

        IReadOnlyList<AdminAuditEvent> result = query
            .OrderByDescending(e => e.RecordedAtUtc)
            .Take(limit)
            .ToList();

        return Task.FromResult(result);
    }
}
