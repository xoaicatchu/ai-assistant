# Unified Chat API Design

## Goal

Xây dựng một ứng dụng ASP.NET Core trên .NET 10 làm gateway hội thoại thống nhất cho OpenAI và Anthropic. Client có thể dùng contract riêng của gateway hoặc contract tương thích OpenAI, chọn provider bằng prefix trong tên model, nhận phản hồi đầy đủ hoặc streaming SSE, và truyền tool definitions để provider trả tool calls về cho client.

## Scope

### In scope

- Một HTTP API chạy độc lập bằng ASP.NET Core Minimal API.
- Endpoint tương thích OpenAI: `POST /v1/chat/completions`.
- Endpoint riêng: `POST /api/chat`.
- Chọn provider bằng model prefix:
  - `openai:<model-name>` hoặc model mặc định được cấu hình.
  - `anthropic:<model-name>` hoặc model mặc định được cấu hình.
- Hai chế độ trả lời:
  - JSON hoàn chỉnh khi `stream` không được bật.
  - Server-Sent Events khi `stream: true`.
- Tool/function calling proxy-only: gateway chuyển đổi tool definitions và tool-call results giữa contract OpenAI và Anthropic; gateway không tự thực thi tool.
- Cấu hình base URL, API key, model mặc định và timeout bằng `appsettings.json`.
- Test tự động cho routing, request mapping, response mapping, SSE và lỗi provider.
- README có hướng dẫn chạy, cấu hình và curl examples.

### Out of scope for MVP

- Frontend/chat UI.
- Database, lưu conversation hoặc user session.
- Authentication/authorization cho client của gateway.
- Retry tự động, rate limiting và circuit breaker.
- Server-side tool registry/execution.
- Claude Code CLI/process runner. Anthropic provider trong MVP gọi Messages API, không gọi executable `claude`.
- Responses API, multimodal content, audio, image generation và embeddings.

## Architecture

Luồng xử lý chung:

```text
HTTP request
    -> request contract validation
    -> normalize model/provider
    -> ChatOrchestrator
    -> IChatProvider (OpenAIProvider | AnthropicProvider)
    -> provider HTTP API
    -> normalized ChatResponse/ChatStreamEvent
    -> endpoint serializer
```

Các boundary chính:

- `ChatRequest`/`ChatResponse`: contract nội bộ và contract riêng của gateway.
- `OpenAiChatRequest`/`OpenAiChatResponse`: DTO tương thích endpoint OpenAI.
- `IChatProvider`: provider nhận một normalized request, trả về normalized response hoặc async stream.
- `ChatOrchestrator`: resolve provider, áp dụng model mặc định/prefix, và giữ endpoint không biết chi tiết provider.
- `ProviderPayloadMapper`: mỗi provider tự map normalized message/tool model sang wire format của provider.
- `SseWriter`: ghi normalized stream events thành SSE; endpoint OpenAI emit chunk shape tương thích OpenAI, endpoint riêng emit event shape của gateway.

Mỗi provider dùng typed `HttpClient` từ `IHttpClientFactory`, không đưa API key vào log. Provider không được phụ thuộc vào endpoint layer.

## API contracts

### Gateway endpoint

`POST /api/chat`

```json
{
  "model": "anthropic:claude-sonnet-4-5",
  "messages": [
    { "role": "system", "content": "You are concise." },
    { "role": "user", "content": "Hello" }
  ],
  "stream": false,
  "temperature": 0.2,
  "maxTokens": 512,
  "tools": [
    {
      "name": "get_weather",
      "description": "Get the weather for a city",
      "parameters": {
        "type": "object",
        "properties": { "city": { "type": "string" } },
        "required": ["city"]
      }
    }
  ]
}
```

Non-stream response:

```json
{
  "id": "chat_...",
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "message": {
    "role": "assistant",
    "content": "Hello!",
    "toolCalls": []
  },
  "finishReason": "stop",
  "usage": { "inputTokens": 3, "outputTokens": 4 }
}
```

`toolCalls` contains `{ id, name, argumentsJson }`. The gateway returns tool calls; it does not invoke them.

### OpenAI-compatible endpoint

`POST /v1/chat/completions` accepts the OpenAI Chat Completions fields used by this MVP: `model`, `messages`, `stream`, `temperature`, `max_tokens`, `tools`, and `tool_choice`. The model can be provider-prefixed, while a non-prefixed model is resolved by configured default provider.

For `stream: false`, response shape is `object: "chat.completion"` with `choices[0].message`, `finish_reason`, and optional `tool_calls`.

For `stream: true`, response is `text/event-stream`, each event is `data: <json>\n\n`, and the stream ends with `data: [DONE]\n\n`. Text deltas and tool-call deltas are normalized to OpenAI chunk fields.

