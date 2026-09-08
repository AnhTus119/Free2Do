# Free2Do Backend — Giải thích chi tiết code

Tài liệu này giải thích **từng file**, **từng khối code quan trọng** đang có trong `backend/`, và cách chúng liên kết với nhau. Đọc theo thứ tự bên dưới — thứ tự này cũng chính là thứ tự "tầng" của hệ thống, tầng dưới không phụ thuộc tầng trên.

```
backend/
├── app/
│   ├── config.py       ← Tầng 1: đọc biến môi trường
│   ├── database.py     ← Tầng 2: kết nối DB (phụ thuộc config)
│   ├── models.py        ← Tầng 3: định nghĩa bảng (phụ thuộc database)
│   ├── schemas.py       ← Tầng 3: định nghĩa dữ liệu vào/ra API (độc lập với models)
│   ├── auth.py          ← Tầng 4: hash, JWT, Google verify, phân quyền (phụ thuộc config, database, models)
│   ├── utils/
│   │   ├── distance.py  ← Tầng 3: tính khoảng cách (độc lập)
│   │   ├── scoring.py   ← Tầng 3: tính điểm phù hợp (độc lập)
│   │   ├── email.py     ← Tầng 3: gửi mail (phụ thuộc config)
│   │   └── otp.py       ← Tầng 4: sinh/kiểm tra OTP (phụ thuộc models)
│   ├── routers/
│   │   ├── auth.py      ← Tầng 5: endpoint auth (phụ thuộc auth.py, utils/otp, utils/email)
│   │   └── search.py    ← Tầng 5: endpoint search (phụ thuộc utils/distance, utils/scoring)
│   └── main.py          ← Tầng 6: điểm khởi động, gộp toàn bộ router lại
├── init_db.py           ← script chạy tay, tạo bảng
├── seed_db.py           ← script chạy tay, tạo data mẫu
├── test_connection.py   ← script chạy tay, test DB
└── test_email.py        ← script chạy tay, test gửi mail
```

---

## 1. `app/config.py` — Đọc biến môi trường

```python
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
```
Tính đường dẫn tuyệt đối tới file `.env` (nằm ở `backend/.env`), dựa trên vị trí thật của `config.py` chứ không dựa vào bạn đang đứng ở thư mục nào khi gõ lệnh `python`. Đây là chỗ sửa để fix lỗi "chạy sai thư mục không đọc được `.env`" đã gặp trước đó.

```python
class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET_KEY: str
    ...
    model_config = SettingsConfigDict(env_file=ENV_PATH, extra="ignore")

settings = Settings()
```
`BaseSettings` (từ `pydantic-settings`) tự động đọc từng dòng trong `.env` và map vào đúng tên biến (`DATABASE_URL`, `JWT_SECRET_KEY`...). Field nào không có giá trị mặc định (`= "..."`) mà cũng không có trong `.env` → app sẽ crash ngay khi khởi động với lỗi `Field required` (đã gặp lỗi này lúc thiếu `DATABASE_URL`/`JWT_SECRET_KEY`).

`extra="ignore"` — nếu `.env` có thêm biến thừa không khai báo trong class (ví dụ lúc trước có `supabase_url`, `supabase_service_key` bị dư) thì bỏ qua, không crash.

`settings = Settings()` chạy 1 lần duy nhất khi module này được import lần đầu — mọi file khác chỉ cần `from app.config import settings` là dùng lại đúng 1 instance đó (singleton).

**Ai import file này:** `database.py`, `auth.py`, `utils/email.py`, `utils/otp.py`.

---

## 2. `app/database.py` — Kết nối SQLAlchemy

```python
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
```
`engine` là đối tượng quản lý kết nối vật lý tới Postgres. `pool_pre_ping=True` bắt SQLAlchemy "ping thử" kết nối trước mỗi lần dùng — cần thiết vì Supabase tự ngắt kết nối rảnh sau một thời gian, nếu không có dòng này sẽ dính lỗi "connection closed" ngẫu nhiên.

```python
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
```
`SessionLocal` là "khuôn" để tạo ra 1 phiên làm việc với DB (1 Session = 1 transaction). Mỗi request API sẽ có 1 Session riêng, không share giữa các request.

