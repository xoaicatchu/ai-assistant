using System.Text;
using ProxyAgent.Api.Streaming;

namespace ProxyAgent.Api.Tests.Streaming;

public sealed class SseReaderTests
{
    [Fact]
    public async Task ReadAsync_groups_event_and_multiple_data_lines()
    {
        await using var stream = new MemoryStream(Encoding.UTF8.GetBytes(
            "event: content_block_delta\n" +
            "data: {\"delta\":\n" +
            "data: {\"text\":\"Hello\"}\n\n" +
            "data: {\"id\":\"done\"}\n\n"));

        var events = new List<SseEvent>();
        await foreach (var item in SseReader.ReadAsync(stream, CancellationToken.None))
        {
            events.Add(item);
        }

        Assert.Equal(2, events.Count);
        Assert.Equal("content_block_delta", events[0].Event);
        Assert.Equal("{\"delta\":\n{\"text\":\"Hello\"}", events[0].Data);
        Assert.Null(events[1].Event);
        Assert.Equal("{\"id\":\"done\"}", events[1].Data);
    }
}
