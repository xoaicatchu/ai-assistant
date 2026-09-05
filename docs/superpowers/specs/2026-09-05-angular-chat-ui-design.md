# Angular Chat UI Design

## Goal

Add a small Angular standalone web client so a developer can verify the real .NET gateway and configured provider from a browser, without manually writing curl commands.

## Scope

- Create an Angular app under \`web/\`.
- Run it with \`npm start\` on \`http://localhost:4200\`.
- Proxy \`/api\` and \`/v1\` requests to the existing API at \`http://localhost:5030\` during development.
- Build static assets for Vercel with \`NG_APP_API_BASE_URL\` pointing to the separately deployed .NET API.
- Configure the .NET API with an exact CORS allowlist for the Vercel origin and a container-ready production entrypoint.
- Send OpenAI-compatible chat requests to \`/v1/chat/completions\`.
- Support normal JSON responses and incremental SSE responses.
- Keep provider credentials exclusively in the .NET backend configuration; the browser sends no API key.

## User experience

The page has a dark, focused chat layout: a header showing gateway status, a model input defaulting to \`openai:deepseek/deepseek-v4-flash\`, a scrollable message timeline, a composer, and a streaming toggle. The user can send with the button or Ctrl/Cmd+Enter, stop an active request, clear the conversation, and see provider/network errors inline. User and assistant messages are visually distinct; an assistant message is created before streaming starts so chunks appear immediately.

## Architecture and data flow

\`AppComponent\` owns the view state and uses \`ChatService\` for HTTP/SSE transport. \`ChatService\` exposes \`complete()\` for JSON and \`stream()\` for SSE. For streaming, it reads the response body with \`ReadableStream\`, splits UTF-8 text into SSE events, parses \`data: {...}\` chunks, appends \`choices[0].delta.content\`, and stops on \`data: [DONE]\`. \`AbortController\` cancels the fetch when the user clicks Stop.

The Angular dev-server proxy forwards \`/v1/*\` to the .NET API, avoiding browser CORS configuration in development. For Vercel, a build script writes the public backend URL into a generated static config file. The backend then applies the configured upstream endpoint and bearer key, and allows only configured frontend origins.

## Error handling

- Non-2xx JSON responses are converted to a readable error message from \`error.message\` when available.
- Network and abort errors are surfaced separately; an intentional Stop does not show a failure.
- Empty prompts are rejected in the UI.
- While a request is active, the composer and model field are disabled and Stop is enabled.

## Testing and verification

- Angular unit tests cover SSE parsing, request payload shape, non-2xx error extraction, and the main send/stop state transitions where practical.
- \`npm run build\` must complete successfully.
- \`dotnet test ProxyAgent.slnx --no-restore\` must remain green.
- A browser smoke test must load the page, send a short prompt through the configured gateway, and display an assistant response.
