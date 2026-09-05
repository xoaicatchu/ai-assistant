using Microsoft.Extensions.Options;

namespace ProxyAgent.Api.Chat;

public sealed class RoutingOptions
{
    public string DefaultProvider { get; set; } = "openai";
}

public sealed class ProvidersOptions
{
    public ProviderOptions OpenAI { get; set; } = new();
    public ProviderOptions Anthropic { get; set; } = new();

    public ProviderOptions Get(string provider) => provider.ToLowerInvariant() switch
    {
        "openai" => OpenAI,
        "anthropic" => Anthropic,
        _ => throw new UnsupportedProviderException(provider)
    };
}

public sealed class ProviderOptions
{
    public string BaseUrl { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string DefaultModel { get; set; } = string.Empty;
    public string ApiVersion { get; set; } = "2023-06-01";
}

public sealed record ProviderSelection(string Provider, string Model);

public interface IModelSelector
{
    ProviderSelection Select(string? requestedModel);
}

public sealed class UnsupportedProviderException : Exception
{
    public UnsupportedProviderException(string provider)
        : base($"Unsupported provider '{provider}'.")
    {
        Provider = provider;
    }

    public string Provider { get; }
    public string Code => "unsupported_provider";
}

public sealed class ModelSelector(
    IOptions<RoutingOptions> routingOptions,
    IOptions<ProvidersOptions> providersOptions) : IModelSelector
{
    public ProviderSelection Select(string? requestedModel)
    {
        var value = requestedModel?.Trim();
        var provider = routingOptions.Value.DefaultProvider.Trim().ToLowerInvariant();
        string? model = value;

        if (!string.IsNullOrWhiteSpace(value))
        {
            var separator = value.IndexOf(':');
            if (separator > 0)
            {
                provider = value[..separator].ToLowerInvariant();
                model = value[(separator + 1)..].Trim();
            }
        }

        var settings = providersOptions.Value.Get(provider);
        if (string.IsNullOrWhiteSpace(model))
        {
            model = settings.DefaultModel;
        }

        if (string.IsNullOrWhiteSpace(model))
        {
            throw new InvalidOperationException($"No model configured for provider '{provider}'.");
        }

        return new ProviderSelection(provider, model);
    }
}
