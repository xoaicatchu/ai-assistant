using Microsoft.Extensions.Options;
using ProxyAgent.Api.Api;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Settings;
using ProxyAgent.Api.Storage;
using ProxyAgent.Api.WebSearch;

namespace ProxyAgent.Api.Tests.Settings;

public sealed class BackendSettingsServiceTests
{
    [Fact]
    public void Uses_environment_defaults_when_persistence_is_unavailable_at_startup()
    {
        var service = new BackendSettingsService(
            Options.Create(new ProvidersOptions
            {
                OpenAI = new ProviderOptions
                {
                    BaseUrl = "https://gateway.example.com/v1",
                    ApiKey = "environment-key",
                    DefaultModel = "grok-4.6"
                }
            }),
            Options.Create(new WebSearchOptions
            {
                Enabled = false,
                ApiKey = "environment-search-key"
            }),
            new UnavailableSettingsStore());

        var current = service.Current;

        Assert.Equal("https://gateway.example.com/v1", current.Providers.OpenAI.BaseUrl);
        Assert.Equal("environment-key", current.Providers.OpenAI.ApiKey);
        Assert.Equal("grok-4.6", current.Providers.OpenAI.DefaultModel);
        Assert.False(current.WebSearch.Enabled);
        Assert.Equal("environment-search-key", current.WebSearch.ApiKey);
    }

    [Fact]
    public void Applies_nvidia_overrides_correctly()
    {
        var store = new MemorySettingsStore();
        var service = new BackendSettingsService(
            Options.Create(new ProvidersOptions
            {
                Nvidia = new ProviderOptions
                {
                    BaseUrl = "https://integrate.api.nvidia.com/v1",
                    ApiKey = "",
                    DefaultModel = "meta/llama-3.2-11b-vision-instruct"
                }
            }),
            Options.Create(new WebSearchOptions()),
            store);

        service.Save(new BackendSettingsOverrides(
            OpenAI: null,
            Anthropic: null,
            WebSearch: null,
            Nvidia: new ProviderSettingsOverride("https://override.nvidia.com/v1", "new-nv-key", "new-model", "v1")));

        var current = service.Current;
        Assert.Equal("https://override.nvidia.com/v1", current.Providers.Nvidia.BaseUrl);
        Assert.Equal("new-nv-key", current.Providers.Nvidia.ApiKey);
        Assert.Equal("new-model", current.Providers.Nvidia.DefaultModel);
    }

    [Fact]
    public void Applies_xai_overrides_correctly()
    {
        var store = new MemorySettingsStore();
        var service = new BackendSettingsService(
            Options.Create(new ProvidersOptions
            {
                XAI = new ProviderOptions
                {
                    BaseUrl = "https://api.x.ai/v1",
                    ApiKey = "",
                    DefaultModel = "grok-2-latest"
                }
            }),
            Options.Create(new WebSearchOptions()),
            store);

        service.Save(new BackendSettingsOverrides(
            OpenAI: null,
            Anthropic: null,
            WebSearch: null,
            Nvidia: null,
            XAI: new ProviderSettingsOverride("https://override.x.ai/v1", "new-xai-key", "grok-beta", "v1")));

        var current = service.Current;
        Assert.Equal("https://override.x.ai/v1", current.Providers.XAI.BaseUrl);
        Assert.Equal("new-xai-key", current.Providers.XAI.ApiKey);
        Assert.Equal("grok-beta", current.Providers.XAI.DefaultModel);
    }

    [Fact]
    public void Applies_groq_overrides_correctly()
    {
        var store = new MemorySettingsStore();
        var service = new BackendSettingsService(
            Options.Create(new ProvidersOptions
            {
                Groq = new ProviderOptions
                {
                    BaseUrl = "https://api.groq.com/openai/v1",
                    ApiKey = "",
                    DefaultModel = "openai/gpt-oss-120b"
                }
            }),
            Options.Create(new WebSearchOptions()),
            store);

        service.Save(new BackendSettingsOverrides(
            OpenAI: null,
            Anthropic: null,
            WebSearch: null,
            Nvidia: null,
            XAI: null,
            Groq: new ProviderSettingsOverride("https://override.groq.com/v1", "new-groq-key", "new-groq-model", "v1")));

        var current = service.Current;
        Assert.Equal("https://override.groq.com/v1", current.Providers.Groq.BaseUrl);
        Assert.Equal("new-groq-key", current.Providers.Groq.ApiKey);
        Assert.Equal("new-groq-model", current.Providers.Groq.DefaultModel);
    }

    private sealed class MemorySettingsStore : IBackendSettingsStore
    {
        private BackendSettingsOverrides? saved;
        public BackendSettingsOverrides? Get() => saved;
        public void Save(BackendSettingsOverrides settings) => saved = settings;
    }

    private sealed class UnavailableSettingsStore : IBackendSettingsStore
    {
        public BackendSettingsOverrides? Get() => throw new InvalidOperationException("database unavailable");

        public void Save(BackendSettingsOverrides settings) => throw new InvalidOperationException("database unavailable");
    }
}
