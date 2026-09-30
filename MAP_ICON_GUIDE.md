# Cách thay hoặc bổ sung icon hoạt động trên bản đồ

Icon này chỉ dùng làm marker nhỏ trên bản đồ, không phải ảnh bìa hoạt động.

Icon được lưu tại:

`frontend/img/map-icons/`

Quy tắc chọn icon nằm trong:

`frontend/js/customer-activity-icons.js`

## Thay ảnh nhưng giữ nguyên loại hoạt động

Ví dụ muốn thay icon Bowling:

1. Chuẩn bị ảnh JPG hoặc PNG hình vuông.
2. Đặt tên ảnh là `bowling.jpg`.
3. Ghi đè file `frontend/img/map-icons/bowling.jpg`.
4. Deploy lại frontend lên Vercel.

Không cần sửa JavaScript nếu giữ nguyên tên file.

## Tự động chọn icon khi doanh nghiệp tạo hoạt động

Doanh nghiệp chọn một hoặc nhiều tags trong form tạo hoạt động. Backend lưu các tags vào bảng `activities_categories`. API tìm kiếm trả `category_names`, sau đó bản đồ tự chọn icon theo tên/mô tả hoạt động trước và tags trong database sau. Không cần Operator gắn icon cho từng hoạt động.

## Thêm icon cho loại hoạt động mới theo cách tự động

Ví dụ thêm icon cho hoạt động Karaoke:

1. Chép ảnh vào `frontend/img/map-icons/karaoke.jpg`.
2. Tạo tag `Karaoke` trong database hoặc qua API Operator.
3. Doanh nghiệp chọn tag `Karaoke` khi tạo hoạt động.
4. Deploy lại frontend. Hệ thống chuẩn hóa tên tag thành `karaoke` và tự tìm `karaoke.jpg`; không cần gắn icon thủ công cho từng hoạt động.

Tên file tự động là tên tag viết thường, bỏ dấu và thay khoảng trắng bằng dấu gạch ngang. Ví dụ:

- `Cà phê` → `ca-phe.jpg`
- `Gội đầu` → `goi-dau.jpg`
- `Thể thao` → `the-thao.jpg`

Nếu tên file không giống slug của tag hoặc một icon cần dùng cho nhiều từ khóa, mở `frontend/js/customer-activity-icons.js`, thêm file vào `ICONS`:

```js
'karaoke': '../img/map-icons/karaoke.jpg',
```

Sau đó thêm quy tắc vào mảng `RULES`:

```js
{ key: 'karaoke', keywords: ['karaoke', 'hát karaoke'] },
```

Nếu file tự động chưa tồn tại, bản đồ dùng marker mặc định thay vì hiện ảnh lỗi.

Từ khóa được so khớp không phân biệt chữ hoa/thường và dấu tiếng Việt. Hệ thống ưu tiên tên, doanh nghiệp và mô tả hoạt động; nếu chưa khớp thì kiểm tra tags lấy từ database.

## Đổi từ khóa của icon hiện có

Ví dụ một hoạt động gaming có tên riêng không chứa chữ `gaming`, thêm tên đó vào quy tắc:

```js
{ key: 'game', keywords: ['game', 'gaming', 'tên hoạt động mới'] },
```

Quy tắc ở trên được ưu tiên hơn quy tắc ở dưới. Hoạt động không khớp quy tắc nào dùng marker mặc định. Ảnh bìa ở trang chủ và danh sách luôn lấy từ ảnh doanh nghiệp tải riêng khi tạo hoặc sửa hoạt động.

## Zoom bản đồ

- Máy tính: đặt chuột trên bản đồ và cuộn để zoom, nhấp đúp để zoom vào.
- Điện thoại: dùng hai ngón tay chụm/mở để zoom.
- Zoom chỉ thay đổi mức nhìn; tọa độ marker vẫn lấy từ latitude/longitude trong database.
