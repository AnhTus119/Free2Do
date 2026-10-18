# Free2Do

**Nền tảng khám phá hoạt động dựa trên thời gian rảnh.**

Người dùng nhập thời gian rảnh, vị trí, ngân sách và sở thích; Free2Do lọc, tính khoảng cách và
xếp hạng các hoạt động phù hợp quanh họ, thay vì bắt người dùng tự biết mình muốn làm gì.

## Tính năng

- **Khách hàng**: tìm hoạt động theo thời gian rảnh, vị trí, ngân sách, tags và bán kính, xem trên
  bản đồ; trang chi tiết hoạt động/doanh nghiệp; lưu (bookmark), đánh giá kèm ảnh, báo cáo;
  lập nhóm đi chơi (mời bằng link, bình chọn hoạt động, chia tiền); trợ lý AI gợi ý bằng tiếng Việt;
  thông báo; đăng ký trở thành doanh nghiệp.
- **Doanh nghiệp**: dashboard và biểu đồ, hồ sơ (logo, gallery, menu), tạo/sửa hoạt động kèm
  ảnh/video, trả lời đánh giá, gửi khiếu nại. Hoạt động mới/sửa đổi chờ Operator duyệt.
- **Operator (quản trị)**: dashboard, duyệt hoạt động và đơn đăng ký doanh nghiệp, quản lý khách
  hàng/doanh nghiệp/Operator, xử lý báo cáo/khiếu nại, nhật ký thao tác.
- **Tài khoản**: đăng ký/đăng nhập bằng email hoặc số điện thoại, quên mật khẩu bằng OTP qua email.

## Cấu trúc

```text
backend/        API FastAPI (app/), script quản trị database, tests/
frontend/       Trang HTML/CSS/JS tĩnh, không cần build
migration.sql   SQL bổ sung cho database đã có dữ liệu (xem MAINTAINING.md)
render.yaml     Cấu hình deploy backend lên Render
```

## Yêu cầu

