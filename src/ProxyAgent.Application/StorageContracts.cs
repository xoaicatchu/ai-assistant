using ProxyAgent.Api.Api;

namespace ProxyAgent.Api.Storage;

public sealed record AdminAccount(string Username, string PasswordHash);

public interface IAdminAccountStore
{
    AdminAccount? Get(string username);
    bool HasAccount();
    void Create(string username, string passwordHash);
    void UpdatePasswordHash(string username, string passwordHash);
}

public interface IBackendSettingsStore
{
    BackendSettingsOverrides? Get();
    void Save(BackendSettingsOverrides settings);
}

public interface IConversationStore
{
    ConversationCreationResult Create(string title, IReadOnlyList<ConversationMessage> messages, string? requestedId = null);
    ConversationDocument? Get(string id, string? ownerToken = null);
    ConversationDocument? Update(string id, string title, IReadOnlyList<ConversationMessage> messages, string? ownerToken = null);
    ConversationDocument? Publish(string id, string? ownerToken = null);
}

public sealed record ConversationCreationResult(string Id, string OwnerToken);
