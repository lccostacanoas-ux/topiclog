using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Modules.Shipments;
using TopicLog.Api.Modules.Trips;

namespace TopicLog.Api.Modules.Matching;

public static class MatchingEndpoints
{
    public static IServiceCollection AddTopicLogMatchingModule(this IServiceCollection services)
    {
        services.AddScoped<IMatchingService, MatchingService>();
        return services;
    }

    public static IEndpointRouteBuilder MapTopicLogMatchingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/matching")
                       .WithTags("Matching & Compatibilidade (PR-03)");

        // 1. Encontrar viagens compatíveis para uma encomenda pública
        group.MapGet("/shipments/{id:guid}/trips", async (
            Guid id,
            IMatchingService matchingService,
            CancellationToken ct) =>
        {
            var matches = await matchingService.FindCompatibleTripsForShipmentAsync(id, ct).ConfigureAwait(false);
            return Results.Ok(new
            {
                shipmentId = id,
                totalCompatibleTrips = matches.Count,
                matches
            });
        })
        .WithName("FindCompatibleTripsForShipment")
        .Produces<object>(StatusCodes.Status200OK);

        // 2. Encontrar encomendas compatíveis para uma viagem do transportador
        group.MapGet("/trips/{id:guid}/shipments", async (
            Guid id,
            IMatchingService matchingService,
            CancellationToken ct) =>
        {
            var matches = await matchingService.FindCompatibleShipmentsForTripAsync(id, ct).ConfigureAwait(false);
            return Results.Ok(new
            {
                tripId = id,
                totalCompatibleShipments = matches.Count,
                matches
            });
        })
        .WithName("FindCompatibleShipmentsForTrip")
        .Produces<object>(StatusCodes.Status200OK);

