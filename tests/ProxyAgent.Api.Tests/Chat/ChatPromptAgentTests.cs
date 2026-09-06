using System.Runtime.CompilerServices;
using Microsoft.Extensions.Options;
using ProxyAgent.Api.Api;
using ProxyAgent.Api.Chat;
using ProxyAgent.Api.Providers;
using ProxyAgent.Api.WebSearch;

namespace ProxyAgent.Api.Tests.Chat;

public sealed class ChatPromptAgentTests
{
    [Fact]
    public async Task CompleteAsync_prepends_configured_system_prompt_before_client_messages()
    {
        var provider = new CapturingProvider();
        var agent = CreateAgent(provider, "Trả lời trực tiếp và hữu ích.");

        await agent.CompleteAsync(
            new NormalizedChatRequest
            {
                Model = "openai:test-model",
                Messages = [new ChatMessage { Role = "user", Content = "Xin chào" }]
            },
            CancellationToken.None);

        Assert.Equal("Trả lời trực tiếp và hữu ích.", provider.LastRequest!.Messages[0].Content);
        Assert.Equal("user", provider.LastRequest.Messages[1].Role);
    }

    [Fact]
    public async Task CompleteAsync_rejects_images_for_a_known_text_only_model()
    {
        var provider = new CapturingProvider();
        var agent = CreateAgent(provider, "Trả lời trực tiếp và hữu ích.");

        var error = await Assert.ThrowsAsync<ApiValidationException>(() => agent.CompleteAsync(
            new NormalizedChatRequest
            {
                Model = "deepseek/deepseek-v4-flash",
                Messages =
                [
                    new ChatMessage
                    {
                        Role = "user",
                        ContentParts = [new ChatContentPart { Type = "image_url", ImageUrl = "data:image/png;base64,AA==" }]
                    }
                ]
            },
            CancellationToken.None));

        Assert.Contains("does not support image", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Null(provider.LastRequest);
    }

    private static ChatPromptAgent CreateAgent(CapturingProvider provider, string systemPrompt)
    {
        var modelSelector = new ModelSelector(
            Options.Create(new RoutingOptions()),
            Options.Create(new ProvidersOptions
            {
                OpenAI = new ProviderOptions { DefaultModel = "test-model" }
            }));
        var orchestrator = new ChatOrchestrator(modelSelector, [provider]);
        var webSearchAgent = new WebSearchAgent(
            orchestrator,
            new UnconfiguredWebSearchProvider(),
            Options.Create(new WebSearchOptions { Enabled = false }));
        return new ChatPromptAgent(
            webSearchAgent,
            orchestrator,
            Options.Create(new ChatPromptOptions { SystemPrompt = systemPrompt }));
    }

    private sealed class CapturingProvider : IChatProvider
    {
        public string Name => "openai";
        public NormalizedChatRequest? LastRequest { get; private set; }

        public Task<NormalizedChatResponse> CompleteAsync(
            NormalizedChatRequest request,
            ProviderSelection selection,
            CancellationToken cancellationToken)
        {
            LastRequest = request;
            return Task.FromResult(new NormalizedChatResponse
            {
                Id = "test-response",
                Provider = Name,
                Model = selection.Model,
                Message = new ChatMessage { Role = "assistant", Content = "OK" }
            });
        }

        public async IAsyncEnumerable<ChatStreamEvent> StreamAsync(
            NormalizedChatRequest request,
            ProviderSelection selection,
            [EnumeratorCancellation] CancellationToken cancellationToken)
        {
            LastRequest = request;
            yield return new ChatStreamEvent { Id = "test-response", Provider = Name, Model = selection.Model, IsDone = true };
            await Task.CompletedTask;
        }
    }

    private sealed class UnconfiguredWebSearchProvider : IWebSearchProvider
    {
        public bool IsConfigured => false;

        public Task<WebSearchResponse> SearchAsync(string query, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("Search should not be called in this test.");
    }
}
