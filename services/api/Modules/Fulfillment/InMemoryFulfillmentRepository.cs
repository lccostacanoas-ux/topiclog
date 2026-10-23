using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;

namespace TopicLog.Api.Modules.Fulfillment;

public sealed class InMemoryFulfillmentRepository : IFulfillmentRepository
{
    private readonly ConcurrentDictionary<Guid, DeliveryOrder> _orders = new();
    private readonly ConcurrentDictionary<Guid, DeliveryChallenge> _challenges = new();
    private readonly ConcurrentDictionary<Guid, DeliveryProof> _proofs = new();
    private readonly List<DeliveryEvent> _events = [];
    private readonly ConcurrentDictionary<Guid, DeliveryException> _exceptions = new();
    private readonly Lock _syncLock = new();

    public InMemoryFulfillmentRepository()
    {
        SeedDemoData();
    }

    public Task<DeliveryOrder> CreateOrderAsync(DeliveryOrder order, CancellationToken cancellationToken = default)
    {
        _orders[order.Id] = order;
        return Task.FromResult(order);
    }

    public Task<DeliveryOrder?> GetOrderByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        _orders.TryGetValue(id, out var order);
        return Task.FromResult(order);
    }

    public Task<DeliveryOrder?> GetOrderByContractIdAsync(Guid contractId, CancellationToken cancellationToken = default)
    {
        var order = _orders.Values.FirstOrDefault(o => o.ContractId == contractId);
        return Task.FromResult(order);
    }

    public Task<DeliveryOrder?> GetOrderByShipmentIdAsync(Guid shipmentId, CancellationToken cancellationToken = default)
    {
        var order = _orders.Values.FirstOrDefault(o => o.ShipmentId == shipmentId);
        return Task.FromResult(order);
    }

    public Task<IReadOnlyList<DeliveryOrder>> ListOrdersByCarrierIdAsync(Guid carrierId, CancellationToken cancellationToken = default)
    {
        var list = _orders.Values
            .Where(o => o.CarrierId == carrierId)
            .OrderByDescending(o => o.CreatedAtUtc)
            .ToList();
        return Task.FromResult<IReadOnlyList<DeliveryOrder>>(list);
    }

    public Task<IReadOnlyList<DeliveryOrder>> ListOrdersBySenderIdAsync(Guid senderId, CancellationToken cancellationToken = default)
    {
        var list = _orders.Values
            .Where(o => o.SenderId == senderId)
            .OrderByDescending(o => o.CreatedAtUtc)
            .ToList();
        return Task.FromResult<IReadOnlyList<DeliveryOrder>>(list);
    }

    public Task<DeliveryOrder> UpdateOrderAsync(DeliveryOrder order, CancellationToken cancellationToken = default)
    {
        _orders[order.Id] = order;
        return Task.FromResult(order);
    }

    public Task<DeliveryChallenge> CreateChallengeAsync(DeliveryChallenge challenge, CancellationToken cancellationToken = default)
    {
        // Desativa desafios anteriores para esta mesma ordem
        foreach (var c in _challenges.Values.Where(c => c.DeliveryOrderId == challenge.DeliveryOrderId))
        {
            c.IsActive = false;
        }

        _challenges[challenge.Id] = challenge;
        return Task.FromResult(challenge);
    }

    public Task<DeliveryChallenge?> GetActiveChallengeByOrderIdAsync(Guid orderId, CancellationToken cancellationToken = default)
    {
        var challenge = _challenges.Values
            .Where(c => c.DeliveryOrderId == orderId && c.IsActive)
            .OrderByDescending(c => c.CreatedAtUtc)
            .FirstOrDefault();
        return Task.FromResult(challenge);
    }

    public Task<DeliveryChallenge> UpdateChallengeAsync(DeliveryChallenge challenge, CancellationToken cancellationToken = default)
    {
        _challenges[challenge.Id] = challenge;
        return Task.FromResult(challenge);
    }

    public Task<DeliveryProof> CreateProofAsync(DeliveryProof proof, CancellationToken cancellationToken = default)
    {
        _proofs[proof.DeliveryOrderId] = proof;
        return Task.FromResult(proof);
    }

    public Task<DeliveryProof?> GetProofByOrderIdAsync(Guid orderId, CancellationToken cancellationToken = default)
    {
        _proofs.TryGetValue(orderId, out var proof);
        return Task.FromResult(proof);
    }

    public Task<DeliveryEvent> AppendEventAsync(DeliveryEvent evt, CancellationToken cancellationToken = default)
    {
        lock (_syncLock)
        {
            _events.Add(evt);
        }
        return Task.FromResult(evt);
    }

    public Task<IReadOnlyList<DeliveryEvent>> ListEventsByOrderIdAsync(Guid orderId, CancellationToken cancellationToken = default)
    {
        lock (_syncLock)
        {
            var list = _events
                .Where(e => e.DeliveryOrderId == orderId)
                .OrderBy(e => e.OccurredAtUtc)
                .ToList();
            return Task.FromResult<IReadOnlyList<DeliveryEvent>>(list);
        }
    }

    public Task<DeliveryException> CreateExceptionAsync(DeliveryException exc, CancellationToken cancellationToken = default)
    {
        _exceptions[exc.DeliveryOrderId] = exc;
        return Task.FromResult(exc);
    }

    public Task<DeliveryException?> GetActiveExceptionByOrderIdAsync(Guid orderId, CancellationToken cancellationToken = default)
    {
        _exceptions.TryGetValue(orderId, out var exc);
        return Task.FromResult(exc);
    }

    public Task<DeliveryException> UpdateExceptionAsync(DeliveryException exc, CancellationToken cancellationToken = default)
    {
        _exceptions[exc.DeliveryOrderId] = exc;
        return Task.FromResult(exc);
    }

    public static (string Hash, string Salt) ComputeCodeHash(string plainCode)
    {
        var saltBytes = RandomNumberGenerator.GetBytes(16);
        var saltHex = Convert.ToHexString(saltBytes);
        using var hmac = new HMACSHA256(saltBytes);
        var hashBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(plainCode.Trim()));
        return (Convert.ToHexString(hashBytes), saltHex);
    }

    public static bool VerifyCodeHash(string plainCode, string hashHex, string saltHex)
    {
        try
        {
            var saltBytes = Convert.FromHexString(saltHex);
            using var hmac = new HMACSHA256(saltBytes);
            var computed = hmac.ComputeHash(Encoding.UTF8.GetBytes(plainCode.Trim()));
            var expected = Convert.FromHexString(hashHex);
            return CryptographicOperations.FixedTimeEquals(computed, expected);
        }
        catch
        {
            return false;
        }
    }

    private void SeedDemoData()
    {
        var demoOrderId = Guid.Parse("f0000001-0000-0000-0000-000000000001");
        var demoContractId = Guid.Parse("c0000001-0000-0000-0000-000000000001");
        var demoShipmentId = Guid.Parse("e0000001-0000-0000-0000-000000000001");
        var demoTripId = Guid.Parse("b0000001-0000-0000-0000-000000000001");
        var demoSenderId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var demoCarrierId = Guid.Parse("00000000-0000-0000-0000-000000000002");

        var order = new DeliveryOrder
        {
            Id = demoOrderId,
            ContractId = demoContractId,
            ShipmentId = demoShipmentId,
            TripId = demoTripId,
            SenderId = demoSenderId,
            SenderName = "Carlos M. (Remetente Demo)",
            CarrierId = demoCarrierId,
            CarrierName = "Marcos Vinícius (Demo)",
            RecipientName = "Farmácia Central Santa Efigênia",
            RecipientPhone = "(31) 98888-0001",
            RecipientDocumentMasked = "***.876.543-**",
            Status = DeliveryOrderStatus.AWAITING_PICKUP,
            CreatedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-30),
            UpdatedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-30)
        };
        _orders[demoOrderId] = order;

        // Código inicial de 4 dígitos seguro: "4826" (armazenado estritamente como HASH)
        const string plainCode = "4826";
        var (hash, salt) = ComputeCodeHash(plainCode);

        var challenge = new DeliveryChallenge
        {
            Id = Guid.Parse("c4000001-0000-0000-0000-000000000001"),
            DeliveryOrderId = demoOrderId,
            CodeHash = hash,
            CodeSalt = salt,
            FailedAttempts = 0,
            MaxAttempts = 3,
            IsLocked = false,
            ExpiresAtUtc = DateTimeOffset.UtcNow.AddHours(24),
            IsActive = true,
            CreatedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-30),
            PlainCode = plainCode
        };
        _challenges[challenge.Id] = challenge;

        _events.Add(new DeliveryEvent
        {
            Id = Guid.NewGuid(),
            DeliveryOrderId = demoOrderId,
            EventType = DeliveryEventType.IN_TRANSIT,
            ActorId = demoSenderId,
            ActorRole = "SENDER",
            PreviousStatus = "NONE",
            NewStatus = DeliveryOrderStatus.AWAITING_PICKUP.ToString(),
            Notes = "Ordem de entrega formalizada. Código secreto D16 gerado com proteção em repouso.",
            OccurredAtUtc = DateTimeOffset.UtcNow.AddMinutes(-30)
        });
    }
}
