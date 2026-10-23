using Microsoft.AspNetCore.Mvc;
using TopicLog.Api.Common.Contracts;
using TopicLog.Api.Common.Domain;
using TopicLog.Api.Modules.Identity;
using TopicLog.Api.Modules.Proposals;

namespace TopicLog.Api.Modules.Fulfillment;

public static class FulfillmentEndpoints
{
    public static IServiceCollection AddTopicLogFulfillmentModule(this IServiceCollection services)
    {
        services.AddSingleton<IFulfillmentRepository, InMemoryFulfillmentRepository>();
        services.AddScoped<IFulfillmentApplicationService, FulfillmentApplicationService>();
        return services;
    }

    public static IEndpointRouteBuilder MapTopicLogFulfillmentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/deliveries");

        // GET /api/v1/deliveries/{orderId}
        group.MapGet("/{orderId:guid}", async (
            Guid orderId,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var result = await fulfillmentService.GetOrderAsync(
                actor.UserId,
                actorRole,
                orderId,
                cancellationToken);

            return Results.Ok(result);
        });

        // GET /api/v1/deliveries/shipment/{shipmentId}
        group.MapGet("/shipment/{shipmentId:guid}", async (
            Guid shipmentId,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var result = await fulfillmentService.GetOrderByShipmentIdAsync(
                actor.UserId,
                actorRole,
                shipmentId,
                cancellationToken);

            return Results.Ok(result);
        });

        // POST /api/v1/deliveries/{orderId}/pickup-checkin
        group.MapPost("/{orderId:guid}/pickup-checkin", async (
            Guid orderId,
            [FromBody] PickupCheckinRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var result = await fulfillmentService.PickupCheckinAsync(
                actor.UserId,
                actorRole,
                orderId,
                request,
                cancellationToken);

            return Results.Ok(result);
        });

        // POST /api/v1/deliveries/{orderId}/confirm-pickup
        group.MapPost("/{orderId:guid}/confirm-pickup", async (
            Guid orderId,
            [FromBody] ConfirmPickupRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var result = await fulfillmentService.ConfirmPickupAsync(
                actor.UserId,
                actorRole,
                orderId,
                request,
                cancellationToken);

            return Results.Ok(result);
        });

        // POST /api/v1/deliveries/{orderId}/delivery-proof
        group.MapPost("/{orderId:guid}/delivery-proof", async (
            Guid orderId,
            [FromBody] DeliveryProofUploadRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var result = await fulfillmentService.UploadDeliveryProofAsync(
                actor.UserId,
                actorRole,
                orderId,
                request,
                cancellationToken);

            return Results.Created($"/api/v1/deliveries/{orderId}/delivery-proof", result);
        });

        // POST /api/v1/deliveries/{orderId}/proofs (Alias)
        group.MapPost("/{orderId:guid}/proofs", async (
            Guid orderId,
            [FromBody] DeliveryProofUploadRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var result = await fulfillmentService.UploadDeliveryProofAsync(
                actor.UserId,
                actorRole,
                orderId,
                request,
                cancellationToken);

            return Results.Created($"/api/v1/deliveries/{orderId}/proofs", result);
        });

        // GET /api/v1/deliveries/{orderId}/delivery-code
        group.MapGet("/{orderId:guid}/delivery-code", async (
            Guid orderId,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var result = await fulfillmentService.GetDeliveryCodeAsync(
                actor.UserId,
                actorRole,
                orderId,
                cancellationToken);

            return Results.Ok(result);
        });

        // POST /api/v1/deliveries/{orderId}/regenerate-code
        group.MapPost("/{orderId:guid}/regenerate-code", async (
            Guid orderId,
            [FromBody] RegenerateDeliveryCodeRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var result = await fulfillmentService.RegenerateDeliveryCodeAsync(
                actor.UserId,
                actorRole,
                orderId,
                request,
                cancellationToken);

            return Results.Ok(result);
        });

        // POST /api/v1/deliveries/{orderId}/regenerate-delivery-code (Alias)
        group.MapPost("/{orderId:guid}/regenerate-delivery-code", async (
            Guid orderId,
            [FromBody] RegenerateDeliveryCodeRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var result = await fulfillmentService.RegenerateDeliveryCodeAsync(
                actor.UserId,
                actorRole,
                orderId,
                request,
                cancellationToken);

            return Results.Ok(result);
        });

