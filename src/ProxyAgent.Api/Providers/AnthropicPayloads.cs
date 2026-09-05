using System.Text.Json;
using System.Text.Json.Serialization;

namespace ProxyAgent.Api.Providers;

internal sealed class AnthropicRequest
{
    [JsonPropertyName("model")] public string Model { get; init; } = string.Empty;
    [JsonPropertyName("max_tokens")] public int MaxTokens { get; init; }
    [JsonPropertyName("system")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? System { get; init; }
    [JsonPropertyName("messages")] public IReadOnlyList<AnthropicMessage> Messages { get; init; } = [];
    [JsonPropertyName("stream")] public bool Stream { get; init; }
    [JsonPropertyName("temperature")] public double? Temperature { get; init; }
    [JsonPropertyName("tools")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public IReadOnlyList<AnthropicTool>? Tools { get; init; }
    [JsonPropertyName("tool_choice")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public AnthropicToolChoice? ToolChoice { get; init; }
}

internal sealed class AnthropicMessage
{
    [JsonPropertyName("role")] public string Role { get; init; } = string.Empty;
    [JsonPropertyName("content")] public IReadOnlyList<AnthropicContentBlock> Content { get; init; } = [];
}

internal sealed class AnthropicContentBlock
{
    [JsonPropertyName("type")] public string Type { get; init; } = string.Empty;
    [JsonPropertyName("text")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Text { get; init; }
    [JsonPropertyName("id")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Id { get; init; }
    [JsonPropertyName("name")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Name { get; init; }
    [JsonPropertyName("input")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public JsonElement Input { get; init; }
    [JsonPropertyName("tool_use_id")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? ToolUseId { get; init; }
    [JsonPropertyName("content")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Content { get; init; }
}

internal sealed class AnthropicTool
{
    [JsonPropertyName("name")] public string Name { get; init; } = string.Empty;
    [JsonPropertyName("description")] public string Description { get; init; } = string.Empty;
    [JsonPropertyName("input_schema")] public JsonElement InputSchema { get; init; }
}

internal sealed class AnthropicToolChoice
{
    [JsonPropertyName("type")] public string Type { get; init; } = "auto";
}

internal sealed class AnthropicResponse
{
    [JsonPropertyName("id")] public string Id { get; init; } = string.Empty;
    [JsonPropertyName("model")] public string Model { get; init; } = string.Empty;
    [JsonPropertyName("content")] public IReadOnlyList<AnthropicContentBlock> Content { get; init; } = [];
    [JsonPropertyName("stop_reason")] public string? StopReason { get; init; }
    [JsonPropertyName("usage")] public AnthropicUsage? Usage { get; init; }
}

internal sealed class AnthropicUsage
{
    [JsonPropertyName("input_tokens")] public int InputTokens { get; init; }
    [JsonPropertyName("output_tokens")] public int OutputTokens { get; init; }
}
