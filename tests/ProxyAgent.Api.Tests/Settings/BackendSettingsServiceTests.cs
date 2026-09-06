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

    private sealed class UnavailableSettingsStore : IBackendSettingsStore
    {
        public BackendSettingsOverrides? Get() => throw new InvalidOperationException("database unavailable");

        public void Save(BackendSettingsOverrides settings) => throw new InvalidOperationException("database unavailable");
    }
}
