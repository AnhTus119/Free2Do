# Bảo trì và deploy Free2Do

Tài liệu cho người vận hành. Cài đặt để phát triển: xem [README.md](README.md).
Danh sách API đầy đủ: Swagger tại `<backend>/docs`.

## Deploy

### Backend: Render

[`render.yaml`](render.yaml) đã khai báo sẵn: root `backend`, build
`pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`,
health check `/health/live`, Python 3.13.5, region Singapore (cùng vùng Supabase).

Điền trong **Render → Environment** các biến `sync: false`: `DATABASE_URL`, `JWT_SECRET_KEY`,
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GMAIL_API_*`, `GMAIL_SENDER_EMAIL`, `GOOGLE_CLIENT_ID`
(và `SMTP_*` nếu dùng SMTP). `render.yaml` đặt sẵn `EMAIL_PROVIDER=gmail_api` vì Render Free chặn
SMTP. `OPENAI_API_KEY` không có trong `render.yaml`; thêm tay nếu cần.

`CORS_ORIGINS` mặc định cho phép `localhost:5500`, `https://free2-do.vercel.app` và mọi
`https://*.vercel.app`; domain frontend khác thì thêm vào biến này.

Sau mỗi deploy mở `<backend>/health/ready`: cần `"database": "connected"` và `"schema": []`.

### Frontend: Vercel

Project Vercel trỏ **Root Directory** vào `frontend/` (nơi có [`vercel.json`](frontend/vercel.json)),
không có bước build. URL backend production nằm trong [`frontend/js/config.js`](frontend/js/config.js).
`vercel.json` chuyển link cũ `admin-login.html` về `log-in.html` và rewrite link mời nhóm `/g/:code`.

## Database

- **Tự động khi khởi động**: backend tạo bảng thiếu và thêm cột thiếu (nullable) theo
  `app/models.py` ([`app/schema_sync.py`](backend/app/schema_sync.py)). `/health/ready` liệt kê
  những gì còn thiếu trong `"schema"`.
- **Database mới**: `python init_db.py` tạo bảng và role `customer`/`business`.
- **[`migration.sql`](migration.sql)** (`python migrate_db.py`, hoặc dán vào Supabase SQL Editor):
  bật PostGIS trong schema `extensions` (kiểu Supabase), thêm cột `activities.location` + trigger +
  index, và bổ sung cột/bảng cho database cũ. Chạy lại an toàn. Không chạy thì tìm kiếm tự dùng
  Haversine thay cho PostGIS.
- **[`rename_activities.sql`](rename_activities.sql)**: chỉ dành cho database có dữ liệu mẫu cũ (không
  dùng cho database mới). Chạy một lần trong Supabase SQL Editor: đổi tên 30 hoạt động theo dạng
  `[Thương hiệu] - [Loại hình]` và xóa hoạt động test tên `123` cùng dữ liệu liên quan.
- **Cột `accounts.must_change_password`** (buộc đổi mật khẩu lần đầu cho tài khoản tạo bằng
  `bootstrap_admin.py`): backend tự thêm khi khởi động với giá trị mặc định `false`, nên không tài
  khoản hiện có nào bị ảnh hưởng. Câu lệnh tương ứng nằm cuối `migration.sql`.

## Việc tự động định kỳ (không cần cron)

Backend chạy một vòng quét ngay khi khởi động rồi mỗi giờ một lần ([`app/main.py`](backend/app/main.py)).
Render Free ngủ khi không có request nên vòng quét chạy khi service thức; các API danh sách liên quan
cũng tự quét hết hạn nên dữ liệu hiển thị luôn đúng.

