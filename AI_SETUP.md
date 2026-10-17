# FREE2DO AI

Trợ lý AI có ở mọi trang customer (nút "✨ Hỏi FREE2DO AI" kéo thả được, hút về cạnh trái/phải, kéo quá mép thì thu thành tab mũi tên).

## Cách hoạt động (hybrid, gần như không tốn token)

1. **Bộ phân tích local** (`backend/app/routers/ai.py` → `parse_message`) đọc câu tiếng Việt, không gọi mạng:
   - khu vực: "khu vực Hai Bà Trưng", "ở Cầu Giấy", "phố Huế"… → tra tọa độ bằng cùng dịch vụ bản đồ của trang tìm kiếm; không nhắc khu vực thì dùng vị trí đang chọn ở trang chủ;
   - ngân sách: "dưới 200k", "150.000đ", "1tr5", "miễn phí"; thời gian rảnh: "2 tiếng rưỡi", "90 phút"; bán kính "3km";
   - ngày/buổi: "tối nay", "ngày mai", "cuối tuần";
   - thời tiết người dùng nói: mưa/lạnh/nóng → ưu tiên trong nhà, bỏ chỗ chỉ ngoài trời; nắng đẹp → ưu tiên ngoài trời, chụp ảnh, thuê máy ảnh;
   - ngữ cảnh → tag: hẹn hò, gia đình, hội bạn, karaoke, bida, học bài, spa…
   Trong/ngoài trời suy từ tag (Trong nhà: Cà phê, Xem phim, Workshop, Billiard, Ca hát, Game, Làm đẹp, Mua sắm, Làm việc; Ngoài trời: Thể thao, Tham quan, Chụp ảnh).
2. Tìm thẳng trong database bằng đúng logic `POST /search`. Không có kết quả thì tự nới bán kính 5 → 10 → 20 km rồi bỏ tag; **ngân sách luôn giữ cứng**.
3. Câu trả lời dựng bằng template từ dữ liệu thật: tóm tắt, các "chip" điều kiện đã hiểu, thẻ hoạt động có ảnh + lý do phù hợp; trang chủ và trang tìm kiếm ghim kết quả lên bản đồ.
4. **Chỉ khi bộ local không hiểu gì** mới gọi OpenAI một lượt ngắn (~200 token) để trích ý định. Không có key thì vẫn chạy bình thường (gợi ý theo vị trí/bộ lọc hiện tại).

## Cấu hình (tùy chọn)

```env
OPENAI_API_KEY=your-api-key   # để trống = chạy 100% local
OPENAI_MODEL=gpt-6-luna       # đặt đúng tên model trong tài khoản OpenAI của bạn
```

Đặt key ở biến môi trường backend (Render → Environment), không đưa vào frontend. Không cần migration riêng cho AI.
