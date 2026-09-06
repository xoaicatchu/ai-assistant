using ProxyAgent.Api.Api;
using ProxyAgent.Api.Storage;
using Microsoft.Extensions.Options;

namespace ProxyAgent.Api.Tests.Storage;

public sealed class SqliteStorageTests
{
    [Fact]
    public void Conversation_round_trips_through_a_new_store_instance()
    {
        var path = CreateTempDatabasePath();
        try
        {
            var first = CreateStore(path);
            var created = first.Create("Test", [
                new ConversationMessage(1, 1, "user", "Xin chào", "complete")
            ]);

            var second = CreateStore(path);
            var loaded = second.Get(created.Id, created.OwnerToken);

            Assert.NotNull(loaded);
            Assert.Equal(created.Id, loaded!.Id);
            Assert.Equal("Xin chào", loaded.Messages[0].Text);
        }
        finally
        {
            DeleteTempDatabase(path);
        }
    }

    [Fact]
    public void Conversation_writes_are_sanitized_before_persistence()
    {
        var path = CreateTempDatabasePath();
        try
        {
            var store = CreateStore(path);
            var created = store.Create(
                new string('T', 120),
                [
                    new ConversationMessage(1, 1, "user", "  Câu hỏi  ", "pending"),
                    new ConversationMessage(2, 1, "assistant", "", "complete"),
                    new ConversationMessage(3, 1, "assistant", "Trả lời", "complete"),
                    new ConversationMessage(4, 1, "system", "Không được lưu", "complete")
                ]);

            var loaded = store.Get(created.Id, created.OwnerToken);

            Assert.NotNull(loaded);
            Assert.Equal(80, loaded!.Title.Length);
            Assert.Collection(
                loaded.Messages,
                message =>
                {
                    Assert.Equal("user", message.Role);
                    Assert.Equal("Câu hỏi", message.Text);
                    Assert.Equal("complete", message.Status);
                },
                message => Assert.Equal("Trả lời", message.Text));
        }
        finally
        {
            DeleteTempDatabase(path);
        }
    }

    [Fact]
    public void Conversation_update_keeps_the_same_opaque_id()
    {
        var path = CreateTempDatabasePath();
        try
        {
            var store = CreateStore(path);
            var created = store.Create("Ban đầu", [
                new ConversationMessage(1, 1, "user", "Một", "complete")
            ]);

            var updated = store.Update(created.Id, "Đã cập nhật", [
                new ConversationMessage(1, 1, "user", "Hai", "complete")
            ], created.OwnerToken);

            Assert.NotNull(updated);
            Assert.Equal(created.Id, updated!.Id);
            Assert.Equal("Đã cập nhật", updated.Title);
            Assert.Equal("Hai", updated.Messages[0].Text);
        }
        finally
        {
            DeleteTempDatabase(path);
        }
    }

    [Fact]
    public void Conversation_is_private_until_the_owner_publishes_it()
    {
        var path = CreateTempDatabasePath();
        try
        {
            var store = CreateStore(path);
            var created = store.Create("Riêng tư", [
                new ConversationMessage(1, 1, "user", "Nội dung", "complete")
            ]);

            Assert.Null(store.Get(created.Id));
            Assert.Null(store.Update(created.Id, "Không được sửa", [], "sai-token"));

            var published = store.Publish(created.Id, created.OwnerToken);

            Assert.NotNull(published);
            Assert.True(published!.IsPublic);
            Assert.NotNull(store.Get(created.Id));
        }
        finally
        {
            DeleteTempDatabase(path);
        }
    }

    private static IConversationStore CreateStore(string path)
    {
        var database = new SqliteDatabase(Options.Create(new StorageOptions { SqlitePath = path }));
        database.Initialize();
        return new SqliteConversationStore(database);
    }

    private static string CreateTempDatabasePath()
        => Path.Combine(Path.GetTempPath(), $"proxy-agent-{Guid.NewGuid():N}.db");

    private static void DeleteTempDatabase(string path)
    {
        foreach (var file in new[] { path, $"{path}-wal", $"{path}-shm" })
        {
            if (File.Exists(file))
            {
                File.Delete(file);
            }
        }
    }
}
