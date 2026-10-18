using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Providers;

namespace ProxyAgent.Api.Tests.Providers;

public sealed class XaiProviderTests
{
    [Fact]
    public async Task CompleteAsync_maps_response_and_sets_provider_name_to_xai()
    {
        var handler = new RecordingHandler(
            """
            {"id":"chat-xai-1","model":"grok-2-latest","choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"Hello from Grok"}}],"usage":{"prompt_tokens":5,"completion_tokens":10}}
            """.Trim());
        var provider = CreateProvider(handler);

        var response = await provider.CompleteAsync(
            new NormalizedChatRequest
            {
                Model = "grok-2-latest",
                Messages = [new ChatMessage { Role = "user", Content = "Hi" }]
            },
            new ProviderSelection("xai", "grok-2-latest"),
            CancellationToken.None);

        Assert.Equal("chat-xai-1", response.Id);
        Assert.Equal("xai", response.Provider);
        Assert.Equal("Hello from Grok", response.Message.Content);
        Assert.Equal("stop", response.FinishReason);
        Assert.Equal(5, response.Usage!.InputTokens);
        Assert.Equal(10, response.Usage.OutputTokens);
        Assert.Equal(HttpMethod.Post, handler.Request!.Method);
        Assert.Equal("https://api.x.ai/v1/chat/completions", handler.Request.RequestUri!.ToString());
        Assert.Equal("Bearer", handler.Request.Headers.Authorization!.Scheme);
        Assert.Equal("xai-test-key", handler.Request.Headers.Authorization.Parameter);
    }

    [Fact]
    public async Task StreamAsync_maps_text_and_sets_provider_to_xai()
    {
        var handler = new StreamingHandler(
            """
            data: {"id":"chat-xai-stream-1","model":"grok-2-latest","choices":[{"delta":{"content":"Hello from Grok Stream"},"finish_reason":null}]}

            data: [DONE]

            """.Trim());
        var provider = new XaiProvider(new HttpClient(handler), Options.Create(new ProviderOptions
        {
            BaseUrl = "https://api.x.ai/v1",
            ApiKey = "xai-test-key"
        }));

        var events = new List<ChatStreamEvent>();
        await foreach (var item in provider.StreamAsync(
            new NormalizedChatRequest { Messages = [new ChatMessage { Role = "user", Content = "Hi" }] },
            new ProviderSelection("xai", "grok-2-latest"),
            CancellationToken.None))
        {
            events.Add(item);
        }

        Assert.Contains(events, item => item.TextDelta == "Hello from Grok Stream" && item.Provider == "xai");
        Assert.True(events[^1].IsDone);
        Assert.Equal("xai", events[^1].Provider);
    }

    private static XaiProvider CreateProvider(RecordingHandler handler)
    {
        var client = new HttpClient(handler);
        return new XaiProvider(client, Options.Create(new ProviderOptions
        {
            BaseUrl = "https://api.x.ai/v1",
            ApiKey = "xai-test-key"
        }));
    }

    private sealed class RecordingHandler(string responseBody, HttpStatusCode statusCode = HttpStatusCode.OK) : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }
        public string RequestBody { get; private set; } = string.Empty;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Request = request;
            RequestBody = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(statusCode)
            {
                Content = new StringContent(responseBody, Encoding.UTF8, "application/json")
            };
        }
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
