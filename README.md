# Proxy Agent

Gateway HTTP trên .NET 10 để gọi OpenAI và Anthropic qua một contract thống nhất. Ứng dụng hỗ trợ:

- `POST /api/chat`: contract riêng, response normalized.
- `POST /v1/chat/completions`: contract tương thích OpenAI Chat Completions.
- Response JSON đầy đủ hoặc streaming Server-Sent Events (SSE).
- Model routing bằng prefix `openai:` hoặc `anthropic:`.
- Server-side web search agent qua Tavily, tự tìm nguồn và đưa context cho model tổng hợp.
- Vision input từ Angular: dán/chọn ảnh JPG, PNG, WEBP hoặc GIF tối đa 5 MB; gateway map sang format của provider.
- Client-side tool/function calling vẫn được hỗ trợ cho tool riêng của client.
- `GET /health`: kiểm tra process mà không gọi provider.
- `POST/GET/PUT /api/conversations`: lưu và mở conversation bằng ID ổn định để chia sẻ.
- `POST /api/conversations/{id}/publish`: công khai conversation để người không đăng nhập xem được.
- `/admin`: trang quản trị có đăng nhập, cấu hình provider và Tavily server-side.
- Angular chat UI trong `web/`, chạy local ở `http://localhost:4200` và deploy static lên Vercel.

Tài liệu chi tiết:

- [Kiến trúc](docs/ARCHITECTURE.md)
- [Hướng dẫn chạy và sử dụng](docs/GETTING_STARTED.md)

> `anthropic:` gọi Anthropic Messages API. Ứng dụng chưa chạy executable Claude Code CLI.

## Yêu cầu

- .NET SDK 10.
- API key của OpenAI và/hoặc Anthropic nếu muốn gọi provider thật.

## Cấu hình

`src/ProxyAgent.Api/appsettings.json` chứa base URL, model mặc định và giá trị API key rỗng. Để chạy local, có thể điền key vào `appsettings.Development.json` (file này đã được gitignore) hoặc đăng nhập `/admin` sau khi bootstrap tài khoản admin:

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

Để mở giao diện Angular, giữ API đang chạy ở terminal thứ nhất rồi chạy terminal thứ hai:

```powershell
cd web
npm install
npm start
```

Mở `http://localhost:4200`. Khi chạy local, Angular dev-server proxy `/health`, `/api` và `/v1` sang `http://localhost:5030`; trình duyệt không cần biết API key.

## Deploy frontend lên Vercel

Tạo Vercel Project từ repository này và để **Root Directory** ở thư mục gốc (để trống hoặc `.`). Cấu hình build mặc định trong `vercel.json`:

- Build command: `npm run build`
- Output directory: `web/dist/web/browser`
- Chọn framework **Services** trong Vercel Project Settings.
- Provider credentials và CORS origin cấu hình trong Environment Variables của backend service.

Frontend dùng mặc định same-origin `/api`; Vercel route `/api/*` trực tiếp tới backend .NET container trong cùng project. Cả frontend và backend đều được build từ Dockerfile dành cho Vercel; backend đọc credential từ Environment Variables server-side.

Nếu Project đã đặt Root Directory là `web`, giữ thiết lập đó cũng được: dùng build command `npm run build`, output `dist/web/browser` và cấu hình trong `web/vercel.json`. Không đặt Root Directory là `src` hoặc một thư mục không chứa `package.json`.

Với Vercel, để trống `NG_APP_API_BASE_URL`; frontend dùng same-origin `/api`. Tab Customize dùng để đổi backend, API key và custom model routes khi cần; backend mặc định đã quản lý cấu hình provider server-side.

Website production hiện tại là `https://ai-assistant-01.vercel.app`. Nếu GitHub đang hiển thị một preview alias trong trường **Website**, sửa trường đó trong phần About của repository thành URL production này; đây chỉ là metadata của GitHub, không ảnh hưởng deployment.

Backend production cần allowlist domain Vercel bằng biến môi trường:

```text
Cors__AllowedOrigins__0=https://<your-project>.vercel.app
```

Nếu dùng custom domain, thêm origin đó ở index tiếp theo (`Cors__AllowedOrigins__1`). Không dùng `*` khi frontend gọi API production.

