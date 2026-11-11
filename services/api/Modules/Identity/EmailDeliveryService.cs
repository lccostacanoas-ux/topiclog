using System.Net;
using System.Net.Mail;
using System.Text.Json;
using TopicLog.Api.Common;

namespace TopicLog.Api.Modules.Identity;

/// <summary>
/// Contrato de entrega de e-mails transacionais (ex.: código de recuperação de senha).
/// </summary>
public interface IEmailDeliveryService
{
    bool IsConfigured { get; }

    Task SendPasswordResetCodeAsync(
        string toEmail,
        string recipientName,
        string resetCode,
        int expiresInMinutes,
        CancellationToken cancellationToken);
}

internal sealed class LocalEmailSettings
{
    public string? SmtpHost { get; set; }
    public int SmtpPort { get; set; } = 587;
    public bool EnableSsl { get; set; } = true;
    public string? Username { get; set; }
    public string? AppPassword { get; set; }
    public string? FromAddress { get; set; }
    public string? FromName { get; set; } = "Topic Log";
}

/// <summary>
/// Serviço SMTP nativo (.NET BCL) compatível com Gmail + Senha de App e servidores SMTP padrão.
/// Lê credenciais de variáveis de ambiente (Email__*) ou do arquivo privado local email_settings.json.
/// </summary>
public sealed class SmtpEmailDeliveryService : IEmailDeliveryService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true
    };

    public bool IsConfigured => TryResolveConfig(out _);

    public async Task SendPasswordResetCodeAsync(
        string toEmail,
        string recipientName,
        string resetCode,
        int expiresInMinutes,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(toEmail);
        ArgumentException.ThrowIfNullOrWhiteSpace(resetCode);
        cancellationToken.ThrowIfCancellationRequested();

        if (!TryResolveConfig(out var cfg))
        {
            throw new InvalidOperationException("Credenciais SMTP não configuradas em email_settings.json.");
        }

        string safeName = WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(recipientName) ? "Usuário Topic Log" : recipientName.Trim());
        string safeCode = WebUtility.HtmlEncode(resetCode.Trim());

        using var message = new MailMessage
        {
            From = new MailAddress(cfg.FromAddress, cfg.FromName),
            Subject = "Topic Log — Código de recuperação de senha",
            IsBodyHtml = true,
            Body = $"""
                <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #E2E8F0;border-radius:12px;color:#0F172A;">
                  <h2 style="margin:0 0 12px 0;color:#1D4ED8;">Topic Log — Recuperação de Acesso</h2>
                  <p style="font-size:15px;line-height:1.5;">Olá, <strong>{safeName}</strong>.</p>
                  <p style="font-size:15px;line-height:1.5;">Recebemos uma solicitação para redefinir a senha da sua conta. Use o código abaixo na tela de recuperação:</p>
                  <div style="margin:20px 0;padding:16px;background:#F1F5F9;border-radius:8px;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;color:#0F172A;">
                    {safeCode}
                  </div>
                  <p style="font-size:14px;color:#475569;">Este código expira em <strong>{expiresInMinutes} minutos</strong> e possui limite de tentativas.</p>
                  <p style="font-size:13px;color:#64748B;margin-top:20px;">Se você não solicitou a redefinição de senha, ignore este e-mail. Sua senha atual continuará funcionando normalmente.</p>
                </div>
                """
        };
        message.To.Add(new MailAddress(toEmail.Trim()));

        using var client = new SmtpClient(cfg.SmtpHost, cfg.SmtpPort)
        {
            EnableSsl = cfg.EnableSsl,
            DeliveryMethod = SmtpDeliveryMethod.Network,
            UseDefaultCredentials = false,
            Credentials = new NetworkCredential(cfg.Username, cfg.AppPassword),
            Timeout = 15_000
        };

        await client.SendMailAsync(message, cancellationToken).ConfigureAwait(false);
    }

    private static bool TryResolveConfig(out ResolvedSmtpConfig config)
    {
        var fileSettings = ReadFromLocalFile();

        string host = FirstNonEmpty(Environment.GetEnvironmentVariable("Email__SmtpHost"), fileSettings?.SmtpHost) ?? "smtp.gmail.com";
        int port = int.TryParse(Environment.GetEnvironmentVariable("Email__SmtpPort"), out int envPort) && envPort > 0
            ? envPort
            : (fileSettings?.SmtpPort > 0 ? fileSettings.SmtpPort : 587);
        bool enableSsl = bool.TryParse(Environment.GetEnvironmentVariable("Email__EnableSsl"), out bool envSsl)
            ? envSsl
            : (fileSettings?.EnableSsl ?? true);

        string? username = FirstNonEmpty(Environment.GetEnvironmentVariable("Email__Username"), fileSettings?.Username);
        string? rawPassword = FirstNonEmpty(Environment.GetEnvironmentVariable("Email__Password"), fileSettings?.AppPassword);
        string? normalizedPassword = rawPassword is null ? null : string.Concat(rawPassword.Where(ch => !char.IsWhiteSpace(ch)));

        string? fromAddress = FirstNonEmpty(Environment.GetEnvironmentVariable("Email__FromAddress"), fileSettings?.FromAddress, username);
        string fromName = FirstNonEmpty(Environment.GetEnvironmentVariable("Email__FromName"), fileSettings?.FromName) ?? "Topic Log";

        if (string.IsNullOrWhiteSpace(host)
            || string.IsNullOrWhiteSpace(username)
            || string.IsNullOrWhiteSpace(normalizedPassword)
            || string.IsNullOrWhiteSpace(fromAddress)
            || normalizedPassword.Contains("PREENCHER", StringComparison.OrdinalIgnoreCase)
            || normalizedPassword.Contains("COLOQUE_AQUI", StringComparison.OrdinalIgnoreCase)
            || username.Contains("seu_email", StringComparison.OrdinalIgnoreCase)
            || username.Contains("COLOQUE_SEU_EMAIL", StringComparison.OrdinalIgnoreCase))
        {
            config = default!;
            return false;
        }

        config = new ResolvedSmtpConfig(host.Trim(), port, enableSsl, username.Trim(), normalizedPassword, fromAddress.Trim(), fromName.Trim());
        return true;
    }

    private static LocalEmailSettings? ReadFromLocalFile()
    {
        try
        {
            string path = StoragePathResolver.ResolveFilePath("email_settings.json");
            if (!File.Exists(path))
            {
                return null;
            }

            string json = File.ReadAllText(path).TrimStart('\uFEFF');
            return JsonSerializer.Deserialize<LocalEmailSettings>(json, JsonOptions);
        }
        catch
        {
            return null;
        }
    }

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (string? value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }
        return null;
    }

    private sealed record ResolvedSmtpConfig(
        string SmtpHost,
        int SmtpPort,
        bool EnableSsl,
        string Username,
        string AppPassword,
        string FromAddress,
        string FromName);
}
