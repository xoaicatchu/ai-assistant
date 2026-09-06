using Microsoft.Extensions.Options;
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
