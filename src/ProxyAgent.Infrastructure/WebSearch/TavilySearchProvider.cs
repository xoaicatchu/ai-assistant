using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using ProxyAgent.Api.Settings;

namespace ProxyAgent.Api.WebSearch;

public sealed class TavilySearchProvider : IWebSearchProvider
{
    private readonly HttpClient httpClient;
    private readonly Func<WebSearchOptions> getSettings;

    public TavilySearchProvider(HttpClient httpClient, IOptions<WebSearchOptions> options)
    {
        this.httpClient = httpClient;
        getSettings = () => options.Value;
    }

    public TavilySearchProvider(HttpClient httpClient, IBackendSettings backendSettings)
    {
        this.httpClient = httpClient;
        getSettings = () => backendSettings.Current.WebSearch;
    }

    public bool IsConfigured
    {
        get
        {
            var settings = getSettings();
            return
                !string.IsNullOrWhiteSpace(settings.ApiKey) &&
                Uri.TryCreate(settings.BaseUrl, UriKind.Absolute, out var baseUri) &&
                baseUri.Scheme is "http" or "https";
        }
    }

    public async Task<WebSearchResponse> SearchAsync(string query, CancellationToken cancellationToken)
    {
        var settings = getSettings();
        if (!IsConfigured)
        {
            throw new WebSearchException("Tavily web search is not configured.");
        }

        if (string.IsNullOrWhiteSpace(query))
        {
            throw new WebSearchException("The web_search query must not be empty.");
        }

        var payload = new TavilySearchRequest
        {
            Query = query.Trim(),
            SearchDepth = NormalizeSearchDepth(settings.SearchDepth),
            MaxResults = Math.Clamp(settings.MaxResults, 1, 20),
            IncludeAnswer = false,
            IncludeRawContent = "markdown"
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, BuildEndpoint("search", settings))
        {
            Content = JsonContent.Create(payload)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.ApiKey);

        try
        {
            using var response = await httpClient.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new WebSearchException($"Tavily returned HTTP {(int)response.StatusCode}.");
            }

            var result = await response.Content.ReadFromJsonAsync<TavilySearchResponse>(
                cancellationToken: cancellationToken);
            if (result is null)
            {
                throw new WebSearchException("Tavily returned an empty response.");
            }

            return new WebSearchResponse
            {
                Query = string.IsNullOrWhiteSpace(result.Query) ? query.Trim() : result.Query,
                Results = result.Results
                    .Where(item => Uri.TryCreate(item.Url, UriKind.Absolute, out var uri) &&
                                   uri.Scheme is "http" or "https")
                    .Select(item => new WebSearchResult
                    {
                        Title = item.Title,
                        Url = item.Url,
                        Content = LimitContent(item.RawContent ?? item.Content ?? string.Empty, settings),
                        PublishedDate = item.PublishedDate
                    })
                    .ToArray()
            };
        }
        catch (WebSearchException)
        {
            throw;
        }
        catch (HttpRequestException exception)
        {
            throw new WebSearchException("Tavily is unavailable.", exception);
        }
        catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new WebSearchException("Tavily search timed out.", exception);
        }
        catch (JsonException exception)
        {
            throw new WebSearchException("Tavily returned an invalid response.", exception);
        }
    }

    private static Uri BuildEndpoint(string path, WebSearchOptions settings)
    {
        var baseUrl = settings.BaseUrl.TrimEnd('/') + "/";
        return new Uri(new Uri(baseUrl, UriKind.Absolute), path);
    }

    private static string LimitContent(string content, WebSearchOptions settings)
    {
        var maxChars = Math.Max(settings.MaxContentCharsPerResult, 500);
        return content.Length <= maxChars ? content : content[..maxChars] + "\n[content truncated]";
    }

    private static string NormalizeSearchDepth(string? value) =>
        value?.Trim().ToLowerInvariant() switch
        {
            "advanced" => "advanced",
            _ => "basic"
        };

    private sealed class TavilySearchRequest
    {
        [JsonPropertyName("query")] public string Query { get; init; } = string.Empty;
        [JsonPropertyName("search_depth")] public string SearchDepth { get; init; } = "basic";
        [JsonPropertyName("max_results")] public int MaxResults { get; init; }
        [JsonPropertyName("include_answer")] public bool IncludeAnswer { get; init; }
        [JsonPropertyName("include_raw_content")] public string IncludeRawContent { get; init; } = "markdown";
    }

    private sealed class TavilySearchResponse
    {
        [JsonPropertyName("query")] public string Query { get; init; } = string.Empty;
        [JsonPropertyName("results")] public IReadOnlyList<TavilyResult> Results { get; init; } = [];
    }

    private sealed class TavilyResult
    {
        [JsonPropertyName("title")] public string Title { get; init; } = string.Empty;
        [JsonPropertyName("url")] public string Url { get; init; } = string.Empty;
        [JsonPropertyName("content")] public string? Content { get; init; }
        [JsonPropertyName("raw_content")] public string? RawContent { get; init; }
        [JsonPropertyName("published_date")] public string? PublishedDate { get; init; }
    }
}
