using System.Text.Json.Serialization;

namespace ProxyAgent.Api.Api;

public sealed record ConversationMessage(
    int Id,
    int RequestId,
    string Role,
    string Text,
    string Status);

public sealed record ConversationDocument(
    string Id,
    string Title,
    IReadOnlyList<ConversationMessage> Messages,
    bool IsPublic = false);

public sealed class ConversationWriteRequest
{
    public string? Id { get; init; }
    public string? Title { get; init; }
    public IReadOnlyList<ConversationMessage>? Messages { get; init; }
}

public sealed record ConversationCreatedResponse(string Id, string OwnerToken);

public sealed record ProviderSettingsOverride(
    string? BaseUrl,
    string? ApiKey,
    string? DefaultModel,
    string? ApiVersion);

public sealed record SearchSettingsOverride(
    bool? Enabled,
    bool? UseToolCalling,
    string? BaseUrl,
    string? ApiKey,
    int? MaxResults,
    int? TimeoutSeconds);

public sealed record BackendSettingsOverrides(
    ProviderSettingsOverride? OpenAI,
    ProviderSettingsOverride? Anthropic,
    SearchSettingsOverride? WebSearch);
