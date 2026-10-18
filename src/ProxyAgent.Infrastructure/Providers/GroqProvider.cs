using Microsoft.Extensions.Options;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Settings;

namespace ProxyAgent.Api.Providers;

public sealed class GroqProvider : OpenAiProvider
{
    public GroqProvider(HttpClient httpClient, IOptions<ProviderOptions> options)
        : base(httpClient, options)
    {
    }

    public GroqProvider(HttpClient httpClient, IBackendSettings backendSettings)
        : base(httpClient, () => backendSettings.Current.Providers.Groq)
    {
    }

    public override string Name => "groq";
}
