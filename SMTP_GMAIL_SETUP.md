# Cấu hình Gmail SMTP để Free2Do gửi OTP

Free2Do dùng Gmail SMTP cho cả hai luồng:

- Quên mật khẩu.
- Xác minh email khôi phục của tài khoản đăng nhập bằng số điện thoại.

Hai luồng cùng lỗi thường có nghĩa là cấu hình SMTP trên Render sai hoặc App Password đã bị Google thu hồi.

## 1. Tạo Gmail App Password mới

1. Đăng nhập đúng tài khoản Gmail sẽ dùng để gửi OTP.
2. Mở `https://myaccount.google.com/security`.
3. Bật **Xác minh 2 bước** (2-Step Verification). App Password chỉ xuất hiện sau khi bật tính năng này.
4. Mở `https://myaccount.google.com/apppasswords`.
5. Nhập tên ứng dụng, ví dụ `Free2Do Render`, rồi chọn **Create/Tạo**.
6. Sao chép ngay mã 16 ký tự. Google chỉ hiển thị mã này một lần.

Nếu không thấy mục App Password, nguyên nhân thường là tài khoản trường học/công ty bị quản trị viên chặn, tài khoản chỉ dùng security key cho 2-Step Verification, hoặc đang bật Advanced Protection.

Nếu đã đổi mật khẩu Google, hãy tạo App Password mới vì Google có thể thu hồi các App Password cũ.

## 2. Điền Environment trên Render

Mở Render Dashboard → service `Free2Do` → **Environment**, rồi đặt:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=dia-chi-gmail-day-du@gmail.com
SMTP_PASSWORD=ma-app-password-16-ky-tu
```

Lưu ý:

- `SMTP_USER` phải là đúng Gmail đã tạo App Password.
- `SMTP_PASSWORD` không phải mật khẩu đăng nhập Gmail thông thường.
- Không thêm dấu nháy `"` hoặc `'`.
- Code chấp nhận cả mã có khoảng trắng, nhưng nên dán liền 16 ký tự.
- Không đưa các giá trị thật vào GitHub hoặc file ZIP.

Sau khi lưu, chọn deploy commit mới nhất hoặc **Manual Deploy → Deploy latest commit**.

## 3. Kiểm tra

Mở:

```text
https://free2do.onrender.com/health/ready
```

Kết quả phải có:

```json
"smtp_configured": true
```

Trường này chỉ xác nhận Render đã nhận biến. Để xác nhận App Password thật sự hợp lệ, chạy trong thư mục `backend`:

```powershell
python test_email.py
```

Lệnh trên chỉ đăng nhập SMTP, không gửi thư. Để gửi một email test có mã `123456`:

```powershell
python test_email.py email-nhan@gmail.com
```

Nếu không có Render Shell, thử chức năng quên mật khẩu rồi xem **Render → Logs**. Bản code mới phân biệt lỗi thiếu biến, Gmail từ chối App Password và lỗi kết nối.

## 4. Lưu ý khi thử quên mật khẩu

- Với tài khoản đăng ký bằng email: nhập đúng email dùng để đăng ký.
- Với tài khoản đăng ký bằng số điện thoại: nhập số điện thoại; tài khoản phải xác minh email khôi phục trước đó.
- API quên mật khẩu luôn trả thông báo chung nếu tài khoản không tồn tại nhằm tránh làm lộ danh sách tài khoản. Vì vậy nhập sai email/số điện thoại sẽ không có OTP nhưng có thể vẫn thấy thông báo đã xử lý.
- Kiểm tra cả Spam/Thư rác và chờ một vài phút trước khi yêu cầu mã mới.
