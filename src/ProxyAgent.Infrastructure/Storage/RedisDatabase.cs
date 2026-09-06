using System.Net.Sockets;
using StackExchange.Redis;

namespace ProxyAgent.Api.Storage;

public interface IRedisValueStore
{
    string? Get(string key);
    void Set(string key, string value);
    bool TrySet(string key, string value);
}

public sealed class RedisDatabase : IStorageInitializer, IRedisValueStore, IDisposable
{
    private readonly Lazy<ConnectionMultiplexer>? connection;
    private readonly string? configurationError;

    public RedisDatabase(string? connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            configurationError = "Redis connection string is not configured.";
            return;
        }

        try
        {
            var options = RedisConnectionStringNormalizer.CreateOptions(connectionString);
            connection = new Lazy<ConnectionMultiplexer>(
                () => ConnectionMultiplexer.Connect(options),
                LazyThreadSafetyMode.ExecutionAndPublication);
        }
        catch (Exception exception) when (exception is ArgumentException or FormatException)
        {
            configurationError = exception.Message;
        }
    }

    public void Initialize()
    {
        Execute(database =>
        {
            database.Ping();
            return 0;
        });
    }

    public string? Get(string key) => Execute(database =>
    {
        var value = database.StringGet(key);
        return value.IsNull ? null : value.ToString();
    });

    public void Set(string key, string value)
    {
        Execute(database =>
        {
            database.StringSet(key, value);
            return 0;
        });
    }

    public bool TrySet(string key, string value) => Execute(database =>
        database.StringSet(key, value, when: When.NotExists));

    public void Dispose()
    {
        if (connection?.IsValueCreated == true)
        {
            connection.Value.Dispose();
        }
    }

    private T Execute<T>(Func<StackExchange.Redis.IDatabase, T> operation)
    {
        if (configurationError is not null)
        {
            throw new StorageUnavailableException(
                $"Redis persistence is unavailable: {configurationError}");
        }

        try
        {
            return operation(connection!.Value.GetDatabase());
        }
        catch (Exception exception) when (IsStorageFailure(exception))
        {
            throw new StorageUnavailableException(
                "Redis persistence is temporarily unavailable.",
                exception);
        }
    }

    private static bool IsStorageFailure(Exception exception) => exception is
        RedisException or TimeoutException or SocketException or IOException;
}

public static class RedisConnectionStringNormalizer
{
    private const int DefaultTimeoutMilliseconds = 3000;

    public static ConfigurationOptions CreateOptions(string connectionString)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);
        var value = connectionString.Trim().Trim('"');
        if (value.StartsWith("redis\\://", StringComparison.OrdinalIgnoreCase))
        {
            value = $"redis://{value["redis\\://".Length..]}";
        }
        else if (value.StartsWith("rediss\\://", StringComparison.OrdinalIgnoreCase))
        {
            value = $"rediss://{value["rediss\\://".Length..]}";
        }

        var looksLikeRedisUri = value.StartsWith("redis://", StringComparison.OrdinalIgnoreCase) ||
            value.StartsWith("rediss://", StringComparison.OrdinalIgnoreCase);
        if (!looksLikeRedisUri)
        {
            var parsed = ConfigurationOptions.Parse(value);
            ApplyDefaults(parsed);
            return parsed;
        }

        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            (!string.Equals(uri.Scheme, "redis", StringComparison.OrdinalIgnoreCase) &&
             !string.Equals(uri.Scheme, "rediss", StringComparison.OrdinalIgnoreCase)))
        {
            throw new ArgumentException("Redis URI is invalid.", nameof(connectionString));
        }

        if (string.IsNullOrWhiteSpace(uri.Host))
        {
            throw new ArgumentException("Redis URI must include a host.", nameof(connectionString));
        }

        var userInfoSeparator = uri.UserInfo.IndexOf(':');
        if (userInfoSeparator <= 0 || userInfoSeparator == uri.UserInfo.Length - 1)
        {
            throw new ArgumentException(
                "Redis URI must include a username and password.",
                nameof(connectionString));
        }

        var username = Uri.UnescapeDataString(uri.UserInfo[..userInfoSeparator]);
        var password = Uri.UnescapeDataString(uri.UserInfo[(userInfoSeparator + 1)..]);
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
        {
            throw new ArgumentException(
                "Redis URI must include a username and password.",
                nameof(connectionString));
        }

        var options = new ConfigurationOptions
        {
            User = username,
            Password = password,
            Ssl = string.Equals(uri.Scheme, "rediss", StringComparison.OrdinalIgnoreCase),
            SslHost = uri.Host
        };
        options.EndPoints.Add(uri.Host, uri.IsDefaultPort || uri.Port <= 0 ? 6379 : uri.Port);
        ApplyDefaults(options);
        return options;
    }

    private static void ApplyDefaults(ConfigurationOptions options)
    {
        options.AbortOnConnectFail = false;
        options.ConnectTimeout = DefaultTimeoutMilliseconds;
        options.SyncTimeout = DefaultTimeoutMilliseconds;
        options.ConnectRetry = 1;
        options.KeepAlive = 30;
    }
}
