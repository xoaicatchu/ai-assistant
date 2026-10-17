using Microsoft.Extensions.Options;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Settings;

namespace ProxyAgent.Api.Providers;

public sealed class NvidiaProvider : OpenAiProvider
{
    public NvidiaProvider(HttpClient httpClient, IOptions<ProviderOptions> options)
        : base(httpClient, options)
    {
    }

    public NvidiaProvider(HttpClient httpClient, IBackendSettings backendSettings)
        : base(httpClient, () => backendSettings.Current.Providers.Nvidia)
    {
    }

    public override string Name => "nvidia";
}
