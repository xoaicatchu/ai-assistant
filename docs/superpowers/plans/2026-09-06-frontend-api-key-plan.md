# Frontend API Key Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Angular frontend persist an OpenAI-compatible API key in Setup and send it as `Authorization: Bearer <key>` to the configured backend.

**Architecture:** Extend the existing setup storage record with an optional API key. Pass the loaded key into `ChatService`, which adds the bearer header to health and chat requests while preserving unauthenticated behavior when empty. Add a password-style Setup field and update the existing tests.

**Tech Stack:** Angular 21, TypeScript, Vitest, Tailwind/PostCSS.

## Global Constraints

- The key is browser-local by explicit user request and is readable by browser developer tools.
- Use the OpenAI standard `Authorization: Bearer <key>` header.
- Do not put the key in generated config, URLs, logs, or error messages.
- Preserve empty-key behavior for unauthenticated backends.

---

### Task 1: Persist the API key in setup storage

**Files:**
- Modify: `web/src/app/setup-storage.ts`
- Test: `web/src/app/setup-storage.spec.ts`

- [ ] Add a failing test proving `apiKey` is normalized and persisted.
- [ ] Run the focused storage test and confirm it fails because `apiKey` is absent.
- [ ] Add `apiKey` to setup types, defaults, normalization, and cloning.
- [ ] Run the focused storage tests and confirm they pass.

### Task 2: Add the Setup UI and wire state

**Files:**
- Modify: `web/src/app/app.html`
- Modify: `web/src/app/app.ts`

- [ ] Add a password input labeled `API Key` beside the gateway URL.
- [ ] Load, save, reset, and bind the key through the existing setup state.
- [ ] Keep the input disabled while a request is busy and use `autocomplete="off"`.

### Task 3: Send the OpenAI bearer header

**Files:**
- Modify: `web/src/app/chat.service.ts`
- Modify: `web/src/app/app.ts`

- [ ] Make `ChatService` receive the current setup API key without exposing it in URLs.
- [ ] Add a failing service test for the `Authorization` header and the empty-key case.
- [ ] Run the focused service test and confirm it fails before implementation.
- [ ] Add the header to health and chat fetch requests only when a key is non-empty.
- [ ] Run focused tests and confirm they pass.

### Task 4: Verify the frontend

**Files:**
- No source changes expected.

- [ ] Run `npm test` from `web`.
- [ ] Run `npm run build` from `web`.
- [ ] Confirm the existing dev server reloads successfully and document the Setup usage.
