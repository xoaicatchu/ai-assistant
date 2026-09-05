# Chat Retry, Persistent Setup, and Vercel Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe retry/concurrent-send behavior, persist Gateway Base URL and custom models in Setup, and make the Angular deployment work on Vercel with an SSE-capable proxy to the .NET gateway.

**Architecture:** Keep the .NET 10 service as the provider gateway and add a small Vercel Node function under `web/api/[...path].ts` for same-origin forwarding. The Angular app owns browser-local chat/setup state; request generations and `AbortController` ensure an old stream can never mutate a newer request. Setup stores only gateway URL, model routes, and selected model; provider credentials remain server-side.

**Tech Stack:** .NET 10 minimal API, Angular 21 standalone components, TypeScript, Vitest, native Fetch/SSE, Vercel Node functions, Tailwind CSS v4, `@lucide/angular`.

## Global Constraints

- Keep the four built-in model routes: `gpt/gpt-5.6-sol-high-fast`, `deepseek/deepseek-v4-flash`, `x-ai/grok-4.5`, and `x-ai/grok-4.6`.
- Setup custom models are route strings only; no provider API key or provider credential is stored in `localStorage`.
- A new Enter while busy aborts the old request, sends immediately, and includes the existing user/complete-assistant history.
- Old request callbacks must be ignored after abort or supersession.
- Errors after a user message is created render inside its assistant bubble.
- SSE must be forwarded without buffering through the Vercel proxy.
- Do not commit changes; preserve the existing dirty worktree.

---

### Task 1: Model the request lifecycle and retry behavior

**Files:**
- Modify: `web/src/app/app.ts`
- Modify: `web/src/app/app.html`
- Modify: `web/src/app/app.css`
- Create: `web/src/app/conversation-state.ts`
- Test: `web/src/app/conversation-state.spec.ts`

**Interfaces:**
- `ViewMessage` gains `requestId: number` and `status: 'pending' | 'complete' | 'error' | 'stopped'`.
- `conversation-state.ts` exports `buildRequestMessages(messages: ViewMessage[]): ChatMessage[]`, `findAssistantForUser(messages, userId)`, and `formatAssistantError(message)`.
- `App.retryMessage(userMessageId: number): Promise<void>` retries the selected user message without duplicating it.

- [ ] **Step 1: Write failing state tests**

Test that pending/failed assistant messages are excluded from provider history, completed history is retained, retry finds the paired assistant, and an error is formatted as Markdown.

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `npm test -- --run src/app/conversation-state.spec.ts`

Expected: FAIL because the new state helpers do not exist.

- [ ] **Step 3: Implement the pure state helpers**

Use the existing `toChatMessage` shape. Include each user message once; include assistant messages only when `status === 'complete'` and the text is non-empty. Pair messages with `requestId`, not array position.

- [ ] **Step 4: Refactor `App` around request ownership**

Track `activeRequest = { requestId, userMessageId, assistantMessageId, controller }`. When `send()` starts while busy, call `stopActiveRequest('Đã dừng để gửi câu mới.')`, then create the new request. The callback must check both generation and controller identity before mutating signals. `retryMessage()` removes/replaces only the paired failed assistant, reuses the original user content/image, and starts a new request with `buildRequestMessages`.

- [ ] **Step 5: Update the template and styles**

Remove `[disabled]="busy()"` from the message textarea. Render typing only when `message.status === 'pending'` and `message.id === activeRequest?.assistantMessageId`. For user messages whose paired assistant has `error` or `stopped`, render a Lucide refresh button with `aria-label="Gửi lại tin nhắn"`. Keep the button beside the user bubble and use the existing compact mobile layout.

- [ ] **Step 6: Run focused and full frontend tests**

Run: `npm test -- --run src/app/conversation-state.spec.ts` and then `npm test -- --run`.

Expected: the new tests and all existing frontend tests pass.

---

### Task 2: Persist Gateway Base URL and custom model routes

**Files:**
- Create: `web/src/app/setup-storage.ts`
- Modify: `web/src/app/runtime-config.ts`
- Modify: `web/scripts/generate-app-config.mjs`
- Modify: `web/src/app/model-picker.ts`
- Modify: `web/src/app/app.ts`
- Modify: `web/src/app/app.html`
- Modify: `web/src/app/app.css`
- Test: `web/src/app/setup-storage.spec.ts`
- Test: `web/src/app/model-picker.spec.ts`

**Interfaces:**
- `SetupSettings = { gatewayBaseUrl: string; customModels: string[]; selectedModel: string }`.
- `loadSetupSettings(): SetupSettings` safely reads `localStorage` key `medical-harness-agent.setup.v1` and returns defaults for malformed/missing data.
- `saveSetupSettings(settings: SetupSettings): void` normalizes URLs/routes and catches storage failures.
- `setRuntimeApiBaseUrl(value: string): void` updates the runtime API target used by `apiUrl()`.
- `allModelOptions(customModels: string[]): ModelOption[]` returns the four built-ins followed by unique custom routes.

- [ ] **Step 1: Write failing storage and model option tests**

