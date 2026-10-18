using Microsoft.Extensions.Options;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Settings;

namespace ProxyAgent.Api.Providers;

public sealed class XaiProvider : OpenAiProvider
{
    public XaiProvider(HttpClient httpClient, IOptions<ProviderOptions> options)
        : base(httpClient, options)
    {
    }

    public XaiProvider(HttpClient httpClient, IBackendSettings backendSettings)
        : base(httpClient, () => backendSettings.Current.Providers.XAI)
    {
    }

    public override string Name => "xai";
}
