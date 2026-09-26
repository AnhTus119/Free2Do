"""Thêm/cập nhật Google Maps URL cho hoạt động theo file dữ liệu nguồn.

Chạy an toàn nhiều lần:
    python seed_google_maps.py
"""

from sqlalchemy import text

from app.database import engine
from seed_activities import GOOGLE_MAP_URLS


def main() -> None:
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE activities ADD COLUMN IF NOT EXISTS google_maps_url VARCHAR"))
        existing_ids = {
            row[0]
            for row in connection.execute(
                text("SELECT activity_id FROM activities WHERE activity_id = ANY(:ids)"),
                {"ids": list(GOOGLE_MAP_URLS)},
            )
        }
        missing = sorted(set(GOOGLE_MAP_URLS) - existing_ids)
        if missing:
            raise RuntimeError(f"Database thiếu activity_id: {', '.join(missing)}")

        for activity_id, google_maps_url in GOOGLE_MAP_URLS.items():
            connection.execute(
                text(
                    "UPDATE activities SET google_maps_url = :google_maps_url, "
                    "updated_at = CURRENT_TIMESTAMP WHERE activity_id = :activity_id"
                ),
                {"activity_id": activity_id, "google_maps_url": google_maps_url},
            )

        saved = connection.execute(
            text("SELECT COUNT(*) FROM activities WHERE google_maps_url IS NOT NULL")
        ).scalar_one()
        stored = dict(connection.execute(
            text("SELECT activity_id, google_maps_url FROM activities WHERE activity_id = ANY(:ids)"),
            {"ids": list(GOOGLE_MAP_URLS)},
        ).all())

    mismatched = sorted(key for key, value in GOOGLE_MAP_URLS.items() if stored.get(key) != value)
    if mismatched:
        raise RuntimeError(f"Link lưu sai cho activity_id: {', '.join(mismatched)}")
    print(f"Updated {len(stored)} Google Maps URLs; database now has {saved} mapped activities.")


if __name__ == "__main__":
    main()
