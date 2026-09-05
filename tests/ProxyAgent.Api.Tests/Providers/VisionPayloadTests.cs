using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Providers;

namespace ProxyAgent.Api.Tests.Providers;

public sealed class VisionPayloadTests
{
    [Fact]
    public async Task OpenAi_provider_sends_text_and_image_content_parts()
    {
        var handler = new RecordingHandler(
            """
            {"id":"chat-1","model":"vision-model","choices":[{"message":{"role":"assistant","content":"I see an image."},"finish_reason":"stop"}]}
            """);
        var provider = new OpenAiProvider(
            new HttpClient(handler),
            Options.Create(new ProviderOptions { BaseUrl = "https://api.example.com/v1", ApiKey = "test-key" }));

        await provider.CompleteAsync(
            VisionRequest(),
            new ProviderSelection("openai", "vision-model"),
            CancellationToken.None);

        using var body = JsonDocument.Parse(handler.RequestBody!);
        var content = body.RootElement.GetProperty("messages")[0].GetProperty("content");
        Assert.Equal(JsonValueKind.Array, content.ValueKind);
        Assert.Equal("text", content[0].GetProperty("type").GetString());
        Assert.Equal("Ảnh này có gì?", content[0].GetProperty("text").GetString());
        Assert.Equal("image_url", content[1].GetProperty("type").GetString());
        Assert.Equal("data:image/png;base64,AA==", content[1].GetProperty("image_url").GetProperty("url").GetString());
    }

    [Fact]
    public async Task Anthropic_provider_maps_image_content_to_source_block()
    {
        var handler = new RecordingHandler(
            """
            {"id":"msg-1","model":"vision-model","content":[{"type":"text","text":"I see an image."}],"stop_reason":"end_turn"}
            """);
        var provider = new AnthropicProvider(
            new HttpClient(handler),
            Options.Create(new ProviderOptions
            {
                BaseUrl = "https://api.anthropic.com/v1",
                ApiKey = "test-key",
                ApiVersion = "2023-06-01"
            }));

        await provider.CompleteAsync(
            VisionRequest(),
            new ProviderSelection("anthropic", "vision-model"),
            CancellationToken.None);

        using var body = JsonDocument.Parse(handler.RequestBody!);
        var content = body.RootElement.GetProperty("messages")[0].GetProperty("content");
        Assert.Equal(JsonValueKind.Array, content.ValueKind);
        Assert.Equal("text", content[0].GetProperty("type").GetString());
        Assert.Equal("image", content[1].GetProperty("type").GetString());
        Assert.Equal("base64", content[1].GetProperty("source").GetProperty("type").GetString());
        Assert.Equal("image/png", content[1].GetProperty("source").GetProperty("media_type").GetString());
        Assert.Equal("AA==", content[1].GetProperty("source").GetProperty("data").GetString());
    }

    private static NormalizedChatRequest VisionRequest() => new()
    {
        Messages =
        [
            new ChatMessage
            {
                Role = "user",
                ContentParts =
                [
                    new ChatContentPart { Type = "text", Text = "Ảnh này có gì?" },
                    new ChatContentPart { Type = "image_url", ImageUrl = "data:image/png;base64,AA==" }
                ]
            }
        ]
    };

    private sealed class RecordingHandler(string responseBody) : HttpMessageHandler
    {
        public string? RequestBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            RequestBody = await request.Content!.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(responseBody, Encoding.UTF8, "application/json")
            };
        }
    }
}
