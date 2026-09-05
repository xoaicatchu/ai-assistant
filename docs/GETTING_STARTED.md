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
| `Chat:SystemPrompt` | System prompt dùng chung được thêm vào trước lịch sử hội thoại |
| `Providers:OpenAI:BaseUrl` | API root OpenAI-compatible |
| `Providers:OpenAI:ApiKey` | API key OpenAI-compatible |
| `Providers:OpenAI:DefaultModel` | Model OpenAI mặc định |
| `Providers:Anthropic:BaseUrl` | API root Anthropic-compatible |
| `Providers:Anthropic:ApiKey` | API key Anthropic |
| `Providers:Anthropic:ApiVersion` | Header `anthropic-version` |
| `Providers:Anthropic:DefaultModel` | Model Anthropic mặc định |
| `Http:TimeoutSeconds` | Timeout outbound HTTP, mặc định 120 giây |
| `WebSearch:Enabled` | Bật built-in web search agent |
| `WebSearch:ApiKey` | Tavily API key, chỉ đặt ở User Secrets hoặc environment |
| `WebSearch:UseToolCalling` | `true` để model tự gọi tool; `false` để backend search trước |
| `WebSearch:SearchDepth` | `basic` hoặc `advanced` |
| `WebSearch:MaxResults` | Số nguồn tối đa mỗi lần search, mặc định 5 |
| `WebSearch:MaxToolCalls` | Ngân sách lượt search trước khi agent ép model tổng hợp, mặc định 2 |
| `WebSearch:TimeoutSeconds` | Timeout gọi Tavily, mặc định 30 giây |
| `Cors:AllowedOrigins` | Danh sách origin frontend được phép gọi API |

## 3. Chạy ứng dụng

Từ thư mục root project:

```powershell
dotnet run --project src/ProxyAgent.Api --launch-profile http
```

Profile HTTP hiện chạy tại `http://localhost:5030`.

## 4. Chạy giao diện Angular local

Giữ backend chạy ở terminal thứ nhất. Ở terminal thứ hai:

```powershell
cd web
npm install
npm start
```

Mở `http://localhost:4200`. Giao diện dùng endpoint `/v1/chat/completions`; proxy Angular chuyển request sang backend `http://localhost:5030`. Model mặc định của UI là `openai:x-ai/grok-4.6`, nhưng có thể sửa trực tiếp trên màn hình.

Trong khung chat có thể dán ảnh trực tiếp từ clipboard hoặc bấm nút kẹp giấy để chọn ảnh. UI hỗ trợ JPG, PNG, WEBP và GIF tối đa 5 MB; Enter gửi tin, Shift+Enter chèn dòng mới. Ảnh được gửi dưới dạng OpenAI-compatible `image_url` content part và backend tự chuyển sang payload Vision tương ứng của OpenAI-compatible provider hoặc Anthropic.

API key không được đưa vào frontend. Backend đọc key từ `appsettings.Development.json` hoặc biến môi trường.

### System prompt

`Chat:SystemPrompt` được `ChatPromptAgent` thêm vào request trước khi chuyển sang web-search agent và provider. Có thể ghi đè khi chạy production bằng biến môi trường:

```text
Chat__SystemPrompt=Trả lời trực tiếp bằng tiếng Việt và nêu rõ giả định khi thiếu dữ kiện.
```

Prompt này định hướng cách trả lời nhưng không thể vô hiệu hóa giới hạn an toàn của model hoặc upstream provider.

### Bật Tavily local

Project đã bật web search trong cấu hình mặc định nhưng không chứa secret. Lưu key vào .NET User Secrets:

```powershell
dotnet user-secrets set "WebSearch:ApiKey" "<tavily-api-key>" --project src/ProxyAgent.Api/ProxyAgent.Api.csproj
```

Development local đang bật `WebSearch:UseToolCalling=true` để Grok có thể tự phát sinh `web_search` tool call; backend sẽ gọi Tavily, trả tool result vào lịch sử rồi gọi model lần nữa để tổng hợp. Nếu dùng model/upstream không hỗ trợ tools, đặt lại `false` để dùng pre-search fallback.

## 5. Deploy backend và frontend

Vercel phù hợp để serve Angular static app. Backend .NET 10 chạy ở service/container riêng; Dockerfile ở root repo đã expose cổng `8080`.

### Backend container

Deploy repo bằng Docker trên host hỗ trợ container. Cấu hình các biến môi trường production, không ghi secret vào Git:

```text
ASPNETCORE_ENVIRONMENT=Production
Providers__OpenAI__BaseUrl=https://aishop24h.com/v1
Providers__OpenAI__ApiKey=<secret>
Providers__OpenAI__DefaultModel=deepseek/deepseek-v4-flash
WebSearch__Enabled=true
WebSearch__ApiKey=<tavily-secret>
WebSearch__UseToolCalling=false
Cors__AllowedOrigins__0=https://<your-project>.vercel.app
```

Nếu dùng custom domain Vercel, thêm origin đó ở `Cors__AllowedOrigins__1`. Sau khi deploy, kiểm tra `https://<public-backend-url>/health` trả `{"status":"ok"}`.

### Frontend Vercel

Khi import repo vào Vercel:

1. Để **Root Directory** ở thư mục gốc của repository (để trống hoặc `.`).
2. Dùng build command `npm run build` và output directory `web/dist/web/browser`.
3. Tạo server environment variable `PROXY_AGENT_BACKEND_URL=https://<public-backend-url>` cho Production rồi redeploy.

`api/index.ts` nhận rewrite `/api/*` và proxy cả request lẫn SSE tới backend. Build Vercel luôn dùng same-origin `/api`, kể cả khi `NG_APP_API_BASE_URL` cũ còn tồn tại, nên URL backend không bị nhúng vào bundle. Nếu muốn giữ Root Directory=`web`, dùng output `dist/web/browser` và function `web/api/index.ts`. Deployment không phải Vercel mới dùng `NG_APP_API_BASE_URL` để gọi backend trực tiếp và cần cấu hình CORS tương ứng.

## 6. Kiểm tra process:

```powershell
curl.exe http://localhost:5030/health
```

Kết quả:

```json
{"status":"ok"}
```

## 7. Gọi contract riêng `/api/chat`

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

## 8. Gọi OpenAI-compatible `/v1/chat/completions`

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

## 9. Streaming SSE

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

## 10. Tool/function calling

Gateway chuyển tiếp tool call của client. Built-in `web_search` được backend thực thi khi đã cấu hình Tavily; client không cần tự gọi Tavily.

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

## 11. Chạy test

```powershell
dotnet test ProxyAgent.slnx
```

Test dùng fake provider và fake HTTP handler, không cần API key thật.

## 12. Xử lý lỗi

| Status | Code | Nguyên nhân |
|---:|---|---|
| 400 | `invalid_request` | JSON, message hoặc role không hợp lệ |
| 400 | `unsupported_provider` | Model prefix không hỗ trợ |
| 502 | `provider_authentication_failed` | Upstream từ chối key |
| 502 | `provider_request_failed` | Upstream từ chối payload |
| 502 | `provider_unavailable` | Timeout, network hoặc upstream 5xx |
| 502 | `web_search_failed` | Tavily không khả dụng hoặc trả response không hợp lệ |
| 503 | `provider_not_configured` | Thiếu BaseUrl/API key hoặc provider registration |

## 10. Lưu ý bảo mật

- Không commit API key thật.
- MVP chưa có authentication cho client.
- MVP chưa có rate limiting.
- Không expose gateway trực tiếp ra Internet nếu chưa bổ sung các lớp bảo vệ cần thiết.
