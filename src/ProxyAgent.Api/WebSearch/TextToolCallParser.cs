using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using ProxyAgent.Api.Chat;

namespace ProxyAgent.Api.WebSearch;

public sealed record TextToolCallParseResult(
    IReadOnlyList<ChatToolCall> ToolCalls,
    string AssistantText);

public static class TextToolCallParser
{
    private const string ToolName = "web_search";
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };
    private static readonly Regex ToolCallBlockPattern = new(
        @"<tool_call\b[^>]*>(?<body>[\s\S]*?)(?:</tool_call>|$)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private static readonly Regex InvocationPattern = new(
        @"^\s*(?<name>web_search(?:\s+with\s+snippets)?)\s*(?<json>[\[{])",
        RegexOptions.IgnoreCase | RegexOptions.Multiline | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static TextToolCallParseResult Parse(string? content)
    {
        var value = content ?? string.Empty;
        if (string.IsNullOrWhiteSpace(value))
        {
            return new TextToolCallParseResult([], string.Empty);
        }

        var calls = new List<ChatToolCall>();
        var ranges = new List<(int Start, int Length)>();
        foreach (Match block in ToolCallBlockPattern.Matches(value))
        {
            var callsBeforeBlock = calls.Count;
            ParseBlock(block.Groups["body"].Value, calls);
            if (calls.Count > callsBeforeBlock)
            {
                ranges.Add((block.Index, block.Length));
            }
        }

        if (calls.Count == 0)
        {
            return new TextToolCallParseResult([], value);
        }

        return new TextToolCallParseResult(calls, RemoveRanges(value, ranges));
    }

    private static void ParseBlock(string body, ICollection<ChatToolCall> calls)
    {
        var callsBeforeInvocationParsing = calls.Count;
        foreach (Match invocation in InvocationPattern.Matches(body))
        {
            var jsonStart = invocation.Groups["json"].Index;
            if (TryExtractJson(body, jsonStart, out var json))
            {
                AddQueryCalls(json, calls);
            }
        }

        if (calls.Count > callsBeforeInvocationParsing)
        {
            return;
        }

        var trimmed = body.Trim();
        if ((trimmed.StartsWith('{') || trimmed.StartsWith('[')) &&
            TryExtractJson(trimmed, 0, out var structuredJson))
        {
            AddStructuredCalls(structuredJson, calls);
        }
    }

    private static void AddQueryCalls(string json, ICollection<ChatToolCall> calls)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            AddQueryCalls(document.RootElement, calls);
        }
        catch (JsonException)
        {
            // Leave malformed model output untouched instead of guessing a query.
        }
    }

    private static void AddQueryCalls(JsonElement value, ICollection<ChatToolCall> calls)
    {
        if (value.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in value.EnumerateArray())
            {
                AddQueryCalls(item, calls);
            }

            return;
        }

        if (value.ValueKind != JsonValueKind.Object ||
            !value.TryGetProperty("query", out var query) ||
            query.ValueKind != JsonValueKind.String ||
            string.IsNullOrWhiteSpace(query.GetString()))
        {
            return;
        }

        AddCall(query.GetString()!, calls);
    }

    private static void AddStructuredCalls(string json, ICollection<ChatToolCall> calls)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            AddStructuredCalls(document.RootElement, calls);
        }
        catch (JsonException)
        {
            // Leave malformed model output untouched instead of guessing a query.
        }
    }

    private static void AddStructuredCalls(JsonElement value, ICollection<ChatToolCall> calls)
    {
        if (value.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in value.EnumerateArray())
            {
                AddStructuredCalls(item, calls);
            }

            return;
        }

        if (value.ValueKind != JsonValueKind.Object ||
            !value.TryGetProperty("name", out var name) ||
            name.ValueKind != JsonValueKind.String ||
            !IsWebSearchName(name.GetString()))
        {
            return;
        }

        if (!value.TryGetProperty("arguments", out var arguments))
        {
            return;
        }

        if (arguments.ValueKind == JsonValueKind.String)
        {
            AddQueryCalls(arguments.GetString() ?? string.Empty, calls);
        }
        else
        {
            AddQueryCalls(arguments, calls);
        }
    }

    private static void AddCall(string query, ICollection<ChatToolCall> calls)
    {
        var normalizedQuery = query.Trim();
        if (normalizedQuery.Length == 0)
        {
            return;
        }

        calls.Add(new ChatToolCall
        {
            Id = $"text-call-{calls.Count + 1}",
            Name = ToolName,
            ArgumentsJson = JsonSerializer.Serialize(new { query = normalizedQuery }, JsonOptions)
        });
    }

    private static bool IsWebSearchName(string? name) =>
        string.Equals(name?.Trim(), ToolName, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(name?.Trim(), "web_search with snippets", StringComparison.OrdinalIgnoreCase);

    private static bool TryExtractJson(string value, int start, out string json)
    {
        json = string.Empty;
        if (start < 0 || start >= value.Length || value[start] is not ('{' or '['))
        {
            return false;
        }

        var stack = new Stack<char>();
        var inString = false;
        var escaped = false;
        for (var index = start; index < value.Length; index++)
        {
            var character = value[index];
            if (inString)
            {
                if (escaped)
                {
                    escaped = false;
                }
                else if (character == '\\')
                {
                    escaped = true;
                }
                else if (character == '"')
                {
                    inString = false;
                }

                continue;
            }

            if (character == '"')
            {
                inString = true;
                continue;
            }

            if (character is '{' or '[')
            {
                stack.Push(character);
                continue;
            }

            if (character is not ('}' or ']'))
            {
                continue;
            }

            if (stack.Count == 0 || !MatchesPair(stack.Peek(), character))
            {
                return false;
            }

            stack.Pop();
            if (stack.Count == 0)
            {
                json = value[start..(index + 1)];
                return true;
            }
        }

        return false;
    }

    private static bool MatchesPair(char opening, char closing) =>
        opening == '{' && closing == '}' || opening == '[' && closing == ']';

    private static string RemoveRanges(string value, IReadOnlyList<(int Start, int Length)> ranges)
    {
        var builder = new StringBuilder(value.Length);
        var cursor = 0;
        foreach (var (start, length) in ranges)
        {
            builder.Append(value, cursor, start - cursor);
            cursor = start + length;
        }

        builder.Append(value, cursor, value.Length - cursor);
        return builder.ToString().Trim();
    }
}
