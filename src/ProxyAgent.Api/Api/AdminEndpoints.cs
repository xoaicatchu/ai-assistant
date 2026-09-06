using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using ProxyAgent.Api.Admin;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Settings;
using ProxyAgent.Api.WebSearch;

namespace ProxyAgent.Api.Api;

public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/api/admin/login", (Delegate)LoginAsync);
        endpoints.MapPost("/api/admin/logout", (Delegate)LogoutAsync);
        endpoints.MapGet("/api/admin/session", (Delegate)Session);

        var protectedEndpoints = endpoints.MapGroup("/api/admin")
            .RequireAuthorization(AdminAuthService.PolicyName);
        protectedEndpoints.MapGet("/settings", (Delegate)GetSettings);
        protectedEndpoints.MapPut("/settings", (Delegate)SaveSettings);
        protectedEndpoints.MapPut("/password", (Delegate)ChangePassword);
        return endpoints;
    }

    private static async Task<IResult> LoginAsync(
        HttpContext context,
        AdminLoginRequest? request,
        AdminAuthService auth)
    {
        auth.EnsureSeeded();
        var account = auth.Authenticate(request?.Username, request?.Password);
        if (account is null)
        {
            return Results.Unauthorized();
        }

        var principal = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.Name, account.Username)],
            AdminAuthService.AuthenticationScheme));
        await context.SignInAsync(
            AdminAuthService.AuthenticationScheme,
            principal,
            new AuthenticationProperties { IsPersistent = false, AllowRefresh = true });
        return Results.Ok(new { authenticated = true, username = account.Username });
    }

    private static async Task<IResult> LogoutAsync(HttpContext context)
    {
        await context.SignOutAsync(AdminAuthService.AuthenticationScheme);
        return Results.Ok(new { authenticated = false });
    }

    private static IResult Session(HttpContext context) => Results.Ok(new
    {
        authenticated = context.User.Identity?.IsAuthenticated == true,
        username = context.User.Identity?.Name
    });

    private static IResult GetSettings(IBackendSettings settings)
    {
        var current = settings.Current;
        return Results.Ok(new AdminSettingsResponse
        {
            OpenAI = ToProviderResponse(current.Providers.OpenAI),
            Anthropic = ToProviderResponse(current.Providers.Anthropic),
            WebSearch = ToSearchResponse(current.WebSearch)
        });
    }

    private static IResult SaveSettings(AdminSettingsRequest? request, IBackendSettings settings)
    {
        try
        {
            var current = settings.Current;
            var openAi = MergeProvider(request?.OpenAI, current.Providers.OpenAI, "OpenAI");
            var anthropic = MergeProvider(request?.Anthropic, current.Providers.Anthropic, "Anthropic");
            var webSearch = MergeSearch(request?.WebSearch, current.WebSearch);
            settings.Save(new BackendSettingsOverrides(openAi, anthropic, webSearch));
            return GetSettings(settings);
        }
        catch (ArgumentException exception)
        {
            return Results.BadRequest(new ApiErrorResponse
            {
                Error = new ApiError { Code = "invalid_request", Message = exception.Message }
            });
        }
    }

    private static IResult ChangePassword(
        HttpContext context,
        AdminPasswordRequest? request,
        AdminAuthService auth)
    {
        try
        {
            var username = context.User.Identity?.Name;
            if (string.IsNullOrWhiteSpace(username) || request is null ||
                string.IsNullOrEmpty(request.CurrentPassword) || string.IsNullOrEmpty(request.NewPassword))
            {
                return Results.BadRequest(new ApiErrorResponse
                {
                    Error = new ApiError { Code = "invalid_request", Message = "Both passwords are required." }
                });
            }

            auth.ChangePassword(username, request.CurrentPassword, request.NewPassword);
            return Results.Ok(new { changed = true });
        }
        catch (InvalidOperationException)
        {
            return Results.BadRequest(new ApiErrorResponse
            {
                Error = new ApiError { Code = "invalid_request", Message = "The current admin password is incorrect." }
            });
        }
        catch (ArgumentException exception)
        {
            return Results.BadRequest(new ApiErrorResponse
            {
                Error = new ApiError { Code = "invalid_request", Message = exception.Message }
            });
        }
    }

    private static ProviderSettingsOverride MergeProvider(
        AdminProviderSettingsRequest? request,
        ProviderOptions current,
        string provider)
    {
        var baseUrl = request?.BaseUrl is null ? current.BaseUrl : NormalizeBaseUrl(request.BaseUrl, provider);
        var defaultModel = request?.DefaultModel is null
            ? current.DefaultModel
            : request.DefaultModel.Trim();
        var apiVersion = request?.ApiVersion is null ? current.ApiVersion : request.ApiVersion.Trim();
        var apiKey = request?.ClearApiKey == true
            ? string.Empty
            : string.IsNullOrWhiteSpace(request?.ApiKey) ? current.ApiKey : request!.ApiKey.Trim();

        if (string.IsNullOrWhiteSpace(defaultModel))
        {
            throw new ArgumentException($"{provider} default model is required.");
        }

        return new ProviderSettingsOverride(baseUrl, apiKey, defaultModel, apiVersion);
    }

    private static SearchSettingsOverride MergeSearch(
        AdminSearchSettingsRequest? request,
        WebSearchOptions current)
    {
        var baseUrl = request?.BaseUrl is null
            ? current.BaseUrl
            : NormalizeBaseUrl(request.BaseUrl, "Tavily");
        var maxResults = request?.MaxResults ?? current.MaxResults;
        var timeoutSeconds = request?.TimeoutSeconds ?? current.TimeoutSeconds;
        if (maxResults is < 1 or > 20)
        {
            throw new ArgumentException("Tavily max results must be between 1 and 20.");
        }

        if (timeoutSeconds is < 1 or > 300)
        {
            throw new ArgumentException("Tavily timeout must be between 1 and 300 seconds.");
        }

        var apiKey = request?.ClearApiKey == true
            ? string.Empty
            : string.IsNullOrWhiteSpace(request?.ApiKey) ? current.ApiKey : request!.ApiKey.Trim();
        return new SearchSettingsOverride(
            request?.Enabled ?? current.Enabled,
            request?.UseToolCalling ?? current.UseToolCalling,
            baseUrl,
            apiKey,
            maxResults,
            timeoutSeconds);
    }

    private static string NormalizeBaseUrl(string value, string provider)
    {
        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri) ||
            !(string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) ||
              string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)))
        {
            throw new ArgumentException($"{provider} Base URL must be an absolute HTTP(S) URL.");
        }

        return uri.ToString().TrimEnd('/');
    }

    private static AdminProviderSettingsResponse ToProviderResponse(ProviderOptions settings) => new(
        settings.BaseUrl,
        settings.DefaultModel,
        settings.ApiVersion,
        !string.IsNullOrWhiteSpace(settings.ApiKey),
        Mask(settings.ApiKey));

    private static AdminSearchSettingsResponse ToSearchResponse(WebSearchOptions settings) => new(
        settings.Enabled,
        settings.UseToolCalling,
        settings.BaseUrl,
        settings.MaxResults,
        settings.TimeoutSeconds,
        !string.IsNullOrWhiteSpace(settings.ApiKey),
        Mask(settings.ApiKey));

    private static string? Mask(string value) => string.IsNullOrWhiteSpace(value) ? null : "••••••••";
}

