using ProxyAgent.Api.Chat;

namespace ProxyAgent.Api.Providers;

public interface IChatProvider
{
    string Name { get; }

    Task<NormalizedChatResponse> CompleteAsync(
        NormalizedChatRequest request,
        ProviderSelection selection,
        CancellationToken cancellationToken);

    IAsyncEnumerable<ChatStreamEvent> StreamAsync(
        NormalizedChatRequest request,
        ProviderSelection selection,
        CancellationToken cancellationToken);
}
