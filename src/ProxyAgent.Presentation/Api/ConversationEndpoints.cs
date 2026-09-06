using ProxyAgent.Api.Storage;

namespace ProxyAgent.Api.Api;

public static class ConversationEndpoints
{
    private const string ConversationTokenHeader = "X-Conversation-Token";
    private const string ConversationTokenCookiePrefix = "medical-harness-conversation-";

    public static IEndpointRouteBuilder MapConversationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/api/conversations", CreateAsync);
        endpoints.MapGet("/api/conversations/{id}", GetAsync);
        endpoints.MapPut("/api/conversations/{id}", UpdateAsync);
        endpoints.MapPost("/api/conversations/{id}/publish", PublishAsync);
        return endpoints;
    }

    private static IResult Create(
        ConversationWriteRequest? request,
        HttpContext context,
        IConversationStore store)
    {
        if (!TryReadRequest(request, out var title, out var messages, out var error))
        {
            return Results.BadRequest(new ApiErrorResponse
            {
                Error = new ApiError { Code = "invalid_request", Message = error }
            });
        }

        var created = store.Create(title, messages, request?.Id);
        context.Response.Cookies.Append(
            TokenCookieName(created.Id),
            created.OwnerToken,
            new CookieOptions
            {
                HttpOnly = true,
                Secure = context.Request.IsHttps,
                SameSite = SameSiteMode.Lax,
                Path = $"/api/conversations/{created.Id}"
            });
        return Results.Created(
            $"/api/conversations/{created.Id}",
            new ConversationCreatedResponse(created.Id, created.OwnerToken));
    }

    private static IResult Get(string id, HttpContext context, IConversationStore store)
    {
        var document = store.Get(id, ReadConversationToken(context, id));
        return document is null ? Results.NotFound() : Results.Ok(document);
    }

    private static IResult Update(
        string id,
        ConversationWriteRequest? request,
        HttpContext context,
        IConversationStore store)
    {
        if (!TryReadRequest(request, out var title, out var messages, out var error))
        {
            return Results.BadRequest(new ApiErrorResponse
            {
                Error = new ApiError { Code = "invalid_request", Message = error }
            });
        }

        var document = store.Update(id, title, messages, ReadConversationToken(context, id));
        return document is null ? Results.NotFound() : Results.Ok(document);
    }

    private static IResult Publish(string id, HttpContext context, IConversationStore store)
    {
        var document = store.Publish(id, ReadConversationToken(context, id));
        return document is null ? Results.NotFound() : Results.Ok(document);
    }

    private static bool TryReadRequest(
        ConversationWriteRequest? request,
        out string title,
        out IReadOnlyList<ConversationMessage> messages,
        out string error)
    {
        title = request?.Title?.Trim() ?? string.Empty;
        messages = request?.Messages ?? [];
        error = string.Empty;

        if (messages.Count > 200)
        {
            error = "Conversation has too many messages.";
            return false;
        }

        if (messages.Sum(message => message?.Text?.Length ?? 0) > 500_000)
        {
            error = "Conversation is too large.";
            return false;
        }

        return true;
    }

    private static Task<IResult> CreateAsync(
        ConversationWriteRequest? request,
        HttpContext context,
        IConversationStore store)
        => Task.FromResult(Create(request, context, store));

    private static Task<IResult> GetAsync(string id, HttpContext context, IConversationStore store)
        => Task.FromResult(Get(id, context, store));

    private static Task<IResult> UpdateAsync(
        string id,
        ConversationWriteRequest? request,
        HttpContext context,
        IConversationStore store)
        => Task.FromResult(Update(id, request, context, store));

    private static Task<IResult> PublishAsync(string id, HttpContext context, IConversationStore store)
        => Task.FromResult(Publish(id, context, store));

    private static string? ReadConversationToken(HttpContext context, string conversationId)
        => context.Request.Headers.TryGetValue(ConversationTokenHeader, out var value)
            ? value.ToString()
            : context.Request.Cookies[TokenCookieName(conversationId)];

    private static string TokenCookieName(string conversationId) =>
        $"{ConversationTokenCookiePrefix}{conversationId}";
}
