import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text
from app.config import settings
from app.utils.email import get_email_provider
from app.database import SessionLocal, engine
from app.schema_sync import find_schema_gaps, sync_schema_safely
from app.retention import purge_stale_records
from app.routers import (
    search,
    auth,
    operator,
    operator_users,
    action_logs,
    categories,
    users,
    business_requests,
    activities,
    reviews,
    bookmarks,
    reports,
    complaints,
    businesses,
    media,
    public_businesses,
    groups,
    ai,
    notifications,
)

logger = logging.getLogger("free2do.api")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Tự bổ sung bảng/cột còn thiếu để không phụ thuộc vào việc đã chạy migrate hay chưa.
    sync_schema_safely(engine)
    sweeper = asyncio.create_task(_maintain_periodically())
    yield
    sweeper.cancel()


def _maintain_once() -> None:
    db = SessionLocal()
    try:
        for task in (activities.expire_overdue_activities, complaints.expire_overdue_complaints, purge_stale_records):
            try:
                task(db)
            except Exception:  # noqa: BLE001 -- một việc lỗi không chặn các việc còn lại
                db.rollback()
                logger.exception("Vòng quét định kỳ lỗi ở %s", task.__name__)
    finally:
        db.close()


async def _maintain_periodically() -> None:
    """Chạy ngay khi khởi động rồi mỗi giờ: hoạt động chờ duyệt quá 30 ngày -> "expired" (kèm email),
    khiếu nại quá hạn 30 ngày -> "expired", xóa vĩnh viễn dữ liệu đã kết thúc quá 60 ngày
    (app/retention.py). Các API danh sách cũng tự quét hết hạn nên trễ tối đa ~1 giờ."""
    while True:
        await asyncio.to_thread(_maintain_once)
        await asyncio.sleep(3600)


app = FastAPI(title="Free2Do API", version="1.1.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=5)


# Lỗi 500 chưa được xử lý sẽ thoát khỏi CORSMiddleware nên trình duyệt chỉ thấy lỗi CORS
# ("không kết nối được máy chủ"). Middleware này nằm BÊN TRONG CORS để 500 vẫn có header CORS
# và frontend đọc được thông báo lỗi thật.
@app.middleware("http")
async def keep_cors_on_server_errors(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:  # noqa: BLE001
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Máy chủ gặp lỗi. Vui lòng thử lại sau."})

# Riêng 2 API này trả 400 (không phải 422) khi thiếu/sai kiểu dữ liệu, theo test case OTP_06 và INTEREST_05.
# Các API khác giữ nguyên 422 mặc định của FastAPI.
_BAD_REQUEST_ON_VALIDATION = {
    "/auth/verify-reset-otp": "Vui lòng nhập đầy đủ email/số điện thoại và mã OTP",
    "/users/me/categories": "Danh sách sở thích không hợp lệ (category_ids phải là mảng mã danh mục)",
}


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    message = _BAD_REQUEST_ON_VALIDATION.get(request.url.path)
    if message:
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": message})
    return await request_validation_exception_handler(request, exc)

cors_origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https://[a-zA-Z0-9-]+\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Retry-After"],  # trang quên mật khẩu đọc để đếm ngược nút gửi lại OTP
)

app.include_router(search.router)
app.include_router(auth.router)
app.include_router(operator.router)

# Customer
app.include_router(categories.router)
app.include_router(users.router)
app.include_router(business_requests.router)
app.include_router(activities.router)
app.include_router(reviews.router)
app.include_router(bookmarks.router)
app.include_router(reports.router)
app.include_router(complaints.router)
app.include_router(businesses.router)
app.include_router(media.router)
app.include_router(public_businesses.router)
app.include_router(groups.router)
app.include_router(ai.router)
app.include_router(notifications.router)

# Operator
app.include_router(categories.operator_router)
app.include_router(business_requests.operator_router)
app.include_router(activities.operator_router)
app.include_router(reports.operator_router)
app.include_router(complaints.operator_router)
app.include_router(operator_users.router)
app.include_router(action_logs.router)


@app.get("/")
def root():
    return {"message": "Free2Do API is running"}


@app.get("/health/live", tags=["health"])
def health_live():
    """Health check nhẹ cho Render; không phụ thuộc dịch vụ ngoài."""
    return {"status": "ok"}


@app.get("/health/ready", tags=["health"])
def health_ready():
    """Kiểm tra kết nối database và trạng thái cấu hình, không lộ secret."""
    postgis_enabled = False
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            if connection.dialect.name == "postgresql":
                postgis_enabled = bool(
                    connection.execute(
                        text("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')")
                    ).scalar()
                )
    except Exception as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Database chưa sẵn sàng") from exc
    try:
        schema_gaps = find_schema_gaps(engine)
    except Exception:  # noqa: BLE001
        schema_gaps = ["không đọc được schema"]
    return {
        "status": "ready",
        "database": "connected",
        # Danh sách bảng/cột còn thiếu trong database; [] nghĩa là schema đầy đủ.
        "schema": schema_gaps,
        "postgis_enabled": postgis_enabled,
        "supabase_storage_configured": bool(
            settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY
        ),
        "openai_configured": bool(settings.OPENAI_API_KEY.strip()),
        "smtp_configured": bool(
            settings.SMTP_USER.strip() and settings.SMTP_PASSWORD.strip()
        ),
        "email_provider": get_email_provider(),
        "email_provider_configured": bool(
            settings.GMAIL_API_CLIENT_ID.strip()
            and settings.GMAIL_API_CLIENT_SECRET.strip()
            and settings.GMAIL_API_REFRESH_TOKEN.strip()
            and (settings.GMAIL_SENDER_EMAIL.strip() or settings.SMTP_USER.strip())
        ) if get_email_provider() == "gmail_api" else bool(
            settings.SMTP_USER.strip() and settings.SMTP_PASSWORD.strip()
        ),
    }
