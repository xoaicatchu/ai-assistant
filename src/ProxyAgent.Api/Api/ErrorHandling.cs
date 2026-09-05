using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Providers;
using ProxyAgent.Api.Streaming;

namespace ProxyAgent.Api.Api;

public sealed class ApiValidationException(string message) : Exception(message);

public sealed class ApiErrorResponse
{
    public ApiError Error { get; init; } = new();
}

public sealed class ApiError
{
    public string Code { get; init; } = string.Empty;
    public string Message { get; init; } = string.Empty;
    public string? Provider { get; init; }
}

public static class ErrorHandling
{
    public static async Task WriteAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is OperationCanceledException && context.RequestAborted.IsCancellationRequested)
        {
            return;
        }

        var error = Map(exception);
        if (context.Response.HasStarted)
        {
            await SseWriter.WriteErrorAsync(context.Response, error.Code, error.Message, error.Provider, cancellationToken);
            return;
        }

        context.Response.StatusCode = error.StatusCode;
        await context.Response.WriteAsJsonAsync(new ApiErrorResponse
        {
            Error = new ApiError { Code = error.Code, Message = error.Message, Provider = error.Provider }
        }, cancellationToken);
    }

    private static ErrorDetails Map(Exception exception) => exception switch
    {
        UnsupportedProviderException unsupported => new(400, unsupported.Code, unsupported.Message, unsupported.Provider),
        ApiValidationException validation => new(400, "invalid_request", validation.Message, null),
        ProviderNotConfiguredException notConfigured => new(503, notConfigured.Code, notConfigured.Message, notConfigured.Provider),
        ProviderAuthenticationException authentication => new(502, authentication.Code, authentication.Message, authentication.Provider),
        ProviderRequestException request => new(502, request.Code, request.Message, request.Provider),
        ProviderUnavailableException unavailable => new(502, unavailable.Code, unavailable.Message, unavailable.Provider),
        _ => new(500, "internal_error", "An unexpected server error occurred.", null)
    };

    private sealed record ErrorDetails(int StatusCode, string Code, string Message, string? Provider);
}
