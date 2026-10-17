-- Chạy 1 lần trong Supabase SQL Editor (Database > SQL Editor) TRƯỚC khi deploy code mới.
-- Chạy lại nhiều lần vẫn an toàn.

BEGIN;

-- 1. Cột mới (backend cũng tự thêm khi khởi động, chạy trước ở đây để bước 2 dùng được).
ALTER TABLE users ADD COLUMN IF NOT EXISTS code VARCHAR;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 2. Mã khách hàng C1, C2, C3... theo thứ tự đăng ký (khóa chính user_id giữ nguyên).
WITH numbered AS (
  SELECT u.user_id,
         ROW_NUMBER() OVER (ORDER BY a.created_at, u.user_id)
           + COALESCE((SELECT MAX(CAST(SUBSTRING(code FROM 2) AS INTEGER)) FROM users WHERE code ~ '^C[0-9]+$'), 0) AS n
  FROM users u
  JOIN accounts a ON a.account_id = u.account_id
  WHERE u.code IS NULL
)
UPDATE users SET code = 'C' || numbered.n
FROM numbered
WHERE users.user_id = numbered.user_id;

CREATE UNIQUE INDEX IF NOT EXISTS ix_users_code ON users (code);

-- Người dùng đăng ký sau này lấy mã tiếp theo từ sequence (app/models.py: next_user_code).
CREATE SEQUENCE IF NOT EXISTS user_code_seq;
SELECT setval(
  'user_code_seq',
  COALESCE((SELECT MAX(CAST(SUBSTRING(code FROM 2) AS INTEGER)) FROM users WHERE code ~ '^C[0-9]+$'), 0) + 1,
  false
);

-- 3. Mọi hoạt động hiện có ngày đóng bán -> mở vĩnh viễn (không bao giờ đóng).
--    Operator và doanh nghiệp vẫn đặt lại ngày đóng được trong form sửa như trước.
UPDATE activities
SET always_available = TRUE,
    available_until = NULL
WHERE always_available IS DISTINCT FROM TRUE
   OR available_until IS NOT NULL;

-- 4. Hoạt động đang chờ duyệt chưa có hạn: tính 30 ngày kể từ hôm nay
--    (tránh hàng loạt hoạt động cũ hết hạn và gửi email ngay sau khi deploy).
UPDATE activities
SET expire_at = NOW() AT TIME ZONE 'UTC' + INTERVAL '30 days'
WHERE status = 'pending'
  AND expire_at IS NULL;

COMMIT;
