using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;

namespace ProxyAgent.Api.Storage;

public sealed class SqliteDatabase
{
    private readonly string connectionString;

    public SqliteDatabase(IOptions<StorageOptions> options)
    {
        var configuredPath = options.Value.SqlitePath?.Trim();
        var path = string.IsNullOrWhiteSpace(configuredPath)
            ? "App_Data/proxy-agent.db"
            : configuredPath;
        if (!string.Equals(path, ":memory:", StringComparison.OrdinalIgnoreCase) &&
            !Path.IsPathRooted(path))
        {
            path = Path.Combine(AppContext.BaseDirectory, path);
        }

        DatabasePath = path;
        connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = path,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared,
            ForeignKeys = true,
            Pooling = false
        }.ToString();
    }

    public string DatabasePath { get; }

    public void Initialize()
    {
        if (!string.Equals(DatabasePath, ":memory:", StringComparison.OrdinalIgnoreCase))
        {
            var directory = Path.GetDirectoryName(DatabasePath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }
        }

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            PRAGMA busy_timeout = 5000;

            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                messages_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS admin_accounts (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS backend_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                settings_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """;
        command.ExecuteNonQuery();
    }

    public SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection(connectionString);
        connection.Open();
        return connection;
    }
}
