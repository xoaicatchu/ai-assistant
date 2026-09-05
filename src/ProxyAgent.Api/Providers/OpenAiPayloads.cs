using System.Text.Json;
using System.Text.Json.Serialization;

namespace ProxyAgent.Api.Providers;

internal sealed class OpenAiChatRequest
{
    [JsonPropertyName("model")] public string Model { get; init; } = string.Empty;
    [JsonPropertyName("messages")] public IReadOnlyList<OpenAiMessage> Messages { get; init; } = [];
    [JsonPropertyName("stream")] public bool Stream { get; init; }
    [JsonPropertyName("temperature")] public double? Temperature { get; init; }
    [JsonPropertyName("max_tokens")] public int? MaxTokens { get; init; }
    [JsonPropertyName("tools")] public IReadOnlyList<OpenAiTool>? Tools { get; init; }
    [JsonPropertyName("tool_choice")] public string? ToolChoice { get; init; }
}

internal sealed class OpenAiMessage
{
    [JsonPropertyName("role")] public string Role { get; init; } = string.Empty;
    [JsonPropertyName("content")] public string? Content { get; init; }
    [JsonPropertyName("tool_calls")] public IReadOnlyList<OpenAiToolCall>? ToolCalls { get; init; }
    [JsonPropertyName("tool_call_id")] public string? ToolCallId { get; init; }
    [JsonPropertyName("name")] public string? Name { get; init; }
}

internal sealed class OpenAiTool
{
    [JsonPropertyName("type")] public string Type { get; init; } = "function";
    [JsonPropertyName("function")] public OpenAiFunction Function { get; init; } = new();
}

internal sealed class OpenAiFunction
{
    [JsonPropertyName("name")] public string Name { get; init; } = string.Empty;
    [JsonPropertyName("description")] public string Description { get; init; } = string.Empty;
    [JsonPropertyName("parameters")] public JsonElement Parameters { get; init; }
}

internal sealed class OpenAiToolCall
{
    [JsonPropertyName("id")] public string Id { get; init; } = string.Empty;
    [JsonPropertyName("type")] public string Type { get; init; } = "function";
    [JsonPropertyName("function")] public OpenAiFunctionCall Function { get; init; } = new();
}

internal sealed class OpenAiFunctionCall
{
    [JsonPropertyName("name")] public string Name { get; init; } = string.Empty;
    [JsonPropertyName("arguments")] public string Arguments { get; init; } = "{}";
}

internal sealed class OpenAiChatResponse
{
    [JsonPropertyName("id")] public string Id { get; init; } = string.Empty;
    [JsonPropertyName("model")] public string Model { get; init; } = string.Empty;
    [JsonPropertyName("choices")] public IReadOnlyList<OpenAiChoice> Choices { get; init; } = [];
    [JsonPropertyName("usage")] public OpenAiUsage? Usage { get; init; }
}

internal sealed class OpenAiChoice
{
    [JsonPropertyName("finish_reason")] public string? FinishReason { get; init; }
    [JsonPropertyName("message")] public OpenAiMessage? Message { get; init; }
}

internal sealed class OpenAiUsage
{
    [JsonPropertyName("prompt_tokens")] public int PromptTokens { get; init; }
    [JsonPropertyName("completion_tokens")] public int CompletionTokens { get; init; }
}
