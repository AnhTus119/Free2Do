-- Chạy 1 lần trong Supabase SQL Editor (Database > SQL Editor) TRƯỚC khi deploy code mới.
-- Bảng operators trên Supabase hiện chưa có level/status/created_at, cần bổ sung 3 cột này.

-- Một tài khoản có thể đăng nhập bằng email, số điện thoại hoặc cả hai.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS phone VARCHAR,
  ADD COLUMN IF NOT EXISTS recovery_email VARCHAR,
  ALTER COLUMN email DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_phone
  ON accounts(phone) WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_recovery_email
  ON accounts(lower(recovery_email)) WHERE recovery_email IS NOT NULL;

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
