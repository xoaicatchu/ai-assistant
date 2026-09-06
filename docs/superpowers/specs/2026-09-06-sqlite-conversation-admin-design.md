# SQLite conversation links and admin settings design

## Goal

Replace the client-side `#share=...` conversation snapshot with a server-backed
conversation URL and add a protected admin page for backend configuration.

The first storage implementation is SQLite for fast local and single-instance
deployment. Storage access is hidden behind interfaces so the public API and
Angular UI do not need to change when the implementation moves to Postgres.

## Decisions

- Conversation links use `/conversation/{id}` and contain only an opaque,
  cryptographically random ID. Conversation content never goes into the URL.
- Shared conversations are stored and loaded by the backend. A conversation
  created from the chat UI is synchronized after completed user requests, so the
  same link continues to identify that conversation rather than a frozen copy.
- SQLite is the initial adapter. Its file location is configurable with
  `Storage:SqlitePath`, with a safe local default.
- Admin authentication uses a username/password and an HttpOnly cookie. The
  initial account is bootstrapped once from `Admin:InitialUsername` and
  `Admin:InitialPassword`; only a password hash is stored in SQLite.
- Admin settings are server-side overrides. Environment/appsettings values are
  the fallback defaults, and the admin UI can update provider settings without
  exposing existing secrets to the browser.
- API keys are accepted over HTTPS, stored only by the backend, and returned to
  the admin UI only as masked metadata. Empty key fields preserve the existing
  value; an explicit clear action removes a key.
- Public conversation links are intentionally readable by anyone who has the
  unguessable URL. They do not expose provider credentials or attached image
  data.

## Architecture

### Backend ports

Add three application ports:

- `IConversationStore`: create, read, and update sanitized conversation records.
- `IAdminAccountStore`: bootstrap, verify credentials, and change the admin
  password.
- `IBackendSettingsStore`: read effective provider/search settings and persist
  admin overrides.

The SQLite implementations own schema creation and parameterized SQL. Endpoint
handlers depend only on the ports. A future Postgres implementation can replace
the registrations in `Program.cs` while retaining DTOs, routes, and frontend
behavior.

### SQLite schema

Use one database with these tables:

- `conversations(id TEXT PRIMARY KEY, title TEXT NOT NULL, messages_json TEXT
  NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`
- `admin_accounts(id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT
  NULL)`
- `backend_settings(id INTEGER PRIMARY KEY CHECK (id = 1), settings_json TEXT
  NOT NULL, updated_at TEXT NOT NULL)`

Conversation IDs are random 128-bit values encoded as base64url. Conversation
payloads are bounded and sanitized: text/status metadata is retained, embedded
image data and other non-text provider payloads are discarded before storage.

### API routes

Public routes:

- `POST /api/conversations` creates a conversation and returns `{ id, url }`.
- `GET /api/conversations/{id}` loads a conversation by opaque ID.
- `PUT /api/conversations/{id}` updates the title/messages for the same ID.

Admin routes, all except login protected by the admin cookie:

- `POST /api/admin/login` verifies credentials and sets the session cookie.
- `POST /api/admin/logout` clears the cookie.
- `GET /api/admin/session` reports whether the browser is authenticated.
- `GET /api/admin/settings` returns effective values with secret fields masked.
- `PUT /api/admin/settings` writes validated settings and secret changes.
- `PUT /api/admin/password` changes the current admin password.

Use same-origin cookies in production. Set `Secure` when the request is HTTPS,
`HttpOnly`, `SameSite=Lax`, a narrow `/api/admin` path, and a bounded session
lifetime. Invalid credentials and missing admin configuration return generic
errors without revealing whether a username exists.

### Runtime settings

Providers and web search must read effective settings per request (or through a
small cache invalidated by admin updates), rather than capturing immutable
`IOptions` values at process startup. Effective settings resolve in this order:

1. non-empty admin override from SQLite;
2. environment/appsettings configuration.

The admin form covers the current server-side values for OpenAI-compatible,
Anthropic-compatible, and Tavily connections, including base URL, API key,
default model/API version where applicable, enabled/search mode, and timeouts.
The existing frontend custom-backend setup remains separate: it configures the
browser's gateway target and is not a place for provider secrets.

### Angular routing and share flow

- Detect `/conversation/{id}` on initial load, fetch the record, and activate it
  alongside existing local conversations.
- Remove the old base64/hash snapshot parser and any URL replacement that writes
  conversation content into the address bar.
- The Share action first creates the server record if the active local
  conversation has no share ID, then copies the `/conversation/{id}` URL.
- Persist the share ID with the local conversation. After a completed send or
  retry, synchronize the latest sanitized messages with `PUT`; debounce stream
  deltas so one request is not sent for every token.
- Opening a shared URL never auto-scrolls the conversation. The user keeps the
  current viewport and can scroll manually.
- Add `/admin` and `/admin/login` views. The admin view loads masked values,
  supports explicit secret replacement/clearing, saves settings, and offers
  logout/password change. It never places stored provider keys in localStorage.

## Security and operational boundaries

- Do not return raw provider keys from any endpoint or put them in a share
  payload, URL, browser storage, log, or exception message.
- Validate absolute HTTPS URLs in production and reject oversized payloads.
- Use constant-time password verification through a PBKDF2 hash format with a
  per-user salt and a server-side work factor.
- Public share IDs are bearer capabilities; document that anyone with the link
  can read the conversation.
- SQLite on Vercel container storage is not durable across all instance
  replacements/redeploys and is not safe for multi-instance concurrency. Keep
  the adapter replaceable and document Postgres as the production migration.

## Verification plan

Backend tests will cover schema initialization, create/read/update round trips,
conversation sanitization, ID entropy/format, admin bootstrap and password
verification, cookie-protected routes, masked settings responses, override
precedence, and validation/error cases.

Frontend tests will cover path-based share URL parsing, create/update calls,
shared conversation hydration, share ID persistence, removal of the old hash
snapshot behavior, admin login/settings states, and the no-auto-scroll behavior.

The final verification must run backend tests, frontend tests, both production
builds, and a local HTTP smoke test for public conversation and admin routes.

