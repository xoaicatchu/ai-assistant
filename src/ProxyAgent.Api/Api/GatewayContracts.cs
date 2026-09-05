using System.Text.Json;
using ProxyAgent.Api.Chat;

namespace ProxyAgent.Api.Api;

public sealed class GatewayChatRequest
{
    public string? Model { get; init; }
    public List<GatewayMessage> Messages { get; init; } = [];
    public bool Stream { get; init; }
    public double? Temperature { get; init; }
    public int? MaxTokens { get; init; }
    public List<GatewayTool> Tools { get; init; } = [];
    public string? ToolChoice { get; init; }
}

public sealed class GatewayMessage
{
    public string Role { get; init; } = string.Empty;
    public JsonElement? Content { get; init; }
    public List<GatewayToolCall> ToolCalls { get; init; } = [];
    public string? ToolCallId { get; init; }
    public string? Name { get; init; }
}

public sealed class GatewayTool
{
    public string Name { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public JsonElement Parameters { get; init; }
}

public sealed class GatewayToolCall
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string ArgumentsJson { get; init; } = "{}";
}

public sealed class GatewayChatResponse
{
    public string Id { get; init; } = string.Empty;
    public string Provider { get; init; } = string.Empty;
    public string Model { get; init; } = string.Empty;
    public GatewayMessage Message { get; init; } = new();
    public string FinishReason { get; init; } = "stop";
    public UsageInfo? Usage { get; init; }
}

public static class GatewayContractMapper
{
    private static readonly HashSet<string> AllowedRoles = ["system", "user", "assistant", "tool"];

    public static NormalizedChatRequest ToNormalized(GatewayChatRequest request)
    {
        ValidateMessages(request.Messages.Select(message => message.Role));
        return new NormalizedChatRequest
        {
            Model = request.Model,
            Stream = request.Stream,
            Temperature = request.Temperature,
            MaxTokens = request.MaxTokens,
            ToolChoice = request.ToolChoice,
            Messages = request.Messages.Select(message => new ChatMessage
            {
                Role = message.Role,
                Content = message.Content is { ValueKind: JsonValueKind.String } content ? content.GetString() : null,
                ContentParts = MapContentParts(message.Content),
                ToolCallId = message.ToolCallId,
                Name = message.Name,
                ToolCalls = message.ToolCalls.Select(call => new ChatToolCall
                {
                    Id = call.Id,
                    Name = call.Name,
                    ArgumentsJson = call.ArgumentsJson
                }).ToArray()
            }).ToArray(),
            Tools = request.Tools.Select(tool => new ChatTool
            {
                Name = tool.Name,
                Description = tool.Description,
                Parameters = tool.Parameters
            }).ToArray()
        };
    }

    public static GatewayChatResponse FromNormalized(NormalizedChatResponse response) => new()
    {
        Id = response.Id,
        Provider = response.Provider,
        Model = response.Model,
        FinishReason = response.FinishReason,
        Usage = response.Usage,
        Message = new GatewayMessage
        {
            Role = response.Message.Role,
            Content = response.Message.Content is null
                ? null
                : JsonSerializer.SerializeToElement(response.Message.Content),
            ToolCallId = response.Message.ToolCallId,
            Name = response.Message.Name,
            ToolCalls = response.Message.ToolCalls.Select(call => new GatewayToolCall
            {
                Id = call.Id,
                Name = call.Name,
                ArgumentsJson = call.ArgumentsJson
            }).ToList()
        }
    };

    private static void ValidateMessages(IEnumerable<string> roles)
    {
        var roleList = roles.ToArray();
        if (roleList.Length == 0)
        {
            throw new ApiValidationException("Messages must contain at least one item.");
        }

        if (roleList.Any(role => !AllowedRoles.Contains(role.ToLowerInvariant())))
        {
            throw new ApiValidationException("Message roles must be system, user, assistant, or tool.");
        }
    }

    private static IReadOnlyList<ChatContentPart> MapContentParts(JsonElement? content)
    {
        if (content is not { ValueKind: JsonValueKind.Array })
        {
            return [];
        }

        return content.Value.EnumerateArray().Select(part =>
        {
            var type = part.TryGetProperty("type", out var typeElement)
                ? typeElement.GetString() ?? string.Empty
                : string.Empty;
            return type switch
            {
                "text" => new ChatContentPart
                {
                    Type = type,
                    Text = part.TryGetProperty("text", out var text) ? text.GetString() : null
                },
                "image_url" => new ChatContentPart
                {
                    Type = type,
                    ImageUrl = ReadImageUrl(part)
                },
                _ => throw new ApiValidationException($"Unsupported content part type '{type}'.")
            };
        }).ToArray();
    }

    private static string ReadImageUrl(JsonElement part)
    {
        if (!part.TryGetProperty("image_url", out var image) ||
            !image.TryGetProperty("url", out var url) ||
            url.ValueKind != JsonValueKind.String ||
            string.IsNullOrWhiteSpace(url.GetString()))
        {
            throw new ApiValidationException("Image content part must include image_url.url.");
        }

        var imageUrl = url.GetString()!;
        if (imageUrl.StartsWith("data:", StringComparison.OrdinalIgnoreCase) &&
            imageUrl.Length > ChatContentLimits.MaxImageDataUrlLength)
        {
            throw new ApiValidationException("Image data URL must not exceed 5 MB.");
        }

        return imageUrl;
    }
}
