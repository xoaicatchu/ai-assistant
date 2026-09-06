using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;

namespace ProxyAgent.Api.Storage;

public sealed class SqliteDatabase : IStorageInitializer
{
    private string connectionString = string.Empty;

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

        ConfigurePath(path);
    }

    public string DatabasePath { get; private set; } = string.Empty;

    public void Initialize()
    {
        try
        {
            InitializeConfiguredPath();
        }
        catch (Exception exception) when (CanFallBackToTemporaryStorage(exception))
        {
            var fallbackPath = Path.Combine(
                Path.GetTempPath(),
                "proxy-agent",
                $"proxy-agent-{Environment.ProcessId}.db");
            if (string.Equals(DatabasePath, fallbackPath, StringComparison.OrdinalIgnoreCase))
            {
                throw;
            }

            ConfigurePath(fallbackPath);
            InitializeConfiguredPath();
        }
    }

    public SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection(connectionString);
        connection.Open();
        return connection;
    }

    private void InitializeConfiguredPath()
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
                owner_token_hash TEXT NOT NULL DEFAULT '',
                is_public INTEGER NOT NULL DEFAULT 0,
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
        EnsureConversationColumns(connection);
    }

    private static void EnsureConversationColumns(SqliteConnection connection)
    {
        using var columns = connection.CreateCommand();
        columns.CommandText = "PRAGMA table_info(conversations);";
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using (var reader = columns.ExecuteReader())
        {
            while (reader.Read())
            {
                names.Add(reader.GetString(1));
            }
        }

        if (!names.Contains("owner_token_hash"))
        {
            using var command = connection.CreateCommand();
            command.CommandText = "ALTER TABLE conversations ADD COLUMN owner_token_hash TEXT NOT NULL DEFAULT '';";
            command.ExecuteNonQuery();
        }

        if (!names.Contains("is_public"))
        {
            using var command = connection.CreateCommand();
            command.CommandText = "ALTER TABLE conversations ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;";
            command.ExecuteNonQuery();
        }

        // Before owner tokens existed, every persisted conversation was readable by its opaque ID.
        // Keep those legacy links readable after the schema upgrade; newly created rows always have
        // a non-empty owner hash and remain private until explicitly published.
        using var legacy = connection.CreateCommand();
        legacy.CommandText = """
            UPDATE conversations
            SET is_public = 1
            WHERE owner_token_hash = '' AND is_public = 0;
            """;
        legacy.ExecuteNonQuery();
    }

    private void ConfigurePath(string path)
    {
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

    private static bool CanFallBackToTemporaryStorage(Exception exception) =>
        exception is IOException or UnauthorizedAccessException or SqliteException;
}
