# Báo cáo giải trình lỗi đăng nhập Admin trên production

**Ngày lập:** 2026-09-07  
**Phạm vi:** `https://ai-assistant-01.vercel.app/admin` và backend của project `proxy-agent`  
**Loại xử lý:** Điều tra và lập báo cáo; chưa thay đổi logic đăng nhập trong lượt này.

## 1. Kết luận ngắn

Trang Admin không bị lỗi render. Production đang nhận được request và áp dụng đúng lớp bảo vệ admin. Bằng chứng hiện có cho thấy lỗi xảy ra sau khi mở trang, tại bước xác thực tài khoản hoặc đọc tài khoản admin từ storage.

Nguyên nhân có xác suất cao nhất là một trong hai trường hợp sau:

1. Tài khoản admin đang được đọc từ Redis nhưng username/password người dùng nhập không khớp với record đã tồn tại trong Redis.
2. Biến `Admin__InitialUsername` / `Admin__InitialPassword` đã được đổi sau lần bootstrap đầu tiên. Code chỉ tạo tài khoản khi storage chưa có account; đổi biến môi trường sau đó không tự đổi password của account cũ.

Không thể kết luận chỉ từ dòng “Đăng nhập không thành công” rằng password sai, vì frontend đang gom mọi lỗi HTTP thành cùng một thông báo. Lỗi storage 503 hoặc proxy 502 cũng bị hiển thị y hệt.

## 2. Bằng chứng production đã kiểm tra

Các kiểm tra dưới đây không gửi username, password, API key hay connection string:

| Endpoint | Kết quả | Ý nghĩa |
|---|---:|---|
| `GET /api/health` | `200`, `{"status":"ok"}` | Vercel proxy và backend đang phản hồi. |
| `GET /api/admin/session` | `200`, `{"authenticated":false,"username":null}` | Route session và authentication middleware hoạt động; hiện chưa có cookie admin hợp lệ. |
| `GET /api/admin/settings` | `401` | Policy `admin-only` đang chặn đúng request chưa đăng nhập. |

Trong ảnh DevTools người dùng cung cấp trước đó, request `POST /api/admin/login` trả `401 Unauthorized`. Mã này khác với lỗi Redis `503 storage_unavailable`: nó thường có nghĩa là backend đã xử lý request nhưng không tìm thấy account tương ứng hoặc password không khớp. Tuy vậy, do giao diện che mất mã lỗi, cần log/response thực tế của đúng lần thử để khẳng định tuyệt đối.

## 3. Luồng đăng nhập thực tế

### Frontend

- Khi mở `/admin`, frontend gọi `GET /api/admin/session`.
- Khi bấm đăng nhập, frontend gửi JSON `{ username, password }` tới `/api/admin/login` với `credentials: 'include'`.
- Nếu request lỗi, `AdminPage.login()` luôn thay bằng thông báo cố định: `Đăng nhập không thành công. Kiểm tra lại thông tin.`
- Vì vậy frontend hiện không phân biệt được `401`, `502`, `503` hay lỗi response khác.

Tham chiếu: `web/src/app/presentation/admin/admin-page.ts:71-95`, `web/src/app/infrastructure/http/admin.service.ts:99-119`.

### Backend

`POST /api/admin/login` thực hiện theo thứ tự:

1. Gọi `EnsureSeeded()`.
2. Tìm account theo username.
3. Kiểm tra password hash PBKDF2.
4. Nếu không khớp, trả `401` rỗng.
5. Nếu khớp, tạo cookie `__proxy_agent_admin` và trả `200`.

Tham chiếu: `src/ProxyAgent.Api/Api/AdminEndpoints.cs:26-46`, `src/ProxyAgent.Application/Admin/AdminOptions.cs:90-115`.

## 4. Điểm gây nhầm lẫn trong cấu hình storage

Production hiện có `Storage:Provider` được đặt cứng là `redis` trong `appsettings.Production.json`. Khi đó backend đăng ký:

- `RedisConversationStore`
- `RedisAdminAccountStore`
- `RedisBackendSettingsStore`

Tài khoản admin không nằm trong Postgres trong cấu hình này; nó nằm tại key Redis:

`medical-harness:admin-account`

Tham chiếu: `src/ProxyAgent.Api/appsettings.Production.json:1-9`, `src/ProxyAgent.Api/Program.cs:31-66`, `src/ProxyAgent.Infrastructure/Storage/RedisStores.cs:126-177`.

Nếu `REDIS_URL` bị thiếu, sai, hết hạn hoặc backend không kết nối được, thao tác storage sẽ phát sinh `StorageUnavailableException`. Backend đã có mapping lỗi này thành HTTP `503` với code `storage_unavailable`, nhưng frontend hiện lại che mất chi tiết đó.

