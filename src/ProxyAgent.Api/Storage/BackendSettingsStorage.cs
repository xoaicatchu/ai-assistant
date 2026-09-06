using System.Text.Json;
using Microsoft.Data.Sqlite;
using ProxyAgent.Api.Api;

namespace ProxyAgent.Api.Storage;

public interface IBackendSettingsStore
{
    BackendSettingsOverrides? Get();
    void Save(BackendSettingsOverrides settings);
}

public sealed class SqliteBackendSettingsStore(SqliteDatabase database) : IBackendSettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public BackendSettingsOverrides? Get()
    {
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT settings_json FROM backend_settings WHERE id = 1;";
        var value = command.ExecuteScalar() as string;
        return string.IsNullOrWhiteSpace(value)
            ? null
            : JsonSerializer.Deserialize<BackendSettingsOverrides>(value, JsonOptions);
    }

    public void Save(BackendSettingsOverrides settings)
    {
        var now = DateTimeOffset.UtcNow.ToString("O");
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO backend_settings (id, settings_json, updated_at)
            VALUES (1, $settings, $updated_at)
            ON CONFLICT(id) DO UPDATE SET
                settings_json = excluded.settings_json,
                updated_at = excluded.updated_at;
            """;
        command.Parameters.AddWithValue("$settings", JsonSerializer.Serialize(settings, JsonOptions));
        command.Parameters.AddWithValue("$updated_at", now);
        command.ExecuteNonQuery();
    }
}
