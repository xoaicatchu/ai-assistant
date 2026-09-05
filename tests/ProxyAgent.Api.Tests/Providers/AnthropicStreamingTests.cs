using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Providers;

namespace ProxyAgent.Api.Tests.Providers;

public sealed class AnthropicStreamingTests
{
    [Fact]
    public async Task StreamAsync_maps_text_tool_json_and_stop_reason()
    {
        var handler = new StreamingHandler(
            "event: message_start\n" +
            "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg-1\",\"model\":\"claude-test\"}}\n\n" +
            "event: content_block_delta\n" +
            "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello\"}}\n\n" +
            "event: content_block_start\n" +
            "data: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"tool_use\",\"id\":\"toolu-1\",\"name\":\"get_weather\"}}\n\n" +
            "event: content_block_delta\n" +
            "data: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"city\\\":\\\"Hanoi\\\"}\"}}\n\n" +
            "event: message_delta\n" +
            "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"},\"usage\":{\"output_tokens\":9}}\n\n" +
            "event: message_stop\n" +
            "data: {\"type\":\"message_stop\"}\n\n");
        var provider = new AnthropicProvider(new HttpClient(handler), Options.Create(new ProviderOptions
        {
            BaseUrl = "https://api.anthropic.com/v1",
            ApiKey = "test-key",
            ApiVersion = "2023-06-01"
        }));

        var events = new List<ChatStreamEvent>();
        await foreach (var item in provider.StreamAsync(new NormalizedChatRequest { Messages = [new ChatMessage { Role = "user", Content = "Hi" }] }, new ProviderSelection("anthropic", "claude-test"), CancellationToken.None))
        {
            events.Add(item);
        }

        Assert.Contains(events, item => item.TextDelta == "Hello");
        Assert.Contains(events, item => item.ToolCallDelta?.Id == "toolu-1" && item.ToolCallDelta.Name == "get_weather");
        Assert.Contains(events, item => item.ToolCallDelta?.ArgumentsJson == "{\"city\":\"Hanoi\"}");
        Assert.Contains(events, item => item.FinishReason == "tool_use");
        Assert.True(events[^1].IsDone);
    }

    private sealed class StreamingHandler(string body) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(body, Encoding.UTF8, "text/event-stream")
            });
        }
    }
}