        // POST /api/v1/deliveries/{orderId}/confirm-delivery
        group.MapPost("/{orderId:guid}/confirm-delivery", async (
            Guid orderId,
            [FromBody] ConfirmDeliveryRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var result = await fulfillmentService.ConfirmDeliveryAsync(
                actor.UserId,
                actorRole,
                orderId,
                request,
                cancellationToken);

            return Results.Ok(result);
        });

        // POST /api/v1/deliveries/{orderId}/report-exception
        group.MapPost("/{orderId:guid}/report-exception", async (
            Guid orderId,
            [FromBody] ReportDeliveryExceptionRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var result = await fulfillmentService.ReportDeliveryExceptionAsync(
                actor.UserId,
                actorRole,
                orderId,
                request,
                cancellationToken);

            return Results.Ok(result);
        });

        // POST /api/v1/deliveries/{orderId}/exceptions (Alias)
        group.MapPost("/{orderId:guid}/exceptions", async (
            Guid orderId,
            [FromBody] ReportDeliveryExceptionRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var result = await fulfillmentService.ReportDeliveryExceptionAsync(
                actor.UserId,
                actorRole,
                orderId,
                request,
                cancellationToken);

            return Results.Ok(result);
        });

        // POST /api/v1/deliveries/{orderId}/reschedule
        group.MapPost("/{orderId:guid}/reschedule", async (
            Guid orderId,
            [FromBody] RescheduleDeliveryRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var result = await fulfillmentService.RescheduleDeliveryAsync(
                actor.UserId,
                actorRole,
                orderId,
                request,
                cancellationToken);

            return Results.Ok(result);
        });

        // POST /api/v1/deliveries/{orderId}/initiate-return
        group.MapPost("/{orderId:guid}/initiate-return", async (
            Guid orderId,
            [FromBody] InitiateReturnRequest request,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var result = await fulfillmentService.InitiateReturnToSenderAsync(
                actor.UserId,
                actorRole,
                orderId,
                request,
                cancellationToken);

            return Results.Ok(result);
        });

        // GET /api/v1/deliveries/{orderId}/tracking
        group.MapGet("/{orderId:guid}/tracking", async (
            Guid orderId,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var result = await fulfillmentService.GetTrackingAsync(
                actor.UserId,
                actorRole,
                orderId,
                cancellationToken);

            return Results.Ok(result);
        });

        // GET /api/v1/deliveries/{orderId}/post-delivery-suggestions
        group.MapGet("/{orderId:guid}/post-delivery-suggestions", async (
            Guid orderId,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            // Coordenadas padrão da praça-piloto Belo Horizonte / João Monlevade para sugestões pós-entrega
            var result = await fulfillmentService.GetPostDeliverySuggestionsAsync(
                latitude: -19.9167,
                longitude: -43.9345,
                maxRadiusKm: 2,
                cancellationToken: cancellationToken);

            return Results.Ok(result);
        });

        // GET /api/v1/deliveries/my-orders
        group.MapGet("/my-orders", async (
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);
            var actorRole = actor.Roles.Contains(UserRole.CARRIER) ? ActorRole.CARRIER : ActorRole.SENDER;

            var result = await fulfillmentService.ListOrdersForUserAsync(
                actor.UserId,
                actorRole,
                cancellationToken);

            return Results.Ok(result);
        });

        // GET /api/v1/opportunities/post-delivery-suggestions
        app.MapGet("/api/v1/opportunities/post-delivery-suggestions", async (
            [FromQuery] double latitude,
            [FromQuery] double longitude,
            [FromQuery] int? maxRadiusKm,
            HttpContext httpContext,
            ResourceAuthorizationService authorization,
            IFulfillmentApplicationService fulfillmentService,
            CancellationToken cancellationToken) =>
        {
            var actor = authorization.RequireAuthenticatedActor(httpContext);

            var result = await fulfillmentService.GetPostDeliverySuggestionsAsync(
                latitude,
                longitude,
                maxRadiusKm ?? 2,
                cancellationToken);

            return Results.Ok(result);
        });

        return app;
    }
}
