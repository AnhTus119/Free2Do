-- Chỉ chạy file này nếu database hiện tại chưa có activities.location.
-- Migration bổ sung PostGIS cho bản đồ; không xóa bảng/cột hoặc dữ liệu cũ.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS location extensions.geography(Point, 4326);

UPDATE activities
SET location = extensions.ST_SetSRID(
  extensions.ST_MakePoint(longitude, latitude), 4326
)::extensions.geography
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND location IS NULL;

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_sync_activity_location'
      AND tgrelid = 'public.activities'::regclass
  ) THEN
    CREATE TRIGGER trg_sync_activity_location
    BEFORE INSERT OR UPDATE OF latitude, longitude ON public.activities
    FOR EACH ROW EXECUTE FUNCTION public.sync_activity_location();
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_activities_location_gist
  ON activities USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_activities_status
  ON activities(status);

COMMIT;
