namespace ProxyAgent.Api.Providers;

using System.Text.Json;

public abstract class ProviderException : Exception
{
    protected ProviderException(string provider, string code, string message, Exception? innerException = null)
        : base(message, innerException)
    {
        Provider = provider;
        Code = code;
    }

    public string Provider { get; }
    public string Code { get; }
}

public sealed class ProviderNotConfiguredException(string provider)
    : ProviderException(provider, "provider_not_configured", $"Provider '{provider}' is not configured.")
{
}

public sealed class ProviderAuthenticationException(string provider)
    : ProviderException(provider, "provider_authentication_failed", "The upstream provider rejected the credentials.")
{
}

public sealed class ProviderQuotaException(string provider)
    : ProviderException(provider, "provider_quota_exceeded", "The upstream provider quota has been exceeded.")
{
}

public sealed class ProviderRequestException : ProviderException
{
    public ProviderRequestException(string provider, Exception? innerException = null)
        : this(provider, null, innerException)
    {
    }

    public ProviderRequestException(string provider, string? upstreamDetails, Exception? innerException = null)
        : base(
            provider,
            "provider_request_failed",
            BuildMessage(upstreamDetails),
            innerException)
    {
    }

    private static string BuildMessage(string? upstreamDetails) => string.IsNullOrWhiteSpace(upstreamDetails)
        ? "The upstream provider rejected the request."
        : $"The upstream provider rejected the request: {upstreamDetails}";
}

public sealed class ProviderUnavailableException(string provider, Exception? innerException = null)
    : ProviderException(provider, "provider_unavailable", "The upstream provider is unavailable.", innerException)
{
}

internal static class ProviderErrorDetails
{
    private const int MaxLength = 500;

    public static async Task<string?> ReadAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(body))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(body);
            if (document.RootElement.TryGetProperty("error", out var error) &&
                error.ValueKind == JsonValueKind.Object &&
                error.TryGetProperty("message", out var message) &&
                message.ValueKind == JsonValueKind.String)
            {
                body = message.GetString() ?? body;
            }
        }
        catch (JsonException)
        {
            // Keep a bounded plain-text response when the provider does not return JSON.
        }

        var normalized = string.Join(' ', body.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return normalized.Length <= MaxLength ? normalized : normalized[..MaxLength] + "…";
    }
}
