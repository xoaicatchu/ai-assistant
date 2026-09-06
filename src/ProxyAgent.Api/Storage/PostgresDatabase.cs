using Npgsql;

namespace ProxyAgent.Api.Storage;

public sealed class PostgresDatabase : IStorageInitializer
{
    private readonly string connectionString;

    public PostgresDatabase(string connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new ArgumentException("A PostgreSQL connection string is required.", nameof(connectionString));
        }

        this.connectionString = connectionString.Trim();
    }

    public NpgsqlConnection OpenConnection()
    {
        var connection = new NpgsqlConnection(connectionString);
        connection.Open();
        return connection;
    }

    public void Initialize()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                messages_json TEXT NOT NULL,
                owner_token_hash TEXT NOT NULL DEFAULT '',
                is_public BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL
            );

            ALTER TABLE conversations
                ADD COLUMN IF NOT EXISTS owner_token_hash TEXT NOT NULL DEFAULT '';
            ALTER TABLE conversations
                ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
            UPDATE conversations
            SET is_public = TRUE
            WHERE owner_token_hash = '' AND is_public = FALSE;

            CREATE TABLE IF NOT EXISTS admin_accounts (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL
            );

            CREATE TABLE IF NOT EXISTS backend_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                settings_json TEXT NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL
            );
            """;
        command.ExecuteNonQuery();
    }
}
