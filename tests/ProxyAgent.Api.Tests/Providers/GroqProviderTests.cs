using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Providers;

namespace ProxyAgent.Api.Tests.Providers;

public sealed class GroqProviderTests
{
    [Fact]
    public async Task CompleteAsync_maps_response_and_sets_provider_name_to_groq()
    {
        var handler = new RecordingHandler(
            """
            {"id":"chat-groq-1","model":"openai/gpt-oss-120b","choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"Hello from Groq"}}],"usage":{"prompt_tokens":8,"completion_tokens":12}}
            """.Trim());
        var provider = CreateProvider(handler);

        var response = await provider.CompleteAsync(
            new NormalizedChatRequest
            {
                Model = "openai/gpt-oss-120b",
                Messages = [new ChatMessage { Role = "user", Content = "Hi" }]
            },
            new ProviderSelection("groq", "openai/gpt-oss-120b"),
            CancellationToken.None);

        Assert.Equal("chat-groq-1", response.Id);
        Assert.Equal("groq", response.Provider);
        Assert.Equal("Hello from Groq", response.Message.Content);
        Assert.Equal("stop", response.FinishReason);
        Assert.Equal(8, response.Usage!.InputTokens);
        Assert.Equal(12, response.Usage.OutputTokens);
        Assert.Equal(HttpMethod.Post, handler.Request!.Method);
        Assert.Equal("https://api.groq.com/openai/v1/chat/completions", handler.Request.RequestUri!.ToString());
        Assert.Equal("Bearer", handler.Request.Headers.Authorization!.Scheme);
        Assert.Equal("groq-test-key", handler.Request.Headers.Authorization.Parameter);
    }

    [Fact]
    public async Task StreamAsync_maps_text_and_sets_provider_to_groq()
    {
        var handler = new StreamingHandler(
            """
            data: {"id":"chat-groq-stream-1","model":"openai/gpt-oss-120b","choices":[{"delta":{"content":"Hello from Groq Stream"},"finish_reason":null}]}

            data: [DONE]

            """.Trim());
        var provider = new GroqProvider(new HttpClient(handler), Options.Create(new ProviderOptions
        {
            BaseUrl = "https://api.groq.com/openai/v1",
            ApiKey = "groq-test-key"
        }));

        var events = new List<ChatStreamEvent>();
        await foreach (var item in provider.StreamAsync(
            new NormalizedChatRequest { Messages = [new ChatMessage { Role = "user", Content = "Hi" }] },
            new ProviderSelection("groq", "openai/gpt-oss-120b"),
            CancellationToken.None))
        {
            events.Add(item);
        }

        Assert.Equal(2, events.Count);
        Assert.Equal("groq", events[0].Provider);
        Assert.Equal("Hello from Groq Stream", events[0].TextDelta);
        Assert.True(events[1].IsDone);
    }

    private static GroqProvider CreateProvider(HttpMessageHandler handler) =>
        new(new HttpClient(handler), Options.Create(new ProviderOptions
        {
            BaseUrl = "https://api.groq.com/openai/v1",
            ApiKey = "groq-test-key"
        }));

    private sealed class RecordingHandler(string responseJson) : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Request = request;
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(responseJson, Encoding.UTF8, "application/json")
            };
            return Task.FromResult(response);
        }
    }

    private sealed class StreamingHandler(string ssePayload) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(ssePayload, Encoding.UTF8, "text/event-stream")
            };
            return Task.FromResult(response);
        }
    }
}
