# Medical Harness UI

Angular 21 standalone chat UI for the .NET 10 Proxy Agent gateway.
The frontend is deployed independently from the backend.

## Local development

Start the backend from the repository root:

```powershell
dotnet run --project src/ProxyAgent.Api --launch-profile http
```

In a second terminal:

```powershell
npm install
npm start
```

Open <http://localhost:4200>. The development proxy forwards `/health`, `/api`, and `/v1` to <http://localhost:5030>.

The composer accepts text or an image pasted from the clipboard. Supported image types are JPG, PNG, WEBP, and GIF up to 5 MB. The composer sends with Enter and inserts a new line with Shift+Enter. Use the SSE switch beside the attachment control to choose streaming or a complete response; after sending, the composer releases focus so the iPhone keyboard can close. The image is sent as an OpenAI-compatible `image_url` content part, and the .NET gateway maps it to the selected provider's Vision format.

The UI uses Tailwind CSS v4 through the Angular PostCSS integration and `@lucide/angular` for the enterprise icon set. The Chat composer keeps a compact model combobox; Customize manages an optional custom backend URL, API key, and model routes. While a request is running, Send is replaced by Stop.

## Vercel deployment

Set the Vercel project Root Directory to the repository root. Configure the
Production environment variable `NG_APP_BACKEND_URL` to the public backend
origin, for example `https://proxy-agent-api.vercel.app`.

The backend can use Redis for conversations, admin credentials, and persisted settings. Set
`REDIS_URL` to a `redis://` or `rediss://` connection string in the backend deployment environment;
the value is read only on the server and is never bundled into the frontend.

Provider-internal reasoning and legacy search markup are filtered incrementally before assistant text is rendered, copied, or shared.

The frontend calls the backend directly for chat, health, admin, and conversation
APIs. Add the deployed frontend origin to the backend CORS allow-list. The
Customize tab can override the model endpoint independently.

## Commands

```powershell
npm test
npm run build
```