Tham chiếu: `src/ProxyAgent.Infrastructure/Storage/RedisDatabase.cs:74-95`, `src/ProxyAgent.Api/Api/ErrorHandling.cs:44-60`.

## 5. Vấn đề bootstrap tài khoản admin

`EnsureSeeded()` chỉ tạo account khi:

- storage chưa có account;
- `InitialUsername` có giá trị;
- `InitialPassword` có giá trị và dài từ 8 ký tự.

Nếu Redis đã có account, hàm trả về ngay. Do đó:

- thay `Admin__InitialPassword` trên Vercel không reset password cũ;
- redeploy không làm account Redis đổi theo password mới;
- nếu account cũ được tạo bằng password khác, nhập password mới từ Vercel vẫn nhận `401`;
- nếu account chưa từng được seed do thiếu biến môi trường hoặc storage lỗi, mọi lần đăng nhập cũng nhận `401` sau khi storage hoạt động.

Tham chiếu: `src/ProxyAgent.Application/Admin/AdminOptions.cs:90-102`.

Đây là điểm phù hợp nhất với tình trạng “đã nhập biến môi trường nhưng vẫn không đăng nhập được”.

## 6. Các nguyên nhân đã loại trừ một phần

### Không phải lỗi trang `/admin` không tồn tại

Trang tải được và gọi được API session production.

### Không phải policy admin bị bỏ quên

`/api/admin/settings` trả `401` khi chưa có session, đúng hành vi bảo vệ.

### Không phải frontend quên gửi cookie ở các request admin

Admin service đã dùng `credentials: 'include'`. Vercel proxy cũng forward cookie request và copy `Set-Cookie` từ backend.

Tham chiếu: `web/src/app/infrastructure/http/admin.service.ts:99-104`, `web/api/proxy-handler.ts:95-105`.

Tuy nhiên, cookie round-trip chỉ có thể xác nhận sau khi có một lần login trả `200`; hiện chưa có bằng chứng đó.

## 7. Kiểm thử hiện có

Đã chạy:

```text
dotnet test tests/ProxyAgent.Api.Tests/ProxyAgent.Api.Tests.csproj --filter "FullyQualifiedName~AdminEndpointTests" --no-restore
```

Kết quả:

```text
Passed: 4, Failed: 0, Skipped: 0
```

Các test đã bao phủ login thành công, sai credentials, đổi password và storage unavailable. Giới hạn quan trọng: test `TestApp` dùng SQLite file tạm và tự bootstrap account `admin`, nên không kiểm tra record thực tế trên Redis production, biến môi trường Vercel hoặc cookie qua Vercel proxy.

Tham chiếu: `tests/ProxyAgent.Api.Tests/Admin/AdminEndpointTests.cs:14-199`.

## 8. Hướng xử lý đề xuất

### Việc cần kiểm tra trên Vercel/backend

1. Xác nhận deployment đang chạy đúng Redis provider và `REDIS_URL` còn hoạt động.
2. Xác nhận `Admin__InitialUsername` và `Admin__InitialPassword` thuộc đúng Production environment, không chỉ Preview/Development.
3. Tạo deployment mới sau khi thay biến môi trường.
4. Kiểm tra log backend của đúng thời điểm gọi `/api/admin/login` để phân biệt `401` với `storage_unavailable`.
5. Nếu Redis đã có `medical-harness:admin-account`, phải dùng cơ chế đổi/reset password có kiểm soát; chỉ đổi biến bootstrap không đủ.

Không nên đưa password, Redis URL hoặc API key vào source code, screenshot hay report. Các secret đã từng xuất hiện trong lịch sử trao đổi nên được rotate sau khi xử lý.

### Sửa sản phẩm nên làm ở lượt triển khai tiếp theo

- Backend trả JSON có mã lỗi ổn định cho login, ví dụ `invalid_credentials`, thay vì `401` rỗng.
- Frontend hiển thị riêng lỗi credentials, storage unavailable và backend unavailable.
- Thêm endpoint/health check nội bộ cho storage, không tiết lộ secret.
- Thêm test production-like cho Redis account bootstrap và cookie round-trip qua proxy.
- Thêm quy trình reset admin rõ ràng, có xác thực vận hành, thay vì phụ thuộc vào việc đổi biến môi trường.

## 9. Trạng thái xử lý của lượt này

- Đã điều tra code và kiểm tra các endpoint production an toàn.
- Đã chạy test admin hiện có: pass 4/4.
- Đã tạo báo cáo này.
- Chưa thay đổi logic đăng nhập và chưa push commit, vì yêu cầu hiện tại là lập báo cáo giải trình.
