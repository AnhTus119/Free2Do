-- Free2Do: migration rieng cho tinh nang nhom.
-- Co the chay tren database hien tai; khong sua/xoa bang va du lieu cu.

BEGIN;

CREATE TABLE IF NOT EXISTS groups (
  group_id VARCHAR PRIMARY KEY,
  invite_code VARCHAR NOT NULL UNIQUE,
  host_user_id VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  selected_activity_id VARCHAR REFERENCES activities(activity_id) ON DELETE SET NULL,
  status VARCHAR NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  member_id VARCHAR PRIMARY KEY,
  group_id VARCHAR NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  user_id VARCHAR REFERENCES users(user_id) ON DELETE SET NULL,
  name VARCHAR NOT NULL,
  free_hours DOUBLE PRECISION NOT NULL CHECK (free_hours > 0 AND free_hours <= 24),
  address VARCHAR NOT NULL,
  budget DOUBLE PRECISION NOT NULL CHECK (budget >= 0),
  category_ids_json TEXT NOT NULL DEFAULT '[]',
  is_host BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT uq_group_member_user UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_payments (
  payment_id VARCHAR PRIMARY KEY,
  group_id VARCHAR NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  member_id VARCHAR NOT NULL UNIQUE REFERENCES group_members(member_id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (amount >= 0),
  status VARCHAR NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
  reminded_at TIMESTAMP,
  paid_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Nâng cấp an toàn cho các bảng nhóm đã được tạo trước đây.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS search_started BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS is_ready BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS leave_requested_at TIMESTAMP;
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS leave_status VARCHAR NOT NULL DEFAULT 'none';

CREATE INDEX IF NOT EXISTS idx_groups_host_user_id
  ON groups(host_user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id
  ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id
  ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_payments_group_id
  ON group_payments(group_id);

-- Du lieu nhom chi duoc truy cap qua backend Free2Do.
-- Bat RLS de anon/authenticated key khong the doc/ghi truc tiep khi chua co policy.
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_payments ENABLE ROW LEVEL SECURITY;

COMMIT;