        // 3. Avaliar compatibilidade direta entre encomenda e viagem com diagnóstico explicável
        group.MapPost("/evaluate", async (
            EvaluateMatchingRequest request,
            IShipmentsRepository shipmentsRepo,
            ITripsRepository tripsRepo,
            IMatchingService matchingService,
            CancellationToken ct) =>
        {
            var shipment = await shipmentsRepo.GetByIdAsync(request.ShipmentId, ct).ConfigureAwait(false);
            if (shipment == null)
            {
                return Results.Problem(
                    title: "Encomenda não encontrada",
                    detail: $"A encomenda com identificador '{request.ShipmentId}' não existe no sistema.",
                    statusCode: StatusCodes.Status404NotFound);
            }

            var trip = await tripsRepo.GetByIdAsync(request.TripId, ct).ConfigureAwait(false);
            if (trip == null)
            {
                return Results.Problem(
                    title: "Viagem não encontrada",
                    detail: $"A viagem com identificador '{request.TripId}' não existe no sistema.",
                    statusCode: StatusCodes.Status404NotFound);
            }

            var evaluation = matchingService.EvaluateCompatibility(shipment, trip);
            return Results.Ok(evaluation);
        })
        .WithName("EvaluateMatchingCompatibility")
        .Produces<MatchEvaluationResult>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status404NotFound);

        // 4. Busca espacial de oportunidades em raio de até 2 km (Regra 3 / PR-03)
        group.MapGet("/nearby-shipments", async (
            double lat,
            double lon,
            int? radiusMeters,
            string? vehicleType,
            int? availableCapacityGrams,
            IMatchingService matchingService,
            CancellationToken ct) =>
        {
            if (lat < -90.0 || lat > 90.0 || lon < -180.0 || lon > 180.0)
            {
                return Results.Problem(
                    title: "Coordenadas geográficas inválidas",
                    detail: "Latitude deve estar entre -90 e 90, e Longitude entre -180 e 180.",
                    statusCode: StatusCodes.Status400BadRequest);
            }

            VehicleType? modal = null;
            if (!string.IsNullOrWhiteSpace(vehicleType) &&
                Enum.TryParse<VehicleType>(vehicleType, ignoreCase: true, out var parsedModal))
            {
                modal = parsedModal;
            }

            int radius = radiusMeters.GetValueOrDefault(2000);
            if (radius <= 0 || radius > 50000)
            {
                radius = 2000;
            }

            var opportunities = await matchingService.FindNearbyShipmentsAsync(
                lat,
                lon,
                radius,
                modal,
                availableCapacityGrams,
                ct).ConfigureAwait(false);

            return Results.Ok(new
            {
                center = new { latitude = lat, longitude = lon },
                radiusMeters = radius,
                totalFound = opportunities.Count,
                opportunities
            });
        })
        .WithName("FindNearbyShipmentsWithinRadius")
        .Produces<object>(StatusCodes.Status200OK);

        // 5. Grupo do Feed Nacional e Oportunidades (Complemento PR-03)
        var feedGroup = app.MapGroup("/api/v1/opportunities/feed")
                           .WithTags("Feed Nacional de Oportunidades (Complemento PR-03)");

        // 5.1. Modo "No meu trajeto"
        feedGroup.MapGet("/on-my-route", async (
            Guid? tripId,
            string? originCity,
            string? destinationCity,
            string? stops,
            int? maxDetourKm,
            bool? includeExtendedDetours,
            string? cursor,
            int? limit,
            IMatchingService matchingService,
            CancellationToken ct) =>
        {
            var intermediateStops = string.IsNullOrWhiteSpace(stops)
                ? []
                : stops.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            var result = await matchingService.FindOpportunitiesOnRouteAsync(
                tripId,
                originCity,
                destinationCity,
                intermediateStops,
                maxDetourKm.GetValueOrDefault(20),
                includeExtendedDetours.GetValueOrDefault(false),
                cursor,
                limit.GetValueOrDefault(20),
                ct).ConfigureAwait(false);

            return Results.Ok(result);
        })
        .WithName("FindOpportunitiesOnRoute")
        .Produces<CursorPagedResult<OpportunityFeedItemDto>>(StatusCodes.Status200OK);

        // 5.2. Modo "Perto de mim"
        feedGroup.MapGet("/nearby", async (
            double lat,
            double lon,
            int? radiusKm,
            string? vehicleType,
            string? cursor,
            int? limit,
            IMatchingService matchingService,
            CancellationToken ct) =>
        {
            if (lat < -90.0 || lat > 90.0 || lon < -180.0 || lon > 180.0)
            {
                return Results.Problem(
                    title: "Coordenadas geográficas inválidas",
                    detail: "Latitude deve estar entre -90 e 90, e Longitude entre -180 e 180.",
                    statusCode: StatusCodes.Status400BadRequest);
            }

            VehicleType? modal = null;
            if (!string.IsNullOrWhiteSpace(vehicleType) &&
                Enum.TryParse<VehicleType>(vehicleType, ignoreCase: true, out var parsedModal))
            {
                modal = parsedModal;
            }

            var result = await matchingService.FindNearbyOpportunitiesAsync(
                lat,
                lon,
                radiusKm.GetValueOrDefault(15),
                modal,
                cursor,
                limit.GetValueOrDefault(20),
                ct).ConfigureAwait(false);

            return Results.Ok(result);
        })
        .WithName("FindNearbyFeedOpportunities")
        .Produces<CursorPagedResult<OpportunityFeedItemDto>>(StatusCodes.Status200OK);

        // 5.3. Modo "Escolher região"
        feedGroup.MapGet("/regional", async (
            string? uf,
            string? city,
            string? neighborhood,
            string? type,
            string? cursor,
            int? limit,
            IMatchingService matchingService,
            CancellationToken ct) =>
        {
            var result = await matchingService.FindRegionalOpportunitiesAsync(
                uf,
                city,
                neighborhood,
                type ?? "ALL",
                cursor,
                limit.GetValueOrDefault(20),
                ct).ConfigureAwait(false);

            return Results.Ok(result);
        })
        .WithName("FindRegionalFeedOpportunities")
        .Produces<CursorPagedResult<OpportunityFeedItemDto>>(StatusCodes.Status200OK);

        // 6. Grupo de Regiões - Busca Nacional / Typeahead
        var regionsGroup = app.MapGroup("/api/v1/regions")
                              .WithTags("Catálogo de Regiões");

        regionsGroup.MapGet("/search", (
            string? q,
            string? uf,
            int? limit,
            IMatchingService matchingService) =>
        {
            var results = matchingService.SearchMunicipalities(q, uf, limit.GetValueOrDefault(20));
            return Results.Ok(new
            {
                totalFound = results.Count,
                municipalities = results
            });
        })
        .WithName("SearchMunicipalitiesTypeahead")
        .Produces<object>(StatusCodes.Status200OK);

        return app;
    }
}
