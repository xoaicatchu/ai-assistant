using System.Net.Sockets;
using Npgsql;

namespace ProxyAgent.Api.Storage;

public sealed class PostgresDatabase : IStorageInitializer
{
    private readonly string? connectionString;
    private readonly string? configurationError;
    private readonly object initializationGate = new();
    private int initialized;

    public PostgresDatabase(string? connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            configurationError = "PostgreSQL connection string is not configured.";
            return;
        }

        try
        {
            this.connectionString = PostgresConnectionStringNormalizer.Normalize(connectionString);
        }
        catch (ArgumentException exception)
        {
            configurationError = exception.Message;
        }
    }

    public NpgsqlConnection OpenConnection()
    {
        var connection = OpenRawConnection();
        try
        {
            EnsureInitialized(connection);
            return connection;
        }
        catch
        {
            connection.Dispose();
            throw;
        }
    }

    public void Initialize()
    {
        using var connection = OpenRawConnection();
        EnsureInitialized(connection);
    }

    private NpgsqlConnection OpenRawConnection()
    {
        if (configurationError is not null)
        {
            throw new StorageUnavailableException(
                $"PostgreSQL persistence is unavailable: {configurationError}");
        }

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new StorageUnavailableException("PostgreSQL connection string is not configured.");
        }

        var connection = new NpgsqlConnection(connectionString);
        try
        {
            connection.Open();
            return connection;
        }
        catch (Exception exception) when (IsStorageFailure(exception))
        {
            connection.Dispose();
            throw new StorageUnavailableException(
                "PostgreSQL persistence is temporarily unavailable.",
                exception);
        }
    }

    private void EnsureInitialized(NpgsqlConnection connection)
    {
        if (Volatile.Read(ref initialized) == 1)
        {
            return;
        }

        lock (initializationGate)
        {
            if (initialized == 1)
            {
                return;
            }

            try
            {
                EnsureSchema(connection);
                Volatile.Write(ref initialized, 1);
            }
            catch (StorageUnavailableException)
            {
                throw;
            }
            catch (Exception exception) when (IsStorageFailure(exception))
            {
                throw new StorageUnavailableException(
                    "PostgreSQL schema could not be initialized.",
                    exception);
            }
        }
    }

    private static void EnsureSchema(NpgsqlConnection connection)
    {
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

    private static bool IsStorageFailure(Exception exception) => exception is
        NpgsqlException or TimeoutException or SocketException or IOException;
}

public static class PostgresConnectionStringNormalizer
{
    private const int DefaultConnectionTimeoutSeconds = 3;

    public static string Normalize(string connectionString)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);
        var value = connectionString.Trim();
        if (!value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase) &&
            !value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase))
        {
            var keyValueBuilder = new NpgsqlConnectionStringBuilder(value);
            if (keyValueBuilder.Timeout == 15)
            {
                keyValueBuilder.Timeout = DefaultConnectionTimeoutSeconds;
            }

            return keyValueBuilder.ConnectionString;
        }

        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            (!string.Equals(uri.Scheme, "postgres", StringComparison.OrdinalIgnoreCase) &&
             !string.Equals(uri.Scheme, "postgresql", StringComparison.OrdinalIgnoreCase)))
        {
            throw new ArgumentException("PostgreSQL URI is invalid.", nameof(connectionString));
        }

        var userInfoSeparator = uri.UserInfo.IndexOf(':');
        if (userInfoSeparator <= 0 || userInfoSeparator == uri.UserInfo.Length - 1)
        {
            throw new ArgumentException(
                "PostgreSQL URI must include a username and password.",
                nameof(connectionString));
        }

        var username = Uri.UnescapeDataString(uri.UserInfo[..userInfoSeparator]);
        var password = Uri.UnescapeDataString(uri.UserInfo[(userInfoSeparator + 1)..]);
        var database = Uri.UnescapeDataString(uri.AbsolutePath.Trim('/'));
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password) ||
            string.IsNullOrWhiteSpace(database))
        {
            throw new ArgumentException(
                "PostgreSQL URI must include a username, password, and database.",
                nameof(connectionString));
        }

        if (password.Contains("[YOUR-PASSWORD]", StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException(
                "Replace [YOUR-PASSWORD] in the PostgreSQL URI with the real database password.",
                nameof(connectionString));
        }

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort || uri.Port <= 0 ? 5432 : uri.Port,
            Database = database,
            Username = username,
            Password = password,
            SslMode = SslMode.Require,
            Timeout = DefaultConnectionTimeoutSeconds
        };
        ApplyQueryOptions(builder, uri.Query);
        return builder.ConnectionString;
    }

    private static void ApplyQueryOptions(NpgsqlConnectionStringBuilder builder, string query)
    {
        foreach (var item in query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var separator = item.IndexOf('=');
            if (separator <= 0)
            {
                continue;
            }

            var key = Uri.UnescapeDataString(item[..separator]).ToLowerInvariant();
            var value = Uri.UnescapeDataString(item[(separator + 1)..]);
            switch (key)
            {
                case "sslmode" when Enum.TryParse<SslMode>(value, true, out var sslMode):
                    builder.SslMode = sslMode;
                    break;
                case "sslmode":
                    throw new ArgumentException($"Unsupported PostgreSQL sslmode '{value}'.");
                case "application_name":
                case "applicationname":
                    builder.ApplicationName = value;
                    break;
                case "connect_timeout" or "timeout"
                    when int.TryParse(value, out var timeout) && timeout > 0:
                    builder.Timeout = timeout;
                    break;
            }
        }
    }
}
