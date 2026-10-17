"""Chạy test không bao giờ gửi email/gọi AI thật.

backend/.env chứa credential Gmail/OpenAI thật; biến môi trường ưu tiên hơn .env nên xóa trống ở đây,
TRƯỚC khi test import app. Thiếu cấu hình thì gửi email lỗi và được bỏ qua (best-effort)."""
import os

os.environ.update({
    "EMAIL_PROVIDER": "smtp", "SMTP_USER": "", "SMTP_PASSWORD": "", "GMAIL_SENDER_EMAIL": "",
    "GMAIL_API_CLIENT_ID": "", "GMAIL_API_CLIENT_SECRET": "", "GMAIL_API_REFRESH_TOKEN": "",
    "OPENAI_API_KEY": "",
})
