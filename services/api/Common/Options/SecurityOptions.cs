using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Options;
using TopicLog.Api.Common;

namespace TopicLog.Api.Common.Options;

/// <summary>
/// Opções tipadas de segurança, criptografia e autenticação da PR-01.1 (DEC-02).
/// IMPORTANTE: Chaves e segredos NUNCA são gravados no código-fonte ou em appsettings.json.
/// Devem ser injetados via variáveis de ambiente (TOPICLOG__Security__JwtSigningKeyBase64 e
/// TOPICLOG__Security__PiiEncryptionKeyBase64). Em modo Testing/Development, se ausentes,
/// o RuntimeKeyMaterialProvider gera chaves efêmeras de 256 bits apenas em memória RAM.
/// </summary>
public sealed class SecurityOptions
{
    public const string SectionName = "Security";

    public string Issuer { get; set; } = "https://api.topiclog.com.br";

    public string Audience { get; set; } = "https://app.topiclog.com.br";

    public int AccessTokenLifetimeMinutes { get; set; } = 120;

    public int RefreshTokenLifetimeDays { get; set; } = 7;

    public int ClockSkewSeconds { get; set; } = 30;

    /// <summary>
    /// Iterações do PBKDF2-HMAC-SHA256 (Recomendação OWASP >= 210.000).
    /// </summary>
    public int Pbkdf2Iterations { get; set; } = 210_000;

    public int MaxFailedLoginAttempts { get; set; } = 5;

    public int LockoutDurationMinutes { get; set; } = 15;

    /// <summary>
    /// Versão vigente dos Termos de Uso com distribuição legal de responsabilidades (D08).
    /// </summary>
    public string RequiredTermsVersion { get; set; } = "2026.1-D08-DRAFT";

    /// <summary>
    /// Chave HMAC-SHA256 em Base64 (mínimo 32 bytes) carregada exclusivamente do ambiente.
    /// Permanece vazia no código-fonte e nos arquivos versionados no Git (DEC-02.5).
    /// </summary>
    public string JwtSigningKeyBase64 { get; set; } = string.Empty;

    /// <summary>
    /// Chave AES-256-GCM em Base64 (exatamente 32 bytes) carregada exclusivamente do ambiente.
    /// Permanece vazia no código-fonte e nos arquivos versionados no Git (DEC-02.5).
    /// </summary>
    public string PiiEncryptionKeyBase64 { get; set; } = string.Empty;

    /// <summary>
    /// Chave HMAC-SHA256 dedicada para hash seguro de unicidade de CPF (separada da criptografia de dados - Finding 5).
    /// </summary>
    public string CpfLookupHmacKeyBase64 { get; set; } = string.Empty;
}

/// <summary>
/// Validador das configurações de segurança na inicialização (DEC-02).
/// Em ambiente Production, exige que as chaves criptográficas sejam injetadas via ambiente.
/// </summary>
public sealed class SecurityOptionsValidator : IValidateOptions<SecurityOptions>
{
    private readonly IOptions<FeatureFlagsOptions> _featureFlags;

    public SecurityOptionsValidator(IOptions<FeatureFlagsOptions> featureFlags)
    {
        _featureFlags = featureFlags;
    }

    public ValidateOptionsResult Validate(string? name, SecurityOptions options)
    {
        var failures = new List<string>();

        if (string.IsNullOrWhiteSpace(options.Issuer))
        {
            failures.Add("Security:Issuer não pode ser vazio.");
        }

        if (string.IsNullOrWhiteSpace(options.Audience))
        {
            failures.Add("Security:Audience não pode ser vazio.");
        }

        if (options.AccessTokenLifetimeMinutes is < 1 or > 120)
        {
            failures.Add("Security:AccessTokenLifetimeMinutes deve estar entre 1 e 120 minutos.");
        }

        if (options.RefreshTokenLifetimeDays is < 1 or > 30)
        {
            failures.Add("Security:RefreshTokenLifetimeDays deve estar entre 1 e 30 dias.");
        }

        if (options.Pbkdf2Iterations < 100_000)
        {
            failures.Add("Security:Pbkdf2Iterations deve ser de no mínimo 100.000 iterações (DEC-02).");
        }

        if (options.MaxFailedLoginAttempts is < 3 or > 20)
        {
            failures.Add("Security:MaxFailedLoginAttempts deve estar entre 3 e 20.");
        }

        if (options.LockoutDurationMinutes < 1)
        {
            failures.Add("Security:LockoutDurationMinutes deve ser de pelo menos 1 minuto.");
        }

        if (string.IsNullOrWhiteSpace(options.RequiredTermsVersion))
        {
            failures.Add("Security:RequiredTermsVersion deve estar definido conforme D08.");
        }

        bool isProduction = string.Equals(
            _featureFlags.Value.EnvironmentMode,
            "Production",
            StringComparison.OrdinalIgnoreCase);

        if (isProduction)
        {
            if (!TryValidateBase64Key(options.JwtSigningKeyBase64, minBytes: 32, exactBytes: null))
            {
                failures.Add("VIOLAÇÃO DE SEGURANÇA (DEC-02.5): Em Production, Security:JwtSigningKeyBase64 deve ser injetada via ambiente com no mínimo 32 bytes.");
            }

            if (!TryValidateBase64Key(options.PiiEncryptionKeyBase64, minBytes: 32, exactBytes: 32))
            {
                failures.Add("VIOLAÇÃO DE SEGURANÇA (DEC-02.5): Em Production, Security:PiiEncryptionKeyBase64 deve ser injetada via ambiente com exatamente 32 bytes (256 bits).");
            }

            if (!TryValidateBase64Key(options.CpfLookupHmacKeyBase64, minBytes: 32, exactBytes: 32))
            {
                failures.Add("VIOLAÇÃO DE SEGURANÇA (Finding 5): Em Production, Security:CpfLookupHmacKeyBase64 deve ser injetada via ambiente com exatamente 32 bytes (256 bits).");
            }
        }

        return failures.Count > 0
            ? ValidateOptionsResult.Fail(failures)
            : ValidateOptionsResult.Success;
    }

