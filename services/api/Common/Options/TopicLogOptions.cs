using Microsoft.Extensions.Options;

namespace TopicLog.Api.Common.Options;

/// <summary>
/// Configurações institucionais e parâmetros comerciais iniciais aprovados na v2.0 (D01–D13).
/// </summary>
public sealed class TopicLogOptions
{
    public const string SectionName = "TopicLog";

    /// <summary>
    /// Texto obrigatório de aviso para manifestação de interesse em seguro (D06).
    /// </summary>
    public const string MandatoryInsuranceDisclaimer =
        "Esta manifestação não contrata seguro e não garante cobertura";

    public string ProductName { get; set; } = "Topic Log";

    public string IntendedDomain { get; set; } = "www.topiclog.com.br";

    public string TargetStateUf { get; set; } = "MG";

    public List<MunicipalityOption> PilotMunicipalities { get; set; } =
    [
        new()
        {
            IbgeCode = "3136207",
            Name = "João Monlevade",
            StateUf = "MG",
            PriorityOrder = 1,
            IsPilot = true,
            IsEnabled = true
        },
        new()
        {
            IbgeCode = "3106200",
            Name = "Belo Horizonte",
            StateUf = "MG",
            PriorityOrder = 2,
            IsPilot = true,
            IsEnabled = true
        }
    ];

    public Dictionary<string, int> DefaultVehicleLimits { get; set; } = new(StringComparer.OrdinalIgnoreCase)
    {
        ["BICYCLE"] = 5000,
        ["MOTORCYCLE"] = 20000,
        ["CAR"] = 20000
    };

    public CommercialPolicyOptions DefaultCommercialPolicies { get; set; } = new();
}

public sealed class MunicipalityOption
{
    public string IbgeCode { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string StateUf { get; set; } = "MG";
    public int PriorityOrder { get; set; }
    public bool IsPilot { get; set; }
    public bool IsEnabled { get; set; }
}

public sealed class CommercialPolicyOptions
{
    /// <summary>
    /// Comissão inicial gratuita padrão: 13% (0.130000) — D10.
    /// </summary>
    public decimal FreePlanCommissionRate { get; set; } = 0.130000m;

    /// <summary>
    /// Mensalidade inicial do pacote Premium em centavos: R$ 39,90 (3990 centavos) — D11.
    /// </summary>
    public long PremiumPlanMonthlyPriceCents { get; set; } = 3990;

    /// <summary>
    /// Comissão inicial do pacote Premium: 7% (0.070000) — D11.
    /// </summary>
    public decimal PremiumPlanCommissionRate { get; set; } = 0.070000m;

    /// <summary>
    /// Topic Log absorve taxas ordinárias de processamento e transferência do gateway — D12.
    /// </summary>
    public bool PlatformAbsorbsGatewayFees { get; set; } = true;
}

/// <summary>
/// Validador das regras iniciais de negócio carregadas em TopicLogOptions.
/// </summary>
public sealed class TopicLogOptionsValidator : IValidateOptions<TopicLogOptions>
{
    public ValidateOptionsResult Validate(string? name, TopicLogOptions options)
    {
        var failures = new List<string>();

        if (!string.Equals(options.ProductName, "Topic Log", StringComparison.Ordinal))
        {
            failures.Add("TopicLog:ProductName deve ser 'Topic Log' (D01).");
        }

        if (!string.Equals(options.TargetStateUf, "MG", StringComparison.OrdinalIgnoreCase))
        {
            failures.Add("TopicLog:TargetStateUf deve ser 'MG' (D02).");
        }

        var firstPriority = options.PilotMunicipalities
            .OrderBy(m => m.PriorityOrder)
            .FirstOrDefault();

        if (firstPriority is null || !string.Equals(firstPriority.IbgeCode, "3136207", StringComparison.Ordinal))
        {
            failures.Add("João Monlevade (IBGE 3136207) deve ser a prioridade 1 do piloto em MG (D02).");
        }

        if (!options.DefaultVehicleLimits.TryGetValue("BICYCLE", out var bikeLimit) || bikeLimit <= 0)
        {
            failures.Add("Limite padrão para BICYCLE deve estar configurado positivamente em gramas (D03/D04).");
        }

        if (!options.DefaultVehicleLimits.TryGetValue("MOTORCYCLE", out var motoLimit) || motoLimit <= 0)
        {
            failures.Add("Limite padrão para MOTORCYCLE deve estar configurado positivamente em gramas (D03/D04).");
        }

        if (!options.DefaultVehicleLimits.TryGetValue("CAR", out var carLimit) || carLimit <= 0)
        {
            failures.Add("Limite padrão para CAR deve estar configurado positivamente em gramas (D03/D04).");
        }

        if (options.DefaultCommercialPolicies.FreePlanCommissionRate is <= 0m or >= 1m)
        {
            failures.Add("FreePlanCommissionRate deve estar entre 0 e 1 (ex.: 0.130000 para 13% — D10).");
        }

        if (options.DefaultCommercialPolicies.PremiumPlanCommissionRate is <= 0m or >= 1m)
        {
            failures.Add("PremiumPlanCommissionRate deve estar entre 0 e 1 (ex.: 0.070000 para 7% — D11).");
        }

        if (!options.DefaultCommercialPolicies.PlatformAbsorbsGatewayFees)
        {
            failures.Add("PlatformAbsorbsGatewayFees deve ser true conforme decisão D12.");
        }

        return failures.Count > 0
            ? ValidateOptionsResult.Fail(failures)
            : ValidateOptionsResult.Success;
    }
}
