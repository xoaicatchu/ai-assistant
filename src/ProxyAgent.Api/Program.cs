using Microsoft.Extensions.Options;
using ProxyAgent.Api.Api;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Providers;
using ProxyAgent.Api.WebSearch;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<RoutingOptions>(builder.Configuration.GetSection("Routing"));
builder.Services.Configure<ProvidersOptions>(builder.Configuration.GetSection("Providers"));
builder.Services.Configure<ChatPromptOptions>(builder.Configuration.GetSection("Chat"));
builder.Services.Configure<WebSearchOptions>(builder.Configuration.GetSection("WebSearch"));
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddPolicy("frontend", policy =>
    policy.WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()));
builder.Services.AddSingleton<IModelSelector, ModelSelector>();
builder.Services.AddSingleton<ChatOrchestrator>();

var timeoutSeconds = builder.Configuration.GetValue("Http:TimeoutSeconds", 120);
builder.Services.AddHttpClient("openai", client => client.Timeout = TimeSpan.FromSeconds(timeoutSeconds));
builder.Services.AddHttpClient("anthropic", client => client.Timeout = TimeSpan.FromSeconds(timeoutSeconds));
var webSearchTimeoutSeconds = builder.Configuration.GetValue("WebSearch:TimeoutSeconds", 30);
builder.Services.AddHttpClient<IWebSearchProvider, TavilySearchProvider>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(webSearchTimeoutSeconds);
});
builder.Services.AddSingleton<IChatProvider>(services =>
{
    var options = services.GetRequiredService<IOptions<ProvidersOptions>>().Value;
    return new OpenAiProvider(
        services.GetRequiredService<IHttpClientFactory>().CreateClient("openai"),
        Options.Create(options.OpenAI));
});
builder.Services.AddSingleton<WebSearchAgent>();
builder.Services.AddSingleton<ChatPromptAgent>();
builder.Services.AddSingleton<IChatProvider>(services =>
{
    var options = services.GetRequiredService<IOptions<ProvidersOptions>>().Value;
    return new AnthropicProvider(
        services.GetRequiredService<IHttpClientFactory>().CreateClient("anthropic"),
        Options.Create(options.Anthropic));
});

var app = builder.Build();

app.UseCors("frontend");
app.MapGet("/", () => Results.Ok(new { service = "proxy-agent" }));
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapChatEndpoints();

app.Run();

public partial class Program;
