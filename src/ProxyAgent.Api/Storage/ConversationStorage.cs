using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using ProxyAgent.Api.Api;

namespace ProxyAgent.Api.Storage;

public interface IConversationStore
{
    ConversationDocument Create(string title, IReadOnlyList<ConversationMessage> messages);
    ConversationDocument? Get(string id);
    ConversationDocument? Update(string id, string title, IReadOnlyList<ConversationMessage> messages);
}

public sealed class SqliteConversationStore(SqliteDatabase database) : IConversationStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public ConversationDocument Create(string title, IReadOnlyList<ConversationMessage> messages)
    {
        var document = new ConversationDocument(CreateId(), title, messages).Sanitize();
        var now = DateTimeOffset.UtcNow.ToString("O");

        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO conversations (id, title, messages_json, created_at, updated_at)
            VALUES ($id, $title, $messages, $created_at, $updated_at);
            """;
        AddDocumentParameters(command, document, now);
        command.ExecuteNonQuery();
        return document;
    }

    public ConversationDocument? Get(string id)
    {
        if (!ConversationId.IsValid(id))
        {
            return null;
        }

        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT id, title, messages_json FROM conversations WHERE id = $id;";
        command.Parameters.AddWithValue("$id", id);
        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadDocument(reader) : null;
    }

    public ConversationDocument? Update(string id, string title, IReadOnlyList<ConversationMessage> messages)
    {
        if (!ConversationId.IsValid(id))
        {
            return null;
        }

        var document = new ConversationDocument(id, title, messages).Sanitize();
        var now = DateTimeOffset.UtcNow.ToString("O");
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE conversations
            SET title = $title, messages_json = $messages, updated_at = $updated_at
            WHERE id = $id;
            """;
        AddDocumentParameters(command, document, now);
        if (command.ExecuteNonQuery() == 0)
        {
            return null;
        }

        return document;
    }

    private static void AddDocumentParameters(SqliteCommand command, ConversationDocument document, string now)
    {
        command.Parameters.AddWithValue("$id", document.Id);
        command.Parameters.AddWithValue("$title", document.Title);
        command.Parameters.AddWithValue("$messages", JsonSerializer.Serialize(document.Messages, JsonOptions));
        command.Parameters.AddWithValue("$created_at", now);
        command.Parameters.AddWithValue("$updated_at", now);
    }

    private static ConversationDocument ReadDocument(SqliteDataReader reader)
    {
        var messages = JsonSerializer.Deserialize<IReadOnlyList<ConversationMessage>>(
            reader.GetString(2), JsonOptions) ?? [];
        return new ConversationDocument(reader.GetString(0), reader.GetString(1), messages);
    }

    private static string CreateId()
    {
        Span<byte> bytes = stackalloc byte[16];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
    }
}

public static class ConversationId
{
    public static bool IsValid(string? value)
        => !string.IsNullOrWhiteSpace(value) &&
           value.Length == 22 &&
           value.All(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_');
}

internal static class ConversationDocumentSanitizer
{
    private const int MaxTitleLength = 80;
    private const int MaxMessages = 200;
    private const int MaxTotalTextLength = 500_000;

    public static ConversationDocument Sanitize(this ConversationDocument document)
    {
        var title = string.IsNullOrWhiteSpace(document.Title)
            ? "Cuộc trò chuyện mới"
            : document.Title.Trim()[..Math.Min(document.Title.Trim().Length, MaxTitleLength)];
        var totalTextLength = 0;
        var messages = new List<ConversationMessage>(Math.Min(document.Messages.Count, MaxMessages));

        foreach (var message in document.Messages.Take(MaxMessages))
        {
            if (message is null ||
                (message.Role != "user" && message.Role != "assistant") ||
                (message.Status != "complete" && message.Status != "error" && message.Status != "stopped" &&
                 !(message.Role == "user" && message.Status == "pending")))
            {
                continue;
            }

            var text = message.Text?.Trim() ?? string.Empty;
            if (text.Length == 0)
            {
                continue;
            }

            var remaining = MaxTotalTextLength - totalTextLength;
            if (remaining <= 0)
            {
                break;
            }

            text = text[..Math.Min(text.Length, remaining)];
            totalTextLength += text.Length;
            messages.Add(new ConversationMessage(
                message.Id,
                message.RequestId,
                message.Role,
                text,
                message.Role == "user" ? "complete" : message.Status));
        }

        return document with { Title = title, Messages = messages };
    }
}
