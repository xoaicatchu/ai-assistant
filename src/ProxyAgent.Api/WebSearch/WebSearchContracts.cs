namespace ProxyAgent.Api.WebSearch;

public sealed class WebSearchOptions
{
    public bool Enabled { get; set; } = true;
    public bool UseToolCalling { get; set; }
    public string ApiKey { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = "https://api.tavily.com";
    public string SearchDepth { get; set; } = "basic";
    public int MaxResults { get; set; } = 5;
    public int TimeoutSeconds { get; set; } = 30;
    public int MaxToolCalls { get; set; } = 2;
    public int MaxContentCharsPerResult { get; set; } = 4000;
}

public sealed record WebSearchResponse
{
    public string Query { get; init; } = string.Empty;
    public IReadOnlyList<WebSearchResult> Results { get; init; } = [];
}

public sealed record WebSearchResult
{
    public string Title { get; init; } = string.Empty;
    public string Url { get; init; } = string.Empty;
    public string Content { get; init; } = string.Empty;
    public string? PublishedDate { get; init; }
}

public interface IWebSearchProvider
{
    bool IsConfigured { get; }

    Task<WebSearchResponse> SearchAsync(string query, CancellationToken cancellationToken);
}

public sealed class WebSearchException(string message, Exception? innerException = null)
    : Exception(message, innerException)
{
    public string Code => "web_search_failed";
}
