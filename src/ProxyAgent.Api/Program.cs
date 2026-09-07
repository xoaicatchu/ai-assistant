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
        .AllowAnyMethod()));
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

public partial class Program;