## Provider mapping

### OpenAI

- Request: `POST {BaseUrl}/chat/completions`.
- Header: `Authorization: Bearer {ApiKey}`.
- Forward model without `openai:` prefix.
- Forward messages, temperature, max tokens, tools and tool choice.
- Provider stream is parsed line-by-line and translated to normalized stream events.

### Anthropic

- Request: `POST {BaseUrl}/messages`.
- Headers: `x-api-key: {ApiKey}`, `anthropic-version: {ApiVersion}` and `content-type: application/json`.
- Convert a system message to Anthropic `system`.
- Convert user/assistant messages to Anthropic content blocks.
- Convert OpenAI-style function tools to Anthropic tools with `input_schema`.
- Convert Anthropic `tool_use` blocks to normalized tool calls.
- Convert Anthropic `tool_result` messages back to Anthropic content blocks.
- Set `max_tokens` to configured default when the normalized request does not provide it, because Anthropic requires a maximum output token budget.
- Provider stream is parsed from Anthropic SSE events and translated to normalized text/tool events.

The normalized layer intentionally retains only common text, finish reason, usage and client-side tool-call fields. Provider-specific fields are not fabricated when there is no equivalent.

## Model routing

`ModelSelector` applies this deterministic rule:

1. If model starts with `openai:`, select OpenAI and strip the prefix.
2. If model starts with `anthropic:`, select Anthropic and strip the prefix.
3. Otherwise use `Routing:DefaultProvider` and pass the model unchanged; if the model is empty, use that provider's configured default model.
4. Unknown provider prefix returns HTTP 400 with a stable error code.
5. Missing API key/configuration is reported as HTTP 503; provider HTTP failures preserve status class but never expose secrets.

## Configuration

`appsettings.json` contains non-secret placeholders only:

```json
{
  "Routing": {
    "DefaultProvider": "openai"
  },
  "Providers": {
    "OpenAI": {
      "BaseUrl": "https://api.openai.com/v1",
      "ApiKey": "",
      "DefaultModel": "gpt-4o-mini"
    },
    "Anthropic": {
      "BaseUrl": "https://api.anthropic.com/v1",
      "ApiKey": "",
      "ApiVersion": "2023-06-01",
      "DefaultModel": "claude-sonnet-4-5"
    }
  },
  "Http": {
    "TimeoutSeconds": 120
  }
}
```

The application validates provider settings at startup only when that provider is used, so the gateway can run with one provider configured. `appsettings.Development.json` may contain local values but is not a place for committed real credentials. README explicitly warns users not to commit API keys.

## Error handling

All errors use a stable envelope:

```json
{
  "error": {
    "code": "provider_error",
    "message": "The upstream provider rejected the request.",
    "provider": "openai",
    "requestId": "..."
  }
}
```

- Invalid JSON or validation failure: `400 invalid_request`.
- Unsupported model/provider prefix: `400 unsupported_provider`.
- Missing provider credentials: `503 provider_not_configured`.
- Upstream 401/403: `502 provider_authentication_failed`.
- Other upstream 4xx: `502 provider_request_failed` with sanitized upstream message.
- Upstream 5xx/timeout/network failure: `502 provider_unavailable`.
- Once streaming has started, errors are emitted as an SSE error event and the stream is closed; the server does not attempt to write a second HTTP status.

Cancellation from the client is passed through to the provider request. Upstream response bodies are disposed, and no request/response content containing prompts or API keys is logged by default.

## Testing strategy

- Unit tests for model prefix selection and default model behavior.
- Unit tests for OpenAI request mapping and response/tool-call mapping.
- Unit tests for Anthropic system/message/tool mapping and response/tool-use mapping.
- Stream parser tests using representative OpenAI and Anthropic SSE payloads.
- Endpoint tests using `WebApplicationFactory` and fake provider registrations to verify both endpoint contracts without real API calls.
- Error tests for malformed requests, missing configuration, unknown provider and upstream error mapping.
- One smoke test verifies the app starts and exposes `/health`.

No test requires a real API key. Live provider verification remains an operator-run manual step after configuring credentials.

## Operational notes

- `/health` is local-process health only; it does not make billable provider calls.
- The gateway is unauthenticated in MVP and must not be exposed publicly without adding client authentication and rate limiting.
- The README will show both non-stream and stream curl examples, including a tool definition example and the expected client-side tool-call loop.

## References

- OpenAI Chat Completions API: https://developers.openai.com/api/reference/resources/chat
- Anthropic Messages API and tool use: https://docs.anthropic.com/en/api/messages and https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview
