using ProxyAgent.Api.Chat;

namespace ProxyAgent.Api.Tests.Chat;

public sealed class ModelCapabilitiesTests
{
    [Theory]
    [InlineData("deepseek/deepseek-v4-flash", ModelCapabilitySupport.Unsupported, ModelCapabilitySupport.Supported)]
    [InlineData("x-ai/grok-4.6", ModelCapabilitySupport.Supported, ModelCapabilitySupport.Supported)]
    [InlineData("deepseek/deepseek-v4-flash-vision-exp", ModelCapabilitySupport.Supported, ModelCapabilitySupport.Supported)]
    public void For_returns_capabilities_for_known_model_aliases(
        string model,
        ModelCapabilitySupport vision,
        ModelCapabilitySupport toolCalling)
    {
        var result = ModelCapabilityCatalog.For(model);

        Assert.Equal(vision, result.Vision);
        Assert.Equal(toolCalling, result.ToolCalling);
    }

    [Fact]
    public void For_marks_unregistered_custom_models_as_unknown()
    {
        var result = ModelCapabilityCatalog.For("custom/model");

        Assert.Equal(ModelCapabilitySupport.Unknown, result.Vision);
        Assert.Equal(ModelCapabilitySupport.Unknown, result.ToolCalling);
    }
}
