# Hướng dẫn chạy và sử dụng

## 1. Yêu cầu

- Windows, Linux hoặc macOS.
- .NET SDK 10.
- API key OpenAI và/hoặc Anthropic nếu muốn gọi provider thật.

Kiểm tra SDK:

```powershell
dotnet --version
```

## 2. Cấu hình provider

File mẫu là [src/ProxyAgent.Api/appsettings.json](../src/ProxyAgent.Api/appsettings.json). Không điền secret thật vào file này nếu file được commit.

Tạo file `src/ProxyAgent.Api/appsettings.Development.json`:

```json
{
  "Providers": {
    "OpenAI": {
      "ApiKey": "sk-..."
    },
    "Anthropic": {
      "ApiKey": "sk-ant-..."
    }
  }
}
```

File Development đã được gitignore. Chỉ cần cấu hình provider muốn dùng; provider còn lại sẽ trả `503 provider_not_configured`.

Các giá trị cấu hình:

| Key | Ý nghĩa |
|---|---|
| `Routing:DefaultProvider` | `openai` hoặc `anthropic` khi model không có prefix |
| `Providers:OpenAI:BaseUrl` | API root OpenAI-compatible |
| `Providers:OpenAI:ApiKey` | API key OpenAI-compatible |
| `Providers:OpenAI:DefaultModel` | Model OpenAI mặc định |
| `Providers:Anthropic:BaseUrl` | API root Anthropic-compatible |
| `Providers:Anthropic:ApiKey` | API key Anthropic |
| `Providers:Anthropic:ApiVersion` | Header `anthropic-version` |
| `Providers:Anthropic:DefaultModel` | Model Anthropic mặc định |
| `Http:TimeoutSeconds` | Timeout outbound HTTP, mặc định 120 giây |

## 3. Chạy ứng dụng

Từ thư mục root project:

```powershell
dotnet run --project src/ProxyAgent.Api --launch-profile http
```

Profile HTTP hiện chạy tại `http://localhost:5030`.

Kiểm tra process:

```powershell
curl.exe http://localhost:5030/health
```

Kết quả:

```json
{"status":"ok"}
```

## 4. Gọi contract riêng `/api/chat`

### Request JSON đầy đủ

```json
{
  "model": "openai:gpt-4o-mini",
  "messages": [
    {
      "role": "system",
      "content": "Bạn là trợ lý ngắn gọn."
    },
    {
      "role": "user",
      "content": "Xin chào"
    }
  ],
  "stream": false,
  "temperature": 0.2,
  "maxTokens": 512,
  "tools": [],
  "toolChoice": "auto"
}
```

PowerShell:

```powershell
curl.exe http://localhost:5030/api/chat `
  -H "Content-Type: application/json" `
  -d '{"model":"openai:gpt-4o-mini","messages":[{"role":"user","content":"Xin chào"}]}'
```

### Response JSON

```json
{
  "id": "chat-123",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "message": {
    "role": "assistant",
    "content": "Xin chào!",
    "toolCalls": []
  },
  "finishReason": "stop",
  "usage": {
    "inputTokens": 10,
    "outputTokens": 8
  }
}
```

Đổi sang Anthropic chỉ bằng model prefix:

```powershell
curl.exe http://localhost:5030/api/chat `
  -H "Content-Type: application/json" `
  -d '{"model":"anthropic:claude-sonnet-4-5","messages":[{"role":"user","content":"Tóm tắt HTTP trong một câu"}]}'
```

## 5. Gọi OpenAI-compatible `/v1/chat/completions`

Input dùng field name theo chuẩn OpenAI:

```powershell
curl.exe http://localhost:5030/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{"model":"anthropic:claude-sonnet-4-5","messages":[{"role":"user","content":"Hello"}]}'
```

Response có các field chính:

```json
{
  "id": "msg-123",
  "object": "chat.completion",
  "created": 1750000000,
  "model": "claude-sonnet-4-5",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello!",
        "tool_calls": null
      },
      "finish_reason": "stop"
    }
  ]
}
```

## 6. Streaming SSE

Thêm `stream: true`:

```powershell
curl.exe -N http://localhost:5030/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{"model":"openai:gpt-4o-mini","stream":true,"messages":[{"role":"user","content":"Viết một câu ngắn"}]}'
```

OpenAI-compatible route trả:

```text
data: {"id":"chat-123","object":"chat.completion.chunk",...}

data: [DONE]
```

Contract riêng trả event normalized:

```text
data: {"type":"delta","provider":"openai","model":"gpt-4o-mini","delta":"...","done":false}

data: {"type":"done","provider":"openai","model":"gpt-4o-mini","done":true}
```

## 7. Tool/function calling

Gateway chỉ chuyển tiếp tool call. Client phải tự thực thi function.

Request OpenAI-compatible:

```json
{
  "model": "anthropic:claude-sonnet-4-5",
  "messages": [
    { "role": "user", "content": "Thời tiết Hà Nội thế nào?" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get weather for a city",
        "parameters": {
          "type": "object",
          "properties": {
            "city": { "type": "string" }
          },
          "required": ["city"]
        }
      }
    }
  ]
}
```

Nếu model trả tool call, client chạy function rồi gửi request tiếp theo:

```json
{
  "model": "anthropic:claude-sonnet-4-5",
  "messages": [
    { "role": "user", "content": "Thời tiết Hà Nội thế nào?" },
    {
      "role": "assistant",
      "tool_calls": [
        {
          "id": "call-1",
          "type": "function",
          "function": {
            "name": "get_weather",
            "arguments": "{\"city\":\"Hanoi\"}"
          }
        }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call-1",
      "content": "22 degrees Celsius"
    }
  ]
}
```

## 8. Chạy test

```powershell
dotnet test ProxyAgent.slnx
```

Test dùng fake provider và fake HTTP handler, không cần API key thật.

## 9. Xử lý lỗi

| Status | Code | Nguyên nhân |
|---:|---|---|
| 400 | `invalid_request` | JSON, message hoặc role không hợp lệ |
| 400 | `unsupported_provider` | Model prefix không hỗ trợ |
| 502 | `provider_authentication_failed` | Upstream từ chối key |
| 502 | `provider_request_failed` | Upstream từ chối payload |
| 502 | `provider_unavailable` | Timeout, network hoặc upstream 5xx |
| 503 | `provider_not_configured` | Thiếu BaseUrl/API key hoặc provider registration |

## 10. Lưu ý bảo mật

- Không commit API key thật.
- MVP chưa có authentication cho client.
- MVP chưa có rate limiting.
- Không expose gateway trực tiếp ra Internet nếu chưa bổ sung các lớp bảo vệ cần thiết.
