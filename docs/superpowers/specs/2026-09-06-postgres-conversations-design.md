# PostgreSQL conversations and public sharing design

## Goal

Move server-owned conversation, admin-account, and backend-settings data from per-instance SQLite storage to the supplied Supabase PostgreSQL database, while making every chat tab addressable immediately and making Share explicitly publish a conversation.

## Decisions

- PostgreSQL is selected when `ConnectionStrings__Postgres` or `Storage__PostgresConnectionString` is configured. SQLite remains the default for local development and tests.
- The existing storage interfaces remain the application boundary. SQLite and PostgreSQL implementations share the same contracts, so API and UI code do not depend on a database vendor.
- PostgreSQL startup migration creates the three existing tables and adds `owner_token_hash` and `is_public` to conversations. Passwords and conversation owner tokens are stored only as hashes.
- Creating a conversation returns an opaque 22-character server ID and an owner token. The browser stores the token locally and sends it in `X-Conversation-Token` for private reads, updates, and publishing.
- A private conversation can be read by its owner token; a public conversation can be read without a token. Publishing is an explicit authenticated-by-token operation, not an automatic side effect of generating a URL.
- The browser requests an empty server conversation as soon as a new tab is created, stores its server ID, and replaces the address path with `/conversation/<id>`. Sending the first message no longer creates the identity as a side effect.
- Share publishes the active conversation, then copies/opens the same URL. It does not create a second snapshot or encode messages in the URL.
- Existing local conversations without a server token are re-created on the next sync/share; stale SQLite server IDs are not trusted.

## API contract

- `POST /api/conversations` accepts a title and zero or more messages and returns `{ id, ownerToken }`.
- `GET /api/conversations/{id}` accepts `X-Conversation-Token` optionally and returns only public documents or documents authorized by that token.
- `PUT /api/conversations/{id}` requires `X-Conversation-Token` and updates the existing document.
- `POST /api/conversations/{id}/publish` requires `X-Conversation-Token`, marks the document public, and returns the document.

## Error handling

The API uses 404 for an unknown or unauthorized conversation ID to avoid exposing private IDs. The browser treats a stale owner ID as a re-create condition and surfaces a useful message only when both the re-create and publish operations fail. PostgreSQL initialization failures keep `/health` available but make persistence errors explicit in API responses/logs.

## Verification

- Unit tests cover token authorization, private/public reads, publish, migration idempotency, and both SQLite/PostgreSQL storage contracts.
- Endpoint tests cover empty conversation creation, token headers, publish, and public access without a token.
- Frontend tests cover immediate URL identity, token persistence, stale-ID recovery, and Share publishing without a second snapshot.
- Release backend tests/build and frontend tests/build run before pushing `master`.
