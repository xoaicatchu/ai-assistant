# Proxy Agent Chat UI

Angular 21 standalone chat UI for the .NET 10 Proxy Agent gateway.

## Local development

Start the backend from the repository root:

```powershell
dotnet run --project src/ProxyAgent.Presentation --launch-profile http
```

In a second terminal:

```powershell
cd web
npm install
npm start
```

Open <http://localhost:4200>. The development proxy forwards `/health`, `/api`, and `/v1` to <http://localhost:5030>.

The composer accepts text or an image pasted from the clipboard. Supported image types are JPG, PNG, WEBP, and GIF up to 5 MB. The composer sends with Enter and inserts a new line with Shift+Enter. Use the SSE switch beside the attachment control to choose streaming or a complete response; after sending, the composer releases focus so the iPhone keyboard can close. The image is sent as an OpenAI-compatible `image_url` content part, and the .NET gateway maps it to the selected provider's Vision format.

The UI uses Tailwind CSS v4 through the Angular PostCSS integration and `@lucide/angular` for the enterprise icon set. The Chat composer keeps a compact model combobox; Customize manages an optional custom backend URL, API key, and model routes. While a request is running, Send is replaced by Stop.

## Vercel deployment

Recommended: set the Vercel project Root Directory to the repository root (leave it blank or use `.`). The root `vercel.json` uses:

- Build command: `npm run build`
- Output directory: `web/dist/web/browser`
- SPA fallback to `index.html`

Create this Vercel environment variable for the Production environment:

```text
PROXY_AGENT_BACKEND_URL=https://<public-backend-url>
```

The backend can use Redis for conversations, admin credentials, and persisted settings. Set
`REDIS_URL` to a `redis://` or `rediss://` connection string in the backend deployment environment;
the value is read only on the server and is never bundled into the frontend.

Provider-internal reasoning and legacy search markup are filtered incrementally before assistant text is rendered, copied, or shared.

Vercel routes `/api/*` to the .NET backend container service, which streams the response back to the browser. The Angular build defaults to same-origin `/api`; provider credentials are configured on the backend service. SQLite falls back to a temporary file if the configured path cannot be opened, so this does not make Vercel storage durable.

For Vercel, leave `NG_APP_API_BASE_URL` unset; the build uses same-origin `/api`. The Customize tab can override the backend URL, API key, and custom model routes; those values are persisted in local storage. Open `/admin` to log in and manage server-side provider/Tavily settings. Each non-empty conversation receives a server ID before its first model request. Share links use `/conversation/<id>` and load the conversation from the backend instead of embedding a snapshot in the URL; sharing only reveals that URL to other people.

You can also set Root Directory to `web`; in that mode use `dist/web/browser` as the output directory and the `web/vercel.json` configuration.

## Commands

```powershell
npm test
npm run build
```