### Admin và link conversation

Tài khoản admin được tạo một lần khi database chưa có tài khoản. Cấu hình bootstrap bằng biến môi trường của backend, không commit mật khẩu:

```text
Admin__InitialUsername=admin
Admin__InitialPassword=<mat-khau-it-nhat-8-ky-tu>
Storage__Provider=postgres
ConnectionStrings__Postgres=Host=db.uwfeuedubwoggcmrblzx.supabase.co;Port=5432;Database=postgres;Username=postgres;Password=<mat-khau-postgres>;SSL Mode=Require;Trust Server Certificate=true
```

Sau khi backend khởi động, mở `https://<frontend>/admin`, đăng nhập rồi nhập Base URL, API key, model mặc định và cấu hình Tavily. API key chỉ được lưu ở backend và trang admin chỉ trả về trạng thái đã có key cùng phần che; có thể đổi mật khẩu ngay trong trang này. Các thay đổi có hiệu lực cho request mới. PostgreSQL được chọn tự động khi có `ConnectionStrings__Postgres`; production đã đặt provider là `postgres` để không quay lại SQLite.

Mỗi tab conversation được cấp ID opaque ngay khi tạo và URL đổi ngay sang `/conversation/<id>`. Token sở hữu được lưu trên thiết bị để đồng bộ riêng tư; GET không có token chỉ đọc được conversation đã public. Nút chia sẻ chỉ cập nhật bản ghi hiện tại rồi gọi `publish`, không tạo snapshot và không nhúng nội dung vào URL. PostgreSQL lưu conversation, tài khoản admin và backend settings dùng chung giữa các instance Vercel; SQLite vẫn được giữ cho local/test khi không cấu hình PostgreSQL.

## Web search agent qua Tavily

Backend có built-in tool `web_search`. Khi `WebSearch:Enabled=true` và có Tavily API key, agent sẽ tìm kiếm các câu hỏi có tín hiệu như “mới nhất”, “tìm trên Internet”, “nguồn”, “kèm link”, “latest” hoặc “current”, sau đó gửi kết quả nguồn vào model để tổng hợp bằng Markdown link.

Backend cũng hỗ trợ system prompt dùng chung qua `Chat:SystemPrompt`. Prompt được thêm ở gateway trước lịch sử hội thoại để định hướng ngôn ngữ, độ chi tiết và cách xử lý khi thiếu dữ kiện; nó không vượt qua các giới hạn an toàn của model/provider.

Để cấu hình local mà không ghi key vào source (hoặc dùng trang `/admin` để lưu override server-side):

```powershell
dotnet user-secrets set "WebSearch:ApiKey" "<tavily-api-key>" --project src/ProxyAgent.Api/ProxyAgent.Api.csproj
```

Các biến production cần có:

```text
WebSearch__Enabled=true
WebSearch__ApiKey=<tavily-api-key>
WebSearch__UseToolCalling=false
WebSearch__SearchDepth=basic
WebSearch__MaxResults=5
```

`UseToolCalling=false` là cấu hình tương thích với OpenAI-compatible endpoint hiện tại của project: backend search trước rồi gửi context bằng message thường. Với upstream hỗ trợ OpenAI/Anthropic tool calling đầy đủ, có thể đặt `true` để model tự gọi `web_search` và backend chạy vòng lặp tool.

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

Tool riêng của client vẫn được gateway chuyển tiếp: client gửi tool definition, nhận `tool_calls`, tự thực thi, rồi gửi lại kết quả trong message `role: "tool"`. Riêng `web_search` là built-in server-side tool và không cần client tự thực thi.

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
| 502 | `web_search_failed` | Tavily không khả dụng hoặc trả response không hợp lệ |
| 503 | `provider_not_configured` | Provider chưa có base URL/API key |

Gateway MVP chưa có authentication cho client và rate limiting. Không expose trực tiếp ra Internet nếu chưa bổ sung các lớp bảo vệ này.

## Kiểm thử

```powershell
dotnet test ProxyAgent.slnx
```

Test suite dùng fake HTTP handler/fake provider nên không tạo request tính phí và không cần API key thật.
