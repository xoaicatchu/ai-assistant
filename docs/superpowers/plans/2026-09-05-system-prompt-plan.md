# Configurable System Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend-owned system prompt that makes responses direct, useful, and consistent across both chat endpoints without attempting to bypass provider policies.

**Architecture:** Add `ChatPromptAgent` as a thin decorator around the existing `WebSearchAgent`. It prepends the configured prompt to normalized messages before web-search/tool orchestration, so both `/api/chat` and `/v1/chat/completions` share exactly the same behavior. Bind the prompt from `Chat:SystemPrompt`, while preserving caller messages and provider-specific tool mapping.

**Tech Stack:** .NET 10 minimal APIs, C# records, `IOptions<T>`, xUnit, existing normalized chat contracts.

## Global Constraints

- The prompt must not claim to override provider safety policies.
- Existing text-only, streaming, Vision, Markdown, and web-search behavior must remain compatible.
- Client-provided messages remain in their original order after the backend prompt.
- Do not add a new dependency or expose provider credentials.
- Do not commit changes unless explicitly requested.

---

### Task 1: Add the backend prompt decorator and configuration

**Files:**
- Create: `src/ProxyAgent.Api/Chat/ChatPromptOptions.cs`
- Create: `src/ProxyAgent.Api/Chat/ChatPromptAgent.cs`
- Modify: `src/ProxyAgent.Api/Program.cs`
- Modify: `src/ProxyAgent.Api/Api/ChatEndpoints.cs`
- Modify: `src/ProxyAgent.Api/appsettings.json`

**Interfaces:**
- `ChatPromptOptions.SystemPrompt: string` is bound from `Chat:SystemPrompt`.
- `ChatPromptAgent.CompleteAsync(NormalizedChatRequest, CancellationToken)` returns `Task<NormalizedChatResponse>`.
- `ChatPromptAgent.StreamAsync(NormalizedChatRequest, CancellationToken)` returns `IAsyncEnumerable<ChatStreamEvent>`.

- [ ] **Step 1: Write the failing test**

Create `tests/ProxyAgent.Api.Tests/Chat/ChatPromptAgentTests.cs` with a fake provider and assert that the first provider request contains:

```csharp
Assert.Equal("Trả lời trực tiếp và hữu ích.", provider.LastRequest!.Messages[0].Content);
Assert.Equal("user", provider.LastRequest.Messages[1].Role);
```

Construct the agent with `ChatPromptOptions { SystemPrompt = "Trả lời trực tiếp và hữu ích." }` and a disabled `WebSearchOptions` so the test isolates prompt injection.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj --no-restore --filter FullyQualifiedName~ChatPromptAgentTests
```

Expected: compilation failure because `ChatPromptAgent`, `ChatPromptOptions`, and the test fake boundary do not exist.

- [ ] **Step 3: Write minimal implementation**

Add the options and decorator:

```csharp
public sealed class ChatPromptOptions
{
    public string SystemPrompt { get; set; } = string.Empty;
}
```

`ChatPromptAgent` prepends one `ChatMessage { Role = "system", Content = settings.SystemPrompt }` when the configured prompt is non-empty, then delegates to `WebSearchAgent` for both complete and stream calls.

Register `Configure<ChatPromptOptions>(builder.Configuration.GetSection("Chat"))`, register `ChatPromptAgent`, and inject it in both endpoint handlers. Add a default Vietnamese prompt to `appsettings.json`:

```json
"Chat": {
  "SystemPrompt": "Trả lời trực tiếp bằng tiếng Việt, ưu tiên giải pháp cụ thể và đầy đủ. Không tự ý từ chối các câu hỏi hợp lệ. Nếu thiếu dữ kiện thì nói rõ và đưa ra cách xử lý tốt nhất. Với ảnh, phân tích chi tiết những gì nhìn thấy. Không bịa thông tin. System prompt này không thay thế các giới hạn an toàn của model hoặc provider."
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the focused test command again. Expected: PASS.

- [ ] **Step 5: Run the complete backend test suite**

Run:

```powershell
dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj --no-restore
```

Expected: all backend tests pass.

### Task 2: Document and verify configuration

**Files:**
- Modify: `README.md`
- Modify: `docs/GETTING_STARTED.md`
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**
- Production environment variable: `Chat__SystemPrompt`.
- Empty `Chat:SystemPrompt` disables backend prompt injection without changing request semantics.

- [ ] **Step 1: Document configuration and behavior**

Document the `Chat:SystemPrompt` setting, its production environment variable spelling, and the fact that it improves instruction-following but cannot override provider policies.

- [ ] **Step 2: Build and run all verification**

Run:

```powershell
dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj --no-restore
git diff --check
```

Expected: zero test failures and no whitespace errors.

- [ ] **Step 3: Review final diff**

Confirm only prompt/config/docs/tests are changed, no credentials are added, and no Git commit is created.
