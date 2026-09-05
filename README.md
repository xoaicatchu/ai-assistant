# Proxy Agent

Gateway HTTP trên .NET 10 để gọi OpenAI và Anthropic qua một contract thống nhất. Ứng dụng hỗ trợ:

- `POST /api/chat`: contract riêng, response normalized.
- `POST /v1/chat/completions`: contract tương thích OpenAI Chat Completions.
- Response JSON đầy đủ hoặc streaming Server-Sent Events (SSE).
- Model routing bằng prefix `openai:` hoặc `anthropic:`.
- Client-side tool/function calling: gateway chuyển tiếp tool definitions và trả tool calls, không tự chạy tool.
- `GET /health`: kiểm tra process mà không gọi provider.

> Trong scope hiện tại, `anthropic:` gọi Anthropic Messages API. Ứng dụng chưa chạy executable Claude Code CLI.

## Yêu cầu

- .NET SDK 10.
- API key của OpenAI và/hoặc Anthropic nếu muốn gọi provider thật.

## Cấu hình

`src/ProxyAgent.Api/appsettings.json` chứa base URL, model mặc định và giá trị API key rỗng. Để chạy local, điền key vào `appsettings.Development.json` (file này đã được gitignore):

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

Không commit API key thật. Có thể chỉ cấu hình một provider; provider còn lại sẽ trả `503 provider_not_configured` khi được chọn.

## Chạy

Từ thư mục repo:

```powershell
dotnet run --project src/ProxyAgent.Api --launch-profile http
```

Mặc định profile HTTP chạy tại `http://localhost:5030`.

Kiểm tra health:

```powershell
curl.exe http://localhost:5030/health
```

## Gọi bằng contract riêng

```powershell
curl.exe http://localhost:5030/api/chat `
  -H "Content-Type: application/json" `
  -d '{"model":"openai:gpt-4o-mini","messages":[{"role":"user","content":"Xin chào"}]}'
```

Response có dạng:

```json
{
  "id": "chat_...",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "message": {
    "role": "assistant",
    "content": "...",
    "toolCalls": []
  },
  "finishReason": "stop",
  "usage": {
    "inputTokens": 10,
    "outputTokens": 20
  }
}
```

Chọn Anthropic bằng model prefix:

```powershell
curl.exe http://localhost:5030/api/chat `
  -H "Content-Type: application/json" `
  -d '{"model":"anthropic:claude-sonnet-4-5","messages":[{"role":"user","content":"Tóm tắt HTTP trong một câu"}]}'
```

Nếu model không có prefix, gateway dùng `Routing:DefaultProvider`. Nếu model bị bỏ trống, gateway dùng `DefaultModel` của provider đó.

## OpenAI-compatible endpoint

```powershell
curl.exe http://localhost:5030/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{"model":"anthropic:claude-sonnet-4-5","messages":[{"role":"user","content":"Hello"}]}'
```

## Streaming SSE

```powershell
curl.exe -N http://localhost:5030/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{"model":"openai:gpt-4o-mini","stream":true,"messages":[{"role":"user","content":"Viết một câu ngắn"}]}'
```

OpenAI-compatible endpoint trả các event dạng `data: {...}` và kết thúc bằng `data: [DONE]`. Contract riêng `/api/chat` trả event JSON với `type: "delta"` hoặc `type: "done"`.

## Tool/function calling

Gateway không thực thi tool. Client gửi tool definition, nhận `tool_calls`, tự thực thi, rồi gửi lại kết quả trong message `role: "tool"`.

Ví dụ request OpenAI-compatible:

```powershell
curl.exe http://localhost:5030/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{
    "model":"anthropic:claude-sonnet-4-5",
    "messages":[{"role":"user","content":"Thời tiết Hà Nội thế nào?"}],
    "tools":[{
      "type":"function",
      "function":{
        "name":"get_weather",
        "description":"Get weather for a city",
        "parameters":{
          "type":"object",
          "properties":{"city":{"type":"string"}},
          "required":["city"]
        }
      }
    }]
  }'
```

Với Anthropic, gateway đổi schema function thành `input_schema`, đổi assistant tool calls thành `tool_use`, và đổi tool result thành `tool_result` trước khi gọi upstream.

## Error codes

| HTTP | Code | Ý nghĩa |
|---:|---|---|
| 400 | `invalid_request` | Request hoặc role không hợp lệ |
| 400 | `unsupported_provider` | Prefix provider không được hỗ trợ |
| 502 | `provider_authentication_failed` | Provider từ chối credential |
| 502 | `provider_request_failed` | Provider từ chối request |
| 502 | `provider_unavailable` | Timeout, network hoặc upstream 5xx |
| 503 | `provider_not_configured` | Provider chưa có base URL/API key |

Gateway MVP chưa có authentication cho client và rate limiting. Không expose trực tiếp ra Internet nếu chưa bổ sung các lớp bảo vệ này.

## Kiểm thử

```powershell
dotnet test ProxyAgent.slnx
```

Test suite dùng fake HTTP handler/fake provider nên không tạo request tính phí và không cần API key thật.
