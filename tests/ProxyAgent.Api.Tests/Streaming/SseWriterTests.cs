using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Streaming;

namespace ProxyAgent.Api.Tests.Streaming;

public sealed class SseWriterTests
{
    [Fact]
    public async Task WriteOpenAiChunkAsync_writes_openai_chunk_and_done_marker()
    {
        var context = new DefaultHttpContext();
        await using var body = new MemoryStream();
        context.Response.Body = body;

        var item = new ChatStreamEvent
        {
            Id = "chat-1",
            Provider = "openai",
            Model = "gpt-test",
            TextDelta = "Hello"
        };

        await SseWriter.WriteOpenAiChunkAsync(context.Response, item, CancellationToken.None);
        await SseWriter.WriteDoneAsync(context.Response, CancellationToken.None);

        body.Position = 0;
        var output = await new StreamReader(body, Encoding.UTF8).ReadToEndAsync();
        Assert.Equal("text/event-stream", context.Response.ContentType);
        Assert.Contains("data: ", output);
        Assert.Contains("chat.completion.chunk", output);
        Assert.Contains("Hello", output);
        Assert.Contains("data: [DONE]", output);

        var json = output.Split("data: ", StringSplitOptions.RemoveEmptyEntries)[0].Trim();
        using var document = JsonDocument.Parse(json);
        Assert.Equal("chat.completion.chunk", document.RootElement.GetProperty("object").GetString());
    }
}
