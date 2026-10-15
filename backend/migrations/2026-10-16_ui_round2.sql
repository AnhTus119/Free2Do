-- =====================================================================================
-- Free2Do: UI round 2 (2026-10-16)
-- Chạy TOÀN BỘ file trong Supabase SQL Editor TRƯỚC khi deploy backend mới.
-- Chạy lại nhiều lần vẫn an toàn (idempotent). Không xóa dữ liệu thật.
--
-- Vì sao phải chạy trước khi deploy: backend mới cấp mã hoạt động bằng
-- nextval('activity_code_seq'); nếu sequence chưa có thì tạo hoạt động mới sẽ lỗi.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- 1. Mã hoạt động hiển thị A{n} (2.1)
--    Khóa chính activities.activity_id và mọi khóa ngoại giữ nguyên.
-- -------------------------------------------------------------------------------------
ALTER TABLE activities ADD COLUMN IF NOT EXISTS code VARCHAR;

CREATE SEQUENCE IF NOT EXISTS activity_code_seq START WITH 1 MINVALUE 1;

-- Đánh mã cho các hoạt động chưa có mã, theo created_at (tie-break theo activity_id),
-- nối tiếp sau mã lớn nhất đang có. Lần chạy lại không đổi mã đã cấp.
WITH base AS (
  SELECT GREATEST(
           COALESCE((SELECT max(substring(code FROM 2)::bigint) FROM activities WHERE code ~ '^A[0-9]+$'), 0),
           (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM activity_code_seq)
         ) AS start_at
), numbered AS (
  SELECT activity_id,
         row_number() OVER (ORDER BY created_at, activity_id) AS rn
  FROM activities
  WHERE code IS NULL
)
UPDATE activities a
SET code = 'A' || (base.start_at + numbered.rn)
FROM numbered, base
WHERE a.activity_id = numbered.activity_id;

-- Sequence bắt đầu sau mã lớn nhất; không bao giờ lùi (mã đã xóa không bị dùng lại).
SELECT setval(
  'activity_code_seq',
  GREATEST(
    COALESCE((SELECT max(substring(code FROM 2)::bigint) FROM activities WHERE code ~ '^A[0-9]+$'), 0),
    (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM activity_code_seq),
    1
  ),
  (SELECT count(*) > 0 FROM activities)  -- bảng rỗng: lần nextval đầu tiên trả về 1
);

ALTER TABLE activities ALTER COLUMN code SET DEFAULT ('A' || nextval('activity_code_seq'));
ALTER SEQUENCE activity_code_seq OWNED BY activities.code;
ALTER TABLE activities ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ix_activities_code ON activities (code);

-- -------------------------------------------------------------------------------------
-- 2. Ảnh minh chứng của đơn đăng ký doanh nghiệp, tách khỏi activities_media (2.2)
--    File nằm ở thư mục business-proofs/{request_id}/ trong bucket Storage.
--    Không có dữ liệu cũ cần tách: trước bản này luồng đăng ký chưa hề nhận file minh chứng.
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_request_proofs (
  proof_id   VARCHAR PRIMARY KEY,
  request_id VARCHAR NOT NULL REFERENCES business_requests (request_id) ON DELETE CASCADE,
  media_url  VARCHAR NOT NULL,
  public_id  VARCHAR NOT NULL,
  bytes      INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_business_request_proofs_request_id ON business_request_proofs (request_id);

-- -------------------------------------------------------------------------------------
-- 3. Nhãn vị trí trong lịch sử tìm kiếm (3.4). Bản ghi cũ để NULL, giao diện hiện "Vị trí đã chọn".
-- -------------------------------------------------------------------------------------
ALTER TABLE search_history ADD COLUMN IF NOT EXISTS location_label VARCHAR;

-- -------------------------------------------------------------------------------------
-- 4. Trạng thái hoạt động hợp lệ: pending, active, cancelled, hidden (2.5)
--    Bỏ mọi CHECK cũ trên activities.status không cho phép 'hidden', rồi tạo CHECK chuẩn.
--    NOT VALID: chỉ áp cho dữ liệu ghi mới, không làm lỗi migration nếu dòng cũ mang giá trị khác.
-- -------------------------------------------------------------------------------------
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'activities'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%hidden%'
  LOOP
    EXECUTE format('ALTER TABLE activities DROP CONSTRAINT %I', c.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'activities'::regclass AND conname = 'activities_status_valid') THEN
    ALTER TABLE activities
      ADD CONSTRAINT activities_status_valid
      CHECK (status IN ('pending', 'active', 'cancelled', 'hidden')) NOT VALID;
  END IF;
END $$;

COMMIT;

-- =====================================================================================
-- 5. CHỈ ĐỌC: kiểm tra sau khi chạy (không thay đổi dữ liệu)
-- =====================================================================================

-- 5a. Mã hoạt động: phải không có dòng nào NULL/trùng; next_code là mã cho hoạt động tiếp theo.
SELECT count(*) FILTER (WHERE code IS NULL) AS missing_code,
       count(*) - count(DISTINCT code)       AS duplicated_code,
       (SELECT 'A' || (last_value + CASE WHEN is_called THEN 1 ELSE 0 END) FROM activity_code_seq) AS next_code
FROM activities;

-- 5b. Ràng buộc đang có trên activities (dùng để đối chiếu lỗi ẩn hoạt động).
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'activities'::regclass AND contype = 'c';

-- 5c. Trigger trên activities (một trigger lỗi cũng có thể làm UPDATE status trả 500).
SELECT tgname, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'activities'::regclass AND NOT tgisinternal;

-- 5d. Hoạt động nghi bị tạo trùng (cùng doanh nghiệp, cùng tên, tạo cách nhau <= 60 giây).
--     Chỉ liệt kê, KHÔNG xóa. Gửi kết quả cho dev để quyết định.
SELECT a.business_id, a.name,
       a.code AS code_1, a.activity_id AS id_1, a.created_at AS created_1, a.status AS status_1,
       b.code AS code_2, b.activity_id AS id_2, b.created_at AS created_2, b.status AS status_2
FROM activities a
JOIN activities b
  ON a.business_id = b.business_id
 AND a.name = b.name
 AND a.activity_id < b.activity_id
 AND abs(extract(epoch FROM (a.created_at - b.created_at))) <= 60
ORDER BY a.created_at;

-- 5e. Đơn đăng ký doanh nghiệp nghi bị gửi trùng (cùng người, cùng tên, cách nhau <= 60 giây).
SELECT a.user_id, a.business_name,
       a.request_id AS id_1, a.created_at AS created_1, a.status AS status_1,
       b.request_id AS id_2, b.created_at AS created_2, b.status AS status_2
FROM business_requests a
JOIN business_requests b
  ON a.user_id = b.user_id
 AND a.business_name = b.business_name
 AND a.request_id < b.request_id
 AND abs(extract(epoch FROM (a.created_at - b.created_at))) <= 60
ORDER BY a.created_at;
