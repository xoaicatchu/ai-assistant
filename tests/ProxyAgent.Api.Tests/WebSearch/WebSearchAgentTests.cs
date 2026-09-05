using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Providers;
using ProxyAgent.Api.WebSearch;

namespace ProxyAgent.Api.Tests.WebSearch;

public sealed class WebSearchAgentTests
{
    [Fact]
    public async Task CompleteAsync_executes_web_search_before_returning_final_answer()
    {
        var provider = new FakeChatProvider();
        var agent = CreateAgent(provider, new FakeWebSearchProvider());

        var response = await agent.CompleteAsync(
            new NormalizedChatRequest
            {
                Model = "openai:test-model",
                Messages = [new ChatMessage { Role = "user", Content = "What is new?" }]
            },
            CancellationToken.None);

        Assert.Equal("Tổng hợp từ nguồn web.", response.Message.Content);
        Assert.Equal(2, provider.Requests.Count);
        Assert.Contains(provider.Requests[1].Messages, message =>
            message.Role == "tool" && message.Content!.Contains("https://example.com/source", StringComparison.Ordinal));
    }

    [Fact]
    public async Task StreamAsync_hides_tool_call_and_streams_final_answer()
    {
        var provider = new FakeChatProvider();
        var agent = CreateAgent(provider, new FakeWebSearchProvider());
        var events = new List<ChatStreamEvent>();

        await foreach (var item in agent.StreamAsync(
                           new NormalizedChatRequest
                           {
                               Model = "openai:test-model",
                               Stream = true,
                               Messages = [new ChatMessage { Role = "user", Content = "What is new?" }]
                           },
                           CancellationToken.None))
        {
            events.Add(item);
        }

        Assert.Equal(["Tổng ", "hợp."], events.Where(item => item.TextDelta is not null).Select(item => item.TextDelta));
        Assert.DoesNotContain(events, item => item.ToolCallDelta is not null);
        Assert.True(events[^1].IsDone);
        Assert.Equal(2, provider.Requests.Count);
    }

    [Fact]
    public async Task CompleteAsync_pre_searches_current_question_without_provider_tools()
    {
        var provider = new FakeChatProvider();
        var agent = CreateAgent(
            provider,
            new FakeWebSearchProvider(),
            useToolCalling: false);

        var response = await agent.CompleteAsync(
            new NormalizedChatRequest
            {
                Model = "openai:test-model",
                Messages = [new ChatMessage { Role = "user", Content = "Ngày mai thời tiết Hà Nội thế nào?" }]
            },
            CancellationToken.None);

        Assert.Equal("Tổng hợp từ nguồn web.", response.Message.Content);
        Assert.Single(provider.Requests);
        Assert.Empty(provider.Requests[0].Tools);
        Assert.Contains(provider.Requests[0].Messages, message =>
            message.Role == "system" && message.Content!.Contains("https://example.com/source", StringComparison.Ordinal));
    }

    [Fact]
    public async Task CompleteAsync_forces_final_answer_when_tool_call_budget_is_exhausted()
    {
        var provider = new RepeatingToolCallProvider();
        var webSearch = new FakeWebSearchProvider();
        var agent = CreateAgent(provider, webSearch);

        var response = await agent.CompleteAsync(
            new NormalizedChatRequest
            {
                Model = "openai:test-model",
                Messages = [new ChatMessage { Role = "user", Content = "What is new?" }]
            },
            CancellationToken.None);

        Assert.Equal("Tổng hợp từ nguồn web.", response.Message.Content);
        Assert.Equal(3, provider.Requests.Count);
        Assert.Empty(provider.Requests[^1].Tools);
        Assert.Equal(2, webSearch.SearchCount);
    }

    [Fact]
    public async Task StreamAsync_forces_final_answer_when_tool_call_budget_is_exhausted()
    {
        var provider = new RepeatingToolCallProvider();
        var webSearch = new FakeWebSearchProvider();
        var agent = CreateAgent(provider, webSearch);
        var events = new List<ChatStreamEvent>();

        await foreach (var item in agent.StreamAsync(
                           new NormalizedChatRequest
                           {
                               Model = "openai:test-model",
                               Stream = true,
                               Messages = [new ChatMessage { Role = "user", Content = "What is new?" }]
                           },
                           CancellationToken.None))
        {
            events.Add(item);
        }

        Assert.Equal("Tổng hợp từ nguồn web.", string.Concat(events.Select(item => item.TextDelta)));
        Assert.DoesNotContain(events, item => item.ToolCallDelta is not null);
        Assert.True(events[^1].IsDone);
        Assert.Equal(3, provider.Requests.Count);
        Assert.Empty(provider.Requests[^1].Tools);
        Assert.Equal(2, webSearch.SearchCount);
    }

    private static WebSearchAgent CreateAgent(
        IChatProvider provider,
        IWebSearchProvider webSearchProvider,
        bool useToolCalling = true)
    {
        var modelSelector = new ModelSelector(
            Options.Create(new RoutingOptions()),
            Options.Create(new ProvidersOptions
            {
                OpenAI = new ProviderOptions { DefaultModel = "test-model" }
            }));
        var orchestrator = new ChatOrchestrator(modelSelector, [provider]);
        return new WebSearchAgent(
            orchestrator,
            webSearchProvider,
            Options.Create(new WebSearchOptions
            {
                Enabled = true,
                ApiKey = "configured",
                UseToolCalling = useToolCalling,
                MaxToolCalls = 2
            }));
    }

    private sealed class FakeChatProvider : IChatProvider
    {
        public string Name => "openai";
        public List<NormalizedChatRequest> Requests { get; } = [];

