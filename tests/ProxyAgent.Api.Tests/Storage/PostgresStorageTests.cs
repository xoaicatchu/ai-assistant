using Npgsql;
using ProxyAgent.Api.Api;
using ProxyAgent.Api.Storage;

namespace ProxyAgent.Api.Tests.Storage;

public sealed class PostgresStorageTests
{
    [SkippableFact]
    public void Conversation_storage_round_trips_authorizes_and_publishes()
    {
        var connectionString = Environment.GetEnvironmentVariable("TEST_POSTGRES_CONNECTION");
        Skip.If(string.IsNullOrWhiteSpace(connectionString),
            "Set TEST_POSTGRES_CONNECTION to run the PostgreSQL storage integration test.");

        var database = new PostgresDatabase(connectionString!);
        database.Initialize();
        database.Initialize();

        var id = ConversationAccessToken.Create()[..22];
        var store = new PostgresConversationStore(database);
        try
        {
            var created = store.Create("Postgres test", [
                new ConversationMessage(1, 1, "user", "Xin chào", "complete")
            ], id);

            Assert.Equal(id, created.Id);
            Assert.Null(store.Get(id));
            Assert.NotNull(store.Get(id, created.OwnerToken));
            Assert.Null(store.Update(id, "Sai quyền", [], "wrong-token"));

            var updated = store.Update(id, "Đã cập nhật", [
                new ConversationMessage(1, 1, "user", "Nội dung mới", "complete")
            ], created.OwnerToken);
            Assert.Equal("Đã cập nhật", updated?.Title);

            var published = store.Publish(id, created.OwnerToken);
            Assert.True(published?.IsPublic);
            Assert.NotNull(store.Get(id));
        }
        finally
        {
            using var connection = database.OpenConnection();
            using var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM conversations WHERE id = @id;";
            command.Parameters.AddWithValue("id", id);
            command.ExecuteNonQuery();
        }
    }
}
