namespace TopicLog.Api.Modules.Fulfillment;

public interface IFulfillmentRepository
{
    Task<DeliveryOrder> CreateOrderAsync(DeliveryOrder order, CancellationToken cancellationToken = default);
    Task<DeliveryOrder?> GetOrderByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<DeliveryOrder?> GetOrderByContractIdAsync(Guid contractId, CancellationToken cancellationToken = default);
    Task<DeliveryOrder?> GetOrderByShipmentIdAsync(Guid shipmentId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<DeliveryOrder>> ListOrdersByCarrierIdAsync(Guid carrierId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<DeliveryOrder>> ListOrdersBySenderIdAsync(Guid senderId, CancellationToken cancellationToken = default);
    Task<DeliveryOrder> UpdateOrderAsync(DeliveryOrder order, CancellationToken cancellationToken = default);

    Task<DeliveryChallenge> CreateChallengeAsync(DeliveryChallenge challenge, CancellationToken cancellationToken = default);
    Task<DeliveryChallenge?> GetActiveChallengeByOrderIdAsync(Guid orderId, CancellationToken cancellationToken = default);
    Task<DeliveryChallenge> UpdateChallengeAsync(DeliveryChallenge challenge, CancellationToken cancellationToken = default);

    Task<DeliveryProof> CreateProofAsync(DeliveryProof proof, CancellationToken cancellationToken = default);
    Task<DeliveryProof?> GetProofByOrderIdAsync(Guid orderId, CancellationToken cancellationToken = default);

    Task<DeliveryEvent> AppendEventAsync(DeliveryEvent evt, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<DeliveryEvent>> ListEventsByOrderIdAsync(Guid orderId, CancellationToken cancellationToken = default);

    Task<DeliveryException> CreateExceptionAsync(DeliveryException exc, CancellationToken cancellationToken = default);
    Task<DeliveryException?> GetActiveExceptionByOrderIdAsync(Guid orderId, CancellationToken cancellationToken = default);
    Task<DeliveryException> UpdateExceptionAsync(DeliveryException exc, CancellationToken cancellationToken = default);
}
