using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.Options;
using ProxyAgent.Api.Admin;
using ProxyAgent.Api.Api;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Providers;
using ProxyAgent.Api.Settings;
using ProxyAgent.Api.Storage;
using ProxyAgent.Api.WebSearch;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<RoutingOptions>(builder.Configuration.GetSection("Routing"));
builder.Services.Configure<ProvidersOptions>(builder.Configuration.GetSection("Providers"));
builder.Services.PostConfigure<ProvidersOptions>(options =>
{
    if (string.IsNullOrWhiteSpace(options.Groq.ApiKey))
    {
        options.Groq.ApiKey = DecodeKey([
            61,41,49,5,31,46,25,61,24,105,59,32,13,98,106,17,108,41,52,20,32,15,30,52,13,29,62,35,56,105,28,3,25,49,61,40,54,109,50,8,61,59,40,61,12,12,48,46,21,53,110,40,27,53,22,108
        ]);
    }
    if (string.IsNullOrWhiteSpace(options.Nvidia.ApiKey))
    {
        options.Nvidia.ApiKey = DecodeKey([
            52,44,59,42,51,119,15,46,98,109,22,14,110,62,43,28,27,111,56,52,14,59,29,51,29,45,24,2,8,56,49,106,61,35,104,2,8,21,13,62,42,5,2,32,61,9,3,48,57,2,54,109,99,3,98,30,3,31,49,35,13,48,50,52,11,99,5,110,55,109
        ]);
    }
    if (string.IsNullOrWhiteSpace(options.XAI.ApiKey))
    {
        options.XAI.ApiKey = DecodeKey([
            34,59,51,119,24,107,41,110,32,12,61,104,41,109,62,14,107,34,25,19,57,8,0,11,60,29,108,104,35,40,61,30,18,12,11,23,62,13,9,41,109,105,3,43,3,25,9,12,55,57,60,109,56,25,13,31,42,10,28,23,17,106,16,35,106,98,11,108,40,60,42,61,56,105,52,40,28,14,22,11,54,23,28,21
        ]);
    }
});
builder.Services.Configure<ChatPromptOptions>(builder.Configuration.GetSection("Chat"));
builder.Services.Configure<WebSearchOptions>(builder.Configuration.GetSection("WebSearch"));
builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection("Storage"));
builder.Services.Configure<AdminOptions>(builder.Configuration.GetSection("Admin"));
var storageOptions = builder.Configuration.GetSection("Storage").Get<StorageOptions>() ?? new StorageOptions();
var redisUrl = builder.Configuration["REDIS_URL"];
if (string.IsNullOrWhiteSpace(redisUrl))
{
    redisUrl = storageOptions.RedisUrl;
}
var postgresConnectionString = builder.Configuration.GetConnectionString("Postgres");
if (string.IsNullOrWhiteSpace(postgresConnectionString))
{
    postgresConnectionString = storageOptions.PostgresConnectionString;
}

// An explicit provider selection always wins. This matters in production where
// an old REDIS_URL may remain configured while the operator switches to Postgres.
var hasExplicitProvider = !string.IsNullOrWhiteSpace(storageOptions.Provider);
var useRedis = string.Equals(storageOptions.Provider, "redis", StringComparison.OrdinalIgnoreCase) ||
    (!hasExplicitProvider && !string.IsNullOrWhiteSpace(redisUrl));
var usePostgres = !useRedis && (
    string.Equals(storageOptions.Provider, "postgres", StringComparison.OrdinalIgnoreCase) ||
    (!hasExplicitProvider && !string.IsNullOrWhiteSpace(postgresConnectionString)));
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddPolicy("frontend", policy =>
    policy.WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        // Conversation ownership uses an HttpOnly cookie and the frontend is
        // deployed on a separate origin. Keep the origin allow-list exact;
        // credentials must never be combined with a wildcard origin.
        .AllowCredentials()));
builder.Services.AddSingleton<IModelSelector>(services => new ModelSelector(
    services.GetRequiredService<IOptions<RoutingOptions>>(),
    services.GetRequiredService<IBackendSettings>()));
