-- Free2Do: chi bo sung cot/index cho cac tinh nang moi; khong xoa bang hay du lieu.
-- Chay tren Supabase SQL Editor mot lan (cac lenh ADD COLUMN co the chay lai an toan).
BEGIN;

ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS business_code VARCHAR;
WITH base AS (
  SELECT COALESCE(MAX(substring(business_code FROM '^B([0-9]+)$')::INTEGER), 0) AS code_base
  FROM business_profiles
), missing AS (
  SELECT user_id, row_number() OVER (ORDER BY verified_at ASC NULLS LAST, user_id) AS row_num
  FROM business_profiles
  WHERE business_code IS NULL
), numbered AS (
  SELECT missing.user_id, 'B' || (base.code_base + missing.row_num)::TEXT AS business_code
  FROM missing CROSS JOIN base
)
UPDATE business_profiles AS profile
SET business_code = numbered.business_code
FROM numbered
WHERE profile.user_id = numbered.user_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_profiles_business_code
  ON business_profiles (business_code) WHERE business_code IS NOT NULL;

-- Dia chi tren ho so yeu cau doanh nghiep la tuy chon; dia chi dia diem nam tren activity.
ALTER TABLE business_profiles ALTER COLUMN business_address DROP NOT NULL;
ALTER TABLE business_requests ALTER COLUMN business_address DROP NOT NULL;

ALTER TABLE activities ADD COLUMN IF NOT EXISTS available_from TIMESTAMP;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS available_until TIMESTAMP;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS always_available BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE activities_media ADD COLUMN IF NOT EXISTS media_kind VARCHAR NOT NULL DEFAULT 'gallery';
UPDATE activities_media SET media_kind = 'gallery' WHERE media_kind IS NULL;
CREATE INDEX IF NOT EXISTS idx_activities_media_activity_kind
  ON activities_media (activity_id, media_kind);

ALTER TABLE groups ADD COLUMN IF NOT EXISTS search_started BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS is_ready BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS leave_requested_at TIMESTAMP;
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS leave_status VARCHAR NOT NULL DEFAULT 'none';
ALTER TABLE group_payments ADD COLUMN IF NOT EXISTS overdue_since TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_group_payments_overdue
  ON group_payments (status, overdue_since);

COMMIT;
