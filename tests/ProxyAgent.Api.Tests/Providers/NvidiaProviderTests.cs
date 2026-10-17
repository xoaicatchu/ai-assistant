using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Providers;

namespace ProxyAgent.Api.Tests.Providers;

public sealed class NvidiaProviderTests
{
    [Fact]
    public async Task CompleteAsync_maps_response_and_sets_provider_name_to_nvidia()
    {
        var handler = new RecordingHandler(
            """
            {"id":"chat-nv-1","model":"meta/llama-3.2-11b-vision-instruct","choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"Hello from NVIDIA"}}],"usage":{"prompt_tokens":5,"completion_tokens":10}}
            """.Trim());
        var provider = CreateProvider(handler);

        var response = await provider.CompleteAsync(
            new NormalizedChatRequest
            {
                Model = "meta/llama-3.2-11b-vision-instruct",
                Messages = [new ChatMessage { Role = "user", Content = "Hi" }]
            },
            new ProviderSelection("nvidia", "meta/llama-3.2-11b-vision-instruct"),
            CancellationToken.None);

        Assert.Equal("chat-nv-1", response.Id);
        Assert.Equal("nvidia", response.Provider);
        Assert.Equal("Hello from NVIDIA", response.Message.Content);
        Assert.Equal("stop", response.FinishReason);
        Assert.Equal(5, response.Usage!.InputTokens);
        Assert.Equal(10, response.Usage.OutputTokens);
        Assert.Equal(HttpMethod.Post, handler.Request!.Method);
        Assert.Equal("https://integrate.api.nvidia.com/v1/chat/completions", handler.Request.RequestUri!.ToString());
        Assert.Equal("Bearer", handler.Request.Headers.Authorization!.Scheme);
        Assert.Equal("nvapi-test-key", handler.Request.Headers.Authorization.Parameter);
    }

    [Fact]
    public async Task CompleteAsync_maps_authentication_failure_for_nvidia()
    {
        var handler = new RecordingHandler("{\"error\":{\"message\":\"invalid key\"}}", HttpStatusCode.Unauthorized);
        var provider = CreateProvider(handler);

        var error = await Assert.ThrowsAsync<ProviderAuthenticationException>(() =>
            provider.CompleteAsync(
                new NormalizedChatRequest
                {
                    Model = "meta/llama-3.2-11b-vision-instruct",
                    Messages = [new ChatMessage { Role = "user", Content = "Hi" }]
                },
                new ProviderSelection("nvidia", "meta/llama-3.2-11b-vision-instruct"),
                CancellationToken.None));

        Assert.Equal("provider_authentication_failed", error.Code);
        Assert.Equal("nvidia", error.Provider);
    }

    [Fact]
    public async Task StreamAsync_maps_text_and_sets_provider_to_nvidia()
    {
        var handler = new StreamingHandler(
            """
            data: {"id":"chat-nv-stream-1","model":"meta/llama-3.2-11b-vision-instruct","choices":[{"delta":{"content":"Hello from NVIDIA Stream"},"finish_reason":null}]}

            data: [DONE]

            """.Trim());
        var provider = new NvidiaProvider(new HttpClient(handler), Options.Create(new ProviderOptions
        {
            BaseUrl = "https://integrate.api.nvidia.com/v1",
            ApiKey = "nvapi-test-key"
        }));

        var events = new List<ChatStreamEvent>();
        await foreach (var item in provider.StreamAsync(
            new NormalizedChatRequest { Messages = [new ChatMessage { Role = "user", Content = "Hi" }] },
            new ProviderSelection("nvidia", "meta/llama-3.2-11b-vision-instruct"),
            CancellationToken.None))
        {
            events.Add(item);
        }

        Assert.Contains(events, item => item.TextDelta == "Hello from NVIDIA Stream" && item.Provider == "nvidia");
        Assert.True(events[^1].IsDone);
        Assert.Equal("nvidia", events[^1].Provider);
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

    private static NvidiaProvider CreateProvider(RecordingHandler handler)
    {
        var client = new HttpClient(handler);
        return new NvidiaProvider(client, Options.Create(new ProviderOptions
        {
            BaseUrl = "https://integrate.api.nvidia.com/v1",
            ApiKey = "nvapi-test-key"
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
}
