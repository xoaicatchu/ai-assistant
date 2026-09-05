# Angular Chat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Build a browser-based Angular chat client for checking the real .NET gateway and deploy it as a Vercel static app with a separately hosted .NET backend.

**Architecture:** A standalone Angular app lives in \`web/\` and runs on port 4200. Its \`ChatService\` sends OpenAI-compatible requests to the relative \`/v1/chat/completions\` path; the Angular dev-server proxy forwards that path to the .NET API at port 5030. Production builds generate a public runtime config from \`NG_APP_API_BASE_URL\` for Vercel, while the .NET backend exposes CORS and a Docker image. The UI supports both JSON and SSE responses and never receives provider credentials.

**Tech Stack:** Angular 21 standalone components, TypeScript, native \`fetch\`, CSS, Vitest via Angular CLI, .NET 10 existing API.

## Global Constraints

- The provider API key remains only in the ignored .NET \`appsettings.Development.json\`.
- The frontend must use the existing \`/v1/chat/completions\` contract.
- Streaming must use \`AbortController\` and parse OpenAI-compatible SSE chunks.
- The development frontend runs at \`http://localhost:4200\` and proxies to \`http://localhost:5030\`.
- Vercel uses Root Directory \`web\`, output directory \`dist/web/browser\`, and build variable \`NG_APP_API_BASE_URL\`.
- Production backend CORS uses exact origins from \`Cors__AllowedOrigins__0\` and never uses wildcard \`*\`.
- The backend Docker image listens on port 8080.
- Do not modify Git history or create a commit.

### Task 1: Scaffold Angular application

**Files:**
- Create: \`web/package.json\`, \`web/angular.json\`, \`web/tsconfig.json\`, \`web/tsconfig.app.json\`, \`web/tsconfig.spec.json\`
- Create: \`web/src/index.html\`, \`web/src/main.ts\`, \`web/src/styles.css\`
- Create: \`web/src/app/app.config.ts\`, \`web/src/app/app.component.ts\`, \`web/src/app/app.component.html\`, \`web/src/app/app.component.css\`
- Create: \`web/proxy.conf.json\`
- Create: \`web/vercel.json\`, \`web/.env.example\`, \`web/scripts/generate-app-config.mjs\`

- [ ] **Step 1: Generate an Angular standalone app without an unnecessary routing layer**

Run from the repository root:

\`\`\`powershell
npx @angular/cli@21 new web --directory web --standalone --routing=false --style=css --skip-git --skip-tests --ssr=false --package-manager=npm
\`\`\`

Expected: Angular source and workspace files exist under \`web/\`, with no nested \`web/web\` directory and no repository-level Git changes.

- [ ] **Step 2: Add development proxy configuration**

Create \`web/proxy.conf.json\`:

\`\`\`json
{
  "/v1": {
    "target": "http://localhost:5030",
    "secure": false,
    "changeOrigin": true,
    "logLevel": "info"
  },
  "/api": {
    "target": "http://localhost:5030",
    "secure": false,
    "changeOrigin": true,
    "logLevel": "info"
  }
}
\`\`\`

Update the \`serve.options\` section in \`web/angular.json\` to include \`proxyConfig: "proxy.conf.json"\`, and set the \`start\` script to \`ng serve --host localhost --port 4200\`.

- [ ] **Step 3: Install and verify the scaffold**

Run:

\`\`\`powershell
cd web
npm install
npm run build
\`\`\`

Expected: the Angular production build exits with code 0.

### Task 2: Implement the chat transport

**Files:**
- Create: \`web/src/app/chat.service.ts\`
- Create: \`web/src/app/chat.service.spec.ts\`

**Interfaces:**
- \`ChatMessage\`: \`{ role: 'user' | 'assistant'; content: string }\`
- \`ChatRequest\`: \`{ model: string; messages: ChatMessage[]; stream: boolean }\`
- \`ChatService.complete(model: string, messages: ChatMessage[], signal: AbortSignal): Promise<string>\`
- \`ChatService.stream(model: string, messages: ChatMessage[], signal: AbortSignal, onDelta: (text: string) => void): Promise<void>\`

- [ ] **Step 1: Write failing tests for request and SSE behavior**

Cover these behaviors with the Angular test runner: \`complete()\` posts JSON with \`stream: false\` and returns \`choices[0].message.content\`; \`stream()\` parses multiple \`data:\` events plus \`[DONE]\`; a non-2xx response uses the server error message; abort errors propagate for the component to handle.

- [ ] **Step 2: Run the focused tests and verify they fail for the missing service**

Run:

\`\`\`powershell
cd web
npx ng test --watch=false --browsers=ChromeHeadless
\`\`\`

Expected: the focused service tests fail because \`ChatService\` does not yet exist.

- [ ] **Step 3: Implement the minimal fetch-based service**

Use \`fetch('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages, stream: false }), signal })\` for JSON. For streaming, call the same path with \`stream: true\`, read \`response.body.getReader()\`, decode with \`TextDecoder\`, retain partial lines between reads, parse only \`data:\` lines, invoke \`onDelta\` for non-empty content, and return on \`[DONE]\`. Throw an \`Error\` containing the API error message on non-OK responses.

- [ ] **Step 4: Run focused tests and then the full Angular test suite**

Run:

\`\`\`powershell
npx ng test --watch=false --browsers=ChromeHeadless
\`\`\`

Expected: all Angular tests pass with zero failures.

### Task 3: Implement the chat screen

**Files:**
- Modify: \`web/src/app/app.component.ts\`
- Modify: \`web/src/app/app.component.html\`
- Modify: \`web/src/app/app.component.css\`
- Modify: \`web/src/styles.css\`
- Create: \`web/src/app/app.component.spec.ts\`

**Interfaces:**
- Component state: \`messages\`, \`model\`, \`draft\`, \`streaming\`, \`busy\`, \`error\`, \`healthState\`.
- Component actions: \`send()\`, \`stop()\`, \`clear()\`, \`checkHealth()\`.

- [ ] **Step 1: Write failing component tests**

Test that an empty draft is ignored, send appends a user message and assistant response, Stop aborts the active request, and the rendered screen contains the model field, message list, composer, Send, Stop, and Clear controls.

- [ ] **Step 2: Run component tests to confirm the expected failures**

Run:

\`\`\`powershell
npx ng test --watch=false --browsers=ChromeHeadless
\`\`\`

Expected: component tests fail until the state and template are implemented.

- [ ] **Step 3: Implement the component state and actions**

Use an \`AbortController\` per request. \`send()\` trims the draft, appends the user message, creates an empty assistant message, and calls either \`complete()\` or \`stream()\`. \`stop()\` aborts the controller and resets \`busy\`. Handle intentional abort without an error banner; retain other failures in \`error\`. \`checkHealth()\` calls \`/health\` and shows connected/unavailable state.

- [ ] **Step 4: Implement the browser UI and responsive styling**

Render a dark full-height layout with header/status, model control, assistant welcome state, message bubbles, token-safe plain text content, textarea composer, streaming checkbox, send/stop/clear controls, error banner, loading indicator, and a small footer describing the two-process startup. Use responsive CSS so the composer and controls remain usable below 700px.

- [ ] **Step 5: Run the Angular tests and build**

Run:

\`\`\`powershell
npx ng test --watch=false --browsers=ChromeHeadless
npm run build
\`\`\`

Expected: tests and production build both exit with code 0.

### Task 4: Document startup and run end-to-end verification

**Files:**
- Modify: \`README.md\`
- Modify: \`docs/GETTING_STARTED.md\`

- [ ] **Step 1: Document the two-process startup**

Add commands for starting the .NET API in one terminal and \`npm install\`/\`npm start\` in \`web/\` in another, plus \`http://localhost:4200\`, model prefix usage, streaming toggle, Vercel Root Directory/build/output settings, the \`NG_APP_API_BASE_URL\` variable, backend CORS variables, and the fact that credentials stay in the backend.

- [ ] **Step 2: Verify production configuration paths**

Run a production-mode backend with \`Cors__AllowedOrigins__0=https://demo.vercel.app\` and verify an OPTIONS request returns \`Access-Control-Allow-Origin: https://demo.vercel.app\`. Run the Angular build with \`VERCEL=1 NG_APP_API_BASE_URL=https://api.example.com\` and verify the generated \`dist/web/browser/app-config.js\` contains only that URL.

- [ ] **Step 3: Run existing .NET tests**

Run:

\`\`\`powershell
dotnet test ProxyAgent.slnx --no-restore
\`\`\`

Expected: 19 tests pass, 0 fail.

- [ ] **Step 4: Run the real browser smoke test**

Start the API and Angular dev server, load \`http://localhost:4200\`, submit a minimal prompt such as \`Trả lời đúng một từ: OK\`, and verify an assistant message appears. Also verify the stream toggle displays incremental response text.

- [ ] **Step 5: Inspect the final workspace**

Run:

\`\`\`powershell
git diff --check
git status --short --branch
\`\`\`

Expected: no whitespace errors; only intended frontend/docs files are changed; no provider key is present in tracked files.
