using Microsoft.Extensions.Options;
using ProxyAgent.Api.Api;
using ProxyAgent.Api.WebSearch;

namespace ProxyAgent.Api.Chat;

public sealed class ChatPromptAgent(
    WebSearchAgent webSearchAgent,
    ChatOrchestrator chatOrchestrator,
    IOptions<ChatPromptOptions> options)
{
    private readonly ChatPromptOptions settings = options.Value;

    public Task<NormalizedChatResponse> CompleteAsync(
        NormalizedChatRequest request,
        CancellationToken cancellationToken)
    {
        ValidateCapabilities(request);
        return webSearchAgent.CompleteAsync(Prepare(request), cancellationToken);
    }

    public IAsyncEnumerable<ChatStreamEvent> StreamAsync(
        NormalizedChatRequest request,
        CancellationToken cancellationToken)
    {
        ValidateCapabilities(request);
        return webSearchAgent.StreamAsync(Prepare(request), cancellationToken);
    }

    private void ValidateCapabilities(NormalizedChatRequest request)
    {
        var capabilities = chatOrchestrator.CapabilitiesFor(request.Model);
        var hasImage = request.Messages.Any(message =>
            message.ContentParts.Any(part => part.Type.Equals("image_url", StringComparison.OrdinalIgnoreCase)));
        if (hasImage && capabilities.Vision == ModelCapabilitySupport.Unsupported)
        {
            throw new ApiValidationException("The selected model does not support image input.");
        }
    }

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
