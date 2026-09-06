# Opus Review Adjustments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Sửa các rủi ro còn đúng trong nhận xét Opus mà không lặp lại những phần codebase đã xử lý.

**Architecture:** Giữ nguyên contract `ChatStreamEvent` và luồng tool-calling hiện tại. Chỉ thay đổi WebSearchAgent để phát text ra sớm khi stream không chứa tool call; phần parser giữ một cửa sổ nhỏ để không làm lộ marker XML giả. Các nhận xét về settings lock, lỗi upstream detail và tìm kiếm Tavily được ghi nhận là đã có implementation hiện tại, không sửa lại.

**Tech Stack:** ASP.NET Core .NET 10, C# async iterators, xUnit.

## Global Constraints

- Không thay đổi API response contract.
- Không hiển thị `<thinking>` hoặc marker tool call ra client.
- Không chạy lại các thay đổi đã có trong `BackendSettingsService`, `ProviderErrorDetails` hoặc `SearchToolCallsAsync`.

---

### Task 1: Regression tests for early streaming

**Files:**
- Modify: `tests/ProxyAgent.Api.Tests/WebSearch/WebSearchAgentTests.cs`
- Modify: `src/ProxyAgent.Api/WebSearch/WebSearchAgent.cs`

**Interfaces:**
- Preserve `WebSearchAgent.StreamAsync(NormalizedChatRequest, CancellationToken)` and `ChatStreamEvent`.

- [x] **Step 1: Add a test proving plain text is yielded before upstream completion**

  Feed a fake provider a text delta, pause it with a gate, and assert the consumer receives the text delta before the provider emits `IsDone`.

- [x] **Step 2: Run the focused test and confirm it fails**

  Run `dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj --filter FullyQualifiedName~WebSearchAgentTests`.

- [x] **Step 3: Implement a bounded look-ahead stream**

  Keep only enough trailing text to recognize `<tool_call` markers. Yield safe preceding text immediately. If a tool call is detected, suppress the marker and continue the existing tool execution loop.

- [x] **Step 4: Run focused tests and the full backend test suite**

  Run the focused filter, then `dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj`.

- [x] **Step 5: Commit the verified change**

  Commit with `fix: preserve ttft during web tool streaming`.

### Task 2: Delivery verification

**Files:**
- No source files.

- [x] **Step 1: Run `git diff --check` and inspect status**
- [x] **Step 2: Push `master` to `origin`**
- [x] **Step 3: Verify the GitHub Vercel status and production `/api/health`**
