"""Đồng bộ riêng tags nhiều-nhiều cho dữ liệu hoạt động hiện có.

Không sửa tài khoản, giá, media hoặc trạng thái. Có thể chạy lại an toàn:
    python sync_activity_tags.py
"""

from app import models
from app.database import SessionLocal
from seed_activities import ACTIVITY_TAGS


def sync_activity_tags(db) -> tuple[int, list[str]]:
    category_by_name = {}
    for name in sorted({tag for tags in ACTIVITY_TAGS.values() for tag in tags}):
        category = db.query(models.Category).filter(models.Category.name == name).first()
        if category is None:
            category = models.Category(name=name)
            db.add(category)
            db.flush()
        category_by_name[name] = category

    updated = 0
    missing = []
    for activity_id, tags in ACTIVITY_TAGS.items():
        activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
        if activity is None:
            missing.append(activity_id)
            continue
        db.query(models.ActivityCategory).filter(
            models.ActivityCategory.activity_id == activity_id
        ).delete(synchronize_session=False)
        for tag in tags:
            db.add(models.ActivityCategory(
                activity_id=activity_id,
                category_id=category_by_name[tag].category_id,
            ))
        if activity_id == "A023":
            activity.name = "Cà phê"
            activity.description = "Không gian cà phê yên tĩnh phù hợp để làm việc và thư giãn"
        updated += 1
    db.commit()
    return updated, missing


def main() -> None:
    db = SessionLocal()
    try:
        updated, missing = sync_activity_tags(db)
        print(f"Updated tags for {updated} activities.")
        if missing:
            print(f"Skipped missing activity IDs: {', '.join(missing)}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
