# Unified Chat API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng gateway ASP.NET Core .NET 10 thống nhất cho OpenAI và Anthropic với dual endpoint, synchronous response, SSE streaming và proxy-only tool calling.

**Architecture:** Minimal API nhận hai contract, chuẩn hóa về model nội bộ, chọn provider qua model prefix, rồi gọi `IChatProvider`. Hai adapter raw `HttpClient` map normalized messages/tools sang OpenAI Chat Completions hoặc Anthropic Messages; stream từ cả hai provider được chuyển thành normalized events trước khi serialize ra endpoint.

**Tech Stack:** .NET 10, ASP.NET Core Minimal API, `HttpClientFactory`, `System.Text.Json`, xUnit, `Microsoft.AspNetCore.Mvc.Testing`, `Microsoft.NET.Test.Sdk`.

## Global Constraints

- Target framework: `net10.0`.
- Automated tests never require a real provider API key.
- Keys use `appsettings.json` placeholders and are never logged or committed as real secrets.
- MVP supports text messages and client-side tool calls; it does not execute tools on the server.
- MVP does not include frontend, database, authentication, retry policy or rate limiting.
- Every production behavior is introduced by a failing test first, except generated scaffolding and static configuration.
- Every task ends with a focused test run and a git commit.

---

### Task 1: Scaffold the .NET 10 API and test harness

**Files:**
- Create: `ProxyAgent.slnx`, `src/ProxyAgent.Api/ProxyAgent.Api.csproj`, `src/ProxyAgent.Api/Program.cs`
- Create: `src/ProxyAgent.Api/appsettings.json`, `src/ProxyAgent.Api/Properties/launchSettings.json`
- Create: `tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj`, `tests/ProxyAgent.Api.Tests/Usings.cs`, `.gitignore`

**Interfaces:** Produces a runnable ASP.NET Core host and a test project referencing the API project.

- [ ] **Step 1: Generate scaffolding**

```powershell
dotnet new sln -n ProxyAgent
dotnet new web -n ProxyAgent.Api -o src/ProxyAgent.Api --framework net10.0
dotnet new xunit -n ProxyAgent.Api.Tests -o tests/ProxyAgent.Api.Tests --framework net10.0
dotnet sln ProxyAgent.slnx add src/ProxyAgent.Api/ProxyAgent.Api.csproj tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj
dotnet add tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj reference src/ProxyAgent.Api/ProxyAgent.Api.csproj
dotnet add tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj package Microsoft.AspNetCore.Mvc.Testing --version 10.0.0
```

Remove generated sample endpoint files, but keep project files and test runner configuration.

- [ ] **Step 2: Add static configuration and ignores**

`appsettings.json` must contain `Routing:DefaultProvider`, `Providers:OpenAI`, `Providers:Anthropic`, and `Http:TimeoutSeconds`; use empty `ApiKey` values and model defaults only. Add `bin/`, `obj/`, `appsettings.Development.json`, and `appsettings.Local.json` to `.gitignore`.

- [ ] **Step 3: Verify and commit**

Run `dotnet build ProxyAgent.slnx` and `dotnet test ProxyAgent.slnx --no-restore`; expect exit code 0. Then run:

```powershell
git add .gitignore ProxyAgent.slnx src tests
git commit -m "chore: scaffold dotnet 10 api and tests"
```

### Task 2: Define normalized contracts and deterministic model routing

**Files:**
- Create: `src/ProxyAgent.Api/Chat/ChatModels.cs`, `src/ProxyAgent.Api/Chat/ModelSelector.cs`
- Test: `tests/ProxyAgent.Api.Tests/Chat/ModelSelectorTests.cs`

**Interfaces:**
- `NormalizedChatRequest(Model, Messages, Stream, Temperature, MaxTokens, Tools, ToolChoice)`.
- `ChatMessage(Role, Content, ToolCalls, ToolCallId, Name)`.
- `ChatTool(Name, Description, JsonElement Parameters)` and `ChatToolCall(Id, Name, ArgumentsJson)`.
- `NormalizedChatResponse` and `ChatStreamEvent` containing provider/model, text delta, optional tool call, finish reason and usage.
- `IModelSelector.Select(string? requestedModel) -> ProviderSelection`.

- [ ] **Step 1: Write the failing tests**

Test that `openai:gpt-test` selects OpenAI and strips the prefix; `anthropic:claude-test` selects Anthropic; an empty model uses configured provider/default model; and `local:model` throws `UnsupportedProviderException` with code `unsupported_provider`.

- [ ] **Step 2: Verify RED**

Run `dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj --filter FullyQualifiedName~ModelSelectorTests`; expect failure because the selector and normalized contracts do not exist.

- [ ] **Step 3: Implement the minimal contracts and selector**

Use `RoutingOptions` and `ProviderOptions` records bound with `IOptions`. Apply prefix selection first, then configured default provider for unprefixed models, then that provider's default model for null/empty input. Keep normalized contracts independent from configuration.

- [ ] **Step 4: Verify GREEN and commit**

