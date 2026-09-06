using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Providers;

namespace ProxyAgent.Api.Tests.Providers;

public sealed class OpenAiProviderTests
{
    [Fact]
    public async Task CompleteAsync_maps_text_tool_call_and_usage()
    {
        var handler = new RecordingHandler(
            """
            {"id":"chat-1","model":"gpt-test","choices":[{"index":0,"finish_reason":"tool_calls","message":{"role":"assistant","content":null,"tool_calls":[{"id":"call-1","type":"function","function":{"name":"get_weather","arguments":"{\"city\":\"Hanoi\"}"}}]}}],"usage":{"prompt_tokens":4,"completion_tokens":8}}
            """.Trim());
        var provider = CreateProvider(handler);

        var response = await provider.CompleteAsync(RequestWithTool(), Selection("gpt-test"), CancellationToken.None);

        Assert.Equal("chat-1", response.Id);
        Assert.Equal("openai", response.Provider);
        Assert.Equal("tool_calls", response.FinishReason);
        Assert.Equal("get_weather", Assert.Single(response.Message.ToolCalls).Name);
        Assert.Equal("{\"city\":\"Hanoi\"}", response.Message.ToolCalls[0].ArgumentsJson);
        Assert.Equal(4, response.Usage!.InputTokens);
        Assert.Equal(8, response.Usage.OutputTokens);
        Assert.Equal(HttpMethod.Post, handler.Request!.Method);
        Assert.Equal("Bearer", handler.Request.Headers.Authorization!.Scheme);
        Assert.Equal("test-key", handler.Request.Headers.Authorization.Parameter);
        Assert.Contains("\"type\":\"function\"", handler.RequestBody);
    }

    [Fact]
    public async Task CompleteAsync_maps_authentication_failure()
    {
        var handler = new RecordingHandler("{\"error\":{\"message\":\"bad key\"}}", HttpStatusCode.Unauthorized);
        var provider = CreateProvider(handler);

        var error = await Assert.ThrowsAsync<ProviderAuthenticationException>(() =>
            provider.CompleteAsync(RequestWithTool(), Selection("gpt-test"), CancellationToken.None));

        Assert.Equal("provider_authentication_failed", error.Code);
    }

    [Fact]
    public async Task CompleteAsync_maps_quota_failure_to_actionable_error()
    {
        var handler = new RecordingHandler(
            "{\"error\":{\"message\":\"You exceeded your current quota\",\"code\":\"insufficient_quota\"}}",
            HttpStatusCode.PaymentRequired);
        var provider = CreateProvider(handler);

        var error = await Assert.ThrowsAsync<ProviderQuotaException>(() =>
            provider.CompleteAsync(RequestWithTool(), Selection("gpt-test"), CancellationToken.None));

        Assert.Equal("provider_quota_exceeded", error.Code);
        Assert.Equal("The upstream provider quota has been exceeded.", error.Message);
    }

    private static OpenAiProvider CreateProvider(RecordingHandler handler)
    {
        var client = new HttpClient(handler);
        return new OpenAiProvider(client, Options.Create(new ProviderOptions
        {
            BaseUrl = "https://api.openai.com/v1",
            ApiKey = "test-key"
        }));
    }

    private static ProviderSelection Selection(string model) => new("openai", model);

    private static NormalizedChatRequest RequestWithTool()
    {
        using var document = JsonDocument.Parse("{\"type\":\"object\",\"properties\":{\"city\":{\"type\":\"string\"}}}");
        return new NormalizedChatRequest
        {
            Model = "gpt-test",
            Messages = [new ChatMessage { Role = "user", Content = "What is the weather?" }],
            Tools = [new ChatTool
            {
                Name = "get_weather",
                Description = "Get weather",
                Parameters = document.RootElement.Clone()
            }]
        };
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
