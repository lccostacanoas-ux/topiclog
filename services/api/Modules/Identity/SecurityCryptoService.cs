using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Options;

namespace TopicLog.Api.Modules.Identity;

/// <summary>
/// Serviço criptográfico nativo (.NET 10 BCL) responsável por:
/// 1. Hash irreversível de senhas com PBKDF2-HMAC-SHA256, salt individual de 128 bits e suporte a rehash (DEC-02.1, DEC-02.2, DEC-02.3).
/// 2. Criptografia autenticada AES-256-GCM para telefone e HMAC-SHA256 + mascaramento para CPF (LGPD).
/// 3. Emissão e validação estrita de tokens JWT HS256 (assinatura, exp, nbf, iss, aud, alg) e Refresh Tokens (DEC-02.4).
/// </summary>
public sealed class SecurityCryptoService
{
    public const string CurrentPasswordFormatVersion = "v1";
    public const string CurrentPasswordAlgorithmId = "pbkdf2-sha256";
    private const int SaltByteLength = 16;
    private const int DerivedKeyByteLength = 32;
    private const int AesGcmNonceByteLength = 12;
    private const int AesGcmTagByteLength = 16;

    private readonly SecurityOptions _options;
    private readonly RuntimeKeyMaterialProvider _keyMaterial;

    public SecurityCryptoService(
        IOptions<SecurityOptions> options,
        RuntimeKeyMaterialProvider keyMaterial)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(keyMaterial);

