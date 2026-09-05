using System.Runtime.CompilerServices;
using System.Text;

namespace ProxyAgent.Api.Streaming;

public sealed record SseEvent(string? Event, string Data);

public static class SseReader
{
    public static async IAsyncEnumerable<SseEvent> ReadAsync(
        Stream stream,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(stream, new UTF8Encoding(false), detectEncodingFromByteOrderMarks: true, leaveOpen: true);
        string? eventName = null;
        var dataLines = new List<string>();

        while (await reader.ReadLineAsync(cancellationToken) is { } line)
        {
            if (line.Length == 0)
            {
                if (dataLines.Count > 0)
                {
                    yield return new SseEvent(eventName, string.Join("\n", dataLines));
                    eventName = null;
                    dataLines.Clear();
                }

                continue;
            }

            if (line.StartsWith(':'))
            {
                continue;
            }

            if (line.StartsWith("event:", StringComparison.Ordinal))
            {
                eventName = line[6..].TrimStart();
            }
            else if (line.StartsWith("data:", StringComparison.Ordinal))
            {
                dataLines.Add(line.Length > 5 && line[5] == ' ' ? line[6..] : line[5..]);
            }
        }

        if (dataLines.Count > 0)
        {
            yield return new SseEvent(eventName, string.Join("\n", dataLines));
        }
    }
}
