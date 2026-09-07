# Clean Architecture Refactor Design

**Date:** 2026-09-07  
**Scope:** Refactor toàn bộ backend .NET và frontend Angular; giữ nguyên hành vi sản phẩm, API contract và đường deploy Vercel.

## Mục tiêu

- Tách rõ Domain, Application, Infrastructure và Presentation.
- Không để domain/use case phụ thuộc ASP.NET, Redis, PostgreSQL, SQLite, Angular hoặc browser API.
- Giữ nguyên các tính năng đang có: chat thường, SSE, tool call/web search, Vision, conversation/share, admin, dark mode, mobile UX, auto-scroll và server/model customize.
- Sau refactor có thể thay Redis bằng PostgreSQL hoặc adapter khác mà không sửa use case và UI.
- Không đổi URL API công khai, payload JSON, SSE event contract hoặc URL conversation.

## Backend architecture

### Cấu trúc project

```text
src/
├── ProxyAgent.Domain/
│   ├── Chat/
│   ├── Conversations/
│   ├── Models/
│   └── Common/
├── ProxyAgent.Application/
│   ├── Chat/
│   ├── Conversations/
│   ├── Admin/
│   ├── WebSearch/
│   └── Abstractions/
├── ProxyAgent.Infrastructure/
│   ├── Providers/
│   ├── Storage/
│   │   ├── Redis/
│   │   ├── PostgreSql/
│   │   └── Sqlite/
│   ├── WebSearch/
│   ├── Settings/
│   └── DependencyInjection.cs
└── ProxyAgent.Api/
    ├── Endpoints/
    ├── Contracts/
    ├── Middleware/
    ├── Composition/
    └── Program.cs
```

### Dependency rule

```text
Presentation → Application → Domain
Infrastructure → Application + Domain
Domain → không phụ thuộc project nào
```

`ProxyAgent.Api` là executable ASP.NET host để Docker/Vercel vẫn có một entrypoint rõ ràng. `ProxyAgent.Api` cũ sẽ được loại bỏ sau khi toàn bộ reference, Dockerfile, solution và test đã chuyển sang host mới.

### Phân loại chức năng

- **Domain:** `ChatMessage`, normalized chat request/response, `ChatToolCall`, conversation document/value objects, model capability, domain errors và các quy tắc thuần C#.
- **Application:** `ChatOrchestrator`, web-search workflow, conversation publish/load/update use cases, admin login/settings/password use cases và các port như `IChatProvider`, `IConversationStore`, `IAdminAccountStore`, `IBackendSettings`.
- **Infrastructure:** OpenAI/Anthropic HTTP clients, Tavily client, SSE reader/writer adapter, Redis/PostgreSQL/SQLite stores, password hash persistence, configuration adapters và DI registrations.
- **Presentation:** Minimal API route mapping, HTTP DTO, cookie authentication, error-to-HTTP mapping, CORS, health endpoints và composition root.

Provider-specific payload DTO không được đưa vào Domain. HTTP request/response DTO không được đưa vào Application.

### Backend compatibility

- Giữ nguyên `/api/*`, `/v1/chat/completions`, `/health`, `/api/health`.
- Giữ nguyên `tool_calls`, SSE và normalized response hiện tại.
- Giữ nguyên storage provider selection qua Redis/PostgreSQL/SQLite.
- Giữ nguyên bootstrap admin và HttpOnly cookie.
- Dockerfile, `Dockerfile.vercel`, `docker-entrypoint.sh`, Vercel rewrite và API proxy sẽ trỏ tới `ProxyAgent.Api`.

## Frontend architecture

Frontend vẫn là một Angular application nhưng chia module theo dependency direction thay vì để toàn bộ behavior trong `App`.

```text
web/src/app/
├── domain/
│   ├── chat/
│   ├── conversation/
│   ├── model/
│   └── shared/
├── application/
│   ├── chat/
│   ├── conversation/
│   ├── customize/
│   └── admin/
├── infrastructure/
│   ├── http/
│   ├── storage/
│   ├── browser/
│   └── config/
├── presentation/
│   ├── chat/
│   ├── customize/
│   ├── admin/
│   ├── shell/
│   └── shared-ui/
└── app.ts
```

- **Frontend domain:** interfaces/types và pure functions cho message, conversation, model capability, server config, scroll state.
- **Frontend application:** orchestration gửi message, stream lifecycle, replay/edit/share, tab management, customize state và admin workflows.
- **Frontend infrastructure:** `fetch`, SSE parsing, browser `sessionStorage` cho UI state, clipboard, voice input, URL/history và runtime config.
- **Frontend presentation:** components/templates/styles, header/footer, composer, message list, customize page, admin page và responsive layout.

`App` sẽ trở thành shell/router composition mỏng. Không di chuyển mù từng file theo tên; những file đang chứa nhiều trách nhiệm sẽ được tách theo use case để tránh tạo các folder đẹp nhưng dependency vẫn rối.

## Migration strategy

1. Tạo project backend mới và project references; tạo frontend layer folders/types.
2. Di chuyển domain contracts trước, giữ compatibility aliases trong thời gian chuyển tiếp nếu cần.
3. Di chuyển application services/use cases và inject các port.
4. Di chuyển infrastructure adapters và gom DI registration vào một composition extension.
5. Di chuyển Presentation endpoints/middleware/Program, cập nhật Docker/Vercel.
6. Tách frontend theo domain/application/infrastructure/presentation, giữ template behavior và public selectors.
7. Xóa namespace/file cũ chỉ sau khi không còn reference.
8. Chạy backend unit/integration tests, frontend tests, build, diff check và smoke test production.

## Kiểm thử bắt buộc

- Backend test project tham chiếu Domain/Application/Infrastructure/Presentation khi cần.
- Domain/Application tests không khởi động web server hoặc kết nối database thật.
- Infrastructure tests giữ fake HTTP và storage tests hiện có.
- Presentation tests giữ smoke tests cho endpoint, cookie auth, SSE và error mapping.
- Frontend giữ toàn bộ test hiện có và bổ sung dependency-boundary checks ở mức TypeScript/import nếu cần.
- Trước mỗi commit chạy test liên quan; trước push chạy toàn bộ backend tests, frontend tests và production build.

## Rủi ro và nguyên tắc không phá luồng

- Không đổi contract trong lúc refactor; mọi thay đổi behavior phải là commit riêng.
- Không đưa secret/API key vào source hoặc test fixture.
- Không biến browser storage thành nơi lưu nội dung conversation.
- Không tạo thêm abstraction nếu không có consumer/port rõ ràng.
- Nếu một bước di chuyển làm fail test hoặc build, dừng ở checkpoint đó và sửa dependency trước khi tiếp tục.