| Việc | Quy tắc |
|---|---|
| Hoạt động chờ duyệt quá hạn | Quá 30 ngày chưa duyệt -> `expired`, gửi email cho doanh nghiệp. |
| Khiếu nại đánh giá quá hạn | Quá 30 ngày kể từ lúc gửi mà Operator chưa xử lý -> `expired`. Operator vẫn xử lý được khiếu nại `expired`. |
| Xóa vĩnh viễn hoạt động | `rejected` / `cancelled` / `expired` / `hidden` quá 60 ngày kể từ lần đổi trạng thái cuối: xóa cùng đánh giá (kèm ảnh, phản hồi, khiếu nại), bookmark, báo cáo, phiếu bầu nhóm và file trên Storage. Nhóm đã chọn hoạt động đó chỉ bị bỏ chọn. |
| Xóa vĩnh viễn báo cáo | Báo cáo đã xử lý (`resolved` = đã ẩn hoạt động, `dismissed` = bỏ qua) quá 60 ngày kể từ lúc xử lý. |

Hoạt động `active`/`pending` và báo cáo `pending` không bao giờ bị xóa tự động.

> **Trước lần deploy đầu tiên có tính năng xóa 60 ngày:** sao lưu database (Supabase → Database →
> Backups). Vòng quét chạy ngay khi khởi động và xóa luôn mọi bản ghi đã quá 60 ngày.

## Script trong `backend/`

Chạy trong `backend/`, venv đã kích hoạt, `.env` trỏ đúng database cần thao tác.

| Script | Việc làm |
|---|---|
| `bootstrap_admin.py [EMAIL]` | Tạo Operator admin đầu tiên (mặc định `test123@gmail.com` / `test12345`, Enter để dùng mặc định). In database đích, chỉ ghi khi gõ `yes`; email đã tồn tại thì dừng, không sửa gì. Tài khoản phải đổi mật khẩu ở lần đăng nhập đầu. |
| `seed_activities.py` | Nạp/cập nhật 28 doanh nghiệp, 30 hoạt động mẫu, tags và link Google Maps. Chạy lại an toàn nhưng ghi đè dữ liệu của chính các bản ghi mẫu. Tài khoản doanh nghiệp mẫu không có mật khẩu (không đăng nhập được) và lần chạy lại không đổi mật khẩu đã có. **Không chạy trên production.** |
| `seed_business_media.py --root DIR [--dry-run] [--image-kind menu] [--replace-existing-logo]` | Upload logo/gallery từ thư mục `B001/`, `B002/`... lên Supabase Storage. |
| `seed_avatar_presets.py --avatar "Tên=đường-dẫn-hoặc-URL"` | Upload avatar mẫu dùng chung (truyền `--avatar` nhiều lần). |
| `sync_activity_locations.py [--apply]` | Kiểm tra tọa độ theo link Google Maps; chỉ ghi khi có `--apply`. |
| `migrate_db.py` | Chạy `migration.sql`. |
| `test_connection.py` | Kiểm tra kết nối database. |
| `test_email.py [email-nhan]` | Kiểm tra cấu hình email; có địa chỉ thì gửi thử một OTP. |

> Các bản cũ của seed từng đặt mật khẩu dùng chung `Doanhnghiep123` cho doanh nghiệp mẫu. Nếu từng
> chạy chúng trên production, hãy đổi mật khẩu các tài khoản đó.

## Upload ảnh (Supabase Storage)

Backend tự tạo bucket public `SUPABASE_STORAGE_BUCKET` (mặc định `free2do-media`) ở lần upload đầu.
File đi qua backend nên service key không lộ ra trình duyệt; giới hạn dung lượng chỉnh bằng
`MAX_IMAGE_UPLOAD_MB` / `MAX_VIDEO_UPLOAD_MB`. Theo dõi Storage Usage trong Supabase.

## Email OTP

- Máy local hoặc Render trả phí: SMTP, xem [SMTP_GMAIL_SETUP.md](SMTP_GMAIL_SETUP.md).
- Render Free (chặn SMTP): Gmail API, xem [GMAIL_API_RENDER_SETUP.md](GMAIL_API_RENDER_SETUP.md).
