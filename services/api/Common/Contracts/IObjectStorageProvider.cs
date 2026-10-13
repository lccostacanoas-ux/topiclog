namespace TopicLog.Api.Common.Contracts;

public sealed record PrivateObjectReference(
    string StorageKey,
    string ContentType,
    long SizeBytes,
    DateTimeOffset StoredAtUtc);

/// <summary>
/// Contrato para armazenamento privado de imagens (encomendas e provas de entrega — D16).
/// Documentos e fotos de prova de entrega nunca devem ter URL pública irrestrita.
/// </summary>
public interface IObjectStorageProvider
{
    string ProviderName { get; }

    Task<PrivateObjectReference> StorePrivateObjectAsync(
        string category,
        string fileName,
        Stream content,
        string contentType,
        CancellationToken cancellationToken);

    string GenerateTemporarySignedPath(
        string storageKey,
        TimeSpan validityWindow);
}
