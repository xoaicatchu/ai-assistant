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
            "deepseek-ai/deepseek-v4.1-flash" => TextAndTools,
            "openai/gpt-oss-120b" or "openai/gpt-oss-20b" or "gpt-oss-120b" or "gpt-oss-20b" => TextAndTools,
            "deepseek/deepseek-v4-flash-vision-exp" or "deepseek-v4-flash-vision-exp" => VisionAndTools,
            "meta/llama-3.2-11b-vision-instruct" => VisionAndTools,
            "x-ai/grok-4.6" or "grok-4.6" => VisionAndTools,
            "x-ai/grok-2-latest" or "grok-2-latest" or "grok-2" or "grok-beta" or "grok-2-vision-latest" => VisionAndTools,
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
