# SQLite conversation links and admin settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Replace snapshot share URLs with server-backed conversation links and add a protected admin page that stores backend configuration in SQLite while keeping a clean path to Postgres.

**Architecture:** The .NET API will expose replaceable storage ports for conversations, admin accounts, and runtime backend settings. SQLite will implement those ports for now; provider clients will resolve effective settings at request time, with SQLite overrides taking precedence over environment/appsettings defaults. The Angular SPA will use \`/conversation/{id}\` links and a path-based \`/admin\` page, while localStorage retains only browser UI state and the opaque share ID.

**Tech Stack:** .NET 10 minimal APIs, \`Microsoft.Data.Sqlite\`, ASP.NET Core cookie authentication, PBKDF2 password hashing, Angular 21 standalone components, TypeScript, Vitest, xUnit, Vercel container deployment.

## Global Constraints

- Never place provider API keys in a conversation URL, conversation payload, browser localStorage, logs, or API response.
- Store admin passwords only as salted PBKDF2 hashes; raw bootstrap credentials are used only when creating the first account.
- Public conversation URLs are bearer links: anyone holding the opaque URL can read that conversation.
- Keep \`IConversationStore\`, \`IAdminAccountStore\`, and \`IBackendSettingsStore\` independent from SQLite so a later Postgres adapter does not change routes or UI.
- Environment/appsettings provider values remain the fallback when no admin override exists.
- SQLite storage is explicitly documented as non-durable on Vercel container replacement; do not describe it as production-durable.
- Use test-first cycles: add a focused failing test, run it red, implement the minimum, run it green, then refactor.
- Work on the current \`master\` checkout because the user explicitly requested implementation and a \`master\` push for Vercel.

---

### Task 1: Correct the GitHub repository website metadata

**Files:**
- External repository metadata for \`xoaicatchu/ai-assistant\` (no repository file change).
- Modify \`README.md\` only if the repository metadata UI cannot be updated automatically and a visible production link is needed.

**Interfaces:**
- Consumes the production URL \`https://ai-assistant-01.vercel.app\`.
- Produces the GitHub repository homepage/Website value pointing to the production URL instead of the preview alias.

- [ ] **Step 1: Read the current repository homepage metadata**

Run an authenticated GitHub API or the logged-in GitHub repository settings page and verify the current Website value is the preview alias shown by the user.

- [ ] **Step 2: Update the repository Website field**

Set the repository homepage to:

~~~text
https://ai-assistant-01.vercel.app
~~~

- [ ] **Step 3: Verify the metadata**

Reload repository metadata or the repository About panel and confirm the Website is exactly the production URL.

---

### Task 2: Add replaceable SQLite storage ports and schema

**Files:**
- Modify \`src/ProxyAgent.Api/ProxyAgent.Api.csproj\`
- Modify \`src/ProxyAgent.Api/Program.cs\`
- Create \`src/ProxyAgent.Api/Storage/StorageOptions.cs\`
- Create \`src/ProxyAgent.Api/Storage/SqliteDatabase.cs\`
- Create \`src/ProxyAgent.Api/Storage/ConversationStorage.cs\`
- Create \`src/ProxyAgent.Api/Storage/AdminStorage.cs\`
- Create \`src/ProxyAgent.Api/Storage/BackendSettingsStorage.cs\`
- Create \`src/ProxyAgent.Api/Api/ConversationContracts.cs\`
- Create \`tests/ProxyAgent.Api.Tests/Storage/SqliteStorageTests.cs\`

**Interfaces:**
- Produces \`IConversationStore\`, \`IAdminAccountStore\`, and \`IBackendSettingsStore\`.
- \`IConversationStore.Create\`, \`Get\`, and \`Update\` accept sanitized \`ConversationDocument\` values and return \`ConversationDocument\` values.
- \`IAdminAccountStore.Find\`, \`Create\`, and \`UpdatePasswordHash\` operate on one \`AdminAccount\` record.
- \`IBackendSettingsStore.Get\` and \`Save\` persist a serialized \`BackendSettingsOverrides\` record.

- [ ] **Step 1: Add the SQLite package and write the failing round-trip tests**

Add the \`Microsoft.Data.Sqlite\` package at version \`10.0.0\`. In \`SqliteStorageTests\`, create a unique temporary database path and assert that a conversation survives a new store instance:

~~~csharp
[Fact]
public void Conversation_round_trips_through_a_new_store_instance()
{
    var path = CreateTempDatabasePath();
    try
    {
        var first = CreateStore(path);
        first.Create(new ConversationDocument("abc", "Test", [
            new ConversationMessage(1, 1, "user", "Xin chào", "complete")
        ]));

        var second = CreateStore(path);
        var loaded = second.Get("abc");

        Assert.NotNull(loaded);
        Assert.Equal("Xin chào", loaded!.Messages[0].Text);
    }
    finally
    {
        DeleteTempDatabase(path);
    }
}
~~~

- [ ] **Step 2: Run the focused test to verify the expected red failure**

Run:

~~~powershell
dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj --filter FullyQualifiedName~SqliteStorageTests
~~~

Expected: FAIL because the SQLite package, ports, and schema are not implemented.

- [ ] **Step 3: Define contracts and storage ports**

In \`ConversationContracts.cs\`, define bounded server records:

~~~csharp
public sealed record ConversationMessage(int Id, int RequestId, string Role, string Text, string Status);
public sealed record ConversationDocument(string Id, string Title, IReadOnlyList<ConversationMessage> Messages);
public sealed record BackendSettingsOverrides(ProviderOverride? OpenAI, ProviderOverride? Anthropic, SearchOverride? WebSearch);
public sealed record ProviderOverride(string? BaseUrl, string? ApiKey, string? DefaultModel, string? ApiVersion);
public sealed record SearchOverride(bool? Enabled, bool? UseToolCalling, string? BaseUrl, string? ApiKey, int? MaxResults, int? TimeoutSeconds);
~~~

In the storage files, define the three interfaces and SQLite implementations. Use one parameterized connection per operation, \`CREATE TABLE IF NOT EXISTS\` during database initialization, and JSON serialization for message/settings payloads. Create IDs with 16 random bytes encoded using URL-safe base64 without padding; reject IDs that are not exactly URL-safe opaque tokens.

- [ ] **Step 4: Implement validation and sanitization before writes**

Normalize titles to at most 80 characters, accept only \`user\`/\`assistant\` roles, accept only \`complete\`/\`error\`/\`stopped\` statuses, trim text, discard empty messages, cap messages at 200 and total text at 500,000 characters, and never accept an image field in the server contract.

- [ ] **Step 5: Initialize the database and register the ports**

Add \`StorageOptions.SqlitePath\` with default \`App_Data/proxy-agent.db\`. Resolve relative paths from \`AppContext.BaseDirectory\`, create the parent directory, initialize all three tables, and register each SQLite adapter as a singleton in \`Program.cs\`. Keep the registration lines isolated so a future Postgres adapter can replace them without changing endpoints.

- [ ] **Step 6: Run the focused tests to verify green**

Run the same \`dotnet test\` command and confirm the SQLite round-trip, sanitization, update, and missing-record cases pass.

- [ ] **Step 7: Commit the storage slice**

~~~powershell
git add src/ProxyAgent.Api/ProxyAgent.Api.csproj src/ProxyAgent.Api/Program.cs src/ProxyAgent.Api/Storage src/ProxyAgent.Api/Api/ConversationContracts.cs tests/ProxyAgent.Api.Tests/Storage/SqliteStorageTests.cs
git commit -m "Add replaceable SQLite storage ports"
~~~

---

### Task 3: Add public server-backed conversation endpoints

**Files:**
- Create \`src/ProxyAgent.Api/Api/ConversationEndpoints.cs\`
- Modify \`src/ProxyAgent.Api/Api/ErrorHandling.cs\`
- Modify \`src/ProxyAgent.Api/Program.cs\`
- Create \`tests/ProxyAgent.Api.Tests/Api/ConversationEndpointTests.cs\`

**Interfaces:**
- \`POST /api/conversations\` accepts \`{ title, messages }\` and returns \`201 { id }\`.
- \`GET /api/conversations/{id}\` returns \`{ id, title, messages }\` or \`404\`.
- \`PUT /api/conversations/{id}\` replaces the sanitized title/messages and returns \`200\`, or \`404\`.

- [ ] **Step 1: Write failing endpoint tests**

Use \`WebApplicationFactory<Program>\` with an isolated \`Storage:SqlitePath\`. Test create/read/update, invalid oversized payload (\`400\`), missing ID (\`404\`), and ensure a posted image-like JSON property is absent from the returned document.

- [ ] **Step 2: Run the endpoint tests and confirm red**

~~~powershell
dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj --filter FullyQualifiedName~ConversationEndpointTests
~~~

Expected: FAIL because the routes are not mapped.

- [ ] **Step 3: Implement the endpoint handlers**

Map the routes from \`MapConversationEndpoints\`. Generate the ID only on \`POST\`; use the route ID for \`PUT\`; return a generic validation error through \`ApiValidationException\`; never echo arbitrary request properties.

- [ ] **Step 4: Run focused and existing backend tests**

~~~powershell
dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj --filter FullyQualifiedName~ConversationEndpointTests
dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj
~~~

- [ ] **Step 5: Commit the conversation API slice**

~~~powershell
git add src/ProxyAgent.Api/Api/ConversationEndpoints.cs src/ProxyAgent.Api/Api/ErrorHandling.cs src/ProxyAgent.Api/Program.cs tests/ProxyAgent.Api.Tests/Api/ConversationEndpointTests.cs
git commit -m "Add server-backed conversation endpoints"
~~~

---

### Task 4: Add admin authentication and runtime backend settings

**Files:**
- Create \`src/ProxyAgent.Api/Admin/AdminOptions.cs\`
- Create \`src/ProxyAgent.Api/Admin/AdminAuthService.cs\`
- Create \`src/ProxyAgent.Api/Api/AdminEndpoints.cs\`
- Modify \`src/ProxyAgent.Api/Chat/ModelSelector.cs\`
- Modify \`src/ProxyAgent.Api/Providers/OpenAiProvider.cs\`
- Modify \`src/ProxyAgent.Api/Providers/AnthropicProvider.cs\`
- Modify \`src/ProxyAgent.Api/WebSearch/WebSearchAgent.cs\`
- Modify \`src/ProxyAgent.Api/Program.cs\`
- Create \`tests/ProxyAgent.Api.Tests/Admin/AdminAuthTests.cs\`
- Create \`tests/ProxyAgent.Api.Tests/Admin/AdminEndpointTests.cs\`

**Interfaces:**
- \`POST /api/admin/login\` accepts \`{ username, password }\`, sets an HttpOnly cookie, and returns \`200\` or generic \`401\`.
- \`POST /api/admin/logout\` clears the cookie.
- \`GET /api/admin/session\` returns \`{ authenticated }\`.
- \`GET /api/admin/settings\` requires the cookie and returns effective values with \`hasApiKey\`/masked hints only.
- \`PUT /api/admin/settings\` requires the cookie and saves validated provider/search overrides.
- \`PUT /api/admin/password\` requires the cookie and replaces the PBKDF2 hash.
- The runtime settings service exposes \`GetProviders()\` and \`GetWebSearch()\` to request-time consumers.

- [ ] **Step 1: Write failing password and authorization tests**

Cover first-run bootstrap from \`Admin:InitialUsername\`/\`Admin:InitialPassword\`, wrong password rejection, successful cookie login, unauthenticated settings \`401\`, and password change invalidating the old password.

- [ ] **Step 2: Run the tests to verify red**

~~~powershell
dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj --filter FullyQualifiedName~Admin
~~~

Expected: FAIL because admin storage, auth, and endpoints do not exist.

- [ ] **Step 3: Implement password hashing and cookie authentication**

Use a versioned PBKDF2 format containing algorithm, iteration count, salt, and derived key. Compare derived bytes with \`CryptographicOperations.FixedTimeEquals\`. Configure the cookie as HttpOnly, SameSite=Lax, Secure when HTTPS, path \`/api/admin\`, and an eight-hour expiration. Seed exactly one account only when the admin table is empty and both bootstrap values are non-empty.

- [ ] **Step 4: Implement effective settings precedence**

Build a singleton runtime settings service that clones environment/appsettings options at startup, overlays non-null SQLite overrides, and replaces its in-memory snapshot after a successful admin save. Refactor \`ModelSelector\`, \`OpenAiProvider\`, \`AnthropicProvider\`, and \`WebSearchAgent\` to read the current snapshot per request instead of capturing \`IOptions<T>.Value\` once.

- [ ] **Step 5: Implement masked settings DTOs and validation**

Return base URLs, default model/API version, booleans, and secret metadata only. A blank API-key field preserves the existing key; explicit \`clear...ApiKey: true\` removes it. Validate absolute HTTP(S) URLs, positive timeout/result limits, and reject payloads over the configured bounds. Do not write raw keys to logs or errors.

- [ ] **Step 6: Run focused and full backend tests**

~~~powershell
dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj --filter FullyQualifiedName~Admin
dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj
~~~

- [ ] **Step 7: Commit the admin/backend settings slice**

~~~powershell
git add src/ProxyAgent.Api/Admin src/ProxyAgent.Api/Api/AdminEndpoints.cs src/ProxyAgent.Api/Chat/ModelSelector.cs src/ProxyAgent.Api/Providers src/ProxyAgent.Api/WebSearch/WebSearchAgent.cs src/ProxyAgent.Api/Program.cs tests/ProxyAgent.Api.Tests/Admin
git commit -m "Add protected admin settings and runtime overrides"
~~~

---

### Task 5: Replace the client snapshot share flow with conversation IDs

**Files:**
- Delete \`web/src/app/conversation-sharing.ts\`
- Delete \`web/src/app/conversation-sharing.spec.ts\`
- Create \`web/src/app/conversation-link.ts\`
- Create \`web/src/app/conversation-link.spec.ts\`
- Modify \`web/src/app/chat.service.ts\`
- Modify \`web/src/app/conversation-storage.ts\`
- Modify \`web/src/app/conversation-storage.spec.ts\`
- Modify \`web/src/app/app.ts\`
- Modify \`web/src/app/app.html\`
- Modify \`web/src/app/app.css\`
- Modify \`web/src/app/app.spec.ts\`

**Interfaces:**
- \`readConversationId(href: string): string | null\` reads only \`/conversation/{opaqueId}\`.
- \`createConversationUrl(id: string, baseHref: string): string | null\` creates a clean path URL and never serializes messages.
- \`ChatService.createConversation\`, \`getConversation\`, and \`updateConversation\` call the three backend routes.
- \`StoredConversation.shareId?: string\` persists the server ID beside local UI history.

- [ ] **Step 1: Write failing link and service tests**

Assert that a Vietnamese conversation produces a URL without \`#share\`, message text, or image data; malformed paths return \`null\`; \`ChatService.createConversation\` sends title/messages to \`POST /api/conversations\`; and \`getConversation\` reads the server response.

- [ ] **Step 2: Run the frontend tests to verify red**

~~~powershell
Push-Location web
npm test -- --run src/app/conversation-link.spec.ts src/app/chat.service.spec.ts
Pop-Location
~~~

Expected: FAIL because the new link module and service methods do not exist.

- [ ] **Step 3: Implement path-based links and API methods**

Use a strict opaque-ID path matcher, \`encodeURIComponent\` for the path segment, and \`fetch(apiUrl('/conversations'))\` with JSON. Keep all message sanitization server-authoritative; the client sends text/status metadata only.

- [ ] **Step 4: Replace App snapshot behavior**

On startup, detect a path conversation ID and load it from the API. The Share action creates a server record once, saves \`shareId\` locally, copies the clean \`/conversation/{id}\` URL, and shows an error if the API fails. After a completed send/retry, update an existing shared conversation once; do not issue a PUT for every SSE token. Remove all hash snapshot imports, payload encoding, and hash URL mutation.

- [ ] **Step 5: Preserve the existing viewport behavior**

Loading or synchronizing a shared conversation must not call the auto-scroll helper. Sending a message should retain the current scroll policy already covered by \`scrolling.ts\`; the user remains responsible for reading longer responses by scrolling.

- [ ] **Step 6: Run focused and full frontend tests**

~~~powershell
Push-Location web
npm test -- --run src/app/conversation-link.spec.ts src/app/chat.service.spec.ts src/app/conversation-storage.spec.ts src/app/app.spec.ts
npm test
Pop-Location
~~~

- [ ] **Step 7: Commit the server-backed share slice**

~~~powershell
git add web/src/app
git commit -m "Use server-backed conversation share links"
~~~

---

### Task 6: Add the authenticated Angular admin page

**Files:**
- Create \`web/src/app/admin.service.ts\`
- Create \`web/src/app/admin-page.ts\`
- Create \`web/src/app/admin-page.html\`
- Create \`web/src/app/admin-page.css\`
- Create \`web/src/app/admin-page.spec.ts\`
- Modify \`web/src/app/app.ts\`
- Modify \`web/src/app/app.html\`
- Modify \`web/src/app/app.css\`

**Interfaces:**
- \`/admin/login\` renders username/password login.
- \`/admin\` renders masked provider/search settings after \`GET /api/admin/session\` succeeds.
- The admin page saves settings, changes the password, logs out, and never writes provider API keys to localStorage.

- [ ] **Step 1: Write failing component/service tests**

Test that unauthenticated \`/admin\` shows the login form, a successful login loads settings, the save request sends replacement/clear flags rather than an existing masked key, logout returns to login, and no provider secret is written to \`localStorage\`.

- [ ] **Step 2: Run the tests to verify red**

~~~powershell
Push-Location web
npm test -- --run src/app/admin-page.spec.ts
Pop-Location
~~~

Expected: FAIL because the admin service and component do not exist.

- [ ] **Step 3: Implement the admin service and page**

Use a standalone component with signals or simple \`ngModel\` state. Include fields for OpenAI-compatible Base URL/API key/default model, Anthropic Base URL/API key/API version/default model, Tavily Base URL/API key/enabled/tool-calling/max results/timeout, plus explicit “Xóa key” controls. Keep API key inputs blank on load and show only the server-provided masked hint.

- [ ] **Step 4: Add route detection and consistent UI**

Render the admin component when \`location.pathname\` is \`/admin\` or \`/admin/login\`, keep the chat component unchanged for other paths, use the existing typography/button tokens, and provide a link back to \`/\`. Ensure the existing nginx SPA fallback serves both admin paths.

- [ ] **Step 5: Run frontend tests and production build**

~~~powershell
Push-Location web
npm test
npm run build
Pop-Location
~~~

- [ ] **Step 6: Commit the admin UI slice**

~~~powershell
git add web/src/app
git commit -m "Add authenticated backend settings page"
~~~

---

### Task 7: Document bootstrap/deployment and verify the integrated application

**Files:**
- Modify \`src/ProxyAgent.Api/appsettings.json\`
- Modify \`src/ProxyAgent.Api/appsettings.Production.json\`
- Modify \`README.md\`
- Modify \`docs/GETTING_STARTED.md\`
- Modify \`docs/ARCHITECTURE.md\`
- Create or modify \`src/ProxyAgent.Api/.gitignore\` only if the SQLite default directory needs an explicit ignore rule.
- Create \`tests/ProxyAgent.Api.Tests/Integration/HealthAndAdminSmokeTests.cs\` if the existing endpoint tests do not cover startup seeding.

**Interfaces:**
- Documents \`Admin:InitialUsername\`, \`Admin:InitialPassword\`, \`Storage:SqlitePath\`, admin URL, conversation URL, and the Postgres adapter seam.
- Produces a clean buildable backend/frontend deployment with a reproducible local smoke test.

- [ ] **Step 1: Add non-secret configuration placeholders**

Add empty/non-secret sections for \`Storage.SqlitePath\` and \`Admin.InitialUsername\`/\`InitialPassword\`; never commit a real password or API key. Add the SQLite directory/database pattern to \`.gitignore\`.

- [ ] **Step 2: Document the one-time bootstrap**

Document setting the two bootstrap variables on Vercel, opening \`/admin/login\`, saving provider settings, then removing \`Admin:InitialPassword\` after the first successful seed. Explain that existing environment values remain fallback defaults and that SQLite data is ephemeral on Vercel.

- [ ] **Step 3: Document the GitHub/Vercel URL distinction**

State that the GitHub repository Website should be \`https://ai-assistant-01.vercel.app\`, while Vercel preview aliases can change per deployment and must not be used as the canonical link.

- [ ] **Step 4: Run the complete verification suite**

~~~powershell
dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj
Push-Location web
npm test
npm run build
Pop-Location
dotnet build src/ProxyAgent.Api/ProxyAgent.Api.csproj --configuration Release
git diff --check
~~~

Confirm zero test failures, zero build errors, and no provider secret in tracked diffs.

- [ ] **Step 5: Run a local HTTP smoke test**

Start the API with temporary bootstrap credentials and a temporary SQLite path, then verify:

~~~text
GET  /api/health                         -> 200
POST /api/admin/login                    -> 200 + HttpOnly cookie
GET  /api/admin/settings                 -> 200 with masked secrets
POST /api/conversations                  -> 201 + opaque id
GET  /api/conversations/{id}             -> 200 with the same messages
PUT  /api/conversations/{id}             -> 200 with updated messages
~~~

- [ ] **Step 6: Commit docs and final verification changes**

~~~powershell
git add README.md docs/GETTING_STARTED.md docs/ARCHITECTURE.md src/ProxyAgent.Api/appsettings.json src/ProxyAgent.Api/appsettings.Production.json src/ProxyAgent.Api/.gitignore tests/ProxyAgent.Api.Tests/Integration
git commit -m "Document SQLite admin bootstrap and deployment"
~~~

- [ ] **Step 7: Push \`master\` and verify Vercel**

~~~powershell
git push origin master
~~~

Poll the GitHub commit status until the Vercel check completes, then verify the production root, \`/api/health\`, \`/admin/login\`, and a clean \`/conversation/{id}\` route. Report the exact commit and deployment status only after fresh command/output evidence.

## Self-review checklist

- The design spec's storage-port, SQLite-schema, public-link, runtime-settings, auth, security, and verification sections are covered by Tasks 2–7.
- The old base64/hash snapshot behavior is explicitly deleted in Task 5.
- The admin page does not depend on raw secrets from GET responses and is protected by cookie authentication in Task 4/6.
- The Postgres migration boundary is limited to storage registrations and adapter implementations.
- Every task has exact files, interfaces, red/green commands, and a commit point; all implementation steps are concrete.
