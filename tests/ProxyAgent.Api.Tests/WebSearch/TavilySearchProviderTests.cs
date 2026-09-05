using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ProxyAgent.Api.WebSearch;

namespace ProxyAgent.Api.Tests.WebSearch;

public sealed class TavilySearchProviderTests
{
    [Fact]
    public async Task SearchAsync_posts_search_options_and_maps_results()
    {
        var handler = new RecordingHandler(
            """
            {
              "query": "dotnet 10",
              "results": [
                {
                  "title": ".NET 10 release",
                  "url": "https://learn.microsoft.com/dotnet/core/whats-new/dotnet-10/overview",
                  "content": "New .NET 10 features",
                  "raw_content": "# New .NET 10 features"
                }
              ]
            }
            """);
        var provider = new TavilySearchProvider(
            new HttpClient(handler),
            Options.Create(new WebSearchOptions
            {
                ApiKey = "tvly-test",
                BaseUrl = "https://api.tavily.com",
                SearchDepth = "basic",
                MaxResults = 3,
                TimeoutSeconds = 15
            }));

        var response = await provider.SearchAsync("dotnet 10", CancellationToken.None);

        Assert.Equal("dotnet 10", response.Query);
        Assert.Single(response.Results);
        Assert.Equal(".NET 10 release", response.Results[0].Title);
        Assert.Equal("# New .NET 10 features", response.Results[0].Content);
        Assert.Equal(HttpMethod.Post, handler.Request!.Method);
        Assert.Equal("https://api.tavily.com/search", handler.Request.RequestUri!.ToString());
        Assert.Equal("Bearer", handler.Request.Headers.Authorization!.Scheme);
        Assert.Equal("tvly-test", handler.Request.Headers.Authorization.Parameter);

        using var requestBody = JsonDocument.Parse(handler.RequestBody!);
        Assert.Equal("dotnet 10", requestBody.RootElement.GetProperty("query").GetString());
        Assert.Equal("basic", requestBody.RootElement.GetProperty("search_depth").GetString());
        Assert.Equal(3, requestBody.RootElement.GetProperty("max_results").GetInt32());
        Assert.False(requestBody.RootElement.GetProperty("include_answer").GetBoolean());
        Assert.Equal("markdown", requestBody.RootElement.GetProperty("include_raw_content").GetString());
    }

    private sealed class RecordingHandler(string body) : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }
        public string? RequestBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Request = request;
            RequestBody = await request.Content!.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            };
        }
    }
}