```python
Base = declarative_base()
```
Class gốc mà mọi model trong `models.py` phải kế thừa. SQLAlchemy dùng `Base` để biết class Python nào tương ứng với bảng nào.

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```
Đây là 1 **FastAPI dependency** — dùng `yield` thay vì `return` để đảm bảo `db.close()` luôn chạy sau khi request xử lý xong, kể cả khi có lỗi giữa chừng (`finally`). Trong router, bạn khai `db: Session = Depends(get_db)` — FastAPI tự gọi hàm này, đưa `db` vào, và tự đóng khi xong.

**Ai import file này:** `models.py` (lấy `Base`), mọi router (lấy `get_db`), `init_db.py`, `test_connection.py`, `seed_db.py`.

---

## 3. `app/models.py` — Định nghĩa bảng (SQLAlchemy ORM)

Mỗi class = 1 bảng thật trong Postgres, ánh xạ 1:1 theo `database.txt`.

```python
def gen_id() -> str:
    return str(uuid.uuid4())
```
Hàm sinh UUID ngẫu nhiên làm khóa chính, dùng làm `default=gen_id` cho mọi cột `*_id`. Vì sao không để Postgres tự sinh (`SERIAL`)? Vì UUID string không đoán được thứ tự, an toàn hơn khi expose `activity_id` ra API công khai (đối thủ không đếm được có bao nhiêu record).

### `Account` — bảng trung tâm nhất
```python
password_hash = Column(String, nullable=True)  # null nếu đăng ký bằng Google
auth_provider = Column(String, nullable=False, default="email")
google_id = Column(String, unique=True, nullable=True)
email_verified = Column(Boolean, nullable=False, default=False)
```
4 cột này được thêm **sau** so với `database.txt` gốc, để hỗ trợ 2 phương thức đăng ký:
- `auth_provider` phân biệt tài khoản tạo bằng `"email"` hay `"google"`.
- `password_hash` nullable vì tài khoản Google không có mật khẩu.
- `google_id` lưu `sub` (ID định danh duy nhất) Google trả về, dùng để tra cứu lần đăng nhập sau.
- `email_verified` — tài khoản email/password bắt đầu là `False`, chỉ thành `True` sau khi xác minh OTP; tài khoản Google luôn `True` ngay từ đầu.

```python
user = relationship("User", back_populates="account", uselist=False)
```
`relationship` không tạo cột mới trong DB — nó là "đường tắt" ở tầng Python để từ 1 object `Account` truy cập thẳng sang `account.user` (object `User` liên kết) mà không cần tự viết `db.query(User).filter(...)`. `uselist=False` nghĩa là quan hệ 1-1 (1 account chỉ có tối đa 1 user), khác với quan hệ 1-nhiều (ví dụ `Activity.reviews` là danh sách).

`back_populates="account"` phải khớp tên với `relationship` phía bên kia (trong class `User`) — đây là cách SQLAlchemy biết 2 `relationship` này là 2 chiều của cùng 1 quan hệ.

### `OtpCode` — bảng mới, không có trong `database.txt` gốc
```python
class OtpCode(Base):
    __tablename__ = "otp_codes"
    otp_id = Column(String, primary_key=True, default=gen_id)
    email = Column(String, nullable=False, index=True)
    code = Column(String, nullable=False)
    purpose = Column(String, nullable=False)  # "register" | "reset_password"
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False)
```
Lưu mã OTP tạm thời. `purpose` phân biệt OTP này dùng cho đăng ký hay quên mật khẩu — cùng 1 email có thể có nhiều OTP với `purpose` khác nhau, không đụng nhau. `index=True` trên `email` giúp query tìm OTP theo email nhanh hơn khi bảng có nhiều dòng.

**Ai import file này:** mọi router, `auth.py`, `utils/otp.py`, `init_db.py`, `seed_db.py`.

---

## 4. `app/schemas.py` — Định nghĩa dữ liệu vào/ra API (Pydantic)

Khác với `models.py` (định nghĩa bảng DB), `schemas.py` định nghĩa **hình dạng dữ liệu JSON** mà API nhận vào (request body) và trả ra (response). 2 file này tách biệt cố ý — không phải lúc nào cũng muốn trả hết mọi cột trong DB ra ngoài (ví dụ `password_hash` không bao giờ nên xuất hiện trong response).

```python
class Account(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    account_id: str
    email: str
    ...
```
`from_attributes=True` cho phép tạo object `Account` (schema) trực tiếp từ object `models.Account` (ORM) bằng `Account.model_validate(db_account)`, thay vì phải gõ tay từng field.

**Quy ước đặt tên trong file này:**
- `XyzCreate` — dữ liệu client gửi lên khi tạo mới (không có `id`, `created_at`... vì server tự sinh).
- `Xyz` — dữ liệu trả về client (có đủ field, kể cả field do server sinh).

```python
class ActivityWithScore(Activity):
    match_score: float
    distance_km: Optional[float] = None
```
Kế thừa từ `Activity`, thêm 2 field chỉ tồn tại lúc tìm kiếm (không phải cột thật trong DB — được tính runtime bởi `utils/scoring.py`).

**Ai import file này:** mọi router (để validate request/response).

---

## 5. `app/auth.py` — Hash mật khẩu, JWT, Google verify, phân quyền

Đây là file "lõi bảo mật" — mọi logic xác thực dùng chung đều nằm ở đây (không đặt trực tiếp trong router để tránh lặp code).

### Hash mật khẩu
```python
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)
```
Không bao giờ lưu mật khẩu gốc vào DB — `bcrypt` băm 1 chiều, không thể giải mã ngược. `verify_password` không "giải mã rồi so sánh" mà băm lại mật khẩu người dùng nhập và so 2 chuỗi băm.

### JWT — access token & reset token
```python
def create_access_token(account_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": account_id, "type": "access", "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
```
JWT là 1 chuỗi tự chứa thông tin, được ký bằng `JWT_SECRET_KEY` — server không cần lưu token vào DB, chỉ cần verify chữ ký lúc client gửi lên là biết token có bị giả mạo không. `"sub"` (subject) = ai sở hữu token, `"exp"` = thời điểm hết hạn (thư viện `jose` tự check field này khi decode).

`"type": "access"` khác `"type": "reset"` (trong `create_reset_token`) — 2 loại token dùng **chung 1 secret key** nhưng có "nhãn" khác nhau, để đảm bảo 1 reset token (sinh ra sau khi xác minh OTP quên mật khẩu) không thể bị dùng thay cho access token đăng nhập thường, dù về mặt kỹ thuật cả 2 đều là JWT hợp lệ.

```python
def decode_token(token: str, expected_type: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    return payload.get("sub")
```
Hàm dùng chung để decode cả 2 loại token. Trả `None` (thay vì raise lỗi) nếu: chữ ký sai, hết hạn, hoặc đúng JWT nhưng sai `type` — router gọi hàm này chỉ cần check `if not result: raise HTTPException(...)`.

### Google OAuth verify
```python
def verify_google_token(token: str) -> Optional[dict]:
    info = google_id_token.verify_oauth2_token(
        token, google_requests.Request(), settings.GOOGLE_CLIENT_ID
    )
```
`token` ở đây là `id_token` do **frontend** lấy được sau khi người dùng bấm "Sign in with Google" (dùng Google Identity Services JS SDK) rồi gửi lên backend. `verify_oauth2_token` tự gọi tới server Google để xác minh chữ ký, hạn dùng, và **khớp đúng `GOOGLE_CLIENT_ID`** của project (chặn trường hợp ai đó gửi lên 1 id_token hợp lệ nhưng cấp cho app khác). Nếu token giả/hết hạn, hàm ném `ValueError` — được bắt lại và trả `None`.

### 3 dependency phân quyền — quan trọng nhất để hiểu khi viết router mới
```python
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def get_current_account(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.Account:
    account_id = decode_token(token, expected_type="access")
    if not account_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token không hợp lệ hoặc đã hết hạn")
    account = db.query(models.Account).filter(models.Account.account_id == account_id).first()
    if not account or account.status != "active":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tài khoản không tồn tại hoặc chưa kích hoạt")
    return account
```
`OAuth2PasswordBearer` không tự xác thực gì cả — nó chỉ là 1 "công cụ khai báo" để: (1) báo cho Swagger UI biết route này cần nút Authorize, và (2) tự động đọc header `Authorization: Bearer <token>` từ request, đưa chuỗi token (đã bỏ chữ "Bearer ") vào biến `token`.

`get_current_account` là dependency **gốc** — mọi route cần đăng nhập sẽ khai `Depends(get_current_account)` trong tham số hàm. FastAPI tự chạy hàm này trước, nếu nó raise `HTTPException` thì route chính không chạy nữa (client nhận thẳng lỗi 401).

```python
def get_current_operator(account: models.Account = Depends(get_current_account), db: Session = Depends(get_db)) -> models.Operator:
    operator = db.query(models.Operator).filter(models.Operator.account_id == account.account_id).first()
    if not operator:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ operator mới được thực hiện thao tác này")
    return operator
```
Đây là ví dụ về **dependency chain** — `get_current_operator` phụ thuộc vào `get_current_account` (đã đăng nhập), rồi kiểm tra thêm điều kiện (có phải operator không). Route nào khai `Depends(get_current_operator)` sẽ tự động chạy qua cả 2 lớp kiểm tra theo đúng thứ tự. Tương tự với `get_current_business_user`.

**Ai import file này:** mọi router.

---

## 6. `app/utils/distance.py` — Tính khoảng cách

```python
def haversine_km(lat1, lon1, lat2, lon2) -> float:
```
Công thức Haversine tính khoảng cách đường chim bay giữa 2 điểm trên mặt cầu (Trái Đất), dựa vào kinh độ/vĩ độ. Dùng thay cho PostGIS vì tọa độ trong `activities` đang lưu `Float` thường (quyết định đơn giản hóa đã chốt trước đó) — nên phép tính khoảng cách phải làm ở tầng Python (trong `search.py`) thay vì query SQL không gian.

Không phụ thuộc file nào khác trong project (chỉ dùng thư viện `math` có sẵn của Python).

**Ai import file này:** `routers/search.py`.

---

## 7. `app/utils/scoring.py` — Tính điểm phù hợp

4 hàm private (`_distance_score`, `_budget_score`, `_interest_score`, `_time_score`) mỗi hàm trả về điểm 0–100 cho **1 tiêu chí riêng lẻ**, rồi `calculate_score()` gộp lại theo trọng số:

```python
WEIGHT_DISTANCE = 0.3
WEIGHT_BUDGET = 0.25
WEIGHT_INTEREST = 0.25
WEIGHT_TIME = 0.2
```
4 số này cộng lại = 1.0 — đúng công thức "weighted sum" đã thống nhất trong dự án. Muốn đổi độ ưu tiên (ví dụ coi trọng khoảng cách hơn) chỉ cần sửa 4 số này, không cần đụng logic bên dưới.

Ví dụ đọc 1 hàm: `_budget_score`
```python
def _budget_score(price, budget):
    if not price or budget is None:
        return 100.0          # hoạt động miễn phí, hoặc user không nhập ngân sách -> không trừ điểm
    if price <= budget:
        return 100.0          # trong ngân sách -> full điểm
    over_ratio = (price - budget) / budget if budget > 0 else 1
    return max(0.0, 100.0 * (1 - over_ratio))   # vượt ngân sách càng nhiều, điểm càng thấp, tối thiểu 0
```

**Ai import file này:** `routers/search.py`.

---

## 8. `app/utils/email.py` — Gửi email qua Gmail SMTP

```python
msg["From"] = formataddr(("Free2Do", settings.SMTP_USER))
```
`formataddr` tạo header dạng `Free2Do <email-that@gmail.com>` — người nhận thấy tên hiển thị "Free2Do" thay vì thấy trần địa chỉ email.

```python
with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
    server.starttls()
    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
    server.sendmail(settings.SMTP_USER, [to_email], msg.as_string())
```
`starttls()` nâng cấp kết nối lên mã hóa TLS (bắt buộc với Gmail ở port 587). `server.login` dùng **App Password** (không phải mật khẩu Gmail thật) — lý do phải tạo App Password thay vì dùng mật khẩu thường đã giải thích ở các bước trước.

**Ai import file này:** `routers/auth.py`, `test_email.py`.

---

## 9. `app/utils/otp.py` — Sinh và kiểm tra mã OTP

```python
def generate_and_save_otp(db, email, purpose) -> str:
    code = f"{random.randint(0, 999999):06d}"
```
Sinh số ngẫu nhiên 0–999999, format `:06d` để luôn có đủ 6 chữ số (thêm số 0 phía trước nếu cần, ví dụ `7` → `"000007"`).

```python
def verify_otp(db, email, code, purpose) -> bool:
    otp = (
        db.query(models.OtpCode)
        .filter(
            models.OtpCode.email == email,
            models.OtpCode.code == code,
            models.OtpCode.purpose == purpose,
            models.OtpCode.is_used == False,
            models.OtpCode.expires_at >= now,
        )
        .order_by(models.OtpCode.created_at.desc())
        .first()
    )
```
Điều kiện lọc đủ chặt để chống replay: đúng email + đúng mã + đúng mục đích (`purpose`) + **chưa từng dùng** (`is_used == False`) + **chưa hết hạn**. `order_by(...desc()).first()` lấy mã mới nhất nếu người dùng lỡ xin nhiều mã liên tiếp.

```python
    otp.is_used = True
    db.commit()
```
Đánh dấu đã dùng ngay khi verify thành công — 1 mã OTP chỉ dùng được đúng 1 lần, kể cả khi client gửi lại request y hệt.

**Ai import file này:** `routers/auth.py`.

---

## 10. `app/routers/auth.py` — Endpoint xác thực

Router này chỉ **điều phối** (gọi các hàm đã viết ở `auth.py`, `utils/otp.py`, `utils/email.py`) — hầu như không tự viết logic phức tạp, đúng nguyên tắc tách trách nhiệm.

### `POST /auth/register`
```python
db.add(account)
db.flush()  # có account_id trước khi tạo User
```
`db.flush()` đẩy câu lệnh `INSERT` xuống DB **nhưng chưa commit** — mục đích chỉ để Postgres sinh/xác nhận `account_id`, để dòng code ngay sau có thể dùng `account.account_id` gán cho `User.account_id` (khóa ngoại). `db.commit()` ở cuối mới thực sự lưu vĩnh viễn cả 2 record (`account` + `user`) cùng lúc — nếu có lỗi giữa chừng, cả 2 đều rollback, không bị tạo `account` mồ côi không có `user`.

### `POST /auth/google`
```python
account = db.query(models.Account).filter(models.Account.google_id == info["google_id"]).first()
if not account:
    account = db.query(models.Account).filter(models.Account.email == info["email"]).first()
    if account:
        account.google_id = info["google_id"]
        ...
    else:
        # tạo mới hoàn toàn
```
3 nhánh xử lý: (1) đã từng đăng nhập Google trước đó → tìm thấy ngay; (2) email đã tồn tại nhưng đăng ký bằng cách khác (email/password) → tự động "gắn" Google vào tài khoản cũ thay vì tạo trùng; (3) hoàn toàn mới → tạo account + user mới.

### `POST /auth/login`
```python
form_data: OAuth2PasswordRequestForm = Depends()
```
Nhận dữ liệu dạng **form** (không phải JSON) — đây là chuẩn OAuth2, cũng là điểm khác biệt quan trọng cần nhớ khi nối frontend: gọi `/auth/login` phải gửi `Content-Type: application/x-www-form-urlencoded` hoặc `multipart/form-data`, không phải `application/json` như các route khác.

### `POST /auth/forgot-password`
```python
if account and account.auth_provider == "email":
    ...
return {"message": "Nếu email tồn tại, mã OTP đã được gửi"}
```
Dù email có tồn tại trong DB hay không, response trả về **luôn giống nhau** — tránh lộ thông tin "email này có đăng ký tài khoản hay không" cho kẻ tấn công dò email (kỹ thuật bảo mật gọi là tránh "user enumeration").

### `POST /auth/verify-reset-otp` → `POST /auth/reset-password`
Tách 2 bước, nối nhau bằng `reset_token` (JWT ngắn hạn 10 phút) — đúng yêu cầu "xác nhận trong gmail → quay lại web → chuyển sang phần đổi mật khẩu": frontend nhận `reset_token` sau bước verify, giữ tạm (state/URL param), rồi mới gửi kèm khi user bấm "Đổi mật khẩu".

---

## 11. `app/routers/search.py` — Endpoint tìm kiếm

```python
query = db.query(models.Activity).filter(models.Activity.status == "active")
if keyword:
    query = query.filter(models.Activity.name.ilike(f"%{keyword}%"))
if category_ids:
    query = query.join(models.ActivityCategory).filter(...).distinct()
```
Lọc thô ở tầng SQL trước (nhanh hơn vì Postgres tối ưu tốt) — chỉ lọc được những điều kiện SQL biểu đạt được (từ khóa, category). `.distinct()` cần thiết vì `JOIN` với bảng trung gian `activities_categories` có thể tạo ra nhiều dòng trùng activity nếu 1 activity có nhiều category khớp.

```python
for activity in query.all():
    distance = haversine_km(...)
    if distance > radius:
        continue
```
Khoảng cách **không lọc được bằng SQL** (vì không dùng PostGIS) — phải load hết activity đã qua lọc thô, rồi tính khoảng cách từng cái bằng Python, loại bỏ cái nào ngoài bán kính. Đây là điểm sẽ chậm dần khi số lượng activity tăng lên nhiều (hàng chục nghìn) — chấp nhận được ở quy mô MVP 1 quận.

```python
item = schemas.ActivityWithScore.model_validate(activity)
item.match_score = score
item.distance_km = round(distance, 2)
```
Tạo schema từ ORM object trước, rồi **gán thêm** 2 field không có trong DB (`match_score`, `distance_km`) — vì đây là dữ liệu tính runtime, không lưu trong bảng `activities`.

**Lưu ý an ninh chưa xử lý:** `user_id` hiện là query param client tự khai báo, không lấy từ JWT — nghĩa là ai cũng có thể gửi `user_id` giả để ghi `search_history` vào tên người khác. Cần sửa thành lấy từ `Depends(get_current_account)` (optional — cho phép cả người chưa đăng nhập vẫn search được) khi làm kỹ hơn phần bảo mật.

---

## 12. `app/main.py` — Điểm khởi động ứng dụng

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500", "http://localhost:5500"],
    ...
)
```
CORS chặn browser gọi API từ domain lạ theo mặc định — dòng này **mở cửa riêng** cho frontend chạy ở Live Server (port 5500) được phép gọi backend (port 8000). Khi deploy thật, cần thêm domain Vercel thật vào danh sách này (`allow_origins`), nếu không frontend production sẽ bị chặn.

```python
app.include_router(search.router)
app.include_router(auth.router)
```
Mỗi `router` (định nghĩa trong `routers/*.py`) là 1 nhóm endpoint độc lập, `include_router` gắn chúng vào app chính. Thêm router mới (`activities.py`, `reviews.py`, `operator.py`) chỉ cần thêm 2 dòng tương tự — không cần sửa gì trong chính router đó.

---

## 13. Các script chạy tay (không phải API, chạy trực tiếp bằng `python <file>.py`)

| File | Việc làm | Khi nào chạy |
|---|---|---|
| `test_connection.py` | Gọi `SELECT version()` để xác nhận kết nối DB sống | Sau khi đổi `DATABASE_URL` |
| `test_email.py` | Gửi 1 email OTP test tới địa chỉ bất kỳ | Sau khi đổi `SMTP_USER`/`SMTP_PASSWORD` |
| `init_db.py` | `Base.metadata.create_all()` — tạo toàn bộ bảng theo `models.py` | Lần đầu setup, hoặc sau khi đổi schema (kèm bước xóa bảng cũ) |
| `seed_db.py` | Tạo 7 account operator mẫu, bỏ qua nếu email đã tồn tại | Sau `init_db.py`, khi cần data test |

Điểm chung: cả 4 file đều **đứng ngoài package `app/`** (không có `from . import`, mà dùng `from app.xxx import yyy`) — nên bắt buộc chạy từ thư mục `backend/`, không phải từ trong `app/`.

---

## 14. Sơ đồ luồng gọi (request lifecycle) — ví dụ `POST /auth/verify-register-otp`

```
Client gửi POST /auth/verify-register-otp {email, code}
        │
        ▼
main.py: app đã include_router(auth.router) -> route khớp
        │
        ▼
routers/auth.py: verify_register_otp(payload, db)
        │  db lấy từ Depends(get_db) -- database.py tạo Session mới
        ▼
utils/otp.py: verify_otp(db, email, code, purpose="register")
        │  query bảng otp_codes (models.py) qua Session db
        ▼
Nếu hợp lệ: cập nhật account.email_verified=True, status="active"
        │
        ▼
app/auth.py: create_access_token(account.account_id)
        │  đọc settings.JWT_SECRET_KEY từ config.py
        ▼
Trả về {"access_token": "..."}  (đúng hình dạng schemas.Token)
        │
        ▼
database.py: get_db() chạy finally -> db.close()
```
