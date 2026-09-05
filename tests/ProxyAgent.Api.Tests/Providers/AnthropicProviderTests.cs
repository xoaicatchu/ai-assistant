using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Providers;

namespace ProxyAgent.Api.Tests.Providers;

public sealed class AnthropicProviderTests
{
    [Fact]
    public async Task CompleteAsync_moves_system_message_and_maps_tool_use()
    {
        var handler = new RecordingHandler(
            """
            {"id":"msg-1","type":"message","role":"assistant","model":"claude-test","content":[{"type":"text","text":"I need the weather."},{"type":"tool_use","id":"toolu-1","name":"get_weather","input":{"city":"Hanoi"}}],"stop_reason":"tool_use","usage":{"input_tokens":5,"output_tokens":9}}
            """.Trim());
        var provider = CreateProvider(handler);

        var response = await provider.CompleteAsync(RequestWithSystemAndTool(), Selection("claude-test"), CancellationToken.None);

        Assert.Equal("msg-1", response.Id);
        Assert.Equal("I need the weather.", response.Message.Content);
        Assert.Equal("tool_use", response.FinishReason);
        Assert.Equal("get_weather", Assert.Single(response.Message.ToolCalls).Name);
        Assert.Equal("{\"city\":\"Hanoi\"}", response.Message.ToolCalls[0].ArgumentsJson);
        Assert.Equal(5, response.Usage!.InputTokens);
        Assert.Equal(9, response.Usage.OutputTokens);
        Assert.Contains("\"system\":\"You are concise.\"", handler.RequestBody);
        Assert.Contains("\"input_schema\"", handler.RequestBody);
        Assert.Equal("test-key", handler.Request!.Headers.GetValues("x-api-key").Single());
        Assert.Equal("2023-06-01", handler.Request.Headers.GetValues("anthropic-version").Single());
    }

    [Fact]
    public async Task CompleteAsync_maps_tool_result_to_anthropic_block()
    {
        var handler = new RecordingHandler(
            "{\"id\":\"msg-2\",\"model\":\"claude-test\",\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"Done\"}],\"stop_reason\":\"end_turn\"}");
        var provider = CreateProvider(handler);

        await provider.CompleteAsync(new NormalizedChatRequest
        {
            Messages =
            [
                new ChatMessage { Role = "user", Content = "Call the tool." },
                new ChatMessage { Role = "tool", ToolCallId = "toolu-1", Content = "22 degrees" }
            ]
        }, Selection("claude-test"), CancellationToken.None);

        Assert.Contains("tool_result", handler.RequestBody);
        Assert.Contains("toolu-1", handler.RequestBody);
    }

    private static AnthropicProvider CreateProvider(RecordingHandler handler)
    {
        return new AnthropicProvider(new HttpClient(handler), Options.Create(new ProviderOptions
        {
            BaseUrl = "https://api.anthropic.com/v1",
            ApiKey = "test-key",
            ApiVersion = "2023-06-01"
        }));
    }

    private static ProviderSelection Selection(string model) => new("anthropic", model);

    private static NormalizedChatRequest RequestWithSystemAndTool()
    {
        using var document = JsonDocument.Parse("{\"type\":\"object\",\"properties\":{\"city\":{\"type\":\"string\"}}}");
        return new NormalizedChatRequest
        {
            Messages =
            [
                new ChatMessage { Role = "system", Content = "You are concise." },
                new ChatMessage { Role = "user", Content = "What is the weather?" }
            ],
            Tools =
            [
                new ChatTool
                {
                    Name = "get_weather",
                    Description = "Get weather",
                    Parameters = document.RootElement.Clone()
                }
            ]
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
