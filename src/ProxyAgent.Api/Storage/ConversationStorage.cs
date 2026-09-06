using System.Text.Json;
using Microsoft.Data.Sqlite;
using ProxyAgent.Api.Api;

namespace ProxyAgent.Api.Storage;

public interface IConversationStore
{
    ConversationCreationResult Create(
        string title,
        IReadOnlyList<ConversationMessage> messages,
        string? requestedId = null);

    ConversationDocument? Get(string id, string? ownerToken = null);

    ConversationDocument? Update(
        string id,
        string title,
        IReadOnlyList<ConversationMessage> messages,
        string? ownerToken = null);

    ConversationDocument? Publish(string id, string? ownerToken = null);
}

public sealed record ConversationCreationResult(string Id, string OwnerToken);

public sealed class SqliteConversationStore(SqliteDatabase database) : IConversationStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public ConversationCreationResult Create(
        string title,
        IReadOnlyList<ConversationMessage> messages,
        string? requestedId = null)
    {
        var ownerToken = ConversationAccessToken.Create();
        var ownerTokenHash = ConversationAccessToken.Hash(ownerToken);
        var preferredId = ConversationId.IsValid(requestedId) ? requestedId : null;

        for (var attempt = 0; attempt < 5; attempt++)
        {
            var id = attempt == 0 && preferredId is not null ? preferredId : CreateId();
            var document = new ConversationDocument(id, title, messages).Sanitize();
            var now = DateTimeOffset.UtcNow.ToString("O");

            using var connection = database.OpenConnection();
            using var command = connection.CreateCommand();
            command.CommandText = """
                INSERT INTO conversations
                    (id, title, messages_json, owner_token_hash, is_public, created_at, updated_at)
                VALUES ($id, $title, $messages, $owner_token_hash, 0, $created_at, $updated_at);
                """;
            AddDocumentParameters(command, document, ownerTokenHash, now, includeCreatedAt: true);
            try
            {
                command.ExecuteNonQuery();
                return new ConversationCreationResult(document.Id, ownerToken);
            }
            catch (SqliteException exception) when (exception.SqliteErrorCode == 19 && attempt < 4)
            {
                // A client-generated ID can theoretically collide. Retry with a fresh opaque ID.
            }
        }

        throw new InvalidOperationException("Could not allocate a conversation ID.");
    }

    public ConversationDocument? Get(string id, string? ownerToken = null)
    {
        if (!ConversationId.IsValid(id))
        {
            return null;
        }

        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, title, messages_json, owner_token_hash, is_public
            FROM conversations
            WHERE id = $id;
            """;
        command.Parameters.AddWithValue("$id", id);
        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }

        var document = ReadDocument(reader);
        return document.IsPublic || ConversationAccessToken.Matches(ownerToken, reader.GetString(3))
            ? document
            : null;
    }

    public ConversationDocument? Update(
        string id,
        string title,
        IReadOnlyList<ConversationMessage> messages,
        string? ownerToken = null)
    {
        if (!ConversationId.IsValid(id))
        {
            return null;
        }

        var existing = Get(id, ownerToken);
        var ownerTokenHash = GetOwnerTokenHash(id);
        if (existing is null || !ConversationAccessToken.Matches(ownerToken, ownerTokenHash))
        {
            return null;
        }

        var document = new ConversationDocument(id, title, messages, existing.IsPublic).Sanitize();
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE conversations
            SET title = $title, messages_json = $messages, updated_at = $updated_at
            WHERE id = $id AND owner_token_hash = $owner_token_hash;
            """;
        AddDocumentParameters(
            command,
            document,
            ownerTokenHash!,
            DateTimeOffset.UtcNow.ToString("O"),
            includeCreatedAt: false);
        if (command.ExecuteNonQuery() == 0)
        {
            return null;
        }

        return document;
    }

    public ConversationDocument? Publish(string id, string? ownerToken = null)
    {
        if (!ConversationId.IsValid(id) ||
            !ConversationAccessToken.Matches(ownerToken, GetOwnerTokenHash(id)))
        {
            return null;
        }

        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE conversations
            SET is_public = 1, updated_at = $updated_at
            WHERE id = $id;
            """;
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$updated_at", DateTimeOffset.UtcNow.ToString("O"));
        if (command.ExecuteNonQuery() == 0)
        {
            return null;
        }

        return Get(id, ownerToken);
    }

    private string? GetOwnerTokenHash(string id)
    {
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT owner_token_hash FROM conversations WHERE id = $id;";
        command.Parameters.AddWithValue("$id", id);
        return command.ExecuteScalar() as string;
    }

    private static void AddDocumentParameters(
        SqliteCommand command,
        ConversationDocument document,
        string ownerTokenHash,
        string now,
        bool includeCreatedAt)
    {
        command.Parameters.AddWithValue("$id", document.Id);
        command.Parameters.AddWithValue("$title", document.Title);
        command.Parameters.AddWithValue("$messages", JsonSerializer.Serialize(document.Messages, JsonOptions));
        command.Parameters.AddWithValue("$owner_token_hash", ownerTokenHash);
        if (includeCreatedAt)
        {
            command.Parameters.AddWithValue("$created_at", now);
        }
        command.Parameters.AddWithValue("$updated_at", now);
    }

    private static ConversationDocument ReadDocument(SqliteDataReader reader)
    {
        var messages = JsonSerializer.Deserialize<IReadOnlyList<ConversationMessage>>(
            reader.GetString(2), JsonOptions) ?? [];
        return new ConversationDocument(
            reader.GetString(0),
            reader.GetString(1),
            messages,
            Convert.ToBoolean(reader.GetValue(4)));
    }

    private static string CreateId() => ConversationAccessToken.Create()[..22];
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
