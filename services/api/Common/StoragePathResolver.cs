using System.Text;

namespace TopicLog.Api.Common;

/// <summary>
/// Resolvedor centralizado de caminhos de persistência e gravação atômica segura.
/// Garante isolamento estrito: impede que suítes de testes acessem dados reais do usuário.
/// </summary>
public static class StoragePathResolver
{
    public static string StorageDirectory => ResolveStorageDirectory();

    public static string ResolveStorageDirectory()
    {
        string? customDir = Environment.GetEnvironmentVariable("TOPICLOG_STORAGE_DIR");
        if (!string.IsNullOrWhiteSpace(customDir))
        {
            Directory.CreateDirectory(customDir.Trim());
            return customDir.Trim();
        }

        bool isTest = AppDomain.CurrentDomain.FriendlyName.Contains("test", StringComparison.OrdinalIgnoreCase)
                   || AppContext.BaseDirectory.Contains("test", StringComparison.OrdinalIgnoreCase)
                   || string.Equals(Environment.GetEnvironmentVariable("TOPICLOG_IS_TEST"), "true", StringComparison.OrdinalIgnoreCase);

        if (isTest)
        {
            throw new InvalidOperationException("VIOLAÇÃO DE ISOLAMENTO DE TESTE: Testes não podem utilizar o diretório de dados reais! É obrigatório injetar um diretório temporário isolado via TOPICLOG_STORAGE_DIR.");
        }

        string defaultDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TopicLog");
        Directory.CreateDirectory(defaultDir);
        return defaultDir;
    }

    public static string ResolveFilePath(string fileName)
    {
        return Path.Combine(ResolveStorageDirectory(), fileName);
    }

    public static void SaveFileAtomically(string filePath, string content)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);
        ArgumentNullException.ThrowIfNull(content);

        string dir = Path.GetDirectoryName(filePath) 
            ?? throw new InvalidOperationException($"Não foi possível determinar o diretório do caminho: {filePath}");
        
        Directory.CreateDirectory(dir);
        string tempPath = Path.Combine(dir, $"{Path.GetFileName(filePath)}.{Guid.NewGuid():N}.tmp");

        try
        {
            File.WriteAllText(tempPath, content, Encoding.UTF8);
            File.Move(tempPath, filePath, overwrite: true);
        }
        catch
        {
            if (File.Exists(tempPath))
            {
                try { File.Delete(tempPath); } catch { /* silencia limpeza de arquivo temporário */ }
            }
            throw;
        }
    }
}