Run the same filtered test and expect all routing tests to pass. Commit:

```powershell
git add src/ProxyAgent.Api/Chat tests/ProxyAgent.Api.Tests/Chat
git commit -m "feat: add normalized chat contracts and model routing"
```

### Task 3: Add provider abstraction and OpenAI adapter

**Files:**
- Create: `src/ProxyAgent.Api/Providers/IChatProvider.cs`, `ProviderExceptions.cs`, `OpenAiProvider.cs`, `OpenAiPayloads.cs`
- Test: `tests/ProxyAgent.Api.Tests/Providers/OpenAiProviderTests.cs`
- Modify: `src/ProxyAgent.Api/Program.cs`

**Interfaces:**
- `IChatProvider.Name`.
- `CompleteAsync(NormalizedChatRequest, ProviderSelection, CancellationToken)`.
- `StreamAsync(NormalizedChatRequest, ProviderSelection, CancellationToken)`.

- [ ] **Step 1: Write failing OpenAI provider tests**

Use a recording `HttpMessageHandler` returning fixed JSON. Assert `POST {BaseUrl}/chat/completions`, bearer header, `stream:false`, forwarded messages and OpenAI tool shape. Assert a response with `tool_calls` maps to `ChatToolCall` and usage. Add tests for upstream 401/403, other 4xx and 5xx/network failures.

Expected assertion example:

```csharp
Assert.Equal("tool_calls", response.FinishReason);
Assert.Equal("get_weather", Assert.Single(response.Message.ToolCalls).Name);
Assert.Contains("\"city\":\"Hanoi\"", handler.RequestBody);
```

- [ ] **Step 2: Verify RED**

Run `dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj --filter FullyQualifiedName~OpenAiProviderTests`; expect failure because the provider is absent.

- [ ] **Step 3: Implement the provider**

Serialize `model`, `messages`, `temperature`, `max_tokens`, `stream`, `tools`, and `tool_choice`. Map normalized tools to `{ "type":"function", "function": { "name", "description", "parameters" } }`. Map the first choice's text/tool calls, finish reason and usage. Map 401/403 to `ProviderAuthenticationException`, other 4xx to `ProviderRequestException`, and 5xx/network to `ProviderUnavailableException` without exposing secrets.

- [ ] **Step 4: Verify GREEN and commit**

Run the focused tests and expect all to pass. Commit:

```powershell
git add src/ProxyAgent.Api/Providers src/ProxyAgent.Api/Chat tests/ProxyAgent.Api.Tests/Providers src/ProxyAgent.Api/Program.cs
git commit -m "feat: add openai chat provider"
```

### Task 4: Add Anthropic Messages adapter and tool conversion

**Files:**
- Create: `src/ProxyAgent.Api/Providers/AnthropicProvider.cs`, `AnthropicPayloads.cs`
- Test: `tests/ProxyAgent.Api.Tests/Providers/AnthropicProviderTests.cs`

**Interfaces:** `AnthropicProvider.Name == "anthropic"`; it sends `POST {BaseUrl}/messages` with `x-api-key`, `anthropic-version`, and `content-type` headers.

- [ ] **Step 1: Write failing Anthropic tests**

Assert the first system message becomes top-level `system`; normal messages become Anthropic content blocks; tools become `{ name, description, input_schema }`; `max_tokens` defaults when absent; and a `tool_use` response becomes a normalized `ChatToolCall` with serialized input. Also test mapping of a normalized tool result to a `tool_result` block.

- [ ] **Step 2: Verify RED**

Run `dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj --filter FullyQualifiedName~AnthropicProviderTests`; expect failure because the adapter is absent.

- [ ] **Step 3: Implement the adapter**

Use raw `HttpClient` and `System.Text.Json`. Preserve tool-call IDs and argument JSON. Convert upstream status failures through the shared provider exception hierarchy. Do not execute a tool or synthesize provider-specific fields.

- [ ] **Step 4: Verify GREEN and commit**

Run the focused tests and expect all to pass. Commit:

```powershell
git add src/ProxyAgent.Api/Providers tests/ProxyAgent.Api.Tests/Providers
git commit -m "feat: add anthropic messages provider"
```

### Task 5: Implement provider streaming and SSE normalization

**Files:**
- Create: `src/ProxyAgent.Api/Streaming/SseReader.cs`, `SseWriter.cs`
- Modify: `src/ProxyAgent.Api/Providers/OpenAiProvider.cs`, `AnthropicProvider.cs`
- Test: `tests/ProxyAgent.Api.Tests/Streaming/SseReaderTests.cs`, `Providers/OpenAiStreamingTests.cs`, `Providers/AnthropicStreamingTests.cs`

**Interfaces:** `SseReader.ReadAsync(Stream, CancellationToken) -> IAsyncEnumerable<SseEvent>` and writers for gateway/OpenAI chunks.

- [ ] **Step 1: Write failing parser/stream tests**

