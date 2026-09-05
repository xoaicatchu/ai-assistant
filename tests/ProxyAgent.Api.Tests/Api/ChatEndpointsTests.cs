using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Providers;

namespace ProxyAgent.Api.Tests.Api;

public sealed class ChatEndpointsTests
{
    [Fact]
    public async Task OpenAi_endpoint_returns_openai_completion_shape()
    {
        using var app = CreateApp(new FakeChatProvider());

        var response = await app.Client.PostAsJsonAsync("/v1/chat/completions", new
        {
            model = "openai:test-model",
            messages = new[] { new { role = "user", content = "Hi" } }
        });

        response.EnsureSuccessStatusCode();
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("chat.completion", body.RootElement.GetProperty("object").GetString());
        Assert.Equal("assistant", body.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("role").GetString());
    }

    [Fact]
    public async Task Gateway_endpoint_returns_gateway_shape()
    {
        using var app = CreateApp(new FakeChatProvider());

        var response = await app.Client.PostAsJsonAsync("/api/chat", new
        {
            model = "openai:test-model",
            messages = new[] { new { role = "user", content = "Hi" } }
        });

        response.EnsureSuccessStatusCode();
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("openai", body.RootElement.GetProperty("provider").GetString());
        Assert.Equal("Hello from fake provider", body.RootElement.GetProperty("message").GetProperty("content").GetString());
    }

    [Fact]
    public async Task OpenAi_stream_returns_sse_chunks_and_done_marker()
    {
        using var app = CreateApp(new FakeChatProvider());

        var response = await app.Client.PostAsJsonAsync("/v1/chat/completions", new
        {
            model = "openai:test-model",
            stream = true,
            messages = new[] { new { role = "user", content = "Hi" } }
        });

        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal("text/event-stream", response.Content.Headers.ContentType!.MediaType);
        Assert.Contains("chat.completion.chunk", body);
        Assert.Contains("Hello from fake provider", body);
        Assert.Contains("data: [DONE]", body);
    }

    [Fact]
    public async Task OpenAi_endpoint_maps_client_side_tool_calls()
    {
        using var app = CreateApp(new FakeChatProvider(returnToolCall: true));

        var response = await app.Client.PostAsJsonAsync("/v1/chat/completions", new
        {
            model = "openai:test-model",
            messages = new[] { new { role = "user", content = "Weather?" } },
            tools = new[]
            {
                new
                {
                    type = "function",
                    function = new
                    {
                        name = "get_weather",
                        description = "Get weather",
                        parameters = new { type = "object" }
                    }
                }
            }
        });

        response.EnsureSuccessStatusCode();
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var toolCall = body.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("tool_calls")[0];
        Assert.Equal("get_weather", toolCall.GetProperty("function").GetProperty("name").GetString());
    }

