using Microsoft.Extensions.Options;
using ProxyAgent.Api.Chat;

namespace ProxyAgent.Api.Tests.Chat;

public sealed class ModelSelectorTests
{
    [Fact]
    public void Select_strips_openai_prefix()
    {
        var selector = CreateSelector(defaultProvider: "anthropic");

        var result = selector.Select("openai:gpt-test");

        Assert.Equal("openai", result.Provider);
        Assert.Equal("gpt-test", result.Model);
    }

    [Fact]
    public void Select_strips_anthropic_prefix()
    {
        var selector = CreateSelector();

        var result = selector.Select("anthropic:claude-test");

        Assert.Equal("anthropic", result.Provider);
        Assert.Equal("claude-test", result.Model);
    }

    [Fact]
    public void Select_uses_configured_default_model_for_empty_input()
    {
        var selector = CreateSelector(defaultProvider: "anthropic", anthropicDefault: "claude-test");

        var result = selector.Select(null);

        Assert.Equal("anthropic", result.Provider);
        Assert.Equal("claude-test", result.Model);
    }

    [Fact]
    public void Select_rejects_unknown_provider_prefix()
    {
        var selector = CreateSelector();

        var error = Assert.Throws<UnsupportedProviderException>(() => selector.Select("local:model"));

        Assert.Equal("unsupported_provider", error.Code);
    }

    private static ModelSelector CreateSelector(
        string defaultProvider = "openai",
        string openAiDefault = "gpt-default",
        string anthropicDefault = "claude-default")
    {
        var providers = new ProvidersOptions
        {
            OpenAI = new ProviderOptions { DefaultModel = openAiDefault },
            Anthropic = new ProviderOptions { DefaultModel = anthropicDefault }
        };

        return new ModelSelector(
            Options.Create(new RoutingOptions { DefaultProvider = defaultProvider }),
            Options.Create(providers));
    }
}
