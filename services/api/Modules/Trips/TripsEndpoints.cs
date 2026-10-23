using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Modules.Identity;

namespace TopicLog.Api.Modules.Trips;

public static class TripsEndpoints
{
    public static IServiceCollection AddTopicLogTripsModule(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddSingleton<ITripsRepository, InMemoryTripsRepository>();
        services.AddSingleton<ITripsApplicationService, TripsApplicationService>();

        return services;
    }

    public static WebApplication MapTopicLogTripsEndpoints(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        // POST /api/v1/trips — Cadastro de viagem com capacidade livre (PRD-04, D03, D04)
        app.MapPost("/api/v1/trips", async (
            [FromBody] CreateTripRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            ITripsApplicationService tripsService,
            CancellationToken cancellationToken) =>
        {
            Guid carrierId;
            string carrierName;
            bool carrierKycVerified;

            if (authorization.TryGetAuthenticatedActor(httpContext, out var actor) && actor is not null)
            {
                carrierId = actor.UserId;
                carrierName = actor.Email;
                carrierKycVerified = actor.KycStatus == KycStatus.VERIFIED;
            }
            else
            {
                // Fallback sandbox para desenvolvimento local
                carrierId = Guid.Parse("00000000-0000-0000-0000-000000000002");
                carrierName = "Transportador Sandbox (Demo)";
                carrierKycVerified = true;
            }

            var created = await tripsService.CreateTripAsync(
                carrierId,
                carrierName,
                carrierKycVerified,
                request,
                cancellationToken).ConfigureAwait(false);

            return Results.Created($"/api/v1/trips/{created.Id}", created);
        });

        // GET /api/v1/trips — Listagem de viagens ativas com espaço disponível
        app.MapGet("/api/v1/trips", async (
            [FromQuery] string? originCity,
            [FromQuery] string? destinationCity,
            ITripsApplicationService tripsService,
            CancellationToken cancellationToken) =>
        {
            var trips = await tripsService.ListTripsAsync(
                originCity,
                destinationCity,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(trips);
        });

        // GET /api/v1/trips/{id:guid} — Detalhes completos da viagem
        app.MapGet("/api/v1/trips/{id:guid}", async (
            Guid id,
            ITripsApplicationService tripsService,
            CancellationToken cancellationToken) =>
        {
            var trip = await tripsService.GetTripByIdAsync(id, cancellationToken).ConfigureAwait(false);
            if (trip is null)
            {
                return Results.NotFound(new
                {
                    type = "https://topiclog.com.br/errors/trip-not-found",
                    title = "Viagem não encontrada",
                    status = 404,
                    detail = $"A viagem com ID '{id}' não foi localizada."
                });
            }

            return Results.Ok(trip);
        });

        return app;
    }
}
