# Proxy Agent Chat UI

Angular 21 standalone chat UI for the .NET 10 Proxy Agent gateway.

## Local development

Start the backend from the repository root:

```powershell
dotnet run --project src/ProxyAgent.Api --launch-profile http
```

In a second terminal:

```powershell
cd web
npm install
npm start
```

Open <http://localhost:4200>. The development proxy forwards `/health`, `/api`, and `/v1` to <http://localhost:5030>.

The composer accepts text or an image pasted from the clipboard. Supported image types are JPG, PNG, WEBP, and GIF up to 5 MB. Press Enter to send; use Shift+Enter for a new line. The image is sent as an OpenAI-compatible `image_url` content part, and the .NET gateway maps it to the selected provider's Vision format.

The UI uses Tailwind CSS v4 through the Angular PostCSS integration and `@lucide/angular` for the enterprise icon set. The Chat composer keeps a compact model combobox; Setup manages the gateway URL and optional custom model routes. While a request is running, Send is replaced by Stop.

## Vercel deployment

Set the Vercel project Root Directory to `web`. The checked-in `vercel.json` uses:

- Build command: `npm run build`
- Output directory: `dist/web/browser`
- SPA fallback to `index.html`

Create this Vercel environment variable for the Production environment:

```text
PROXY_AGENT_BACKEND_URL=https://<public-backend-url>
```

The Vercel function in `api/[...path].ts` proxies `/api/*` to this backend and streams the response back to the browser. The Angular build defaults to same-origin `/api`, so the backend URL is not exposed in the browser bundle. Provider credentials remain on the .NET server.

If you intentionally deploy the frontend and backend with public CORS enabled, you can instead set `NG_APP_API_BASE_URL` to the backend URL. The Setup tab can override the URL and custom model routes for the current browser; those values are persisted in local storage.

## Commands

```powershell
npm test
npm run build
```
