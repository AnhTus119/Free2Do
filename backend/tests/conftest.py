"""Chạy test không bao giờ gửi email/gọi AI thật và không chạm database thật.

backend/.env chứa credential thật; biến môi trường ưu tiên hơn .env nên ghi đè ở đây,
TRƯỚC khi test import app. Test tự tạo SQLite riêng; DATABASE_URL giả chỉ để app import được
(kể cả khi clone mới chưa có .env). Thiếu cấu hình thì gửi email lỗi và được bỏ qua (best-effort)."""
import os

os.environ.update({
    "DATABASE_URL": "postgresql://test:test@127.0.0.1:1/free2do_test", "JWT_SECRET_KEY": "test-only-secret",
    "EMAIL_PROVIDER": "smtp", "SMTP_USER": "", "SMTP_PASSWORD": "", "GMAIL_SENDER_EMAIL": "",
    "GMAIL_API_CLIENT_ID": "", "GMAIL_API_CLIENT_SECRET": "", "GMAIL_API_REFRESH_TOKEN": "",
    "OPENAI_API_KEY": "",
})
