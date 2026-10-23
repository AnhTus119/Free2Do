from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
class Settings(BaseSettings):
    # Bắt buộc. Để trống (copy .env.example mà quên điền) thì dừng ngay: JWT key rỗng vẫn ký được token.
    DATABASE_URL: str = Field(min_length=1)
    JWT_SECRET_KEY: str = Field(min_length=1)
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 30                        # access token (mọi loại tài khoản), hết hạn thì dùng refresh token
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7                  # phiên đăng nhập của user (khách hàng/doanh nghiệp)
    OPERATOR_REFRESH_TOKEN_EXPIRE_MINUTES: int = 8 * 60  # phiên của Operator/admin, ngắn hơn vì là tài khoản quản trị
    LOGIN_MAX_FAILED: int = 5          # sai mật khẩu liên tiếp bao nhiêu lần thì khóa tạm
    LOGIN_LOCK_MINUTES: int = 10

    # Gửi email OTP
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    # Render Free chặn SMTP 25/465/587. Gmail API dùng HTTPS/443 trên production.
    EMAIL_PROVIDER: str = "auto"  # auto | gmail_api | smtp
    GMAIL_API_CLIENT_ID: str = ""
    GMAIL_API_CLIENT_SECRET: str = ""
    GMAIL_API_REFRESH_TOKEN: str = ""
    GMAIL_SENDER_EMAIL: str = ""
    # Sign in with Google
    GOOGLE_CLIENT_ID: str = ""
    # AI recommendations run server-side; never expose this key to the browser.
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-6-luna"
    OTP_EXPIRE_MINUTES: int = 10
    OTP_RESEND_SECONDS: int = 60       # mỗi email phải chờ giữa 2 lần gửi OTP
    OTP_MAX_PER_HOUR: int = 5          # tối đa số OTP gửi tới 1 email trong 1 giờ
    RESET_TOKEN_EXPIRE_MINUTES: int = 10
    # Supabase Storage dùng cùng Project URL và server-side secret/service key.
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""
    SUPABASE_STORAGE_BUCKET: str = "free2do-media"
    MAX_IMAGE_UPLOAD_MB: int = 5
    MAX_VIDEO_UPLOAD_MB: int = 25
    # Bật truy vấn không gian khi database đã chạy phần PostGIS trong migration.sql.
    # Nếu môi trường chưa có extension/cột location, backend tự dùng Haversine dự phòng.
    POSTGIS_EXTENSION_ENABLED: bool = True
    CORS_ORIGINS: str = "http://127.0.0.1:5500,http://localhost:5500,https://free2-do.vercel.app"
    model_config = SettingsConfigDict(env_file=ENV_PATH, extra="ignore")

settings = Settings()
