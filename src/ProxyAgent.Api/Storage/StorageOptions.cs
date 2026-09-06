namespace ProxyAgent.Api.Storage;

public sealed class StorageOptions
{
    public string SqlitePath { get; set; } = "App_Data/proxy-agent.db";
}
