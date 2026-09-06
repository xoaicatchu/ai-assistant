using Microsoft.Extensions.Options;
using ProxyAgent.Api.Api;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Storage;
using ProxyAgent.Api.WebSearch;

namespace ProxyAgent.Api.Settings;

public sealed record BackendSettingsSnapshot(
    ProvidersOptions Providers,
    WebSearchOptions WebSearch);

public interface IBackendSettings
{
    BackendSettingsSnapshot Current { get; }
    void Save(BackendSettingsOverrides overrides);
}

public sealed class BackendSettingsService : IBackendSettings
{
    private static readonly TimeSpan RefreshInterval = TimeSpan.FromSeconds(5);
    private readonly object gate = new();
    private readonly IBackendSettingsStore store;
    private readonly ProvidersOptions defaultsProviders;
    private readonly WebSearchOptions defaultsWebSearch;
    private BackendSettingsSnapshot current;
    private DateTimeOffset lastRefreshUtc;

    public BackendSettingsService(
        IOptions<ProvidersOptions> providers,
        IOptions<WebSearchOptions> webSearch,
        IBackendSettingsStore store)
    {
        this.store = store;
        defaultsProviders = Clone(providers.Value);
        defaultsWebSearch = Clone(webSearch.Value);
        current = Apply(defaultsProviders, defaultsWebSearch, store.Get());
        lastRefreshUtc = DateTimeOffset.UtcNow;
    }

    public BackendSettingsSnapshot Current
    {
        get
        {
            lock (gate)
            {
                RefreshIfStale();
                return current;
            }
        }
    }

    public void Save(BackendSettingsOverrides overrides)
    {
        var next = Apply(defaultsProviders, defaultsWebSearch, overrides);
        store.Save(overrides);
        lock (gate)
        {
            current = next;
            lastRefreshUtc = DateTimeOffset.UtcNow;
        }
    }

    private void RefreshIfStale()
    {
        if (DateTimeOffset.UtcNow - lastRefreshUtc < RefreshInterval)
        {
            return;
        }

        try
        {
            current = Apply(defaultsProviders, defaultsWebSearch, store.Get());
        }
        catch
        {
            // Keep the last known-good settings when another instance/database connection is
            // temporarily unavailable. The next access will retry after the interval.
        }
        finally
        {
            lastRefreshUtc = DateTimeOffset.UtcNow;
        }
    }

    private static BackendSettingsSnapshot Apply(
        ProvidersOptions providers,
        WebSearchOptions webSearch,
        BackendSettingsOverrides? overrides)
    {
        var nextProviders = Clone(providers);
        var nextWebSearch = Clone(webSearch);

        if (overrides?.OpenAI is not null)
        {
            Apply(nextProviders.OpenAI, overrides.OpenAI);
        }

        if (overrides?.Anthropic is not null)
        {
            Apply(nextProviders.Anthropic, overrides.Anthropic);
        }

        if (overrides?.WebSearch is not null)
        {
            var value = overrides.WebSearch;
            nextWebSearch.Enabled = value.Enabled ?? nextWebSearch.Enabled;
            nextWebSearch.UseToolCalling = value.UseToolCalling ?? nextWebSearch.UseToolCalling;
            nextWebSearch.BaseUrl = value.BaseUrl ?? nextWebSearch.BaseUrl;
            nextWebSearch.ApiKey = value.ApiKey ?? nextWebSearch.ApiKey;
            nextWebSearch.MaxResults = value.MaxResults ?? nextWebSearch.MaxResults;
            nextWebSearch.TimeoutSeconds = value.TimeoutSeconds ?? nextWebSearch.TimeoutSeconds;
        }

        return new BackendSettingsSnapshot(nextProviders, nextWebSearch);
    }

    private static void Apply(ProviderOptions target, ProviderSettingsOverride value)
    {
        target.BaseUrl = value.BaseUrl ?? target.BaseUrl;
        target.ApiKey = value.ApiKey ?? target.ApiKey;
        target.DefaultModel = value.DefaultModel ?? target.DefaultModel;
        target.ApiVersion = value.ApiVersion ?? target.ApiVersion;
    }

    private static ProvidersOptions Clone(ProvidersOptions source) => new()
    {
        OpenAI = Clone(source.OpenAI),
        Anthropic = Clone(source.Anthropic)
    };

    private static ProviderOptions Clone(ProviderOptions source) => new()
    {
        BaseUrl = source.BaseUrl,
        ApiKey = source.ApiKey,
        DefaultModel = source.DefaultModel,
        ApiVersion = source.ApiVersion
    };

    private static WebSearchOptions Clone(WebSearchOptions source) => new()
    {
        Enabled = source.Enabled,
        UseToolCalling = source.UseToolCalling,
        ApiKey = source.ApiKey,
        BaseUrl = source.BaseUrl,
        SearchDepth = source.SearchDepth,
        MaxResults = source.MaxResults,
        TimeoutSeconds = source.TimeoutSeconds,
        MaxToolCalls = source.MaxToolCalls,
        MaxContentCharsPerResult = source.MaxContentCharsPerResult
    };
}
