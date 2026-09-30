from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24        # 1 ngày -- token của user (khách hàng/doanh nghiệp)
    OPERATOR_TOKEN_EXPIRE_MINUTES: int = 180  # 3 tiếng -- token của Operator/admin, ngắn hơn vì là tài khoản quản trị

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
    OTP_EXPIRE_MINUTES: int = 10
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
