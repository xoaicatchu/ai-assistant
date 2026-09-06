# PostgreSQL conversations and public sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist all server data in Supabase PostgreSQL, create conversation IDs at tab creation, and make Share publish the conversation without embedding a snapshot in the URL.

**Architecture:** Keep `IConversationStore`, `IAdminAccountStore`, and `IBackendSettingsStore` as the storage boundary. Add a PostgreSQL database initializer and stores selected by configuration, retain SQLite for local development, and protect private conversation mutations with a random owner token whose hash is stored in the database. The Angular app keeps the token in local storage, updates the URL as soon as the server conversation exists, and calls a publish endpoint from Share.

**Tech Stack:** .NET 10 minimal APIs, Npgsql, Microsoft.Data.Sqlite, Supabase PostgreSQL, Angular 21 standalone components, Vitest, xUnit.

## Global Constraints

- Never commit or print the Supabase password.
- `ConnectionStrings__Postgres` is the preferred production secret; `Storage__PostgresConnectionString` is supported as an alternative.
- SQLite remains available when PostgreSQL is not configured.
- Public GETs never return owner tokens.
- Conversation IDs remain opaque 22-character URL-safe values.
- Push the final implementation to `origin/master` and verify production endpoints.

---

### Task 1: Add PostgreSQL configuration and storage initialization

**Files:**
- Modify: `src/ProxyAgent.Api/ProxyAgent.Api.csproj`
- Modify: `src/ProxyAgent.Api/Storage/StorageOptions.cs`
- Create: `src/ProxyAgent.Api/Storage/PostgresDatabase.cs`
- Create: `tests/ProxyAgent.Api.Tests/Storage/PostgresDatabaseTests.cs`

**Interfaces:**
- Produces `IStorageInitializer.Initialize()` and `PostgresDatabase.OpenConnection()`.
- Configuration consumes `ConnectionStrings:Postgres` or `Storage:PostgresConnectionString`.

- [ ] Write failing migration/idempotency tests for a PostgreSQL database fixture that is skipped with a clear message when `TEST_POSTGRES_CONNECTION` is absent.
- [ ] Run the focused test and verify the new contract is not implemented.
- [ ] Add Npgsql and implement migration SQL for `conversations`, `admin_accounts`, and `backend_settings`, including `owner_token_hash` and `is_public`.
- [ ] Run the focused test with a local/injected PostgreSQL connection and verify it passes.

### Task 2: Implement PostgreSQL storage contracts

**Files:**
- Modify: `src/ProxyAgent.Api/Storage/ConversationStorage.cs`
- Modify: `src/ProxyAgent.Api/Storage/AdminStorage.cs`
- Modify: `src/ProxyAgent.Api/Storage/BackendSettingsStorage.cs`
- Create: `src/ProxyAgent.Api/Storage/PostgresStorage.cs`
- Modify: `tests/ProxyAgent.Api.Tests/Storage/SqliteStorageTests.cs`
- Create: `tests/ProxyAgent.Api.Tests/Storage/PostgresStorageTests.cs`

**Interfaces:**
- `ConversationCreated(string Id, string OwnerToken)`.
- `IConversationStore.Create`, `Get`, `Update`, and `Publish` accept the owner token where required.

- [ ] Write failing tests for token hashing, private/public reads, update authorization, and publish.
- [ ] Run focused tests and confirm failure before implementation.
- [ ] Implement shared token generation/hash verification and PostgreSQL stores while preserving SQLite behavior.
- [ ] Run both storage suites and verify all pass.

### Task 3: Select the configured database in startup

**Files:**
- Modify: `src/ProxyAgent.Api/Storage/SqliteDatabase.cs`
- Modify: `src/ProxyAgent.Api/Program.cs`
- Modify: `tests/ProxyAgent.Api.Tests/Api/ConversationEndpointTests.cs`

**Interfaces:**
- Startup resolves one `IStorageInitializer` and one implementation of each storage interface.

- [ ] Add a failing startup/endpoint test proving the selected store is not hard-coded to SQLite.
- [ ] Run it and confirm the current registration fails the test.
- [ ] Register PostgreSQL when the connection string exists, otherwise SQLite; initialize the selected database once.
- [ ] Run the endpoint suite and Release build.

### Task 4: Add conversation authorization and publish API

**Files:**
- Modify: `src/ProxyAgent.Api/Api/ConversationContracts.cs`
- Modify: `src/ProxyAgent.Api/Api/ConversationEndpoints.cs`
- Modify: `tests/ProxyAgent.Api.Tests/Api/ConversationEndpointTests.cs`

**Interfaces:**
- `POST /api/conversations` returns `id` and `ownerToken`.
- `GET` allows public or matching `X-Conversation-Token`.
- `PUT` and `POST /publish` require matching `X-Conversation-Token`.

- [ ] Add failing endpoint tests for empty creation, private rejection, owner access, publish, and public read.
- [ ] Run focused endpoint tests and observe the old API contract fail.
- [ ] Implement the endpoints and header extraction with 404 for unknown/unauthorized IDs.
- [ ] Run all backend tests.

### Task 5: Update Angular conversation identity and Share behavior

**Files:**
- Modify: `web/src/app/conversation-storage.ts`
- Modify: `web/src/app/conversation-link.ts`
- Modify: `web/src/app/chat.service.ts`
- Modify: `web/src/app/app.ts`
- Modify: `web/src/app/app.html`
- Modify: `web/src/app/app.spec.ts`
- Modify: `web/src/app/chat.service.spec.ts`

**Interfaces:**
- Chat service returns `{ id, ownerToken }` from creation and accepts optional conversation tokens.
- App creates an empty server conversation on new-tab creation, updates the URL, and calls `publishConversation` from Share.

- [ ] Add failing Vitest cases for immediate URL update, token header, local owner reload, stale-ID recovery, and publish-only Share.
- [ ] Run frontend focused tests and verify failure.
- [ ] Implement the minimum client state/API changes, preserving local conversation fallback when the backend is unavailable.
- [ ] Run all frontend tests and production build.

### Task 6: Configure deployment and verify

**Files:**
- Modify: `README.md`
- Modify: `docs/GETTING_STARTED.md`

- [ ] Document `Storage__Provider=postgres` and the secret-based connection string without including the supplied password.
- [ ] Run `git diff --check`, backend tests/build, frontend tests/build, and inspect the final diff.
- [ ] Set the Vercel Production connection-string secret through the authenticated deployment channel; never put it in git.
- [ ] Commit the implementation, push `master`, verify the Vercel deployment, `/api/health`, and conversation create/publish/public-read flow.
