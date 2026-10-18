-- Chạy 1 lần trong Supabase SQL Editor (Database > SQL Editor) TRƯỚC khi deploy code mới.
-- Bảng operators trên Supabase hiện chưa có level/status/created_at, cần bổ sung 3 cột này.

-- ===== Các bảng của tính năng Nhóm (chạy lại nhiều lần vẫn an toàn) =====

CREATE TABLE IF NOT EXISTS groups (
  group_id VARCHAR NOT NULL, 
  invite_code VARCHAR NOT NULL, 
  group_name VARCHAR(60), 
  host_user_id VARCHAR NOT NULL, 
  selected_activity_id VARCHAR, 
  status VARCHAR NOT NULL, 
  search_started BOOLEAN NOT NULL, 
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
  PRIMARY KEY (group_id), 
  FOREIGN KEY(host_user_id) REFERENCES users (user_id) ON DELETE CASCADE, 
  FOREIGN KEY(selected_activity_id) REFERENCES activities (activity_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_groups_host_user_id ON groups (host_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS ix_groups_invite_code ON groups (invite_code);

CREATE TABLE IF NOT EXISTS group_members (
  member_id VARCHAR NOT NULL, 
  group_id VARCHAR NOT NULL, 
  user_id VARCHAR, 
  name VARCHAR NOT NULL, 
  free_hours FLOAT NOT NULL, 
  address VARCHAR NOT NULL, 
  budget FLOAT NOT NULL, 
  category_ids_json TEXT NOT NULL, 
  is_host BOOLEAN NOT NULL, 
  is_ready BOOLEAN NOT NULL, 
  leave_requested_at TIMESTAMP WITHOUT TIME ZONE, 
  leave_status VARCHAR NOT NULL, 
  joined_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
  PRIMARY KEY (member_id), 
  CONSTRAINT uq_group_member_user UNIQUE (group_id, user_id), 
  FOREIGN KEY(group_id) REFERENCES groups (group_id) ON DELETE CASCADE, 
  FOREIGN KEY(user_id) REFERENCES users (user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_group_members_group_id ON group_members (group_id);

CREATE INDEX IF NOT EXISTS ix_group_members_user_id ON group_members (user_id);

CREATE TABLE IF NOT EXISTS group_activity_votes (
  vote_id VARCHAR NOT NULL, 
  group_id VARCHAR NOT NULL, 
  member_id VARCHAR NOT NULL, 
  activity_id VARCHAR NOT NULL, 
  confirmation_status VARCHAR NOT NULL, 
  PRIMARY KEY (vote_id), 
  CONSTRAINT uq_group_activity_vote_member UNIQUE (group_id, member_id), 
  FOREIGN KEY(group_id) REFERENCES groups (group_id) ON DELETE CASCADE, 
  FOREIGN KEY(member_id) REFERENCES group_members (member_id) ON DELETE CASCADE, 
  FOREIGN KEY(activity_id) REFERENCES activities (activity_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_group_activity_votes_group_id ON group_activity_votes (group_id);

CREATE INDEX IF NOT EXISTS ix_group_activity_votes_member_id ON group_activity_votes (member_id);

CREATE TABLE IF NOT EXISTS group_payments (
  payment_id VARCHAR NOT NULL, 
  group_id VARCHAR NOT NULL, 
  member_id VARCHAR NOT NULL, 
  amount FLOAT NOT NULL, 
  status VARCHAR NOT NULL, 
  reminded_at TIMESTAMP WITHOUT TIME ZONE, 
  overdue_since TIMESTAMP WITHOUT TIME ZONE, 
  paid_at TIMESTAMP WITHOUT TIME ZONE, 
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
  PRIMARY KEY (payment_id), 
  FOREIGN KEY(group_id) REFERENCES groups (group_id) ON DELETE CASCADE, 
  UNIQUE (member_id), 
  FOREIGN KEY(member_id) REFERENCES group_members (member_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_group_payments_group_id ON group_payments (group_id);

-- Nếu bảng groups đã tồn tại từ trước (bản cũ) thì bổ sung cột tên nhóm:
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS group_name VARCHAR(60);

-- Một tài khoản có thể đăng nhập bằng email, số điện thoại hoặc cả hai.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS phone VARCHAR,
  ADD COLUMN IF NOT EXISTS recovery_email VARCHAR,
  ALTER COLUMN email DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_phone
  ON accounts(phone) WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_recovery_email
  ON accounts(lower(recovery_email)) WHERE recovery_email IS NOT NULL;

-- Tài khoản email/Google dùng chính email đăng nhập để khôi phục mật khẩu.
-- Phone account vẫn phải xác minh một email khôi phục riêng.
UPDATE accounts
SET recovery_email = lower(email)
WHERE recovery_email IS NULL
  AND auth_provider <> 'phone'
  AND email IS NOT NULL
  AND email NOT LIKE '%@seed.free2do.local';

ALTER TABLE operators
  ADD COLUMN IF NOT EXISTS level VARCHAR NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now();

-- Dữ liệu nguồn có hoạt động chưa cung cấp tọa độ và có giá dạng khoảng.
-- Giữ nguyên dữ liệu thiếu thay vì ghi tọa độ giả; price lưu mức trần để lọc ngân sách,
-- price_text giữ nguyên chuỗi hiển thị trong file nguồn.
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS price_text VARCHAR,
  ADD COLUMN IF NOT EXISTS source_url VARCHAR,
  ADD COLUMN IF NOT EXISTS google_maps_url VARCHAR,
  ALTER COLUMN latitude DROP NOT NULL,
  ALTER COLUMN longitude DROP NOT NULL;

-- PostGIS lọc theo bán kính ngay trong PostgreSQL. latitude/longitude vẫn được
-- giữ để tương thích API; trigger đồng bộ sang geography(Point, 4326).
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS location extensions.geography(Point, 4326);

UPDATE activities
SET location = extensions.ST_SetSRID(
  extensions.ST_MakePoint(longitude, latitude), 4326
)::extensions.geography
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_activity_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.location := CASE
    WHEN NEW.latitude IS NULL OR NEW.longitude IS NULL THEN NULL
    ELSE extensions.ST_SetSRID(
      extensions.ST_MakePoint(NEW.longitude, NEW.latitude), 4326
    )::extensions.geography
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_activity_location ON activities;
CREATE TRIGGER trg_sync_activity_location
BEFORE INSERT OR UPDATE OF latitude, longitude ON activities
FOR EACH ROW EXECUTE FUNCTION public.sync_activity_location();

CREATE INDEX IF NOT EXISTS idx_activities_location_gist
  ON activities USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
CREATE INDEX IF NOT EXISTS idx_activities_business_id ON activities(business_id);
CREATE INDEX IF NOT EXISTS idx_reviews_activity_id ON reviews(activity_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);

-- Hồ sơ và metadata Storage. public_id lưu object path để backend có thể xóa tài sản
-- khi người dùng thay ảnh, tránh file mồ côi làm tăng dung lượng.
ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS avatar_url VARCHAR,
  ADD COLUMN IF NOT EXISTS avatar_public_id VARCHAR;

ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS avatar_public_id VARCHAR;

ALTER TABLE activities_media
  ADD COLUMN IF NOT EXISTS public_id VARCHAR,
  ADD COLUMN IF NOT EXISTS bytes INTEGER,
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER;

ALTER TABLE review_media
  ADD COLUMN IF NOT EXISTS public_id VARCHAR,
  ADD COLUMN IF NOT EXISTS bytes INTEGER;

CREATE TABLE IF NOT EXISTS business_media (
  media_id VARCHAR PRIMARY KEY,
  business_id VARCHAR NOT NULL REFERENCES business_profiles(user_id) ON DELETE CASCADE,
  media_url VARCHAR NOT NULL,
  public_id VARCHAR NOT NULL,
  media_type VARCHAR NOT NULL DEFAULT 'image',
  media_kind VARCHAR NOT NULL,
  bytes INTEGER,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS review_replies (
  reply_id VARCHAR PRIMARY KEY,
  review_id VARCHAR NOT NULL UNIQUE REFERENCES reviews(review_id) ON DELETE CASCADE,
  business_id VARCHAR NOT NULL REFERENCES business_profiles(user_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS review_reply_media (
  media_id VARCHAR PRIMARY KEY,
  reply_id VARCHAR NOT NULL REFERENCES review_replies(reply_id) ON DELETE CASCADE,
  media_url VARCHAR NOT NULL,
  public_id VARCHAR NOT NULL,
  media_type VARCHAR NOT NULL,
  bytes INTEGER,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS avatar_presets (
  preset_id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  media_url VARCHAR NOT NULL,
  public_id VARCHAR NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_business_media_business_kind
  ON business_media(business_id, media_kind);
CREATE INDEX IF NOT EXISTS idx_review_replies_business_id
  ON review_replies(business_id);

-- Nếu bạn đã seed sẵn 1 operator mẫu qua seed_db.py và muốn operator đó là admin cấp cao,
-- chạy thêm (thay email cho đúng):
-- UPDATE operators SET level = 'admin'
-- WHERE account_id = (SELECT account_id FROM accounts WHERE email = 'email_operator_mau@...');

-- ===== Cập nhật 2026-10-15 (backend cũng tự bổ sung khi khởi động; chạy lại nhiều lần vẫn an toàn) =====

ALTER TABLE operators ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS voting_closed_at TIMESTAMP;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS random_pick_activity_id VARCHAR;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS random_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS final_method VARCHAR;

CREATE TABLE IF NOT EXISTS user_interests (
  interest_id VARCHAR NOT NULL, 
  user_id VARCHAR NOT NULL, 
  label VARCHAR NOT NULL, 
  label_key VARCHAR NOT NULL, 
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
  PRIMARY KEY (interest_id), 
  CONSTRAINT uq_user_interests_user_label UNIQUE (user_id, label_key), 
  FOREIGN KEY(user_id) REFERENCES users (user_id)
);
CREATE INDEX IF NOT EXISTS ix_user_interests_user_id ON user_interests (user_id);

CREATE TABLE IF NOT EXISTS group_activity_ballots (
  ballot_id VARCHAR NOT NULL, 
  group_id VARCHAR NOT NULL, 
  member_id VARCHAR NOT NULL, 
  activity_id VARCHAR NOT NULL, 
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
  PRIMARY KEY (ballot_id), 
  CONSTRAINT uq_group_ballot_member_activity UNIQUE (member_id, activity_id), 
  FOREIGN KEY(group_id) REFERENCES groups (group_id) ON DELETE CASCADE, 
  FOREIGN KEY(member_id) REFERENCES group_members (member_id) ON DELETE CASCADE, 
  FOREIGN KEY(activity_id) REFERENCES activities (activity_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_group_activity_ballots_group_id ON group_activity_ballots (group_id);
CREATE INDEX IF NOT EXISTS ix_group_activity_ballots_member_id ON group_activity_ballots (member_id);

-- Chuyển phiếu của các nhóm đang bình chọn dở (bản cũ: 1 phiếu/người) sang bảng phiếu mới.
INSERT INTO group_activity_ballots (ballot_id, group_id, member_id, activity_id, created_at)
SELECT gen_random_uuid()::text, v.group_id, v.member_id, v.activity_id, NOW()
FROM group_activity_votes v JOIN groups g ON g.group_id = v.group_id
WHERE g.selected_activity_id IS NULL
ON CONFLICT DO NOTHING;

-- ===== Cập nhật 2026-10-18 (backend cũng tự bổ sung khi khởi động; chạy lại nhiều lần vẫn an toàn) =====
-- Tài khoản tạo bằng backend/bootstrap_admin.py phải đổi mật khẩu ở lần đăng nhập đầu tiên.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
