# Free2Do — ghi chú merge Customer và OTP

## Đã hoàn thành

- Giữ nguyên xác thực bằng email hoặc số điện thoại, phân quyền Customer/Business/Operator và Supabase Storage/PostGIS của nhánh hiện tại.
- Chuẩn hóa Gmail App Password khi có dấu cách hoặc dấu nháy; thêm log lỗi SMTP an toàn và trạng thái `smtp_configured` tại `GET /health/ready`.
- Khai báo các biến bí mật cần nhập trên Render trong `render.yaml`.
- Thêm `PATCH /users/me` để Customer sửa họ tên và số điện thoại hồ sơ.
- Kiểm tra, loại trùng và từ chối category không tồn tại khi cập nhật sở thích.
- Kết nối trang tài khoản, lịch sử tìm kiếm, yêu thích, avatar, yêu cầu trở thành Business, chi tiết hoạt động và chi tiết doanh nghiệp với API thật.
- Thêm timeout và thông báo lỗi rõ ràng cho các request Customer.

## Cấu hình OTP trên Render

Render phải có đúng bốn biến sau (không thêm dấu nháy):

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=dia-chi-gmail-cua-ban@gmail.com
SMTP_PASSWORD=mat-khau-ung-dung-16-ky-tu
```

`SMTP_PASSWORD` là App Password do Google tạo, không phải mật khẩu Gmail thông thường. Sau khi deploy, mở `/health/ready`; trường `smtp_configured` phải là `true`. Nếu gửi vẫn lỗi, xem Render Logs để biết lỗi Gmail trả về. Code không ghi mật khẩu hoặc mã OTP vào log.

## Tính năng nhóm

`frontend/Demo Trang Customer/group.html` hiện chỉ là demo phía trình duyệt. Chưa có bảng nhóm/thành viên, API tạo nhóm, link mời có hiệu lực, phân quyền thành viên hoặc dữ liệu thanh toán trong backend/database. Vì vậy phần này chưa được đánh dấu hoàn thành và được để lại cho giai đoạn sau theo yêu cầu.

## Kiểm thử

- 21 bài kiểm thử backend/API/frontend contract đã chạy thành công.
- Toàn bộ JavaScript trong `frontend/js` đã qua kiểm tra cú pháp.
- Đăng nhập Gmail SMTP bằng cấu hình local thành công; bài kiểm tra không gửi email.
