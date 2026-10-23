using Microsoft.AspNetCore.Mvc;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Modules.Identity;

namespace TopicLog.Api.Modules.Proposals;

public sealed record AcceptProposalRequest(int ExpectedVersion);
public sealed record RespondPriorityOfferRequest(bool Accept);
public sealed record RejectProposalRequest(string? Reason);
public sealed record CancelProposalRequest(string? Reason);

public static class ProposalsEndpoints
{
    public static IServiceCollection AddTopicLogProposalsModule(this IServiceCollection services)
    {
        services.AddSingleton<IProposalsRepository, InMemoryProposalsRepository>();
        services.AddScoped<IProposalsApplicationService, ProposalsApplicationService>();
        return services;
    }

    public static IEndpointRouteBuilder MapTopicLogProposalsEndpoints(this IEndpointRouteBuilder app)
    {
        // POST /api/v1/proposals — Criar proposta de frete (Carrier)
        app.MapPost("/api/v1/proposals", async (
            [FromBody] CreateProposalRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IProposalsApplicationService proposalsService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            if (!actor.Roles.Contains(UserRole.CARRIER))
            {
                throw new DomainRuleViolationException(
                    "AUTH_FORBIDDEN_CARRIER_ROLE_REQUIRED",
                    "Apenas contas com papel de transportador (CARRIER) podem criar propostas de frete.",
                    403);
            }

            var created = await proposalsService.CreateProposalAsync(
                actor.UserId,
                actor.Email,
                request,
                cancellationToken).ConfigureAwait(false);

            return Results.Created($"/api/v1/proposals/{created.Id}", created);
        });

        // GET /api/v1/proposals/{id} — Consultar proposta com sigilo
        app.MapGet("/api/v1/proposals/{id:guid}", async (
            Guid id,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IProposalsApplicationService proposalsService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var proposal = await proposalsService.GetProposalByIdAsync(id, actor.UserId, cancellationToken).ConfigureAwait(false);
            return proposal is null ? Results.NotFound() : Results.Ok(proposal);
        });

        // GET /api/v1/proposals/shipment/{shipmentId} — Listar propostas de uma encomenda
        app.MapGet("/api/v1/proposals/shipment/{shipmentId:guid}", async (
            Guid shipmentId,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IProposalsApplicationService proposalsService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var list = await proposalsService.ListProposalsByShipmentIdAsync(shipmentId, actor.UserId, cancellationToken).ConfigureAwait(false);
            return Results.Ok(list);
        });

        // GET /api/v1/proposals/carrier/{carrierId} — Listar propostas de um transportador (ABAC)
        app.MapGet("/api/v1/proposals/carrier/{carrierId:guid}", async (
            Guid carrierId,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IProposalsApplicationService proposalsService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            await authorization.EnsureCanAccessPrivateUserResourceAsync(actor, carrierId, "carrier_proposals", httpContext.TraceIdentifier, cancellationToken).ConfigureAwait(false);
            var list = await proposalsService.ListProposalsByCarrierIdAsync(carrierId, cancellationToken).ConfigureAwait(false);
            return Results.Ok(list);
        });

        // GET /api/v1/proposals/sender/{senderId} — Listar propostas para o remetente (ABAC)
        app.MapGet("/api/v1/proposals/sender/{senderId:guid}", async (
            Guid senderId,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IProposalsApplicationService proposalsService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            await authorization.EnsureCanAccessPrivateUserResourceAsync(actor, senderId, "sender_proposals", httpContext.TraceIdentifier, cancellationToken).ConfigureAwait(false);
            var list = await proposalsService.ListProposalsForSenderAsync(senderId, cancellationToken).ConfigureAwait(false);
            return Results.Ok(list);
        });

        // POST /api/v1/proposals/{id}/counter — Contraproposta com validação de partícipes e turnos
        app.MapPost("/api/v1/proposals/{id:guid}/counter", async (
            Guid id,
            [FromBody] CounterProposalRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IProposalsApplicationService proposalsService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var updated = await proposalsService.CounterProposalAsync(
                actor.UserId,
                actorRole,
                id,
                request,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(updated);
        });

        // POST /api/v1/proposals/{id}/accept — Aceitação única atômica (Gate G2)
        app.MapPost("/api/v1/proposals/{id:guid}/accept", async (
            Guid id,
            [FromBody] AcceptProposalRequest? body,
            [FromQuery] int? expectedVersion,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IProposalsApplicationService proposalsService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;
            int version = body?.ExpectedVersion ?? expectedVersion ?? 1;

            var contract = await proposalsService.AcceptProposalAsync(
                actor.UserId,
                actorRole,
                id,
                version,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(contract);
        });

        // POST /api/v1/proposals/{id}/reject — Recusar proposta
        app.MapPost("/api/v1/proposals/{id:guid}/reject", async (
            Guid id,
            [FromBody] RejectProposalRequest? body,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IProposalsApplicationService proposalsService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var rejected = await proposalsService.RejectProposalAsync(
                actor.UserId,
                actorRole,
                id,
                body?.Reason,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(rejected);
        });

        // POST /api/v1/proposals/{id}/cancel — Cancelar proposta
        app.MapPost("/api/v1/proposals/{id:guid}/cancel", async (
            Guid id,
            [FromBody] CancelProposalRequest? body,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IProposalsApplicationService proposalsService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);

            var cancelled = await proposalsService.CancelProposalAsync(
                actor.UserId,
                id,
                body?.Reason,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(cancelled);
        });

        // GET /api/v1/proposals/{id}/events — Auditoria e linha do tempo de eventos
        app.MapGet("/api/v1/proposals/{id:guid}/events", async (
            Guid id,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IProposalsApplicationService proposalsService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var events = await proposalsService.GetProposalEventsAsync(id, actor.UserId, cancellationToken).ConfigureAwait(false);
            return Results.Ok(events);
        });

        // GET /api/v1/contracts/{id} — Consultar contrato com sigilo
        app.MapGet("/api/v1/contracts/{id:guid}", async (
            Guid id,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IProposalsApplicationService proposalsService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var contract = await proposalsService.GetContractByIdAsync(id, actor.UserId, cancellationToken).ConfigureAwait(false);
            return contract is null ? Results.NotFound() : Results.Ok(contract);
        });

        // GET /api/v1/contracts/shipment/{shipmentId} — Consultar contrato por encomenda
        app.MapGet("/api/v1/contracts/shipment/{shipmentId:guid}", async (
            Guid shipmentId,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IProposalsApplicationService proposalsService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var contract = await proposalsService.GetContractByShipmentIdAsync(shipmentId, actor.UserId, cancellationToken).ConfigureAwait(false);
            return contract is null ? Results.NotFound() : Results.Ok(contract);
        });

        // GET /api/v1/contracts/carrier/{carrierId} — Listar contratos por transportador (ABAC)
        app.MapGet("/api/v1/contracts/carrier/{carrierId:guid}", async (
            Guid carrierId,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IProposalsApplicationService proposalsService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            await authorization.EnsureCanAccessPrivateUserResourceAsync(actor, carrierId, "carrier_contracts", httpContext.TraceIdentifier, cancellationToken).ConfigureAwait(false);
            var list = await proposalsService.ListContractsByCarrierIdAsync(carrierId, cancellationToken).ConfigureAwait(false);
            return Results.Ok(list);
        });

        // POST /api/v1/contracts/{id}/cancel-pre-pickup — Cancelamento pré-coleta
        app.MapPost("/api/v1/contracts/{id:guid}/cancel-pre-pickup", async (
            Guid id,
            [FromBody] CancelContractRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IProposalsApplicationService proposalsService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var cancelled = await proposalsService.CancelContractPrePickupAsync(
                actor.UserId,
                actorRole,
                id,
                request,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(cancelled);
        });

        // GET /api/v1/priority-offers/shipment/{shipmentId} — Consultar oferta prioritária
        app.MapGet("/api/v1/priority-offers/shipment/{shipmentId:guid}", async (
            Guid shipmentId,
            IProposalsApplicationService proposalsService,
            CancellationToken cancellationToken) =>
        {
            var offer = await proposalsService.GetActivePriorityOfferAsync(shipmentId, cancellationToken).ConfigureAwait(false);
            return offer is null ? Results.NotFound() : Results.Ok(offer);
        });

        // GET /api/v1/priority-offers/carrier/{carrierId} — Listar ofertas prioritárias para transportador (ABAC)
        app.MapGet("/api/v1/priority-offers/carrier/{carrierId:guid}", async (
            Guid carrierId,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IProposalsApplicationService proposalsService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            await authorization.EnsureCanAccessPrivateUserResourceAsync(actor, carrierId, "priority_offers", httpContext.TraceIdentifier, cancellationToken).ConfigureAwait(false);
            var list = await proposalsService.ListActivePriorityOffersForCarrierAsync(carrierId, cancellationToken).ConfigureAwait(false);
            return Results.Ok(list);
        });

        // POST /api/v1/priority-offers/{shipmentId}/respond — Aceitar ou recusar oferta prioritária da 2ª encomenda
        app.MapPost("/api/v1/priority-offers/{shipmentId:guid}/respond", async (
            Guid shipmentId,
            [FromBody] RespondPriorityOfferRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IProposalsApplicationService proposalsService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);

            var response = await proposalsService.RespondPriorityOfferAsync(
                actor.UserId,
                shipmentId,
                request.Accept,
                cancellationToken).ConfigureAwait(false);

            return Results.Ok(response);
        });

        return app;
    }
}
