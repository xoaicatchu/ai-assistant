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
    public void Select_strips_nvidia_prefix()
    {
        var selector = CreateSelector();

        var result = selector.Select("nvidia:meta/llama-3.2-11b-vision-instruct");

        Assert.Equal("nvidia", result.Provider);
        Assert.Equal("meta/llama-3.2-11b-vision-instruct", result.Model);
    }

    [Fact]
    public void Select_uses_configured_default_model_for_empty_input_when_nvidia_is_default()
    {
        var selector = CreateSelector(defaultProvider: "nvidia", nvidiaDefault: "meta/llama-3.2-11b-vision-instruct");

        var result = selector.Select(null);

        Assert.Equal("nvidia", result.Provider);
        Assert.Equal("meta/llama-3.2-11b-vision-instruct", result.Model);
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
        string anthropicDefault = "claude-default",
        string nvidiaDefault = "nvidia-default")
    {
        var providers = new ProvidersOptions
        {
            OpenAI = new ProviderOptions { DefaultModel = openAiDefault },
            Anthropic = new ProviderOptions { DefaultModel = anthropicDefault },
            Nvidia = new ProviderOptions { DefaultModel = nvidiaDefault }
        };

        return new ModelSelector(
            Options.Create(new RoutingOptions { DefaultProvider = defaultProvider }),
            Options.Create(providers));
    }
}
