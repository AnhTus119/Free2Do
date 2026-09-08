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
    SMTP_USER: str
    SMTP_PASSWORD: str

    # Sign in with Google
    GOOGLE_CLIENT_ID: str
    OTP_EXPIRE_MINUTES: int = 10
    RESET_TOKEN_EXPIRE_MINUTES: int = 10
    model_config = SettingsConfigDict(env_file=ENV_PATH, extra="ignore")

settings = Settings()