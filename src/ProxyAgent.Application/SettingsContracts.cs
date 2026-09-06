using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Api;
using ProxyAgent.Api.WebSearch;

namespace ProxyAgent.Api.Settings;

public sealed record BackendSettingsSnapshot(ProvidersOptions Providers, WebSearchOptions WebSearch);

public interface IBackendSettings
{
    BackendSettingsSnapshot Current { get; }
    void Save(BackendSettingsOverrides overrides);
}
