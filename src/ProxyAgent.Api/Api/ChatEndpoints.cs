using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Streaming;
using ProxyAgent.Api.WebSearch;

namespace ProxyAgent.Api.Api;

public static class ChatEndpoints
{
    public static IEndpointRouteBuilder MapChatEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/api/chat", HandleGatewayAsync);
        endpoints.MapPost("/v1/chat/completions", HandleOpenAiAsync);
        return endpoints;
    }

    private static async Task HandleGatewayAsync(HttpContext context, GatewayChatRequest request, ChatPromptAgent orchestrator)
    {
        try
        {
            var normalized = GatewayContractMapper.ToNormalized(request);
            if (!request.Stream)
            {
                var response = await orchestrator.CompleteAsync(normalized, context.RequestAborted);
                await context.Response.WriteAsJsonAsync(GatewayContractMapper.FromNormalized(response), context.RequestAborted);
                return;
            }

            await foreach (var item in orchestrator.StreamAsync(normalized, context.RequestAborted))
            {
                await SseWriter.WriteGatewayEventAsync(context.Response, item, context.RequestAborted);
            }
        }
        catch (Exception exception)
        {
            await ErrorHandling.WriteAsync(context, exception, context.RequestAborted);
        }
    }

    private static async Task HandleOpenAiAsync(HttpContext context, OpenAiChatRequest request, ChatPromptAgent orchestrator)
    {
        try
        {
            var normalized = OpenAiContractMapper.ToNormalized(request);
            if (!request.Stream)
            {
                var response = await orchestrator.CompleteAsync(normalized, context.RequestAborted);
                await context.Response.WriteAsJsonAsync(OpenAiContractMapper.FromNormalized(response), context.RequestAborted);
                return;
            }

            await foreach (var item in orchestrator.StreamAsync(normalized, context.RequestAborted))
            {
                if (item.IsDone)
                {
                    await SseWriter.WriteDoneAsync(context.Response, context.RequestAborted);
                }
                else
                {
                    await SseWriter.WriteOpenAiChunkAsync(context.Response, item, context.RequestAborted);
                }
            }
        }
        catch (Exception exception)
        {
            await ErrorHandling.WriteAsync(context, exception, context.RequestAborted);
        }
    }
}
