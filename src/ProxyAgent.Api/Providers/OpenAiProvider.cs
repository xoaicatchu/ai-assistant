using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Streaming;

namespace ProxyAgent.Api.Providers;

public sealed class OpenAiProvider(HttpClient httpClient, IOptions<ProviderOptions> options) : IChatProvider
{
    private readonly ProviderOptions settings = options.Value;

    public string Name => "openai";

    public async Task<NormalizedChatResponse> CompleteAsync(
        NormalizedChatRequest request,
        ProviderSelection selection,
        CancellationToken cancellationToken)
    {
        EnsureConfigured();

        using var httpRequest = CreateRequest(request, selection, stream: false);
        using var response = await SendAsync(httpRequest, cancellationToken);
        var payload = await response.Content.ReadFromJsonAsync<OpenAiChatResponse>(cancellationToken: cancellationToken)
            ?? throw new ProviderRequestException(Name);

        var choice = payload.Choices.FirstOrDefault() ?? throw new ProviderRequestException(Name);
        var message = choice.Message ?? throw new ProviderRequestException(Name);

        return new NormalizedChatResponse
        {
            Id = payload.Id,
            Provider = Name,
            Model = payload.Model,
            Message = new ChatMessage
            {
                Role = message.Role,
                Content = message.Content,
                ToolCalls = message.ToolCalls?.Select(MapToolCall).ToArray() ?? []
            },
            FinishReason = choice.FinishReason ?? "stop",
            Usage = payload.Usage is null
                ? null
                : new UsageInfo
                {
                    InputTokens = payload.Usage.PromptTokens,
                    OutputTokens = payload.Usage.CompletionTokens
                }
        };
    }

    public async IAsyncEnumerable<ChatStreamEvent> StreamAsync(
        NormalizedChatRequest request,
        ProviderSelection selection,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        EnsureConfigured();

        using var httpRequest = CreateRequest(request, selection, stream: true);
        using var response = await SendAsync(httpRequest, cancellationToken);
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);

        await foreach (var item in SseReader.ReadAsync(stream, cancellationToken))
        {
            if (item.Data.Equals("[DONE]", StringComparison.Ordinal))
            {
                yield return new ChatStreamEvent
                {
                    Id = selection.Model,
                    Provider = Name,
                    Model = selection.Model,
                    IsDone = true
                };
                yield break;
            }

            OpenAiStreamChunk? chunk;
            try
            {
                chunk = JsonSerializer.Deserialize<OpenAiStreamChunk>(item.Data);
            }
            catch (JsonException exception)
            {
                throw new ProviderRequestException(Name, exception);
            }

            if (chunk is null)
            {
                continue;
            }

            var choice = chunk.Choices.FirstOrDefault();
            var delta = choice?.Delta;
            var toolCall = delta?.ToolCalls?.FirstOrDefault();
            if (delta is null && choice?.FinishReason is null)
            {
                continue;
            }

            yield return new ChatStreamEvent
            {
                Id = string.IsNullOrWhiteSpace(chunk.Id) ? selection.Model : chunk.Id,
                Provider = Name,
                Model = string.IsNullOrWhiteSpace(chunk.Model) ? selection.Model : chunk.Model,
                TextDelta = delta?.Content,
                ToolCallDelta = toolCall is null
                    ? null
                    : new ChatToolCall
                    {
                        Id = toolCall.Id ?? string.Empty,
                        Name = toolCall.Function?.Name ?? string.Empty,
                        ArgumentsJson = toolCall.Function?.Arguments ?? string.Empty
                    },
                FinishReason = choice?.FinishReason,
                Usage = chunk.Usage is null
                    ? null
                    : new UsageInfo
                    {
                        InputTokens = chunk.Usage.PromptTokens,
                        OutputTokens = chunk.Usage.CompletionTokens
                    }
            };
        }
    }

    private HttpRequestMessage CreateRequest(NormalizedChatRequest request, ProviderSelection selection, bool stream)
    {
        var payload = new OpenAiChatRequest
        {
            Model = selection.Model,
            Messages = request.Messages.Select(MapMessage).ToArray(),
            Stream = stream,
            Temperature = request.Temperature,
            MaxTokens = request.MaxTokens,
            Tools = request.Tools.Count == 0 ? null : request.Tools.Select(MapTool).ToArray(),
            ToolChoice = request.ToolChoice
        };

        var httpRequest = new HttpRequestMessage(HttpMethod.Post, BuildEndpoint("chat/completions"))
        {
            Content = JsonContent.Create(payload)
        };
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.ApiKey);
        return httpRequest;
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        try
        {
            var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                return response;
            }

            response.Dispose();
            throw response.StatusCode switch
            {
                HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => new ProviderAuthenticationException(Name),
                >= HttpStatusCode.BadRequest and < HttpStatusCode.InternalServerError => new ProviderRequestException(Name),
                _ => new ProviderUnavailableException(Name)
            };
        }
        catch (ProviderException)
        {
            throw;
        }
        catch (HttpRequestException exception)
        {
            throw new ProviderUnavailableException(Name, exception);
        }
        catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new ProviderUnavailableException(Name, exception);
        }
    }

    private void EnsureConfigured()
    {
        if (string.IsNullOrWhiteSpace(settings.ApiKey) || string.IsNullOrWhiteSpace(settings.BaseUrl))
        {
            throw new ProviderNotConfiguredException(Name);
        }
    }

    private Uri BuildEndpoint(string path) => new(new Uri(settings.BaseUrl.TrimEnd('/') + "/"), path);

    private static OpenAiMessage MapMessage(ChatMessage message) => new()
    {
        Role = message.Role,
        Content = message.Content,
        ToolCallId = message.ToolCallId,
        Name = message.Name,
        ToolCalls = message.ToolCalls.Count == 0 ? null : message.ToolCalls.Select(call => new OpenAiToolCall
        {
            Id = call.Id,
            Function = new OpenAiFunctionCall { Name = call.Name, Arguments = call.ArgumentsJson }
        }).ToArray()
    };

    private static OpenAiTool MapTool(ChatTool tool) => new()
    {
        Function = new OpenAiFunction
        {
            Name = tool.Name,
            Description = tool.Description,
            Parameters = tool.Parameters
        }
    };

    private static ChatToolCall MapToolCall(OpenAiToolCall call) => new()
    {
        Id = call.Id,
        Name = call.Function.Name,
        ArgumentsJson = call.Function.Arguments
    };
}
