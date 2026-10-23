// ============================================================================
// TOPIC LOG — INTERFACES DE REPOSITÓRIO ADMINISTRATIVO (PR-ADM-01 / PR-FIN-02)
// ============================================================================

namespace TopicLog.Api.Modules.Admin;

public interface IOperationalSettingsRepository
{
    Task<OperationalSettings> GetActiveSettingsAsync(CancellationToken cancellationToken = default);
    Task UpdateSettingsAsync(OperationalSettings settings, CancellationToken cancellationToken = default);
}

public interface ICarrierVehicleRepository
{
    Task<CarrierVehicle?> GetVehicleByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<CarrierVehicle>> ListVehiclesAsync(
        VehicleModerationStatus? status = null,
        Guid? carrierId = null,
        CancellationToken cancellationToken = default);
    Task<CarrierVehicle> CreateVehicleAsync(CarrierVehicle vehicle, CancellationToken cancellationToken = default);
    Task UpdateVehicleAsync(CarrierVehicle vehicle, CancellationToken cancellationToken = default);
}

public interface IPaymentGovernanceRepository
{
    Task<IReadOnlyList<PaymentMethodSetting>> ListPaymentMethodsAsync(CancellationToken cancellationToken = default);
    Task<PaymentMethodSetting?> GetPaymentMethodAsync(PaymentMethodCode code, CancellationToken cancellationToken = default);
    Task UpdatePaymentMethodAsync(PaymentMethodSetting method, CancellationToken cancellationToken = default);
}

public interface IAdminAuditRepository
{
    Task RecordEventAsync(AdminAuditEvent auditEvent, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<AdminAuditEvent>> ListEventsAsync(
        string? category = null,
        int limit = 50,
        CancellationToken cancellationToken = default);
}