        _options = options.Value;
        _keyMaterial = keyMaterial;
    }

    /// <summary>
    /// Gera hash unidirecional PBKDF2-HMAC-SHA256 com salt aleatório individual por senha (DEC-02.2, DEC-02.3).
    /// Formato: v1$pbkdf2-sha256$&lt;iterations&gt;$&lt;base64Salt&gt;$&lt;base64Subkey&gt;
    /// </summary>
    public string HashPassword(string plainTextPassword, int? iterationsOverride = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(plainTextPassword);

        int iterations = iterationsOverride ?? _options.Pbkdf2Iterations;
        if (iterations < 100_000)
        {
            throw new ArgumentOutOfRangeException(nameof(iterationsOverride), "O número de iterações PBKDF2 deve ser >= 100.000.");
        }

        byte[] salt = RandomNumberGenerator.GetBytes(SaltByteLength);
        byte[] passwordBytes = Encoding.UTF8.GetBytes(plainTextPassword);

        try
        {
            byte[] subkey = Rfc2898DeriveBytes.Pbkdf2(
                passwordBytes,
                salt,
                iterations,
                HashAlgorithmName.SHA256,
                DerivedKeyByteLength);

            return string.Create(
                CultureInfo.InvariantCulture,
                $"{CurrentPasswordFormatVersion}${CurrentPasswordAlgorithmId}${iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(subkey)}");
        }
        finally
        {
            CryptographicOperations.ZeroMemory(passwordBytes);
        }
    }

    /// <summary>
    /// Verifica uma senha contra o hash armazenado em tempo constante.
    /// </summary>
    public static bool VerifyPassword(string plainTextPassword, string storedPasswordHash)
    {
        if (string.IsNullOrWhiteSpace(plainTextPassword) || string.IsNullOrWhiteSpace(storedPasswordHash))
        {
            return false;
        }

        string[] parts = storedPasswordHash.Split('$', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 5)
        {
            return false;
        }

        string version = parts[0];
        string algorithm = parts[1];
        if (!string.Equals(version, CurrentPasswordFormatVersion, StringComparison.Ordinal)
            || !string.Equals(algorithm, CurrentPasswordAlgorithmId, StringComparison.Ordinal))
        {
            return false;
        }

        if (!int.TryParse(parts[2], NumberStyles.None, CultureInfo.InvariantCulture, out int iterations)
            || iterations < 100_000)
        {
            return false;
        }

        byte[] salt;
        byte[] expectedSubkey;
        try
        {
            salt = Convert.FromBase64String(parts[3]);
            expectedSubkey = Convert.FromBase64String(parts[4]);
        }
        catch (FormatException)
        {
            return false;
        }

        if (salt.Length != SaltByteLength || expectedSubkey.Length != DerivedKeyByteLength)
        {
            return false;
        }

        byte[] passwordBytes = Encoding.UTF8.GetBytes(plainTextPassword);
        try
        {
            byte[] actualSubkey = Rfc2898DeriveBytes.Pbkdf2(
                passwordBytes,
                salt,
                iterations,
                HashAlgorithmName.SHA256,
                expectedSubkey.Length);

            return CryptographicOperations.FixedTimeEquals(actualSubkey, expectedSubkey);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(passwordBytes);
        }
    }

    /// <summary>
    /// Indica se um hash armazenado precisa ser atualizado (rehash) devido a mudança de algoritmo ou aumento de iterações (DEC-02.2).
    /// </summary>
    public bool NeedsRehash(string storedPasswordHash)
    {
        if (string.IsNullOrWhiteSpace(storedPasswordHash))
        {
            return true;
        }

        string[] parts = storedPasswordHash.Split('$', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 5)
        {
            return true;
        }

        if (!string.Equals(parts[0], CurrentPasswordFormatVersion, StringComparison.Ordinal)
            || !string.Equals(parts[1], CurrentPasswordAlgorithmId, StringComparison.Ordinal))
        {
            return true;
        }

        if (!int.TryParse(parts[2], NumberStyles.None, CultureInfo.InvariantCulture, out int iterations))
        {
            return true;
        }

        return iterations < _options.Pbkdf2Iterations;
    }

    /// <summary>
    /// Criptografa o telefone em repouso com AES-256-GCM autenticado (DEC-02.1).
    /// Formato: v1$aes256gcm$&lt;base64Nonce&gt;$&lt;base64Tag&gt;$&lt;base64Ciphertext&gt;
    /// </summary>
    public string EncryptPhone(string rawPhone)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rawPhone);

        byte[] plainBytes = Encoding.UTF8.GetBytes(NormalizeDigits(rawPhone));
        byte[] nonce = RandomNumberGenerator.GetBytes(AesGcmNonceByteLength);
        byte[] ciphertext = new byte[plainBytes.Length];
        byte[] tag = new byte[AesGcmTagByteLength];

        using var aesGcm = new AesGcm(_keyMaterial.PiiEncryptionKey, AesGcmTagByteLength);
        aesGcm.Encrypt(nonce, plainBytes, ciphertext, tag);

        return $"v1$aes256gcm${Convert.ToBase64String(nonce)}${Convert.ToBase64String(tag)}${Convert.ToBase64String(ciphertext)}";
    }

    /// <summary>
    /// Descriptografa o telefone autenticado com AES-256-GCM quando estritamente necessário.
    /// </summary>
    public string DecryptPhone(string encryptedPayload)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(encryptedPayload);

        string[] parts = encryptedPayload.Split('$', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 5 || !string.Equals(parts[1], "aes256gcm", StringComparison.Ordinal))
        {
            throw new CryptographicException("Formato de payload AES-GCM inválido.");
        }

        byte[] nonce = Convert.FromBase64String(parts[2]);
        byte[] tag = Convert.FromBase64String(parts[3]);
        byte[] ciphertext = Convert.FromBase64String(parts[4]);
        byte[] plainBytes = new byte[ciphertext.Length];

        using var aesGcm = new AesGcm(_keyMaterial.PiiEncryptionKey, AesGcmTagByteLength);
        aesGcm.Decrypt(nonce, ciphertext, tag, plainBytes);

        return Encoding.UTF8.GetString(plainBytes);
    }

    public static string MaskPhone(string rawPhone)
    {
        string digits = NormalizeDigits(rawPhone);
        if (digits.Length < 4)
        {
            return "(**) *****-****";
        }

        string last4 = digits[^4..];
        return $"(**) *****-{last4}";
    }

    public string ComputeCpfHash(string rawCpf)
    {
        string digits = NormalizeDigits(rawCpf);
        if (digits.Length != 11)
        {
            throw new ArgumentException("O CPF deve conter 11 dígitos numéricos.", nameof(rawCpf));
        }

        byte[] hash = HMACSHA256.HashData(_keyMaterial.CpfLookupHmacKey, Encoding.UTF8.GetBytes(digits));
        return Convert.ToHexStringLower(hash);
    }

    public static string MaskCpf(string rawCpf)
    {
        string digits = NormalizeDigits(rawCpf);
        if (digits.Length != 11)
        {
            return "***.***.***-**";
        }

        return $"***.{digits.Substring(3, 3)}.{digits.Substring(6, 3)}-**";
    }

    /// <summary>
    /// Emite um Access Token JWT assinado com HMAC-SHA256 (HS256) contendo emissor, audiência, expiração e papéis (DEC-02.4).
    /// </summary>
    public (string AccessToken, int ExpiresInSeconds, string TokenId) CreateAccessToken(
        UserEntity user,
        UserProfileEntity profile,
        DateTimeOffset? nowUtcOverride = null,
        int? lifetimeSecondsOverride = null)
    {
        ArgumentNullException.ThrowIfNull(user);
        ArgumentNullException.ThrowIfNull(profile);

        DateTimeOffset now = nowUtcOverride ?? DateTimeOffset.UtcNow;
        int expiresInSeconds = lifetimeSecondsOverride ?? (_options.AccessTokenLifetimeMinutes * 60);
        DateTimeOffset expiresAt = now.AddSeconds(expiresInSeconds);
        string tokenId = Guid.NewGuid().ToString("N");

        var header = new Dictionary<string, object>
        {
            ["alg"] = "HS256",
            ["typ"] = "JWT"
        };

        var payload = new Dictionary<string, object>
        {
            ["iss"] = _options.Issuer,
            ["aud"] = _options.Audience,
            ["sub"] = user.Id.ToString("D"),
            ["email"] = user.Email,
            ["roles"] = profile.Roles.Select(r => r.ToString()).OrderBy(r => r, StringComparer.Ordinal).ToArray(),
            ["kyc_status"] = profile.KycStatus.ToString(),
            ["jti"] = tokenId,
            ["iat"] = now.ToUnixTimeSeconds(),
            ["nbf"] = now.ToUnixTimeSeconds(),
            ["exp"] = expiresAt.ToUnixTimeSeconds()
        };

        string headerEncoded = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(header));
        string payloadEncoded = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(payload));
        string signingInput = $"{headerEncoded}.{payloadEncoded}";

        byte[] signatureBytes = HMACSHA256.HashData(
            _keyMaterial.JwtSigningKey,
            Encoding.ASCII.GetBytes(signingInput));

        string signatureEncoded = Base64UrlEncode(signatureBytes);
        return ($"{signingInput}.{signatureEncoded}", expiresInSeconds, tokenId);
    }

    /// <summary>
    /// Valida rigorosamente um token JWT HS256: cabeçalho (alg/typ), assinatura em tempo constante,
    /// emissor (iss), audiência (aud), expiração (exp) e not-before (nbf) (DEC-02.4).
    /// </summary>
    public bool TryValidateAccessToken(
        string token,
        out AuthenticatedActor? actor,
        out string? failureCode,
        DateTimeOffset? nowUtcOverride = null)
    {
        actor = null;
        failureCode = null;

        if (string.IsNullOrWhiteSpace(token))
        {
            failureCode = "MISSING_TOKEN";
            return false;
        }

        string[] segments = token.Split('.');
        if (segments.Length != 3)
        {
            failureCode = "MALFORMED_JWT";
            return false;
        }

        byte[] headerBytes;
        byte[] payloadBytes;
        byte[] providedSignatureBytes;
        try
        {
            headerBytes = Base64UrlDecode(segments[0]);
            payloadBytes = Base64UrlDecode(segments[1]);
            providedSignatureBytes = Base64UrlDecode(segments[2]);
        }
        catch (FormatException)
        {
            failureCode = "INVALID_BASE64URL_ENCODING";
            return false;
        }

        // 1. Validação estrita do cabeçalho contra ataque alg:none ou confusão de algoritmo
        try
        {
            using var headerDoc = JsonDocument.Parse(headerBytes);
            var hRoot = headerDoc.RootElement;
            string? alg = hRoot.TryGetProperty("alg", out var algProp) ? algProp.GetString() : null;
            string? typ = hRoot.TryGetProperty("typ", out var typProp) ? typProp.GetString() : null;

            if (!string.Equals(alg, "HS256", StringComparison.Ordinal)
                || !string.Equals(typ, "JWT", StringComparison.Ordinal))
            {
                failureCode = "INVALID_TOKEN_ALGORITHM";
                return false;
            }
        }
        catch (JsonException)
        {
            failureCode = "INVALID_HEADER_JSON";
            return false;
        }

        // 2. Validação da assinatura HMAC-SHA256 em tempo constante
        string signingInput = $"{segments[0]}.{segments[1]}";
        byte[] expectedSignatureBytes = HMACSHA256.HashData(
            _keyMaterial.JwtSigningKey,
            Encoding.ASCII.GetBytes(signingInput));

        if (!CryptographicOperations.FixedTimeEquals(providedSignatureBytes, expectedSignatureBytes))
        {
            failureCode = "INVALID_TOKEN_SIGNATURE";
            return false;
        }

        // 3. Validação das claims obrigatórias (iss, aud, exp, nbf, sub, roles, kyc_status, jti)
        try
        {
            using var payloadDoc = JsonDocument.Parse(payloadBytes);
            var root = payloadDoc.RootElement;

            string? issuer = root.TryGetProperty("iss", out var issProp) ? issProp.GetString() : null;
            if (!string.Equals(issuer, _options.Issuer, StringComparison.Ordinal))
            {
                failureCode = "INVALID_TOKEN_ISSUER";
                return false;
            }

            string? audience = root.TryGetProperty("aud", out var audProp) ? audProp.GetString() : null;
            if (!string.Equals(audience, _options.Audience, StringComparison.Ordinal))
            {
                failureCode = "INVALID_TOKEN_AUDIENCE";
                return false;
            }

            long nowUnix = (nowUtcOverride ?? DateTimeOffset.UtcNow).ToUnixTimeSeconds();
            long skew = Math.Max(0, _options.ClockSkewSeconds);

            if (!root.TryGetProperty("exp", out var expProp) || !expProp.TryGetInt64(out long expUnix))
            {
                failureCode = "MISSING_EXPIRATION_CLAIM";
                return false;
            }

            if (nowUnix > expUnix + skew)
            {
                failureCode = "TOKEN_EXPIRED";
                return false;
            }

            if (root.TryGetProperty("nbf", out var nbfProp)
                && nbfProp.TryGetInt64(out long nbfUnix)
                && (nowUnix + skew) < nbfUnix)
            {
                failureCode = "TOKEN_NOT_YET_VALID";
                return false;
            }

            string? subStr = root.TryGetProperty("sub", out var subProp) ? subProp.GetString() : null;
            if (!Guid.TryParse(subStr, out Guid userId))
            {
                failureCode = "INVALID_SUBJECT_CLAIM";
                return false;
            }

            string email = root.TryGetProperty("email", out var emailProp) ? emailProp.GetString() ?? string.Empty : string.Empty;
            string jti = root.TryGetProperty("jti", out var jtiProp) ? jtiProp.GetString() ?? string.Empty : string.Empty;

            string kycStr = root.TryGetProperty("kyc_status", out var kycProp) ? kycProp.GetString() ?? "NOT_STARTED" : "NOT_STARTED";
            if (!Enum.TryParse<KycStatus>(kycStr, ignoreCase: true, out var kycStatus))
            {
                kycStatus = KycStatus.NOT_STARTED;
            }

            var roles = new List<UserRole>();
            if (root.TryGetProperty("roles", out var rolesProp) && rolesProp.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in rolesProp.EnumerateArray())
                {
                    if (Enum.TryParse<UserRole>(item.GetString(), ignoreCase: true, out var parsedRole))
                    {
                        roles.Add(parsedRole);
                    }
                }
            }

            if (roles.Count == 0)
            {
                roles.Add(UserRole.SENDER);
            }

            actor = new AuthenticatedActor(userId, email, roles, kycStatus, jti);
            return true;
        }
        catch (JsonException)
        {
            failureCode = "INVALID_PAYLOAD_JSON";
            return false;
        }
    }

    public static (string RawRefreshToken, string TokenHash) CreateRefreshTokenPair()
    {
        byte[] randomBytes = RandomNumberGenerator.GetBytes(32);
        string rawToken = Base64UrlEncode(randomBytes);
        return (rawToken, HashRefreshToken(rawToken));
    }

    public static string HashRefreshToken(string rawRefreshToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rawRefreshToken);
        byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(rawRefreshToken.Trim()));
        return Convert.ToHexStringLower(hash);
    }

    public static string NormalizeDigits(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var sb = new StringBuilder(value.Length);
        foreach (char ch in value)
        {
            if (char.IsAsciiDigit(ch))
            {
                sb.Append(ch);
            }
        }

        return sb.ToString();
    }

    private static string Base64UrlEncode(ReadOnlySpan<byte> bytes) =>
        Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

    private static byte[] Base64UrlDecode(string input)
    {
        string padded = input
            .Replace('-', '+')
            .Replace('_', '/');

        int mod = padded.Length % 4;
        if (mod == 2)
        {
            padded += "==";
        }
        else if (mod == 3)
        {
            padded += "=";
        }
        else if (mod == 1)
        {
            throw new FormatException("Comprimento Base64Url inválido.");
        }

        return Convert.FromBase64String(padded);
    }
}