Cover default settings, malformed JSON, duplicate/blank custom routes, URL trailing slash normalization, and preserving the four built-in routes.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --run src/app/setup-storage.spec.ts src/app/model-picker.spec.ts`

Expected: FAIL because persistence and custom option merging are not implemented.

- [ ] **Step 3: Implement storage and runtime override**

Use `localStorage` only in browser-safe guarded code. Keep generated `NG_APP_API_BASE_URL` as the deployment default. A saved Gateway Base URL overrides it for the current browser; an empty saved value restores the generated default. Never store or display provider credentials.

- [ ] **Step 4: Add Setup controls and save flow**

Add a Gateway Base URL input, a multiline custom-model route editor, Save Setup, and Reset Setup actions. Save updates the runtime API URL, selected model, and combobox options immediately; reload must restore them before the first health check. The Setup screen must label this as `Gateway Base URL`, not provider Base URL.

- [ ] **Step 5: Use merged options in the compact composer combobox**

Keep the combobox next to Send/Stop, display only the route/model name, and preserve the modern pill styling. Custom routes appear after the four built-ins.

- [ ] **Step 6: Run frontend tests and build**

Run: `npm test -- --run` and `npm run build`.

Expected: all tests pass and Angular production build completes successfully.

---

### Task 3: Add a Vercel same-origin SSE proxy

**Files:**
- Create: `web/api/[...path].ts`
- Create: `web/api/proxy-handler.ts`
- Modify: `web/vercel.json`
- Modify: `web/src/app/runtime-config.ts`
- Modify: `web/scripts/generate-app-config.mjs`
- Create: `web/api/proxy-handler.spec.ts`
- Modify: `web/.env.example`
- Modify: `web/README.md`
- Modify: `README.md`
- Modify: `docs/GETTING_STARTED.md`
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**
- `proxy-handler.ts` exports `buildBackendUrl(baseUrl, path, query)` and `proxyRequest(req, res, backendUrl)`.
- `web/api/[...path].ts` reads `PROXY_AGENT_BACKEND_URL`, forwards request method/body/headers, copies upstream status/content headers, and streams `upstream.body` chunks directly to the Vercel response.
- `generate-app-config.mjs` emits `/api` as the Vercel default when `NG_APP_API_BASE_URL` is empty; local development continues to emit the relative `/health` and `/v1` paths.

- [ ] **Step 1: Write failing proxy tests**

Test backend URL/path/query joining, rejection of missing backend configuration, forwarding of request body and content type, and pass-through of `text/event-stream` chunks.

- [ ] **Step 2: Run the focused proxy test and verify failure**

Run: `npm test -- --run api/proxy-handler.spec.ts`

Expected: FAIL because the handler module does not exist.

- [ ] **Step 3: Implement the proxy**

Use the Vercel Node runtime, disable automatic body parsing, forward only safe request headers, and stream `ReadableStream<Uint8Array>` chunks with `res.write`. Do not log authorization headers or request bodies. Return JSON `503` when `PROXY_AGENT_BACKEND_URL` is absent.

- [ ] **Step 4: Wire Vercel routing and runtime defaults**

Keep `dist/web/browser` as the Angular output. Route `/api/*` to the function and leave SPA fallback for non-file paths. Add `PROXY_AGENT_BACKEND_URL` and optional `NG_APP_API_BASE_URL` documentation. The default Vercel path is same-origin `/api`; an explicit external URL still works for users who deploy the .NET gateway elsewhere.

- [ ] **Step 5: Run proxy tests and production build**

Run: `npm test -- --run api/proxy-handler.spec.ts` and `npm run build`.

Expected: proxy tests pass and the Angular build still completes.

---

### Task 4: End-to-end verification and deployment documentation

**Files:**
- Modify: `web/README.md`
- Modify: `README.md`
- Modify: `docs/GETTING_STARTED.md`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Run the complete verification suite**

Run from repository root: `dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj --no-restore`.

Run from `web`: `npm test -- --run` and `npm run build`.

- [ ] **Step 2: Verify the running gateway**

Start the .NET gateway on `http://localhost:5030`, call `curl.exe -sS http://localhost:5030/health`, and verify `{"status":"ok"}`. Send one streaming request and confirm multiple `data:` deltas followed by `[DONE]`.

- [ ] **Step 3: Verify browser behavior**

On `http://localhost:4200`: type while a request runs, press Enter, confirm the old request stops and the new request includes history; force a failure and confirm the assistant bubble contains the error; reload after saving Setup and confirm Gateway Base URL/custom models/selected model return; verify the compact combobox and retry button at mobile width.

- [ ] **Step 4: Perform a production Vercel build check**

Run `npm run build` with `VERCEL=1` and no external `NG_APP_API_BASE_URL`; verify generated `app-config.js` selects `/api` and the output contains the Angular browser bundle. Document the required Vercel variable `PROXY_AGENT_BACKEND_URL=https://<public-dotnet-backend>`.

- [ ] **Step 5: Review the diff without committing**

Run: `git diff --check` and `git status --short`.

Confirm no credential files, generated secrets, or commits are added.