        public Task<NormalizedChatResponse> CompleteAsync(
            NormalizedChatRequest request,
            ProviderSelection selection,
            CancellationToken cancellationToken)
        {
            Requests.Add(request);
            var hasToolResult = request.Messages.Any(message =>
                message.Role == "tool" ||
                message.Content?.Contains("https://example.com/source", StringComparison.Ordinal) == true);
            return Task.FromResult(new NormalizedChatResponse
            {
                Id = $"response-{Requests.Count}",
                Provider = Name,
                Model = selection.Model,
                Message = hasToolResult
                    ? new ChatMessage { Role = "assistant", Content = "Tổng hợp từ nguồn web." }
                    : new ChatMessage
                    {
                        Role = "assistant",
                        ToolCalls =
                        [
                            new ChatToolCall
                            {
                                Id = "call-search",
                                Name = "web_search",
                                ArgumentsJson = "{\"query\":\"thông tin mới\"}"
                            }
                        ]
                    },
                FinishReason = hasToolResult ? "stop" : "tool_calls"
            });
        }

        public async IAsyncEnumerable<ChatStreamEvent> StreamAsync(
            NormalizedChatRequest request,
            ProviderSelection selection,
            [EnumeratorCancellation] CancellationToken cancellationToken)
        {
            Requests.Add(request);
            var hasToolResult = request.Messages.Any(message => message.Role == "tool");
            if (!hasToolResult)
            {
                yield return new ChatStreamEvent
                {
                    Id = "stream-1",
                    Provider = Name,
                    Model = selection.Model,
                    ToolCallDelta = new ChatToolCall
                    {
                        Id = "call-search",
                        Name = "web_search",
                        ArgumentsJson = "{\"query\":\"thông tin mới\"}"
                    }
                };
                yield return new ChatStreamEvent
                {
                    Id = "stream-1",
                    Provider = Name,
                    Model = selection.Model,
                    FinishReason = "tool_calls"
                };
            }
            else
            {
                yield return new ChatStreamEvent { Id = "stream-2", Provider = Name, Model = selection.Model, TextDelta = "Tổng " };
                yield return new ChatStreamEvent { Id = "stream-2", Provider = Name, Model = selection.Model, TextDelta = "hợp." };
            }

            yield return new ChatStreamEvent { Id = "stream", Provider = Name, Model = selection.Model, IsDone = true };
            await Task.CompletedTask;
        }
    }

    private sealed class RepeatingToolCallProvider : IChatProvider
    {
        public string Name => "openai";
        public List<NormalizedChatRequest> Requests { get; } = [];

        public Task<NormalizedChatResponse> CompleteAsync(
            NormalizedChatRequest request,
            ProviderSelection selection,
            CancellationToken cancellationToken)
        {
            Requests.Add(request);
            return Task.FromResult(new NormalizedChatResponse
            {
                Id = $"response-{Requests.Count}",
                Provider = Name,
                Model = selection.Model,
                Message = request.Tools.Count == 0
                    ? new ChatMessage { Role = "assistant", Content = "Tổng hợp từ nguồn web." }
                    : new ChatMessage
                    {
                        Role = "assistant",
                        ToolCalls =
                        [
                            new ChatToolCall
                            {
                                Id = $"call-search-{Requests.Count}",
                                Name = "web_search",
                                ArgumentsJson = "{\"query\":\"thông tin mới\"}"
                            }
                        ]
                    },
                FinishReason = request.Tools.Count == 0 ? "stop" : "tool_calls"
            });
        }

        public async IAsyncEnumerable<ChatStreamEvent> StreamAsync(
            NormalizedChatRequest request,
            ProviderSelection selection,
            [EnumeratorCancellation] CancellationToken cancellationToken)
        {
            Requests.Add(request);
            if (request.Tools.Count == 0)
            {
                yield return new ChatStreamEvent
                {
                    Id = $"stream-{Requests.Count}",
                    Provider = Name,
                    Model = selection.Model,
                    TextDelta = "Tổng hợp từ nguồn web."
                };
            }
            else
            {
                yield return new ChatStreamEvent
                {
                    Id = $"stream-{Requests.Count}",
                    Provider = Name,
                    Model = selection.Model,
                    ToolCallDelta = new ChatToolCall
                    {
                        Id = $"call-search-{Requests.Count}",
                        Name = "web_search",
                        ArgumentsJson = "{\"query\":\"thông tin mới\"}"
                    }
                };
                yield return new ChatStreamEvent
                {
                    Id = $"stream-{Requests.Count}",
                    Provider = Name,
                    Model = selection.Model,
                    FinishReason = "tool_calls"
                };
            }

            yield return new ChatStreamEvent
            {
                Id = $"stream-{Requests.Count}",
                Provider = Name,
                Model = selection.Model,
                IsDone = true
            };
            await Task.CompletedTask;
        }
    }

    private sealed class FakeWebSearchProvider : IWebSearchProvider
    {
        public bool IsConfigured => true;
        public int SearchCount { get; private set; }

        public Task<WebSearchResponse> SearchAsync(string query, CancellationToken cancellationToken) =>
            Task.FromResult(RecordSearch(query));

        private WebSearchResponse RecordSearch(string query)
        {
            SearchCount++;
            return new WebSearchResponse
            {
                Query = query,
                Results =
                [
                    new WebSearchResult
                    {
                        Title = "Nguồn mẫu",
                        Url = "https://example.com/source",
                        Content = "Nội dung từ nguồn mẫu."
                    }
                ]
            };
        }
    }
}
