namespace ProxyAgent.Api.Chat;

public enum ModelCapabilitySupport
{
    Supported,
    Unsupported,
    Unknown
}

public sealed record ModelCapabilities(
    ModelCapabilitySupport Vision,
    ModelCapabilitySupport ToolCalling);

public static class ModelCapabilityCatalog
{
    private static readonly ModelCapabilities TextAndTools = new(
        ModelCapabilitySupport.Unsupported,
        ModelCapabilitySupport.Supported);

    private static readonly ModelCapabilities VisionAndTools = new(
        ModelCapabilitySupport.Supported,
        ModelCapabilitySupport.Supported);

    private static readonly ModelCapabilities Unknown = new(
        ModelCapabilitySupport.Unknown,
        ModelCapabilitySupport.Unknown);

    public static ModelCapabilities For(string? model)
    {
        var normalized = Normalize(model);
        return normalized switch
        {
            "deepseek/deepseek-v4-flash" or "deepseek-v4-flash" => TextAndTools,
            "deepseek/deepseek-v4-flash-vision-exp" or "deepseek-v4-flash-vision-exp" => VisionAndTools,
            "x-ai/grok-4.6" or "grok-4.6" => VisionAndTools,
            _ => Unknown
        };
    }

    private static string Normalize(string? model)
    {
        var value = model?.Trim().ToLowerInvariant() ?? string.Empty;
        var separator = value.IndexOf(':');
        return separator > 0 ? value[(separator + 1)..].Trim() : value;
    }
}
