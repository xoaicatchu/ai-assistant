using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http;
using ProxyAgent.Api.Chat;

namespace ProxyAgent.Api.Streaming;

public static class SseWriter
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public static Task WriteOpenAiChunkAsync(
        HttpResponse response,
        ChatStreamEvent item,
        CancellationToken cancellationToken) =>
        WriteJsonEventAsync(response, new
        {
            id = item.Id,
            @object = "chat.completion.chunk",
            created = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            model = item.Model,
            choices = new[]
            {
                new
                {
                    index = 0,
                    delta = new
                    {
                        content = item.TextDelta,
                        tool_calls = item.ToolCallDelta is null
                            ? null
                            : new[]
                            {
                                new
                                {
                                    index = 0,
                                    id = item.ToolCallDelta.Id,
                                    type = "function",
                                    function = new
                                    {
                                        name = string.IsNullOrEmpty(item.ToolCallDelta.Name) ? null : item.ToolCallDelta.Name,
                                        arguments = item.ToolCallDelta.ArgumentsJson
                                    }
                                }
                            }
                    },
                    finish_reason = item.FinishReason
                }
            }
        }, cancellationToken);

    public static Task WriteGatewayEventAsync(
        HttpResponse response,
        ChatStreamEvent item,
        CancellationToken cancellationToken) =>
        WriteJsonEventAsync(response, new
        {
            type = item.IsDone ? "done" : "delta",
            id = item.Id,
            provider = item.Provider,
            model = item.Model,
            delta = item.TextDelta,
            toolCall = item.ToolCallDelta,
            finishReason = item.FinishReason,
            usage = item.Usage,
            done = item.IsDone
        }, cancellationToken);

    public static Task WriteDoneAsync(HttpResponse response, CancellationToken cancellationToken)
    {
        EnsureSse(response);
        return WriteRawAsync(response, "data: [DONE]\n\n", cancellationToken);
    }

    public static Task WriteErrorAsync(
        HttpResponse response,
        string code,
        string message,
        string? provider,
        CancellationToken cancellationToken) =>
        WriteJsonEventAsync(response, new
        {
            type = "error",
            error = new { code, message, provider }
        }, cancellationToken);

    private static Task WriteJsonEventAsync(HttpResponse response, object value, CancellationToken cancellationToken)
    {
        EnsureSse(response);
        var json = JsonSerializer.Serialize(value, JsonOptions);
        return WriteRawAsync(response, $"data: {json}\n\n", cancellationToken);
    }

    private static async Task WriteRawAsync(HttpResponse response, string value, CancellationToken cancellationToken)
    {
        var bytes = Encoding.UTF8.GetBytes(value);
        await response.Body.WriteAsync(bytes, cancellationToken);
        await response.Body.FlushAsync(cancellationToken);
    }

    private static void EnsureSse(HttpResponse response)
    {
        if (!response.HasStarted)
        {
            response.ContentType = "text/event-stream";
            response.Headers.CacheControl = "no-cache";
        }
    }
}
