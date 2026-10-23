namespace TopicLog.Api.Modules.Regions;

public sealed record RegionCityResponse(
    string IbgeCode,
    string Name,
    string StateUf,
    bool IsPilotPriority,
    int? PilotPriorityOrder,
    double ApproximateLatitude,
    double ApproximateLongitude);

public static class RegionsEndpoints
{
    private static readonly IReadOnlyList<RegionCityResponse> MgCities =
    [
        new("3136207", "João Monlevade", "MG", true, 1, -19.8100, -43.1736),
        new("3106200", "Belo Horizonte", "MG", true, 2, -19.9167, -43.9345),
        new("3131307", "Ipatinga", "MG", false, null, -19.4680, -42.5400),
        new("3131703", "Itabira", "MG", false, null, -19.6190, -43.2260),
        new("3144805", "Nova Era", "MG", false, null, -19.7580, -43.0360),
        new("3146107", "Ouro Preto", "MG", false, null, -20.3856, -43.5035),
        new("3119401", "Coronel Fabriciano", "MG", false, null, -19.5190, -42.6300),
        new("3168705", "Timóteo", "MG", false, null, -19.5820, -42.6450),
        new("3106705", "Betim", "MG", false, null, -19.9678, -44.1983),
        new("3118601", "Contagem", "MG", false, null, -19.9317, -44.0536),
        new("3167202", "Sete Lagoas", "MG", false, null, -19.4658, -44.2467),
        new("3136702", "Juiz de Fora", "MG", false, null, -21.7642, -43.3496),
        new("3170206", "Uberlândia", "MG", false, null, -18.9186, -48.2772)
    ];

    public static WebApplication MapTopicLogRegionsEndpoints(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        // GET /api/v1/regions/cities — Catálogo de municípios de MG com prioridade piloto D02
        app.MapGet("/api/v1/regions/cities", () => Results.Ok(MgCities));

        return app;
    }
}
