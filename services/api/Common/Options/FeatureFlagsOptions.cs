using Microsoft.Extensions.Options;

namespace TopicLog.Api.Common.Options;

/// <summary>
/// Opções tipadas de Feature Flags e travas operacionais (Decisões D05, D06, D07, D14, D16).
/// </summary>
public sealed class FeatureFlagsOptions
{
    public const string SectionName = "FeatureFlags";

    /// <summary>
    /// Modo do ambiente: "Testing", "Staging" ou "Production" (D14).
    /// </summary>
    public string EnvironmentMode { get; set; } = "Testing";

    /// <summary>
    /// Trava global contra pagamentos reais antes da homologação completa (D07).
    /// </summary>
    public bool RealPaymentsEnabled { get; set; }

    /// <summary>
    /// Habilita o adaptador Asaas exclusivamente em modo Sandbox (D07).
    /// </summary>
    public bool AsaasSandboxEnabled { get; set; } = true;

    /// <summary>
    /// Exige KYC válido (VERIFIED) tanto do remetente quanto do transportador antes do aceite da proposta (D05).
    /// </summary>
    public bool BilateralKycRequiredOnContract { get; set; } = true;

    /// <summary>
    /// Seguro não é comercializado no MVP; quando false, permite apenas manifestação de interesse sem cobrança (D06).
    /// </summary>
    public bool InsuranceCommercializationEnabled { get; set; }

    /// <summary>
    /// Entrega normal exige código de segurança válido + foto privada (D16).
    /// </summary>
    public bool RequireCodeAndPhotoForDelivery { get; set; } = true;

    /// <summary>
    /// Hospeda o TopicLogBackgroundWorker no mesmo processo da API para economizar RAM em máquinas de 8 GB.
    /// </summary>
    public bool RunWorkerInProcess { get; set; } = true;
}

/// <summary>
/// Validador de segurança das Feature Flags na inicialização do sistema.
/// </summary>
public sealed class FeatureFlagsOptionsValidator : IValidateOptions<FeatureFlagsOptions>
{
    public ValidateOptionsResult Validate(string? name, FeatureFlagsOptions options)
    {
        var failures = new List<string>();

        if (string.IsNullOrWhiteSpace(options.EnvironmentMode))
        {
            failures.Add("FeatureFlags:EnvironmentMode não pode ser vazio.");
        }

        if (string.Equals(options.EnvironmentMode, "Testing", StringComparison.OrdinalIgnoreCase)
            && options.RealPaymentsEnabled)
        {
            failures.Add("VIOLAÇÃO DE SEGURANÇA (D07/D14): RealPaymentsEnabled não pode ser true quando EnvironmentMode é 'Testing'.");
        }

        if (options.InsuranceCommercializationEnabled)
        {
            failures.Add("VIOLAÇÃO DE ESCOPO (D06): InsuranceCommercializationEnabled deve permanecer false no MVP até contrato com seguradora.");
        }

        if (!options.BilateralKycRequiredOnContract)
        {
            failures.Add("VIOLAÇÃO DE SEGURANÇA (D05): BilateralKycRequiredOnContract deve permanecer true.");
        }

        if (!options.RequireCodeAndPhotoForDelivery)
        {
            failures.Add("VIOLAÇÃO DE SEGURANÇA (D16): RequireCodeAndPhotoForDelivery deve permanecer true.");
        }

        return failures.Count > 0
            ? ValidateOptionsResult.Fail(failures)
            : ValidateOptionsResult.Success;
    }
}
