using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Providers;

namespace ProxyAgent.Api.Tests.Providers;

public sealed class OpenAiStreamingTests
{
    [Fact]
    public async Task StreamAsync_maps_text_and_tool_call_deltas()
    {
        var handler = new StreamingHandler(
            """
            data: {"id":"chat-1","model":"gpt-test","choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}

            data: {"id":"chat-1","model":"gpt-test","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"get_weather","arguments":"{\"city\":\""}}]},"finish_reason":null}]}

            data: {"id":"chat-1","model":"gpt-test","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"Hanoi\"}"}}]},"finish_reason":"tool_calls"}]}

            data: [DONE]

            """.Trim());
        var provider = new OpenAiProvider(new HttpClient(handler), Options.Create(new ProviderOptions
        {
            BaseUrl = "https://api.openai.com/v1",
            ApiKey = "test-key"
        }));

        var events = new List<ChatStreamEvent>();
        await foreach (var item in provider.StreamAsync(new NormalizedChatRequest { Messages = [new ChatMessage { Role = "user", Content = "Hi" }] }, new ProviderSelection("openai", "gpt-test"), CancellationToken.None))
        {
            events.Add(item);
        }

        Assert.Contains(events, item => item.TextDelta == "Hello");
        var toolArguments = string.Concat(events.Where(item => item.ToolCallDelta is not null).Select(item => item.ToolCallDelta!.ArgumentsJson));
        Assert.Equal("{\"city\":\"Hanoi\"}", toolArguments);
        Assert.Contains(events, item => item.FinishReason == "tool_calls");
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
