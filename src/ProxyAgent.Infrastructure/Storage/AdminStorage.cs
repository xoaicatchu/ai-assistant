using Microsoft.Data.Sqlite;

namespace ProxyAgent.Api.Storage;

public sealed class SqliteAdminAccountStore(SqliteDatabase database) : IAdminAccountStore
{
    public AdminAccount? Get(string username)
    {
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT username, password_hash FROM admin_accounts WHERE username = $username;";
        command.Parameters.AddWithValue("$username", username);
        using var reader = command.ExecuteReader();
        return reader.Read() ? new AdminAccount(reader.GetString(0), reader.GetString(1)) : null;
    }

    public bool HasAccount()
    {
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT EXISTS(SELECT 1 FROM admin_accounts LIMIT 1);";
        return Convert.ToInt32(command.ExecuteScalar()) == 1;
    }

    public void Create(string username, string passwordHash)
    {
        var now = DateTimeOffset.UtcNow.ToString("O");
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO admin_accounts (id, username, password_hash, created_at, updated_at)
            VALUES (1, $username, $password_hash, $created_at, $updated_at);
            """;
        command.Parameters.AddWithValue("$username", username);
        command.Parameters.AddWithValue("$password_hash", passwordHash);
        command.Parameters.AddWithValue("$created_at", now);
        command.Parameters.AddWithValue("$updated_at", now);
        command.ExecuteNonQuery();
    }

    public void UpdatePasswordHash(string username, string passwordHash)
    {
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE admin_accounts
            SET password_hash = $password_hash, updated_at = $updated_at
            WHERE username = $username;
            """;
        command.Parameters.AddWithValue("$username", username);
        command.Parameters.AddWithValue("$password_hash", passwordHash);
        command.Parameters.AddWithValue("$updated_at", DateTimeOffset.UtcNow.ToString("O"));
        command.ExecuteNonQuery();
    }
}