    [Fact]
    public async Task OpenAi_endpoint_accepts_multimodal_content_parts()
    {
        var fake = new FakeChatProvider();
        using var app = CreateApp(fake);

        var response = await app.Client.PostAsJsonAsync("/v1/chat/completions", new
        {
            model = "openai:test-model",
            messages = new[]
            {
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new { type = "text", text = "Ảnh này có gì?" },
                        new { type = "image_url", image_url = new { url = "data:image/png;base64,AA==" } }
                    }
                }
            }
        });

        response.EnsureSuccessStatusCode();
        var message = fake.LastRequest!.Messages.Single(item => item.Role == "user");
        Assert.Equal("Ảnh này có gì?", message.ContentParts[0].Text);
        Assert.Equal("data:image/png;base64,AA==", message.ContentParts[1].ImageUrl);
    }

    [Fact]
    public async Task OpenAi_endpoint_rejects_oversized_image_data_url()
    {
        using var app = CreateApp(new FakeChatProvider());

        var response = await app.Client.PostAsJsonAsync("/v1/chat/completions", new
        {
            model = "openai:test-model",
            messages = new[]
            {
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new
                        {
                            type = "image_url",
                            image_url = new { url = "data:image/png;base64," + new string('A', ChatContentLimits.MaxImageDataUrlLength) }
                        }
                    }
                }
            }
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("invalid_request", body.RootElement.GetProperty("error").GetProperty("code").GetString());
    }

    [Fact]
    public async Task Unknown_provider_returns_bad_request_error()
    {
        using var app = CreateApp(new FakeChatProvider());

        var response = await app.Client.PostAsJsonAsync("/api/chat", new
        {
            model = "local:test-model",
            messages = new[] { new { role = "user", content = "Hi" } }
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("unsupported_provider", body.RootElement.GetProperty("error").GetProperty("code").GetString());
    }

    [Fact]
    public async Task Missing_provider_registration_returns_service_unavailable()
    {
        using var app = CreateApp(new FakeChatProvider());

        var response = await app.Client.PostAsJsonAsync("/api/chat", new
        {
            model = "anthropic:test-model",
            messages = new[] { new { role = "user", content = "Hi" } }
        });

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("provider_not_configured", body.RootElement.GetProperty("error").GetProperty("code").GetString());
    }

    [Fact]
    public async Task Health_endpoint_does_not_call_provider()
    {
        var fake = new FakeChatProvider();
        using var app = CreateApp(fake);

        var response = await app.Client.GetAsync("/health");

        response.EnsureSuccessStatusCode();
        Assert.False(fake.WasCalled);
    }

    [Fact]
    public async Task Health_endpoint_allows_configured_frontend_origin()
    {
        using var app = CreateApp(new FakeChatProvider());
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Add("Origin", "http://localhost:4200");

        var response = await app.Client.SendAsync(request);

        response.EnsureSuccessStatusCode();
        Assert.True(response.Headers.TryGetValues("Access-Control-Allow-Origin", out var values));
        Assert.Equal("http://localhost:4200", values.Single());
    }

    private static TestApp CreateApp(FakeChatProvider fake)
    {
        var factory = new TestFactory(fake);
        return new TestApp(factory, factory.CreateClient());
    }

    private sealed class TestApp(WebApplicationFactory<Program> Factory, HttpClient Client) : IDisposable
    {
        public WebApplicationFactory<Program> Factory { get; } = Factory;
        public HttpClient Client { get; } = Client;
        public void Dispose()
        {
            Client.Dispose();
            Factory.Dispose();
        }
    }

    private sealed class TestFactory(FakeChatProvider fake) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IChatProvider>();
                services.AddSingleton<IChatProvider>(fake);
            });
        }
    }

    private sealed class FakeChatProvider(bool returnToolCall = false) : IChatProvider
    {
        public string Name => "openai";
        public bool WasCalled { get; private set; }
        public NormalizedChatRequest? LastRequest { get; private set; }

        public Task<NormalizedChatResponse> CompleteAsync(NormalizedChatRequest request, ProviderSelection selection, CancellationToken cancellationToken)
        {
            WasCalled = true;
            LastRequest = request;
            var message = new ChatMessage
            {
                Role = "assistant",
                Content = returnToolCall ? null : "Hello from fake provider",
                ToolCalls = returnToolCall
                    ? [new ChatToolCall { Id = "call-1", Name = "get_weather", ArgumentsJson = "{\"city\":\"Hanoi\"}" }]
                    : []
            };
            return Task.FromResult(new NormalizedChatResponse
            {
                Id = "fake-1",
                Provider = Name,
                Model = selection.Model,
                Message = message,
                FinishReason = returnToolCall ? "tool_calls" : "stop"
            });
        }

        public async IAsyncEnumerable<ChatStreamEvent> StreamAsync(
            NormalizedChatRequest request,
            ProviderSelection selection,
            [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
        {
            WasCalled = true;
            LastRequest = request;
            yield return new ChatStreamEvent { Id = "fake-1", Provider = Name, Model = selection.Model, TextDelta = "Hello from fake provider" };
            yield return new ChatStreamEvent { Id = "fake-1", Provider = Name, Model = selection.Model, IsDone = true };
            await Task.CompletedTask;
        }
    }
}
