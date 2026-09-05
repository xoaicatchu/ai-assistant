# Frontend API Key Setup Design

## Goal

Allow the Angular frontend to connect directly to an OpenAI-compatible backend
that requires the standard OpenAI bearer credential, without requiring the
backend in this repository to run.

## Selected behavior

- Add an API key field to the existing Setup tab.
- Treat the value as a browser-local setting and persist it in the existing
  setup `localStorage` record.
- Render the field as a password input with an option to reveal it only while
  editing.
- Send `Authorization: Bearer <key>` on frontend requests to the configured
  gateway, including health checks and chat completions.
- Keep the key out of generated build config, URL query strings, logs, and
  error messages.
- Preserve the current behavior when the key is empty, so backends that do not
  require browser credentials continue to work.

## Data flow

Setup input -> normalized setup storage -> runtime chat service ->
`Authorization` header on requests.

The frontend will not transform, validate, or call the provider directly; it
will only attach the configured bearer value to requests sent to the selected
gateway base URL.

## Alternatives considered

1. Keep credentials only on the backend. This is safest, but does not satisfy
   a backend that expects the browser to authenticate.
2. Add a configurable header name. This supports more services but expands the
   UI and scope beyond the requested OpenAI contract.
3. Add an OpenAI-standard API key field and bearer header. This is the selected
   minimal implementation.

## Testing

- Setup storage tests cover API key persistence and safe defaults.
- Chat service tests cover adding the bearer header when a key exists and
  omitting it when the key is empty.
- Run the frontend test suite and production build after implementation.

## Security note

The user explicitly requested browser-side storage. Any key saved here is
readable by the page and browser developer tools; this is not suitable for a
shared or untrusted frontend deployment.