Feed SSE with `event:`, one or more `data:` lines and blank event delimiters. Assert OpenAI `choices[0].delta.content` and Anthropic `content_block_delta.delta.text` become `TextDelta`; assert Anthropic `input_json_delta.partial_json` accumulates into one tool call.

- [ ] **Step 2: Verify RED**

Run `dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj --filter FullyQualifiedName~SseReaderTests` and the two streaming filters; expect failure because parser/stream methods are absent.

- [ ] **Step 3: Implement parsing and provider streams**

Handle UTF-8, `data:`/`event:` lines, blank-line termination, multiple data lines and cancellation. Stop OpenAI on `[DONE]`. Map Anthropic `message_start`, `content_block_delta`, `message_delta`, and `message_stop` to normalized events.

- [ ] **Step 4: Implement endpoint-facing writers and verify**

OpenAI writer emits `chat.completion.chunk` JSON and final `[DONE]`; gateway writer emits `type`, `id`, `provider`, `model`, `delta`, `toolCall`, and `done`. Set `text/event-stream`, disable buffering and flush each event. Run `dotnet test ... --filter FullyQualifiedName~Streaming`; expect zero failures.

- [ ] **Step 5: Commit streaming**

```powershell
git add src/ProxyAgent.Api/Streaming src/ProxyAgent.Api/Providers tests/ProxyAgent.Api.Tests
git commit -m "feat: normalize provider streams as sse"
```

### Task 6: Add orchestrator, contracts, endpoints, errors and health

**Files:**
- Create: `src/ProxyAgent.Api/Chat/ChatOrchestrator.cs`
- Create: `src/ProxyAgent.Api/Api/OpenAiContracts.cs`, `GatewayContracts.cs`, `ChatEndpoints.cs`, `ErrorHandling.cs`
- Test: `tests/ProxyAgent.Api.Tests/Api/ChatEndpointsTests.cs`
- Modify: `src/ProxyAgent.Api/Program.cs`

**Interfaces:** `ChatOrchestrator.CompleteAsync`, `ChatOrchestrator.StreamAsync`, request mappers for both contracts, and OpenAI response mapper.

- [ ] **Step 1: Write failing endpoint tests**

Use `WebApplicationFactory` with a `FakeChatProvider`. Verify `/v1/chat/completions` returns `object:"chat.completion"`, `/api/chat` returns the gateway response, tool calls appear in the OpenAI response, and `stream:true` returns SSE. Add tests for `/health` 200, unknown provider 400, missing provider 503, and provider auth failure 502.

Example assertion:

```csharp
var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
Assert.Equal("chat.completion", body!.RootElement.GetProperty("object").GetString());
```

- [ ] **Step 2: Verify RED**

Run `dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj --filter FullyQualifiedName~ChatEndpointsTests`; expect failure because routes are absent.

- [ ] **Step 3: Implement orchestration and JSON contracts**

Resolve provider by `Name` after `IModelSelector`; use camelCase for gateway fields and explicit `JsonPropertyName` for OpenAI snake_case. Reject empty messages/unsupported roles with `400 invalid_request`. Never execute tools.

- [ ] **Step 4: Implement routes, streaming and sanitized errors**

Register `POST /api/chat`, `POST /v1/chat/completions`, and `GET /health`. Non-stream requests return JSON; stream requests enumerate with `RequestAborted` and use the route's writer. Map stable error codes from the spec, never log or return API keys/full prompt bodies, and emit an SSE error after headers have started.

- [ ] **Step 5: Verify GREEN and commit**

Run the endpoint filter and expect all tests to pass. Commit:

```powershell
git add src/ProxyAgent.Api tests/ProxyAgent.Api.Tests/Api
git commit -m "feat: expose unified and openai-compatible chat endpoints"
```

### Task 7: Documentation and final verification

**Files:** Create `README.md`; modify `appsettings.json` and `launchSettings.json` only for documented non-secret defaults.

- [ ] **Step 1: Document runnable commands**

README must include `dotnet run --project src/ProxyAgent.Api`, `/health`, both chat routes, provider prefixes, sync JSON, SSE, tool-call client loop, error codes, and the warning that the unauthenticated gateway must not be exposed publicly.

- [ ] **Step 2: Run full verification**

Run:

```powershell
dotnet format ProxyAgent.slnx --verify-no-changes
dotnet build ProxyAgent.slnx --no-restore
dotnet test ProxyAgent.slnx --no-build --no-restore
git diff --check
```

Expected: every command exits 0, formatter reports no changes, build succeeds and tests report zero failures.

- [ ] **Step 3: Inspect and commit documentation**

```powershell
git status --short
git add README.md src/ProxyAgent.Api/appsettings.json src/ProxyAgent.Api/Properties/launchSettings.json
git commit -m "docs: document unified chat gateway"
```

- [ ] **Step 4: Perform final requirement audit**

Check .NET 10 target, both adapters, both endpoints, JSON/SSE modes, tool mapping without server execution, appsettings configuration, stable errors, health, no-key tests, and README commands. Report any gap instead of claiming completion.