    private static bool TryValidateBase64Key(string base64, int minBytes, int? exactBytes)
    {
        if (string.IsNullOrWhiteSpace(base64))
        {
            return false;
        }

        try
        {
            byte[] decoded = Convert.FromBase64String(base64);
            if (decoded.Length < minBytes)
            {
                return false;
            }

            return !exactBytes.HasValue || decoded.Length == exactBytes.Value;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}

/// <summary>
/// Provedor de material criptográfico em tempo de execução.
/// Separa chaves de criptografia AES-GCM (PII), assinatura de token JWT e HMAC de CPF (Finding 5).
/// Em ambiente persistente de desenvolvimento, preserva as chaves geradas em arquivo protegido
/// para garantir que números de telefone e unicidade de CPF permaneçam consistentes entre reinicializações.
/// </summary>
public sealed class RuntimeKeyMaterialProvider
{
    private readonly byte[] _jwtSigningKey;
    private readonly byte[] _piiEncryptionKey;
    private readonly byte[] _cpfLookupHmacKey;

    public RuntimeKeyMaterialProvider(IOptions<SecurityOptions> securityOptions)
    {
        ArgumentNullException.ThrowIfNull(securityOptions);
        var opts = securityOptions.Value;

        byte[]? configuredJwt = TryDecodeKey(opts.JwtSigningKeyBase64, 32);
        byte[]? configuredPii = TryDecodeKey(opts.PiiEncryptionKeyBase64, 32);
        byte[]? configuredCpfHmac = TryDecodeKey(opts.CpfLookupHmacKeyBase64, 32);

        if (configuredJwt != null && configuredPii != null && configuredCpfHmac != null)
        {
            _jwtSigningKey = configuredJwt;
            _piiEncryptionKey = configuredPii;
            _cpfLookupHmacKey = configuredCpfHmac;
            return;
        }

        var persistentKeys = LoadOrGenerateDevKeys(configuredJwt, configuredPii, configuredCpfHmac);
        _jwtSigningKey = persistentKeys.Jwt;
        _piiEncryptionKey = persistentKeys.Pii;
        _cpfLookupHmacKey = persistentKeys.CpfHmac;
    }

    public ReadOnlySpan<byte> JwtSigningKey => _jwtSigningKey;

    public ReadOnlySpan<byte> PiiEncryptionKey => _piiEncryptionKey;

    public ReadOnlySpan<byte> CpfLookupHmacKey => _cpfLookupHmacKey;

    private static byte[]? TryDecodeKey(string configuredBase64, int requiredLength)
    {
        if (string.IsNullOrWhiteSpace(configuredBase64))
        {
            return null;
        }

        try
        {
            byte[] decoded = Convert.FromBase64String(configuredBase64);
            if (decoded.Length >= requiredLength)
            {
                return decoded.Length == requiredLength ? decoded : decoded[..requiredLength];
            }
        }
        catch (FormatException)
        {
        }

        return null;
    }

    private static (byte[] Jwt, byte[] Pii, byte[] CpfHmac) LoadOrGenerateDevKeys(
        byte[]? configuredJwt,
        byte[]? configuredPii,
        byte[]? configuredCpfHmac)
    {
        string devKeysFile = Path.Combine(StoragePathResolver.StorageDirectory, ".topiclog_dev_keys.json");
        try
        {
            if (File.Exists(devKeysFile))
            {
                string json = File.ReadAllText(devKeysFile);
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                byte[] jwt = configuredJwt ?? TryDecodeKey(root.GetProperty("jwt").GetString() ?? "", 32) ?? RandomNumberGenerator.GetBytes(32);
                byte[] pii = configuredPii ?? TryDecodeKey(root.GetProperty("pii").GetString() ?? "", 32) ?? RandomNumberGenerator.GetBytes(32);
                byte[] cpfHmac = configuredCpfHmac ?? TryDecodeKey(root.GetProperty("cpfHmac").GetString() ?? "", 32) ?? RandomNumberGenerator.GetBytes(32);
                return (jwt, pii, cpfHmac);
            }
        }
        catch
        {
            // Em caso de falha de leitura, gera novas chaves com fallback seguro
        }

        byte[] newJwt = configuredJwt ?? RandomNumberGenerator.GetBytes(32);
        byte[] newPii = configuredPii ?? RandomNumberGenerator.GetBytes(32);
        byte[] newCpfHmac = configuredCpfHmac ?? RandomNumberGenerator.GetBytes(32);

        try
        {
            var content = JsonSerializer.Serialize(new
            {
                jwt = Convert.ToBase64String(newJwt),
                pii = Convert.ToBase64String(newPii),
                cpfHmac = Convert.ToBase64String(newCpfHmac)
            });
            StoragePathResolver.SaveFileAtomically(devKeysFile, content);
        }
        catch
        {
            // Ambientes restritos em memória
        }

        return (newJwt, newPii, newCpfHmac);
    }
}
