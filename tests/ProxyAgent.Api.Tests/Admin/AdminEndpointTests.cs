using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ProxyAgent.Api.Admin;
using ProxyAgent.Api.Storage;

namespace ProxyAgent.Api.Tests.Admin;

public sealed class AdminEndpointTests
{
    [Fact]
    public async Task Settings_require_login_and_never_return_a_provider_secret()
    {
        using var app = new TestApp();

        var unauthorized = await app.Client.GetAsync("/api/admin/settings");
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);

        var login = await app.Client.PostAsJsonAsync("/api/admin/login", new
        {
            username = "admin",
            password = "initial-password-123"
        });
        login.EnsureSuccessStatusCode();

        var settings = await app.Client.GetAsync("/api/admin/settings");
        settings.EnsureSuccessStatusCode();
        var body = await settings.Content.ReadAsStringAsync();
        Assert.DoesNotContain("server-secret", body, StringComparison.Ordinal);
        using var document = JsonDocument.Parse(body);
        Assert.True(document.RootElement.GetProperty("openAI").GetProperty("hasApiKey").GetBoolean());
    }

    [Fact]
    public async Task Login_rejects_wrong_credentials_and_password_change_replaces_the_old_password()
    {
        using var app = new TestApp();

        var wrongLogin = await app.Client.PostAsJsonAsync("/api/admin/login", new
        {
            username = "admin",
            password = "wrong-password"
        });
        Assert.Equal(HttpStatusCode.Unauthorized, wrongLogin.StatusCode);

        var login = await app.Client.PostAsJsonAsync("/api/admin/login", new
        {
            username = "admin",
            password = "initial-password-123"
        });
        login.EnsureSuccessStatusCode();

        var change = await app.Client.PutAsJsonAsync("/api/admin/password", new
        {
            currentPassword = "initial-password-123",
            newPassword = "new-password-456"
        });
        change.EnsureSuccessStatusCode();

        await app.Client.PostAsync("/api/admin/logout", content: null);
        var oldLogin = await app.Client.PostAsJsonAsync("/api/admin/login", new
        {
            username = "admin",
            password = "initial-password-123"
        });
        Assert.Equal(HttpStatusCode.Unauthorized, oldLogin.StatusCode);

        var newLogin = await app.Client.PostAsJsonAsync("/api/admin/login", new
        {
            username = "admin",
            password = "new-password-456"
        });
        newLogin.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Saving_settings_updates_the_effective_runtime_values_without_echoing_the_new_secret()
    {
        using var app = new TestApp();
        var login = await app.Client.PostAsJsonAsync("/api/admin/login", new
        {
            username = "admin",
            password = "initial-password-123"
        });
        login.EnsureSuccessStatusCode();

        var save = await app.Client.PutAsJsonAsync("/api/admin/settings", new
        {
            openAI = new
            {
                baseUrl = "https://gateway.example/v1",
                defaultModel = "new-model",
                apiKey = "replacement-secret"
            }
        });

        save.EnsureSuccessStatusCode();
        var body = await save.Content.ReadAsStringAsync();
        Assert.DoesNotContain("replacement-secret", body, StringComparison.Ordinal);
        using var document = JsonDocument.Parse(body);
        Assert.Equal("https://gateway.example/v1", document.RootElement.GetProperty("openAI").GetProperty("baseUrl").GetString());
        Assert.Equal("new-model", document.RootElement.GetProperty("openAI").GetProperty("defaultModel").GetString());
        Assert.True(document.RootElement.GetProperty("openAI").GetProperty("hasApiKey").GetBoolean());
    }

    [Fact]
    public async Task Login_reports_storage_unavailable_instead_of_returning_a_gateway_500()
    {
        using var app = new StorageUnavailableApp();

        var response = await app.Client.PostAsJsonAsync("/api/admin/login", new
        {
            username = "admin",
            password = "initial-password-123"
        });

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("storage_unavailable", document.RootElement.GetProperty("error").GetProperty("code").GetString());
    }

    private sealed class TestApp : WebApplicationFactory<Program>
    {
        private readonly string databasePath = Path.Combine(Path.GetTempPath(), $"proxy-agent-admin-{Guid.NewGuid():N}.db");

        public TestApp()
        {
            Client = CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        }

        public HttpClient Client { get; }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.UseSetting("Storage:SqlitePath", databasePath);
            builder.UseSetting("Admin:InitialUsername", "admin");
            builder.UseSetting("Admin:InitialPassword", "initial-password-123");
            builder.UseSetting("Providers:OpenAI:ApiKey", "server-secret");
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

    private sealed class StorageUnavailableApp : WebApplicationFactory<Program>
    {
        public StorageUnavailableApp()
        {
            Client = CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        }

        public HttpClient Client { get; }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IAdminAccountStore>();
                services.AddSingleton<IAdminAccountStore, ThrowingAdminAccountStore>();
            });
        }

        protected override void Dispose(bool disposing)
        {
            Client.Dispose();
            base.Dispose(disposing);
        }
    }

    private sealed class ThrowingAdminAccountStore : IAdminAccountStore
    {
        private static StorageUnavailableException Unavailable() =>
            new("PostgreSQL persistence is not available.");

        public AdminAccount? Get(string username) => throw Unavailable();

        public bool HasAccount() => throw Unavailable();

        public void Create(string username, string passwordHash) => throw Unavailable();

        public void UpdatePasswordHash(string username, string passwordHash) => throw Unavailable();
    }
}
