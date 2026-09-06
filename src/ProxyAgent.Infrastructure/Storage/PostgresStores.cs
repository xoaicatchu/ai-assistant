using System.Text.Json;
using Npgsql;
using ProxyAgent.Api.Admin;
using ProxyAgent.Api.Api;

namespace ProxyAgent.Api.Storage;

public sealed class PostgresConversationStore(PostgresDatabase database) : IConversationStore
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

            using var connection = database.OpenConnection();
            using var command = connection.CreateCommand();
            command.CommandText = """
                INSERT INTO conversations
                    (id, title, messages_json, owner_token_hash, is_public, created_at, updated_at)
                VALUES (@id, @title, @messages, @owner_token_hash, FALSE, @created_at, @updated_at);
                """;
            AddDocumentParameters(command, document, ownerTokenHash, DateTime.UtcNow, includeCreatedAt: true);
            try
            {
                command.ExecuteNonQuery();
                return new ConversationCreationResult(document.Id, ownerToken);
            }
            catch (PostgresException exception) when (
                exception.SqlState == PostgresErrorCodes.UniqueViolation && attempt < 4)
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
            WHERE id = @id;
            """;
        command.Parameters.AddWithValue("id", id);
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
            SET title = @title, messages_json = @messages, updated_at = @updated_at
            WHERE id = @id AND owner_token_hash = @owner_token_hash;
            """;
        AddDocumentParameters(command, document, ownerTokenHash!, DateTime.UtcNow, includeCreatedAt: false);
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
            SET is_public = TRUE, updated_at = @updated_at
            WHERE id = @id;
            """;
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("updated_at", DateTime.UtcNow);
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
        command.CommandText = "SELECT owner_token_hash FROM conversations WHERE id = @id;";
        command.Parameters.AddWithValue("id", id);
        return command.ExecuteScalar() as string;
    }

    private static void AddDocumentParameters(
        NpgsqlCommand command,
        ConversationDocument document,
        string ownerTokenHash,
        DateTime now,
        bool includeCreatedAt)
    {
        command.Parameters.AddWithValue("id", document.Id);
        command.Parameters.AddWithValue("title", document.Title);
        command.Parameters.AddWithValue("messages", JsonSerializer.Serialize(document.Messages, JsonOptions));
        command.Parameters.AddWithValue("owner_token_hash", ownerTokenHash);
        if (includeCreatedAt)
        {
            command.Parameters.AddWithValue("created_at", now);
        }
        command.Parameters.AddWithValue("updated_at", now);
    }

    private static ConversationDocument ReadDocument(NpgsqlDataReader reader)
    {
        var messages = JsonSerializer.Deserialize<IReadOnlyList<ConversationMessage>>(
            reader.GetString(2), JsonOptions) ?? [];
        return new ConversationDocument(
            reader.GetString(0),
            reader.GetString(1),
            messages,
            reader.GetBoolean(4));
    }

    private static string CreateId() => ConversationAccessToken.Create()[..22];
}

public sealed class PostgresAdminAccountStore(PostgresDatabase database) : IAdminAccountStore
{
    public AdminAccount? Get(string username)
    {
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT username, password_hash FROM admin_accounts WHERE username = @username;";
        command.Parameters.AddWithValue("username", username);
        using var reader = command.ExecuteReader();
        return reader.Read() ? new AdminAccount(reader.GetString(0), reader.GetString(1)) : null;
    }

    public bool HasAccount()
    {
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT EXISTS(SELECT 1 FROM admin_accounts LIMIT 1);";
        return Convert.ToBoolean(command.ExecuteScalar());
    }

    public void Create(string username, string passwordHash)
    {
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO admin_accounts (id, username, password_hash, created_at, updated_at)
            VALUES (1, @username, @password_hash, @created_at, @updated_at);
            """;
        command.Parameters.AddWithValue("username", username);
        command.Parameters.AddWithValue("password_hash", passwordHash);
        command.Parameters.AddWithValue("created_at", DateTime.UtcNow);
        command.Parameters.AddWithValue("updated_at", DateTime.UtcNow);
        command.ExecuteNonQuery();
    }

    public void UpdatePasswordHash(string username, string passwordHash)
    {
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE admin_accounts
            SET password_hash = @password_hash, updated_at = @updated_at
            WHERE username = @username;
            """;
        command.Parameters.AddWithValue("username", username);
        command.Parameters.AddWithValue("password_hash", passwordHash);
        command.Parameters.AddWithValue("updated_at", DateTime.UtcNow);
        command.ExecuteNonQuery();
    }
}

public sealed class PostgresBackendSettingsStore(PostgresDatabase database) : IBackendSettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public BackendSettingsOverrides? Get()
    {
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT settings_json FROM backend_settings WHERE id = 1;";
        var value = command.ExecuteScalar() as string;
        return string.IsNullOrWhiteSpace(value)
            ? null
            : JsonSerializer.Deserialize<BackendSettingsOverrides>(value, JsonOptions);
    }

    public void Save(BackendSettingsOverrides settings)
    {
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO backend_settings (id, settings_json, updated_at)
            VALUES (1, @settings, @updated_at)
            ON CONFLICT (id) DO UPDATE SET
                settings_json = EXCLUDED.settings_json,
                updated_at = EXCLUDED.updated_at;
            """;
        command.Parameters.AddWithValue("settings", JsonSerializer.Serialize(settings, JsonOptions));
        command.Parameters.AddWithValue("updated_at", DateTime.UtcNow);
        command.ExecuteNonQuery();
    }
}
