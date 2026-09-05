using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Streaming;

namespace ProxyAgent.Api.Providers;

public sealed class AnthropicProvider(HttpClient httpClient, IOptions<ProviderOptions> options) : IChatProvider
{
    private readonly ProviderOptions settings = options.Value;

    public string Name => "anthropic";

    public async Task<NormalizedChatResponse> CompleteAsync(
        NormalizedChatRequest request,
        ProviderSelection selection,
        CancellationToken cancellationToken)
    {
        EnsureConfigured();

        using var httpRequest = CreateRequest(request, selection, stream: false);
        using var response = await SendAsync(httpRequest, cancellationToken);
        var payload = await response.Content.ReadFromJsonAsync<AnthropicResponse>(cancellationToken: cancellationToken)
            ?? throw new ProviderRequestException(Name);

        var text = string.Concat(payload.Content.Where(block => block.Type == "text").Select(block => block.Text));
        var toolCalls = payload.Content
            .Where(block => block.Type == "tool_use")
            .Select(block => new ChatToolCall
            {
                Id = block.Id ?? string.Empty,
                Name = block.Name ?? string.Empty,
                ArgumentsJson = block.Input.ValueKind == JsonValueKind.Undefined
                    ? "{}"
                    : JsonSerializer.Serialize(block.Input)
            })
            .ToArray();

        return new NormalizedChatResponse
        {
            Id = payload.Id,
            Provider = Name,
            Model = payload.Model,
            Message = new ChatMessage { Role = "assistant", Content = text, ToolCalls = toolCalls },
            FinishReason = payload.StopReason ?? "stop",
            Usage = payload.Usage is null
                ? null
                : new UsageInfo { InputTokens = payload.Usage.InputTokens, OutputTokens = payload.Usage.OutputTokens }
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
        var toolBlocks = new Dictionary<int, (string Id, string Name)>();
        var messageId = selection.Model;
        var model = selection.Model;

        await foreach (var item in SseReader.ReadAsync(stream, cancellationToken))
        {
            JsonDocument document;
            try
            {
                document = JsonDocument.Parse(item.Data);
            }
            catch (JsonException exception)
            {
                throw new ProviderRequestException(Name, exception);
            }

            using (document)
            {
                var root = document.RootElement;
                var type = root.TryGetProperty("type", out var typeElement)
                    ? typeElement.GetString()
                    : item.Event;

                switch (type)
                {
                    case "message_start":
                        if (root.TryGetProperty("message", out var message))
                        {
                            messageId = GetString(message, "id") ?? messageId;
                            model = GetString(message, "model") ?? model;
                        }

                        break;

                    case "content_block_start":
                        if (root.TryGetProperty("index", out var indexElement) &&
                            root.TryGetProperty("content_block", out var block) &&
                            GetString(block, "type") == "tool_use")
                        {
                            var index = indexElement.GetInt32();
                            var toolCall = (GetString(block, "id") ?? string.Empty, GetString(block, "name") ?? string.Empty);
                            toolBlocks[index] = toolCall;
                            yield return new ChatStreamEvent
                            {
                                Id = messageId,
                                Provider = Name,
                                Model = model,
                                ToolCallDelta = new ChatToolCall { Id = toolCall.Item1, Name = toolCall.Item2, ArgumentsJson = string.Empty }
                            };
                        }

                        break;

                    case "content_block_delta":
                        if (!root.TryGetProperty("delta", out var delta))
                        {
                            break;
                        }

                        var deltaType = GetString(delta, "type");
                        if (deltaType == "text_delta")
                        {
                            yield return new ChatStreamEvent
                            {
                                Id = messageId,
                                Provider = Name,
                                Model = model,
                                TextDelta = GetString(delta, "text")
                            };
                        }
                        else if (deltaType == "input_json_delta" &&
                                 root.TryGetProperty("index", out var toolIndexElement) &&
                                 toolBlocks.TryGetValue(toolIndexElement.GetInt32(), out var toolBlock))
                        {
                            yield return new ChatStreamEvent
                            {
                                Id = messageId,
                                Provider = Name,
                                Model = model,
                                ToolCallDelta = new ChatToolCall
                                {
                                    Id = toolBlock.Id,
                                    Name = toolBlock.Name,
                                    ArgumentsJson = GetString(delta, "partial_json") ?? string.Empty
                                }
                            };
                        }

                        break;

                    case "message_delta":
                        var stopReason = root.TryGetProperty("delta", out var messageDelta)
                            ? GetString(messageDelta, "stop_reason")
                            : null;
                        UsageInfo? usage = null;
                        if (root.TryGetProperty("usage", out var usageElement))
                        {
                            usage = new UsageInfo
                            {
                                InputTokens = usageElement.TryGetProperty("input_tokens", out var input) ? input.GetInt32() : 0,
                                OutputTokens = usageElement.TryGetProperty("output_tokens", out var output) ? output.GetInt32() : 0
                            };
                        }

                        yield return new ChatStreamEvent
                        {
                            Id = messageId,
                            Provider = Name,
                            Model = model,
                            FinishReason = stopReason,
                            Usage = usage
                        };
                        break;

                    case "message_stop":
                        yield return new ChatStreamEvent
                        {
                            Id = messageId,
                            Provider = Name,
                            Model = model,
                            IsDone = true
                        };
                        yield break;
                }
            }
        }
    }

    private HttpRequestMessage CreateRequest(NormalizedChatRequest request, ProviderSelection selection, bool stream)
    {
        var systemMessages = request.Messages.Where(message => message.Role.Equals("system", StringComparison.OrdinalIgnoreCase));
        var messages = request.Messages
            .Where(message => !message.Role.Equals("system", StringComparison.OrdinalIgnoreCase))
            .Select(MapMessage)
            .ToArray();

        var payload = new AnthropicRequest
        {
            Model = selection.Model,
            MaxTokens = request.MaxTokens ?? 1024,
            System = string.Join("\n", systemMessages.Select(message => message.Content).Where(content => content is not null)),
            Messages = messages,
            Stream = stream,
            Temperature = request.Temperature,
            Tools = request.Tools.Count == 0 ? null : request.Tools.Select(MapTool).ToArray(),
            ToolChoice = MapToolChoice(request.ToolChoice)
        };

        var httpRequest = new HttpRequestMessage(HttpMethod.Post, BuildEndpoint("messages"))
        {
            Content = JsonContent.Create(payload)
        };
        httpRequest.Headers.Add("x-api-key", settings.ApiKey);
        httpRequest.Headers.Add("anthropic-version", settings.ApiVersion);
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

            var statusCode = response.StatusCode;
            response.Dispose();
            throw statusCode switch
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

    private static AnthropicMessage MapMessage(ChatMessage message)
    {
        if (message.Role.Equals("tool", StringComparison.OrdinalIgnoreCase))
        {
            return new AnthropicMessage
            {
                Role = "user",
                Content =
                [
                    new AnthropicContentBlock
                    {
                        Type = "tool_result",
                        ToolUseId = message.ToolCallId,
                        Content = message.Content
                    }
                ]
            };
        }

        var content = new List<AnthropicContentBlock>();
        if (message.Content is not null)
        {
            content.Add(new AnthropicContentBlock { Type = "text", Text = message.Content });
        }

        content.AddRange(message.ToolCalls.Select(toolCall => new AnthropicContentBlock
        {
            Type = "tool_use",
            Id = toolCall.Id,
            Name = toolCall.Name,
            Input = JsonDocument.Parse(toolCall.ArgumentsJson).RootElement.Clone()
        }));

        return new AnthropicMessage { Role = message.Role, Content = content };
    }

    private static AnthropicTool MapTool(ChatTool tool) => new()
    {
        Name = tool.Name,
        Description = tool.Description,
        InputSchema = tool.Parameters
    };

    private static AnthropicToolChoice? MapToolChoice(string? choice) => choice?.ToLowerInvariant() switch
    {
        "auto" => new AnthropicToolChoice { Type = "auto" },
        "required" => new AnthropicToolChoice { Type = "any" },
        _ => null
    };

    private static string? GetString(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var value) && value.ValueKind != JsonValueKind.Null
            ? value.GetString()
            : null;
}
