using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using TopicLog.Api.Common.Domain;

namespace TopicLog.Api.Common.Middleware;

/// <summary>
/// Middleware global de tratamento de exceções retornando RFC 9457 ProblemDetails
/// com Correlation-Id e sem expor dados sensíveis ou stack traces em produção (02-TRD-Tecnico.md).
/// </summary>
public sealed partial class GlobalExceptionMiddleware
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;

    public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context).ConfigureAwait(false);
        }
        catch (DomainRuleViolationException domainEx)
        {
            LogDomainViolation(
                _logger,
                domainEx.RuleCode,
                context.Request.Path.Value ?? string.Empty,
                domainEx.Message);

            await WriteProblemDetailsAsync(
                context,
                statusCode: domainEx.HttpStatusCode,
                title: "Violação de regra de negócio",
                detail: domainEx.Message,
                ruleCode: domainEx.RuleCode).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            LogUnhandledException(
                _logger,
                context.Request.Method,
                context.Request.Path.Value ?? string.Empty,
                ex);

            await WriteProblemDetailsAsync(
                context,
                statusCode: StatusCodes.Status500InternalServerError,
                title: "Erro interno no servidor",
                detail: "Ocorreu um erro inesperado ao processar a solicitação.",
                ruleCode: "INTERNAL_SERVER_ERROR").ConfigureAwait(false);
        }
    }

    [LoggerMessage(
        EventId = 2001,
        Level = LogLevel.Warning,
        Message = "Violação de regra de domínio [{RuleCode}] na rota {Path}: {Message}")]
    private static partial void LogDomainViolation(ILogger logger, string ruleCode, string path, string message);

    [LoggerMessage(
        EventId = 2002,
        Level = LogLevel.Error,
        Message = "Erro não tratado ao processar requisição {Method} {Path}.")]
    private static partial void LogUnhandledException(ILogger logger, string method, string path, Exception ex);

    private static async Task WriteProblemDetailsAsync(
        HttpContext context,
        int statusCode,
        string title,
        string detail,
        string ruleCode)
    {
        if (context.Response.HasStarted)
        {
            return;
        }

        context.Response.Clear();
        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/problem+json";
        context.Response.Headers[CorrelationIdMiddleware.HeaderName] = context.TraceIdentifier;

        var problem = new ProblemDetails
        {
            Type = $"https://topiclog.com.br/problems/{ruleCode.ToLowerInvariant()}",
            Title = title,
            Status = statusCode,
            Detail = detail,
            Instance = context.Request.Path
        };

        problem.Extensions["correlationId"] = context.TraceIdentifier;
        problem.Extensions["ruleCode"] = ruleCode;
        problem.Extensions["timestampUtc"] = DateTimeOffset.UtcNow;

        await JsonSerializer.SerializeAsync(
            context.Response.Body,
            problem,
            JsonOptions,
            context.RequestAborted).ConfigureAwait(false);
    }
}
