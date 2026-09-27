# Gửi OTP bằng Gmail API trên Render Free

Render Free chặn outbound SMTP ở các cổng 25, 465 và 587. Vì vậy `smtp.gmail.com:587` chạy được trên máy cá nhân nhưng sẽ timeout trên Render Free. Bản code này giữ SMTP cho local/gói Render trả phí và dùng Gmail API qua HTTPS/443 trên Render Free.

## 1. Chuẩn bị Google Cloud

1. Mở `https://console.cloud.google.com/` và chọn project Google đang dùng cho Free2Do.
2. Vào **APIs & Services → Library**, tìm **Gmail API**, chọn **Enable**.
3. Vào **OAuth consent screen**, cấu hình ứng dụng và thêm Gmail gửi OTP làm test user nếu ứng dụng còn ở chế độ Testing.
4. Vào **Credentials → Create credentials → OAuth client ID**.
5. Có thể dùng OAuth client hiện tại nếu bạn có cả Client ID và Client Secret; không dùng App Password cho Gmail API.

## 2. Lấy Refresh Token

1. Mở `https://developers.google.com/oauthplayground/`.
2. Bấm biểu tượng bánh răng, bật **Use your own OAuth credentials**.
3. Điền OAuth Client ID và Client Secret.
4. Ở danh sách scope, chọn Gmail API scope:

   `https://www.googleapis.com/auth/gmail.send`

5. Chọn **Authorize APIs**, đăng nhập đúng Gmail gửi OTP và chấp nhận quyền.
6. Chọn **Exchange authorization code for tokens**.
7. Sao chép `Refresh token`.

## 3. Environment trên Render

Thêm hoặc cập nhật:

```text
EMAIL_PROVIDER=gmail_api
GMAIL_API_CLIENT_ID=OAuth-client-id
GMAIL_API_CLIENT_SECRET=OAuth-client-secret
GMAIL_API_REFRESH_TOKEN=refresh-token
GMAIL_SENDER_EMAIL=email-gui-otp@gmail.com
```

Giữ `SMTP_*` nếu muốn test local, nhưng Render Free sẽ không sử dụng chúng khi `EMAIL_PROVIDER=gmail_api`.

Sau khi lưu Environment, chọn **Manual Deploy → Deploy latest commit**.

## 4. Kiểm tra

Mở `https://free2do.onrender.com/health/ready`. Kết quả cần có:

```json
"email_provider": "gmail_api",
"email_provider_configured": true
```

Trong local hoặc Render Shell, lệnh sau chỉ kiểm tra OAuth và không gửi thư nếu không truyền email:

```powershell
python test_email.py
```

Gửi một email OTP thử:

```powershell
python test_email.py email-nhan@gmail.com
```

Không commit Client Secret hoặc Refresh Token lên GitHub.
