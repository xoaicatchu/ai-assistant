using Microsoft.Extensions.Options;
using ProxyAgent.Api.Settings;

namespace ProxyAgent.Api.Chat;

public sealed class RoutingOptions
{
    public string DefaultProvider { get; set; } = "openai";
}

public sealed class ProvidersOptions
{
    public ProviderOptions OpenAI { get; set; } = new();
    public ProviderOptions Anthropic { get; set; } = new();
    public ProviderOptions Nvidia { get; set; } = new() { DefaultModel = "meta/llama-3.2-11b-vision-instruct" };
    public ProviderOptions XAI { get; set; } = new() { DefaultModel = "grok-2-latest" };
    public ProviderOptions Groq { get; set; } = new() { DefaultModel = "openai/gpt-oss-120b" };

    public ProviderOptions Get(string provider) => provider.ToLowerInvariant() switch
    {
        "openai" => OpenAI,
        "anthropic" => Anthropic,
        "nvidia" => Nvidia,
        "xai" or "grok" => XAI,
        "groq" => Groq,
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

public sealed class ModelSelector : IModelSelector
{
    private readonly IOptions<RoutingOptions> routingOptions;
    private readonly Func<ProvidersOptions> getProviders;

    public ModelSelector(
        IOptions<RoutingOptions> routingOptions,
        IOptions<ProvidersOptions> providersOptions)
    {
        this.routingOptions = routingOptions;
        getProviders = () => providersOptions.Value;
    }

    public ModelSelector(
        IOptions<RoutingOptions> routingOptions,
        IBackendSettings backendSettings)
    {
        this.routingOptions = routingOptions;
        getProviders = () => backendSettings.Current.Providers;
    }

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
            else if (value.StartsWith("openai/gpt-oss", StringComparison.OrdinalIgnoreCase) ||
                     value.StartsWith("gpt-oss", StringComparison.OrdinalIgnoreCase) ||
                     value.StartsWith("deepseek", StringComparison.OrdinalIgnoreCase))
            {
                provider = "groq";
                if (value.StartsWith("deepseek", StringComparison.OrdinalIgnoreCase))
                {
                    model = null;
                }
            }
            else if (value.StartsWith("x-ai/", StringComparison.OrdinalIgnoreCase) ||
                     value.StartsWith("xai/", StringComparison.OrdinalIgnoreCase))
            {
                provider = "xai";
                model = null;
            }
            else if (value.StartsWith("meta/", StringComparison.OrdinalIgnoreCase) ||
                     value.StartsWith("nvidia/", StringComparison.OrdinalIgnoreCase))
            {
                provider = "nvidia";
                if (value.StartsWith("nvidia/", StringComparison.OrdinalIgnoreCase))
                {
                    model = value["nvidia/".Length..];
                }
            }
        }

        if (provider is "grok")
        {
            provider = "xai";
        }

        var settings = getProviders().Get(provider);
        if (string.IsNullOrWhiteSpace(model) ||
            (provider is "xai" && model.StartsWith("x-ai/", StringComparison.OrdinalIgnoreCase)) ||
            (provider is "groq" && model.StartsWith("deepseek", StringComparison.OrdinalIgnoreCase)))
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
