using System.Text.Json;
using System.Text.Json.Serialization;
using ProxyAgent.Api.Chat;

namespace ProxyAgent.Api.Api;

public sealed class OpenAiChatRequest
{
    [JsonPropertyName("model")] public string? Model { get; init; }
    [JsonPropertyName("messages")] public List<OpenAiRequestMessage> Messages { get; init; } = [];
    [JsonPropertyName("stream")] public bool Stream { get; init; }
    [JsonPropertyName("temperature")] public double? Temperature { get; init; }
    [JsonPropertyName("max_tokens")] public int? MaxTokens { get; init; }
    [JsonPropertyName("tools")] public List<OpenAiRequestTool> Tools { get; init; } = [];
    [JsonPropertyName("tool_choice")] public JsonElement? ToolChoice { get; init; }
}

public sealed class OpenAiRequestMessage
{
    [JsonPropertyName("role")] public string Role { get; init; } = string.Empty;
    [JsonPropertyName("content")] public string? Content { get; init; }
    [JsonPropertyName("tool_calls")] public List<OpenAiRequestToolCall> ToolCalls { get; init; } = [];
    [JsonPropertyName("tool_call_id")] public string? ToolCallId { get; init; }
    [JsonPropertyName("name")] public string? Name { get; init; }
}

public sealed class OpenAiRequestTool
{
    [JsonPropertyName("type")] public string Type { get; init; } = "function";
    [JsonPropertyName("function")] public OpenAiRequestFunction Function { get; init; } = new();
}

public sealed class OpenAiRequestFunction
{
    [JsonPropertyName("name")] public string Name { get; init; } = string.Empty;
    [JsonPropertyName("description")] public string Description { get; init; } = string.Empty;
    [JsonPropertyName("parameters")] public JsonElement Parameters { get; init; }
}

public sealed class OpenAiRequestToolCall
{
    [JsonPropertyName("id")] public string Id { get; init; } = string.Empty;
    [JsonPropertyName("type")] public string Type { get; init; } = "function";
    [JsonPropertyName("function")] public OpenAiRequestFunctionCall Function { get; init; } = new();
}

public sealed class OpenAiRequestFunctionCall
{
    [JsonPropertyName("name")] public string Name { get; init; } = string.Empty;
    [JsonPropertyName("arguments")] public string Arguments { get; init; } = "{}";
}

public sealed class OpenAiChatResponse
{
    [JsonPropertyName("id")] public string Id { get; init; } = string.Empty;
    [JsonPropertyName("object")] public string Object { get; init; } = "chat.completion";
    [JsonPropertyName("created")] public long Created { get; init; }
    [JsonPropertyName("model")] public string Model { get; init; } = string.Empty;
    [JsonPropertyName("choices")] public IReadOnlyList<OpenAiResponseChoice> Choices { get; init; } = [];
    [JsonPropertyName("usage")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public UsageInfo? Usage { get; init; }
}

public sealed class OpenAiResponseChoice
{
    [JsonPropertyName("index")] public int Index { get; init; }
    [JsonPropertyName("message")] public OpenAiResponseMessage Message { get; init; } = new();
    [JsonPropertyName("finish_reason")] public string FinishReason { get; init; } = "stop";
}

public sealed class OpenAiResponseMessage
{
    [JsonPropertyName("role")] public string Role { get; init; } = "assistant";
    [JsonPropertyName("content")] public string? Content { get; init; }
    [JsonPropertyName("tool_calls")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public IReadOnlyList<OpenAiResponseToolCall>? ToolCalls { get; init; }
}

public sealed class OpenAiResponseToolCall
{
    [JsonPropertyName("id")] public string Id { get; init; } = string.Empty;
    [JsonPropertyName("type")] public string Type { get; init; } = "function";
    [JsonPropertyName("function")] public OpenAiResponseFunctionCall Function { get; init; } = new();
}

public sealed class OpenAiResponseFunctionCall
{
    [JsonPropertyName("name")] public string Name { get; init; } = string.Empty;
    [JsonPropertyName("arguments")] public string Arguments { get; init; } = "{}";
}

public static class OpenAiContractMapper
{
    private static readonly HashSet<string> AllowedRoles = ["system", "user", "assistant", "tool"];

    public static NormalizedChatRequest ToNormalized(OpenAiChatRequest request)
    {
        if (request.Messages.Count == 0)
        {
            throw new ApiValidationException("Messages must contain at least one item.");
        }

        if (request.Messages.Any(message => !AllowedRoles.Contains(message.Role.ToLowerInvariant())))
        {
            throw new ApiValidationException("Message roles must be system, user, assistant, or tool.");
        }

        return new NormalizedChatRequest
        {
            Model = request.Model,
            Stream = request.Stream,
            Temperature = request.Temperature,
            MaxTokens = request.MaxTokens,
            ToolChoice = request.ToolChoice is { ValueKind: JsonValueKind.String } choice ? choice.GetString() : null,
            Messages = request.Messages.Select(message => new ChatMessage
            {
                Role = message.Role,
                Content = message.Content,
                ToolCallId = message.ToolCallId,
                Name = message.Name,
                ToolCalls = message.ToolCalls.Select(call => new ChatToolCall
                {
                    Id = call.Id,
                    Name = call.Function.Name,
                    ArgumentsJson = call.Function.Arguments
                }).ToArray()
            }).ToArray(),
            Tools = request.Tools.Select(tool => new ChatTool
            {
                Name = tool.Function.Name,
                Description = tool.Function.Description,
                Parameters = tool.Function.Parameters
            }).ToArray()
        };
    }

    public static OpenAiChatResponse FromNormalized(NormalizedChatResponse response) => new()
    {
        Id = response.Id,
        Created = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
        Model = response.Model,
        Choices =
        [
            new OpenAiResponseChoice
            {
                Message = new OpenAiResponseMessage
                {
                    Role = response.Message.Role,
                    Content = response.Message.Content,
                    ToolCalls = response.Message.ToolCalls.Count == 0
                        ? null
                        : response.Message.ToolCalls.Select(call => new OpenAiResponseToolCall
                        {
                            Id = call.Id,
                            Function = new OpenAiResponseFunctionCall { Name = call.Name, Arguments = call.ArgumentsJson }
                        }).ToArray()
                },
                FinishReason = response.FinishReason
            }
        ],
        Usage = response.Usage
    };
}