- Python 3.13 (Render dùng 3.13.5)
- Một database PostgreSQL. Khuyên dùng một project [Supabase](https://supabase.com) miễn phí
  (có sẵn PostGIS và Storage để upload ảnh).
- Git

## Cài đặt và chạy

### 1. Clone và cài thư viện

```bash
git clone https://github.com/AnhTus119/Free2Do.git
cd Free2Do/backend
python -m venv venv
```

Kích hoạt venv — Windows: `venv\Scripts\activate`, macOS/Linux: `source venv/bin/activate`. Sau đó:

```bash
pip install -r requirements.txt
```

### 2. Cấu hình `backend/.env`

```bash
cp .env.example .env
```

(Windows: `copy .env.example .env`.) Mở `backend/.env` và điền **2 biến bắt buộc**:

| Biến | Giá trị |
|---|---|
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL **của bạn**, dạng `postgresql://USER:PASSWORD@HOST:5432/postgres`. Supabase: tạo project mới → **Connect → Connection string → Session pooler** (chạy được cả mạng chỉ có IPv4) |
| `JWT_SECRET_KEY` | Chuỗi ngẫu nhiên dài, tạo bằng `python -c "import secrets; print(secrets.token_urlsafe(48))"` |

Dùng database riêng của bạn, không dùng database production của nhóm: các script bên dưới ghi
thẳng vào database mà `DATABASE_URL` trỏ tới.

Các biến còn lại là tùy chọn; để trống thì app vẫn chạy, chỉ tính năng tương ứng không dùng được:

| Tính năng | Biến | Khi để trống |
|---|---|---|
| Upload ảnh/video | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | API upload báo "chưa cấu hình" |
| Email OTP | `SMTP_*` hoặc `GMAIL_API_*` | Không gửi được OTP quên mật khẩu / xác minh email |
| Trợ lý AI | `OPENAI_API_KEY` | Trợ lý AI vẫn chạy (xem [AI_SETUP.md](AI_SETUP.md)) |

Giải thích từng biến nằm ngay trong [`backend/.env.example`](backend/.env.example).

### 3. Khởi tạo database (lần đầu)

Database mới **không cần chạy file SQL nào** trong Supabase SQL Editor. Chạy trong `backend/`:

```bash
python init_db.py
```

**Bắt buộc.** Tạo bảng và role `customer`/`business` (thiếu role thì không đăng ký được). Mỗi lần
khởi động, backend cũng tự bổ sung bảng/cột còn thiếu.

```bash
python bootstrap_admin.py
```

**Bắt buộc nếu cần vào trang quản trị (Operator).** Tạo tài khoản admin đầu tiên. Bấm Enter để dùng
mặc định `test123@gmail.com` / `test12345`, hoặc truyền email khác (`python bootstrap_admin.py
admin@example.com`) và nhập mật khẩu riêng. Script in ra database đích và chỉ ghi khi bạn gõ `yes`;
email đã tồn tại thì dừng, không sửa tài khoản nào. Lần đăng nhập đầu tiên tài khoản này **bắt buộc
đổi mật khẩu** (backend chặn mọi API khác cho tới khi đổi xong). Các Operator khác tạo trong trang
quản trị.

Tùy chọn:

- `python seed_activities.py`: nạp 28 doanh nghiệp và 30 hoạt động mẫu để có dữ liệu xem thử.
  Tài khoản doanh nghiệp mẫu không có mật khẩu nên không đăng nhập được.
- `python migrate_db.py`: bật tìm kiếm theo bán kính bằng PostGIS (chạy `migration.sql`). Không chạy
  thì tìm kiếm vẫn hoạt động bằng cách tính khoảng cách trong Python.

### 4. Chạy backend

Trong `backend/`, venv đã kích hoạt:

```bash
uvicorn app.main:app --reload
```

API chạy tại `http://localhost:8000`, tài liệu API (Swagger) tại `http://localhost:8000/docs`.

### 5. Chạy frontend

Mở terminal khác, đứng ở thư mục gốc `Free2Do/`:

```bash
python -m http.server 5500 --directory frontend
```

Mở `http://localhost:5500`. Khi trang được mở từ `localhost`/`127.0.0.1`, frontend tự gọi backend
`http://localhost:8000` (xem [`frontend/js/config.js`](frontend/js/config.js)); bản deploy gọi
backend trên Render.

## Kiểm tra đã chạy đúng

1. `http://localhost:8000/health/live` trả `{"status":"ok"}`.
2. `http://localhost:8000/health/ready` có `"database": "connected"` và `"schema": []`.
3. Mở `http://localhost:5500/sign-up.html`, đăng ký bằng **email** rồi đăng nhập: lưu hoạt động yêu
   thích, tìm kiếm, đánh giá đều ghi vào database của bạn. (Đăng ký bằng số điện thoại cần cấu hình
   email để nhận OTP xác minh email khôi phục.)
4. Đăng nhập `log-in.html` bằng tài khoản admin vừa tạo, đổi mật khẩu, rồi vào trang quản trị.

## Chạy test

Trong `backend/`, venv đã kích hoạt:

```bash
pip install pytest
python -m pytest
```

Test dùng SQLite trong bộ nhớ: không cần database hay `.env`, không gửi email, không gọi AI.

## Lỗi thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| Khởi động báo `ValidationError` ở `DATABASE_URL` hoặc `JWT_SECRET_KEY` | Chưa tạo `backend/.env` hoặc còn để trống 2 biến bắt buộc |
| `/health/ready` trả 503 | `DATABASE_URL` sai hoặc không kết nối được database (kiểm tra mật khẩu, host, cổng) |
| Đăng ký báo "Không tìm thấy role customer" | Chạy `python init_db.py` |
| Đăng nhập admin bị chuyển sang trang đổi mật khẩu | Đúng thiết kế: tài khoản tạo bằng `bootstrap_admin.py` phải đổi mật khẩu lần đầu |
| `bootstrap_admin.py` báo email đã có tài khoản | Database đó đã có email này; dùng email khác hoặc đăng nhập tài khoản cũ |
| Frontend báo "Không kết nối được backend" | Backend chưa chạy ở cổng 8000, hoặc frontend không mở ở cổng 5500 (cổng khác thì thêm vào `CORS_ORIGINS`) |
| `password cannot be longer than 72 bytes` | Đang dùng thư viện ngoài venv; kích hoạt venv và chạy lại `pip install -r requirements.txt` |
| `UnicodeEncodeError` khi chạy script trên Git Bash (Windows) | Đặt `PYTHONUTF8=1` (Git Bash: `export PYTHONUTF8=1`) hoặc dùng PowerShell/cmd |
| Upload ảnh báo chưa cấu hình | Điền `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |
| Không nhận được OTP | Cấu hình email theo [SMTP_GMAIL_SETUP.md](SMTP_GMAIL_SETUP.md); kiểm tra cả thư mục Spam |

## Tài liệu khác

- [MAINTAINING.md](MAINTAINING.md): deploy (Render, Vercel), migration, script seed và bảo trì.
- [SMTP_GMAIL_SETUP.md](SMTP_GMAIL_SETUP.md), [GMAIL_API_RENDER_SETUP.md](GMAIL_API_RENDER_SETUP.md): gửi email OTP.
- [AI_SETUP.md](AI_SETUP.md): trợ lý AI.
- [MAP_ICON_GUIDE.md](MAP_ICON_GUIDE.md): icon hoạt động trên bản đồ.

## Thành viên nhóm

| Vai trò | Họ và tên |
|---|---|
| Project Manager | Nguyễn Thiện Nhân |
| UI/UX Designer | Lê Thị Diệu Linh |
| System Architect | Dương Khánh Duy |
| Frontend Developer | Phạm Phương Anh |
| Backend Developer | Đoàn Anh Tú |
| QA/Tester | Trần Hoàng Trung |
| Thư ký + Triển khai | Nguyễn Thị Linh Anh |
