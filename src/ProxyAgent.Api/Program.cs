using Microsoft.Extensions.Options;
using ProxyAgent.Api.Api;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Providers;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<RoutingOptions>(builder.Configuration.GetSection("Routing"));
builder.Services.Configure<ProvidersOptions>(builder.Configuration.GetSection("Providers"));
builder.Services.AddSingleton<IModelSelector, ModelSelector>();
builder.Services.AddSingleton<ChatOrchestrator>();

var timeoutSeconds = builder.Configuration.GetValue("Http:TimeoutSeconds", 120);
builder.Services.AddHttpClient("openai", client => client.Timeout = TimeSpan.FromSeconds(timeoutSeconds));
builder.Services.AddHttpClient("anthropic", client => client.Timeout = TimeSpan.FromSeconds(timeoutSeconds));
builder.Services.AddSingleton<IChatProvider>(services =>
{
    var options = services.GetRequiredService<IOptions<ProvidersOptions>>().Value;
    return new OpenAiProvider(
        services.GetRequiredService<IHttpClientFactory>().CreateClient("openai"),
        Options.Create(options.OpenAI));
});
builder.Services.AddSingleton<IChatProvider>(services =>
{
    var options = services.GetRequiredService<IOptions<ProvidersOptions>>().Value;
    return new AnthropicProvider(
        services.GetRequiredService<IHttpClientFactory>().CreateClient("anthropic"),
        Options.Create(options.Anthropic));
});

var app = builder.Build();

app.MapGet("/", () => Results.Ok(new { service = "proxy-agent" }));
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapChatEndpoints();

app.Run();

public partial class Program;
