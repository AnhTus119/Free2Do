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

## Thêm icon cho loại hoạt động mới

Ví dụ thêm icon cho hoạt động Karaoke:

1. Chép ảnh vào `frontend/img/map-icons/karaoke.jpg`.
2. Mở `frontend/js/customer-activity-icons.js`.
3. Thêm quy tắc vào đầu mảng `RULES`:

```js
{ icon: '../img/map-icons/karaoke.jpg', keywords: ['karaoke', 'hát karaoke'] },
```

4. Deploy lại frontend.

Từ khóa được so khớp không phân biệt chữ hoa/thường và dấu tiếng Việt. Hệ thống kiểm tra tên hoạt động, tên doanh nghiệp, mô tả, địa chỉ, ID danh mục và tên danh mục.

## Đổi từ khóa của icon hiện có

Ví dụ một hoạt động gaming có tên riêng không chứa chữ `gaming`, thêm tên đó vào quy tắc:

```js
{ icon: '../img/map-icons/gaming.jpg', keywords: ['tay cầm', 'gaming', 'tên hoạt động mới'] },
```

Quy tắc ở trên được ưu tiên hơn quy tắc ở dưới. Hoạt động không khớp quy tắc nào dùng marker mặc định. Ảnh bìa ở trang chủ và danh sách luôn lấy từ ảnh doanh nghiệp tải riêng khi tạo hoặc sửa hoạt động.
