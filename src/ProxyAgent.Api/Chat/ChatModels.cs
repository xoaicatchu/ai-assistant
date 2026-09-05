using System.Text.Json;

namespace ProxyAgent.Api.Chat;

public sealed record NormalizedChatRequest
{
    public string? Model { get; init; }
    public IReadOnlyList<ChatMessage> Messages { get; init; } = [];
    public bool Stream { get; init; }
    public double? Temperature { get; init; }
    public int? MaxTokens { get; init; }
    public IReadOnlyList<ChatTool> Tools { get; init; } = [];
    public string? ToolChoice { get; init; }
}

public sealed record ChatMessage
{
    public string Role { get; init; } = string.Empty;
    public string? Content { get; init; }
    public IReadOnlyList<ChatToolCall> ToolCalls { get; init; } = [];
    public string? ToolCallId { get; init; }
    public string? Name { get; init; }
}

public sealed record ChatTool
{
    public string Name { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public JsonElement Parameters { get; init; }
}

public sealed record ChatToolCall
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string ArgumentsJson { get; init; } = "{}";
}

public sealed record UsageInfo
{
    public int InputTokens { get; init; }
    public int OutputTokens { get; init; }
}

public sealed record NormalizedChatResponse
{
    public string Id { get; init; } = string.Empty;
    public string Provider { get; init; } = string.Empty;
    public string Model { get; init; } = string.Empty;
    public ChatMessage Message { get; init; } = new();
    public string FinishReason { get; init; } = "stop";
    public UsageInfo? Usage { get; init; }
}

public sealed record ChatStreamEvent
{
    public string Id { get; init; } = string.Empty;
    public string Provider { get; init; } = string.Empty;
    public string Model { get; init; } = string.Empty;
    public string? TextDelta { get; init; }
    public ChatToolCall? ToolCallDelta { get; init; }
    public string? FinishReason { get; init; }
    public UsageInfo? Usage { get; init; }
    public bool IsDone { get; init; }
}