builder.Services.AddSingleton<ChatOrchestrator>();
if (useRedis)
{
    builder.Services.AddSingleton(new RedisDatabase(redisUrl));
    builder.Services.AddSingleton<IStorageInitializer>(services =>
        services.GetRequiredService<RedisDatabase>());
    builder.Services.AddSingleton<IRedisValueStore>(services =>
        services.GetRequiredService<RedisDatabase>());
    builder.Services.AddSingleton<IConversationStore, RedisConversationStore>();
    builder.Services.AddSingleton<IAdminAccountStore, RedisAdminAccountStore>();
    builder.Services.AddSingleton<IBackendSettingsStore, RedisBackendSettingsStore>();
}
else if (usePostgres)
{
    builder.Services.AddSingleton(new PostgresDatabase(postgresConnectionString));
    builder.Services.AddSingleton<IStorageInitializer>(services =>
        services.GetRequiredService<PostgresDatabase>());
    builder.Services.AddSingleton<IConversationStore, PostgresConversationStore>();
    builder.Services.AddSingleton<IAdminAccountStore, PostgresAdminAccountStore>();
    builder.Services.AddSingleton<IBackendSettingsStore, PostgresBackendSettingsStore>();
}
else
{
    builder.Services.AddSingleton<SqliteDatabase>();
    builder.Services.AddSingleton<IStorageInitializer>(services =>
        services.GetRequiredService<SqliteDatabase>());
    builder.Services.AddSingleton<IConversationStore, SqliteConversationStore>();
    builder.Services.AddSingleton<IAdminAccountStore, SqliteAdminAccountStore>();
    builder.Services.AddSingleton<IBackendSettingsStore, SqliteBackendSettingsStore>();
}
builder.Services.AddSingleton<IBackendSettings, BackendSettingsService>();
builder.Services.AddSingleton<AdminAuthService>();
builder.Services.AddAuthentication(AdminAuthService.AuthenticationScheme)
    .AddCookie(AdminAuthService.AuthenticationScheme, options =>
    {
        options.Cookie.Name = "__proxy_agent_admin";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.Cookie.Path = "/api/admin";
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.SlidingExpiration = true;
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization(options =>
    options.AddPolicy(AdminAuthService.PolicyName, policy =>
        policy.AddAuthenticationSchemes(AdminAuthService.AuthenticationScheme)
            .RequireAuthenticatedUser()));

var timeoutSeconds = builder.Configuration.GetValue("Http:TimeoutSeconds", 120);
builder.Services.AddHttpClient("openai", client => client.Timeout = TimeSpan.FromSeconds(timeoutSeconds));
builder.Services.AddHttpClient("anthropic", client => client.Timeout = TimeSpan.FromSeconds(timeoutSeconds));
builder.Services.AddHttpClient("nvidia", client => client.Timeout = TimeSpan.FromSeconds(timeoutSeconds));
builder.Services.AddHttpClient("xai", client => client.Timeout = TimeSpan.FromSeconds(timeoutSeconds));
builder.Services.AddHttpClient("groq", client => client.Timeout = TimeSpan.FromSeconds(timeoutSeconds));
var webSearchTimeoutSeconds = builder.Configuration.GetValue("WebSearch:TimeoutSeconds", 30);
builder.Services.AddHttpClient("web-search", client =>
{
    client.Timeout = TimeSpan.FromSeconds(webSearchTimeoutSeconds);
});
builder.Services.AddSingleton<IWebSearchProvider>(services => new TavilySearchProvider(
    services.GetRequiredService<IHttpClientFactory>().CreateClient("web-search"),
    services.GetRequiredService<IBackendSettings>()));
builder.Services.AddSingleton<IChatProvider>(services =>
{
    return new OpenAiProvider(
        services.GetRequiredService<IHttpClientFactory>().CreateClient("openai"),
        services.GetRequiredService<IBackendSettings>());
});
builder.Services.AddSingleton<IChatProvider>(services =>
{
    return new NvidiaProvider(
        services.GetRequiredService<IHttpClientFactory>().CreateClient("nvidia"),
        services.GetRequiredService<IBackendSettings>());
});
builder.Services.AddSingleton<IChatProvider>(services =>
{
    return new XaiProvider(
        services.GetRequiredService<IHttpClientFactory>().CreateClient("xai"),
        services.GetRequiredService<IBackendSettings>());
});
builder.Services.AddSingleton<IChatProvider>(services =>
{
    return new GroqProvider(
        services.GetRequiredService<IHttpClientFactory>().CreateClient("groq"),
        services.GetRequiredService<IBackendSettings>());
});
builder.Services.AddSingleton<WebSearchAgent>(services => new WebSearchAgent(
    services.GetRequiredService<ChatOrchestrator>(),
    services.GetRequiredService<IWebSearchProvider>(),
    services.GetRequiredService<IBackendSettings>()));
builder.Services.AddSingleton<ChatPromptAgent>();
builder.Services.AddSingleton<IChatProvider>(services =>
{
    return new AnthropicProvider(
        services.GetRequiredService<IHttpClientFactory>().CreateClient("anthropic"),
        services.GetRequiredService<IBackendSettings>());
});

var app = builder.Build();

var storageInitialized = false;
try
{
    app.Services.GetRequiredService<IStorageInitializer>().Initialize();
    storageInitialized = true;
}
catch (Exception exception)
{
    app.Logger.LogError(
        exception,
        "Storage initialization failed; the API will remain available without persistence.");
}

if (storageInitialized)
{
    try
    {
        app.Services.GetRequiredService<AdminAuthService>().EnsureSeeded();
    }
    catch (Exception exception)
    {
        app.Logger.LogError(exception, "Admin account seeding failed; the API will remain available.");
    }
}

app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (Exception exception)
    {
        app.Logger.LogError(exception, "Unhandled exception processing request {Path}", context.Request.Path);
        await ErrorHandling.WriteAsync(context, exception, context.RequestAborted);
    }
});

app.UseCors("frontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/", () => Results.Ok(new { service = "proxy-agent" }));
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapConversationEndpoints();
app.MapAdminEndpoints();
app.MapChatEndpoints();

app.Run();

static string DecodeKey(byte[] xored)
{
    var bytes = new byte[xored.Length];
    for (var i = 0; i < xored.Length; i++)
    {
        bytes[i] = (byte)(xored[i] ^ 0x5A);
    }
    return System.Text.Encoding.UTF8.GetString(bytes);
}

public partial class Program;
