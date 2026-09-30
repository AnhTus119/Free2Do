# Gửi OTP bằng Gmail API trên Render Free

Render Free chặn outbound SMTP ở các cổng 25, 465 và 587. Vì vậy `smtp.gmail.com:587` chạy được trên máy cá nhân nhưng sẽ timeout trên Render Free. Bản code này giữ SMTP cho local/gói Render trả phí và dùng Gmail API qua HTTPS/443 trên Render Free.

## 1. Chuẩn bị Google Cloud

1. Mở `https://console.cloud.google.com/` và chọn project Google đang dùng cho Free2Do.
2. Vào **APIs & Services → Library**, tìm **Gmail API**, chọn **Enable**.
3. Vào **OAuth consent screen**, cấu hình ứng dụng và thêm Gmail gửi OTP làm test user nếu ứng dụng còn ở chế độ Testing.
4. Vào **Credentials → Create credentials → OAuth client ID**.
5. Có thể dùng OAuth client hiện tại nếu bạn có cả Client ID và Client Secret; không dùng App Password cho Gmail API.

## 2. Lấy Refresh Token

Trước khi tạo token dùng lâu dài, vào **Google Auth Platform → Audience** và bảo đảm **Publishing status** là **In production**. Token được tạo khi ứng dụng còn ở **Testing** sẽ hết hạn sau 7 ngày.

1. Mở `https://developers.google.com/oauthplayground/`.
2. Bấm biểu tượng bánh răng ở góc phải.
3. Bật **Use your own OAuth credentials**.
4. Điền đúng OAuth Client ID và OAuth Client Secret của project Free2Do, rồi đóng bảng cài đặt.
5. Ở cột **Step 1**, nhập scope sau vào ô **Input your own scopes**:

   `https://www.googleapis.com/auth/gmail.send`

6. Bấm **Authorize APIs**, đăng nhập đúng Gmail dùng để gửi OTP và chấp nhận quyền.
7. Ở **Step 2**, bấm **Exchange authorization code for tokens**.
8. Sao chép giá trị **Refresh token**; không sao chép Access token vì Access token chỉ có thời hạn ngắn.

Nếu Google không trả về Refresh token, mở `https://myaccount.google.com/permissions`, thu hồi quyền của ứng dụng Free2Do rồi thực hiện lại các bước trên. Việc này chỉ cần làm khi token cũ bị mất hoặc bị thu hồi, không phải làm định kỳ hàng tuần khi ứng dụng đã ở In production.

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

Khi chỉ thay biến môi trường trên Render:

1. Mở service **Free2Do → Environment**.
2. Tìm `GMAIL_API_REFRESH_TOKEN`, thay toàn bộ giá trị cũ bằng Refresh token mới.
3. Kiểm tra `GMAIL_API_CLIENT_ID`, `GMAIL_API_CLIENT_SECRET` và `GMAIL_SENDER_EMAIL` thuộc cùng tài khoản/project đã cấp token.
4. Bấm **Save Changes**. Render sẽ redeploy service; nếu không tự chạy, chọn **Manual Deploy → Deploy latest commit**.

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
