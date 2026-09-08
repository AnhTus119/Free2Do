-- Chạy 1 lần trong Supabase SQL Editor (Database > SQL Editor) TRƯỚC khi deploy code mới.
-- Bảng operators trên Supabase hiện chưa có level/status/created_at, cần bổ sung 3 cột này.

ALTER TABLE operators
  ADD COLUMN IF NOT EXISTS level VARCHAR NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now();

-- Nếu bạn đã seed sẵn 1 operator mẫu qua seed_db.py và muốn operator đó là admin cấp cao,
-- chạy thêm (thay email cho đúng):
-- UPDATE operators SET level = 'admin'
-- WHERE account_id = (SELECT account_id FROM accounts WHERE email = 'email_operator_mau@...');