public sealed class AdminLoginRequest
{
    public string? Username { get; init; }
    public string? Password { get; init; }
}

public sealed class AdminPasswordRequest
{
    public string? CurrentPassword { get; init; }
    public string? NewPassword { get; init; }
}

public sealed class AdminSettingsRequest
{
    public AdminProviderSettingsRequest? OpenAI { get; init; }
    public AdminProviderSettingsRequest? Anthropic { get; init; }
    public AdminSearchSettingsRequest? WebSearch { get; init; }
}

public sealed class AdminProviderSettingsRequest
{
    public string? BaseUrl { get; init; }
    public string? ApiKey { get; init; }
    public bool ClearApiKey { get; init; }
    public string? DefaultModel { get; init; }
    public string? ApiVersion { get; init; }
}

public sealed class AdminSearchSettingsRequest
{
    public bool? Enabled { get; init; }
    public bool? UseToolCalling { get; init; }
    public string? BaseUrl { get; init; }
    public string? ApiKey { get; init; }
    public bool ClearApiKey { get; init; }
    public int? MaxResults { get; init; }
    public int? TimeoutSeconds { get; init; }
}

public sealed class AdminSettingsResponse
{
    public AdminProviderSettingsResponse OpenAI { get; init; } = new();
    public AdminProviderSettingsResponse Anthropic { get; init; } = new();
    public AdminSearchSettingsResponse WebSearch { get; init; } = new();
}

public sealed record AdminProviderSettingsResponse(
    string BaseUrl,
    string DefaultModel,
    string ApiVersion,
    bool HasApiKey,
    string? ApiKeyHint)
{
    public AdminProviderSettingsResponse() : this(string.Empty, string.Empty, string.Empty, false, null) { }
}

public sealed record AdminSearchSettingsResponse(
    bool Enabled,
    bool UseToolCalling,
    string BaseUrl,
    int MaxResults,
    int TimeoutSeconds,
    bool HasApiKey,
    string? ApiKeyHint)
{
    public AdminSearchSettingsResponse() : this(false, false, string.Empty, 5, 30, false, null) { }
}
