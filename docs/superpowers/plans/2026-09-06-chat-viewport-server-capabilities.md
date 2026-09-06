# Chat Viewport, Server Status, and Model Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chat behave like a viewport app with fixed chrome, inline request errors, server-scoped models, and explicit model capabilities.

**Architecture:** Keep the existing Angular component and introduce small pure helpers where state decisions need isolated tests. The shell becomes a fixed-height flex column; only the conversation element scrolls. Server/model metadata stays in frontend runtime state and is resolved whenever the selected server changes.

**Tech Stack:** Angular standalone component, TypeScript, CSS flexbox/`100dvh`, Vitest.

## Global Constraints

- Do not render model reasoning or tool protocol text as assistant content.
- Do not reintroduce page scrolling for the chat route.
- Unknown model capabilities are disabled by default.
- Do not expose API keys or backend credentials in UI output.
- Preserve desktop composer usability and iPhone safe-area behavior.

---

### Task 1: Lock the expected state behavior with tests

**Files:**
- Modify: `web/src/app/app.spec.ts`
- Test: `web/src/app/app.spec.ts`

**Interfaces:**
- Test the existing `App` state methods and the new pure model/server capability helpers before implementation.

- [ ] **Step 1: Add failing tests** for: selected-server model isolation; fallback to the selected server default; unknown capabilities disabling vision; request failure stored on the assistant message; and the chat shell exposing a single scroll region through the template contract.
- [ ] **Step 2: Run the focused frontend tests** with `npm test -- --run web/src/app/app.spec.ts` from `web` and confirm the new assertions fail for missing behavior.
- [ ] **Step 3: Commit the failing tests** with `git add web/src/app/app.spec.ts && git commit -m "test: define chat viewport and server capability behavior"`.

### Task 2: Implement server-scoped model capabilities

**Files:**
- Modify: `web/src/app/app.ts`
- Modify: `web/src/app/app.html`
- Modify: `web/src/app/app.css`
- Create or modify: `web/src/app/model-capabilities.ts`

**Interfaces:**
- `ModelCapability` includes `vision`, `thinking`, `toolCall`, and `streaming` booleans.
- `modelsForServer(serverId: string, registry: readonly ModelCapability[]): readonly ModelCapability[]` returns only models for that server.
- `resolveModelForServer(serverId: string, selectedModel: string, registry: readonly ModelCapability[]): ModelCapability | null` returns a valid selected/default model.

- [ ] **Step 1: Implement the smallest registry/helper needed to make Task 1 pass.** Unknown capability fields resolve to false.
- [ ] **Step 2: Update server switching and model change handling** so the selected server recomputes `modelOptions()` and selects that server’s default when necessary.
- [ ] **Step 3: Bind feature controls** so image upload, thinking, tool calls, and streaming controls use the selected model capability rather than a global mixed list.
- [ ] **Step 4: Run focused tests** and confirm they pass.
- [ ] **Step 5: Commit** with `git add web/src/app && git commit -m "feat: scope models and controls to server capabilities"`.

### Task 3: Make viewport chrome fixed and errors inline

**Files:**
- Modify: `web/src/app/app.html`
- Modify: `web/src/app/app.css`
- Modify: `web/src/styles.css`
- Modify: `web/src/app/app.ts`

**Interfaces:**
- The chat route uses `.app-shell`/`.chat-card` as a `100dvh` flex column with hidden outer overflow.
- `.conversation` is the sole vertical scroll container; header, tabs, and composer are siblings outside it.
- Failed requests update the corresponding assistant message with `status: 'error'` and keep replay available.

- [ ] **Step 1: Add the layout classes and remove the global request-error placement** while keeping errors attached to the assistant message.
- [ ] **Step 2: Ensure send/replay/edit paths do not call page-level scrolling or refocus the iPhone textarea.**
- [ ] **Step 3: Run frontend tests and the Angular build.**
- [ ] **Step 4: Commit** with `git add web/src/app/app.html web/src/app/app.css web/src/styles.css web/src/app/app.ts && git commit -m "fix: keep chat chrome fixed and render errors inline"`.

### Task 4: Verify and deploy

**Files:**
- Modify: only files required by verification fixes.

- [ ] **Step 1: Run the full frontend test suite and production build.**
- [ ] **Step 2: Run backend tests to confirm no regression.**
- [ ] **Step 3: Run `git diff --check` and inspect `git status`.**
- [ ] **Step 4: Push `master` to `origin`.**
- [ ] **Step 5: Verify the Vercel deployment is Ready and smoke-test `/api/health` plus the frontend route.**
