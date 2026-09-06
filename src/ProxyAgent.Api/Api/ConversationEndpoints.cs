using ProxyAgent.Api.Storage;

namespace ProxyAgent.Api.Api;

public static class ConversationEndpoints
{
    public static IEndpointRouteBuilder MapConversationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/api/conversations", CreateAsync);
        endpoints.MapGet("/api/conversations/{id}", GetAsync);
        endpoints.MapPut("/api/conversations/{id}", UpdateAsync);
        return endpoints;
    }

    private static IResult Create(ConversationWriteRequest? request, IConversationStore store)
    {
        if (!TryReadRequest(request, out var title, out var messages, out var error))
        {
            return Results.BadRequest(new ApiErrorResponse
            {
                Error = new ApiError { Code = "invalid_request", Message = error }
            });
        }

        var document = store.Create(title, messages);
        return Results.Created($"/api/conversations/{document.Id}", new ConversationCreatedResponse(document.Id));
    }

    private static IResult Get(string id, IConversationStore store)
    {
        var document = store.Get(id);
        return document is null ? Results.NotFound() : Results.Ok(document);
    }

    private static IResult Update(string id, ConversationWriteRequest? request, IConversationStore store)
    {
        if (!TryReadRequest(request, out var title, out var messages, out var error))
        {
            return Results.BadRequest(new ApiErrorResponse
            {
                Error = new ApiError { Code = "invalid_request", Message = error }
            });
        }

        var document = store.Update(id, title, messages);
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

    private static Task<IResult> CreateAsync(ConversationWriteRequest? request, IConversationStore store)
        => Task.FromResult(Create(request, store));

    private static Task<IResult> GetAsync(string id, IConversationStore store)
        => Task.FromResult(Get(id, store));

    private static Task<IResult> UpdateAsync(string id, ConversationWriteRequest? request, IConversationStore store)
        => Task.FromResult(Update(id, request, store));
}
