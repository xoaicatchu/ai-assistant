namespace ProxyAgent.Api.Providers;

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

public sealed class ProviderRequestException(string provider)
    : ProviderException(provider, "provider_request_failed", "The upstream provider rejected the request.")
{
}

public sealed class ProviderUnavailableException(string provider, Exception? innerException = null)
    : ProviderException(provider, "provider_unavailable", "The upstream provider is unavailable.", innerException)
{
}
