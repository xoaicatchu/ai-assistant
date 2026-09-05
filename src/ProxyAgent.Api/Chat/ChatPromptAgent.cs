using Microsoft.Extensions.Options;
using ProxyAgent.Api.WebSearch;

namespace ProxyAgent.Api.Chat;

public sealed class ChatPromptAgent(
    WebSearchAgent webSearchAgent,
    IOptions<ChatPromptOptions> options)
{
    private readonly ChatPromptOptions settings = options.Value;

    public Task<NormalizedChatResponse> CompleteAsync(
        NormalizedChatRequest request,
        CancellationToken cancellationToken) =>
        webSearchAgent.CompleteAsync(Prepare(request), cancellationToken);

    public IAsyncEnumerable<ChatStreamEvent> StreamAsync(
        NormalizedChatRequest request,
        CancellationToken cancellationToken) =>
        webSearchAgent.StreamAsync(Prepare(request), cancellationToken);

    private NormalizedChatRequest Prepare(NormalizedChatRequest request)
    {
        if (string.IsNullOrWhiteSpace(settings.SystemPrompt))
        {
            return request;
        }

        return request with
        {
            Messages = request.Messages.Prepend(new ChatMessage
            {
                Role = "system",
                Content = settings.SystemPrompt.Trim()
            }).ToArray()
        };
    }
}
