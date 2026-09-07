using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace ProxyAgent.Api.Tests.Api;

public sealed class ConversationEndpointTests
{
    private const string ConversationId = "abcdefghijklmnopqrstuv";

    [Fact]
    public async Task Create_read_and_update_use_the_same_server_conversation_id()
    {
        using var app = new TestApp();
        var createResponse = await app.Client.PostAsJsonAsync("/api/conversations", new
        {
            id = ConversationId,
            title = "Cuộc trò chuyện Hà Nội",
            messages = new object[]
            {
                new { id = 1, requestId = 1, role = "user", text = "Thời tiết hôm nay?", status = "complete", image = "secret-image-data" },
                new { id = 2, requestId = 1, role = "assistant", text = "Trời nhiều mây.", status = "complete" }
            }
        });

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        using var createdBody = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = createdBody.RootElement.GetProperty("id").GetString();
        var ownerToken = createdBody.RootElement.GetProperty("ownerToken").GetString();
        Assert.NotNull(id);
        Assert.NotNull(ownerToken);
        Assert.Matches("^[A-Za-z0-9_-]{22}$", id!);
        Assert.Contains("HttpOnly", string.Join(";", createResponse.Headers.GetValues("Set-Cookie")), StringComparison.OrdinalIgnoreCase);

        var readResponse = await app.Client.GetAsync($"/api/conversations/{id}");
        Assert.Equal(HttpStatusCode.OK, readResponse.StatusCode);

        using var ownerReadRequest = new HttpRequestMessage(HttpMethod.Get, $"/api/conversations/{id}");
        ownerReadRequest.Headers.Add("X-Conversation-Token", ownerToken);
        readResponse = await app.Client.SendAsync(ownerReadRequest);
        readResponse.EnsureSuccessStatusCode();
        using var readBody = JsonDocument.Parse(await readResponse.Content.ReadAsStringAsync());
        Assert.Equal(id, readBody.RootElement.GetProperty("id").GetString());
        Assert.True(readBody.RootElement.GetProperty("canEdit").GetBoolean());
        Assert.Equal("Thời tiết hôm nay?", readBody.RootElement.GetProperty("messages")[0].GetProperty("text").GetString());
        Assert.DoesNotContain("image", readBody.RootElement.GetProperty("messages")[0].EnumerateObject().Select(property => property.Name));

        using var updateRequest = new HttpRequestMessage(
            HttpMethod.Put,
            $"/api/conversations/{id}")
        {
            Content = JsonContent.Create(new
            {
                title = "Đã tiếp tục",
                messages = new[]
                {
                    new { id = 1, requestId = 1, role = "user", text = "Câu hỏi mới", status = "complete" }
                }
            })
        };
        updateRequest.Headers.Add("X-Conversation-Token", ownerToken);
        var updateResponse = await app.Client.SendAsync(updateRequest);

        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);
        using var updatedBody = JsonDocument.Parse(await updateResponse.Content.ReadAsStringAsync());
        Assert.Equal(id, updatedBody.RootElement.GetProperty("id").GetString());
        Assert.Equal("Đã tiếp tục", updatedBody.RootElement.GetProperty("title").GetString());

        using var publishRequest = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/conversations/{id}/publish");
        publishRequest.Headers.Add("X-Conversation-Token", ownerToken);
        var publishResponse = await app.Client.SendAsync(publishRequest);
        publishResponse.EnsureSuccessStatusCode();

        using var recipient = app.CreateClient();
        var publicReadResponse = await recipient.GetAsync($"/api/conversations/{id}");
        publicReadResponse.EnsureSuccessStatusCode();
        using var publicBody = JsonDocument.Parse(await publicReadResponse.Content.ReadAsStringAsync());
        Assert.True(publicBody.RootElement.GetProperty("isPublic").GetBoolean());
        Assert.False(publicBody.RootElement.GetProperty("canEdit").GetBoolean());
    }

    [Fact]
    public async Task Missing_or_malformed_conversation_ids_return_not_found()
    {
        using var app = new TestApp();

        Assert.Equal(HttpStatusCode.NotFound, await GetStatus(app.Client, "/api/conversations/not-an-id"));
        Assert.Equal(HttpStatusCode.NotFound, await GetStatus(app.Client, "/api/conversations/AAAAAAAAAAAAAAAAAAAAAA"));
    }

    [Fact]
    public async Task Oversized_conversation_payload_is_rejected()
    {
        using var app = new TestApp();
        var response = await app.Client.PostAsJsonAsync("/api/conversations", new
        {
            title = "Quá dài",
            messages = new[]
            {
                new { id = 1, requestId = 1, role = "user", text = new string('x', 500_001), status = "complete" }
            }
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private static async Task<HttpStatusCode> GetStatus(HttpClient client, string path)
        => (await client.GetAsync(path)).StatusCode;

    private sealed class TestApp : WebApplicationFactory<Program>
    {
        private readonly string databasePath = Path.Combine(Path.GetTempPath(), $"proxy-agent-api-{Guid.NewGuid():N}.db");

        public TestApp()
        {
            Client = CreateClient();
        }

        public HttpClient Client { get; }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.UseSetting("Storage:SqlitePath", databasePath);
        }

        protected override void Dispose(bool disposing)
        {
            Client.Dispose();
            base.Dispose(disposing);
            foreach (var file in new[] { databasePath, $"{databasePath}-wal", $"{databasePath}-shm" })
            {
                if (File.Exists(file))
                {
                    File.Delete(file);
                }
            }
        }
    }
}
