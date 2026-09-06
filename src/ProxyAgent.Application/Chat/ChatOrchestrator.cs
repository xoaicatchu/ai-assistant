using ProxyAgent.Api.Providers;

namespace ProxyAgent.Api.Chat;

public sealed class ChatOrchestrator(IModelSelector modelSelector, IEnumerable<IChatProvider> providers)
{
    private readonly IReadOnlyDictionary<string, IChatProvider> providerMap = providers
        .ToDictionary(provider => provider.Name, StringComparer.OrdinalIgnoreCase);

    public Task<NormalizedChatResponse> CompleteAsync(NormalizedChatRequest request, CancellationToken cancellationToken)
    {
        var (provider, selection) = Resolve(request.Model);
        return provider.CompleteAsync(request, selection, cancellationToken);
    }

    public IAsyncEnumerable<ChatStreamEvent> StreamAsync(NormalizedChatRequest request, CancellationToken cancellationToken)
    {
        var (provider, selection) = Resolve(request.Model);
        return provider.StreamAsync(request, selection, cancellationToken);
    }

    public ModelCapabilities CapabilitiesFor(string? model) =>
        ModelCapabilityCatalog.For(modelSelector.Select(model).Model);

    private (IChatProvider Provider, ProviderSelection Selection) Resolve(string? model)
    {
        var selection = modelSelector.Select(model);
        if (!providerMap.TryGetValue(selection.Provider, out var provider))
        {
            throw new ProviderNotConfiguredException(selection.Provider);
        }

        return (provider, selection);
    }
}
