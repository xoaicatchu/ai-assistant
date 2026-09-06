namespace ProxyAgent.Api.Storage;

public sealed class StorageOptions
{
    public string SqlitePath { get; set; } = "App_Data/proxy-agent.db";
    public string Provider { get; set; } = "sqlite";
    public string PostgresConnectionString { get; set; } = string.Empty;
    public string RedisUrl { get; set; } = string.Empty;
}

public interface IStorageInitializer
{
    void Initialize();
}
