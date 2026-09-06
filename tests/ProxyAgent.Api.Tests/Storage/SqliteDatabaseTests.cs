using Microsoft.Extensions.Options;
using Microsoft.Data.Sqlite;
using ProxyAgent.Api.Api;
using ProxyAgent.Api.Storage;

namespace ProxyAgent.Api.Tests.Storage;

public sealed class SqliteDatabaseTests
{
    [Fact]
    public void Falls_back_to_a_temporary_database_when_the_configured_path_is_not_writable()
    {
        var blockerPath = Path.Combine(Path.GetTempPath(), $"proxy-agent-blocker-{Guid.NewGuid():N}");
        var configuredPath = Path.Combine(blockerPath, "proxy-agent.db");
        File.WriteAllText(blockerPath, "not a directory");

        var database = new SqliteDatabase(Options.Create(new StorageOptions { SqlitePath = configuredPath }));
        try
        {
            database.Initialize();

            Assert.NotEqual(configuredPath, database.DatabasePath);
            using var connection = database.OpenConnection();
            using var command = connection.CreateCommand();
            command.CommandText = "SELECT 1;";
            Assert.Equal(1L, command.ExecuteScalar());
        }
        finally
        {
            DeleteDatabase(database.DatabasePath);
            File.Delete(blockerPath);
        }
    }

    [Fact]
    public void Legacy_conversations_remain_public_after_the_schema_upgrade()
    {
        var path = Path.Combine(Path.GetTempPath(), $"proxy-agent-legacy-{Guid.NewGuid():N}.db");
        const string id = "abcdefghijklmnopqrstuv";
        try
        {
            var connectionString = new SqliteConnectionStringBuilder
            {
                DataSource = path,
                Pooling = false
            }.ToString();
            using (var connection = new SqliteConnection(connectionString))
            {
                connection.Open();
                using (var command = connection.CreateCommand())
                {
                    command.CommandText = """
                        CREATE TABLE conversations (
                            id TEXT PRIMARY KEY,
                            title TEXT NOT NULL,
                            messages_json TEXT NOT NULL,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL
                        );
                        INSERT INTO conversations (id, title, messages_json, created_at, updated_at)
                        VALUES ('abcdefghijklmnopqrstuv', 'Cũ', '[]', '2026-01-01', '2026-01-01');
                        """;
                    command.ExecuteNonQuery();
                }
            }

            var database = new SqliteDatabase(Options.Create(new StorageOptions { SqlitePath = path }));
            database.Initialize();

            var document = new SqliteConversationStore(database).Get(id);

            Assert.NotNull(document);
            Assert.True(document!.IsPublic);
        }
        finally
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

    private static void DeleteDatabase(string path)
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
