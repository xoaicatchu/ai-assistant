using System.Text.Json;
using ProxyAgent.Api.Admin;
using ProxyAgent.Api.Api;

namespace ProxyAgent.Api.Storage;

public sealed class RedisConversationStore(IRedisValueStore redis) : IConversationStore
{
    private const string KeyPrefix = "medical-harness:conversation:";
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
            var record = new RedisConversationRecord(
                document.Id,
                document.Title,
                document.Messages,
                ownerTokenHash,
                document.IsPublic);
            if (redis.TrySet(Key(id), JsonSerializer.Serialize(record, JsonOptions)))
            {
                return new ConversationCreationResult(document.Id, ownerToken);
            }
        }

        throw new InvalidOperationException("Could not allocate a conversation ID.");
    }

    public ConversationDocument? Get(string id, string? ownerToken = null)
    {
        var record = Read(id);
        if (record is null || (!record.IsPublic && !ConversationAccessToken.Matches(ownerToken, record.OwnerTokenHash)))
        {
            return null;
        }

        return record.ToDocument();
    }

    public ConversationDocument? Update(
        string id,
        string title,
        IReadOnlyList<ConversationMessage> messages,
        string? ownerToken = null)
    {
        var existing = Read(id);
        if (existing is null || !ConversationAccessToken.Matches(ownerToken, existing.OwnerTokenHash))
        {
            return null;
        }

        var document = new ConversationDocument(id, title, messages, existing.IsPublic).Sanitize();
        var updated = existing with
        {
            Title = document.Title,
            Messages = document.Messages
        };
        redis.Set(Key(id), JsonSerializer.Serialize(updated, JsonOptions));
        return document;
    }

    public ConversationDocument? Publish(string id, string? ownerToken = null)
    {
        var existing = Read(id);
        if (existing is null || !ConversationAccessToken.Matches(ownerToken, existing.OwnerTokenHash))
        {
            return null;
        }

        var published = existing with { IsPublic = true };
        redis.Set(Key(id), JsonSerializer.Serialize(published, JsonOptions));
        return published.ToDocument();
    }

    private RedisConversationRecord? Read(string id)
    {
        if (!ConversationId.IsValid(id))
        {
            return null;
        }

        var value = redis.Get(Key(id));
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<RedisConversationRecord>(value, JsonOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string Key(string id) => $"{KeyPrefix}{id}";

    private static string CreateId() => ConversationAccessToken.Create()[..22];

    private sealed record RedisConversationRecord(
        string Id,
        string Title,
        IReadOnlyList<ConversationMessage> Messages,
        string OwnerTokenHash,
        bool IsPublic)
    {
        public ConversationDocument ToDocument() =>
            new(Id, Title, Messages, IsPublic);
    }
}

public sealed class RedisAdminAccountStore(IRedisValueStore redis) : IAdminAccountStore
{
    private const string Key = "medical-harness:admin-account";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public AdminAccount? Get(string username)
    {
        var account = Read();
        return account is not null && string.Equals(account.Username, username, StringComparison.Ordinal)
            ? account.ToAccount()
            : null;
    }

    public bool HasAccount() => Read() is not null;

    public void Create(string username, string passwordHash)
    {
        var record = new RedisAdminAccountRecord(username, passwordHash);
        if (!redis.TrySet(Key, JsonSerializer.Serialize(record, JsonOptions)))
        {
            throw new InvalidOperationException("The admin account already exists.");
        }
    }

    public void UpdatePasswordHash(string username, string passwordHash)
    {
        var account = Read();
        if (account is null || !string.Equals(account.Username, username, StringComparison.Ordinal))
        {
            return;
        }

        redis.Set(Key, JsonSerializer.Serialize(account with { PasswordHash = passwordHash }, JsonOptions));
    }

    private RedisAdminAccountRecord? Read()
    {
        var value = redis.Get(Key);
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<RedisAdminAccountRecord>(value, JsonOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private sealed record RedisAdminAccountRecord(string Username, string PasswordHash)
    {
        public AdminAccount ToAccount() => new(Username, PasswordHash);
    }
}

public sealed class RedisBackendSettingsStore(IRedisValueStore redis) : IBackendSettingsStore
{
    private const string Key = "medical-harness:backend-settings";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public BackendSettingsOverrides? Get()
    {
        var value = redis.Get(Key);
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<BackendSettingsOverrides>(value, JsonOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public void Save(BackendSettingsOverrides settings) =>
        redis.Set(Key, JsonSerializer.Serialize(settings, JsonOptions));
}
