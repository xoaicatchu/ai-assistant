using ProxyAgent.Api.Admin;
using ProxyAgent.Api.Api;
using ProxyAgent.Api.Storage;

namespace ProxyAgent.Api.Tests.Storage;

public sealed class RedisStorageTests
{
    [Fact]
    public void Conversation_store_round_trips_authorizes_and_publishes()
    {
        var store = new RedisConversationStore(new MemoryRedisValueStore());
        var created = store.Create("Redis test", [
            new ConversationMessage(1, 1, "user", "Xin chào", "complete")
        ], "abcdefghijklmnopqrstuv");

        Assert.Equal("abcdefghijklmnopqrstuv", created.Id);
        Assert.Null(store.Get(created.Id));
        Assert.NotNull(store.Get(created.Id, created.OwnerToken));
        Assert.Null(store.Update(created.Id, "Sai quyền", [], "wrong-token"));

        var updated = store.Update(created.Id, "Đã cập nhật", [
            new ConversationMessage(1, 1, "user", "Nội dung mới", "complete")
        ], created.OwnerToken);
        Assert.Equal("Đã cập nhật", updated?.Title);

        var published = store.Publish(created.Id, created.OwnerToken);
        Assert.True(published?.IsPublic);
        Assert.NotNull(store.Get(created.Id));
    }

    [Fact]
    public void Admin_and_backend_settings_share_the_same_redis_value_store()
    {
        var values = new MemoryRedisValueStore();
        var admin = new RedisAdminAccountStore(values);
        var settings = new RedisBackendSettingsStore(values);

        admin.Create("admin", AdminPasswordHasher.Hash("password-123"));
        Assert.True(admin.HasAccount());
        Assert.Equal("admin", admin.Get("admin")?.Username);

        var overrides = new BackendSettingsOverrides(
            new ProviderSettingsOverride("https://openai.example/v1", "api-key", "model", null),
            null,
            null);
        settings.Save(overrides);

        var loaded = settings.Get();
        Assert.Equal("https://openai.example/v1", loaded?.OpenAI?.BaseUrl);
    }

    private sealed class MemoryRedisValueStore : IRedisValueStore
    {
        private readonly Dictionary<string, string> values = new(StringComparer.Ordinal);

        public string? Get(string key) => values.TryGetValue(key, out var value) ? value : null;

        public void Set(string key, string value) => values[key] = value;

        public bool TrySet(string key, string value)
        {
            if (values.ContainsKey(key))
            {
                return false;
            }

            values[key] = value;
            return true;
        }
    }
}
