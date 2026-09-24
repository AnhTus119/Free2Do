"""Upload một lần các avatar mẫu lên Cloudinary và ghi vào avatar_presets.

Ví dụ:
  python seed_avatar_presets.py --avatar "Mèo xanh=C:/images/cat.png" \
      --avatar "Phi hành gia=https://example.com/astronaut.png"
"""

import argparse
import re
from datetime import UTC, datetime

from app import models
from app.database import SessionLocal
from app.services.cloudinary_storage import upload_source


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip()).strip("-").lower()
    return slug or "avatar"


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed avatar mẫu dùng chung trên Cloudinary")
    parser.add_argument(
        "--avatar",
        action="append",
        required=True,
        metavar="TEN=DUONG_DAN_HOAC_URL",
        help="Có thể truyền nhiều lần",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        for index, item in enumerate(args.avatar):
            if "=" not in item:
                raise SystemExit(f"Sai định dạng: {item!r}; cần TEN=DUONG_DAN_HOAC_URL")
            name, source = (part.strip() for part in item.split("=", 1))
            existing = db.query(models.AvatarPreset).filter(models.AvatarPreset.name == name).first()
            if existing:
                print(f"Bỏ qua {name}: đã tồn tại")
                continue
            asset = upload_source(source=source, name=f"{index + 1:02d}-{_slug(name)}")
            db.add(
                models.AvatarPreset(
                    name=name,
                    media_url=asset.media_url,
                    public_id=asset.public_id,
                    is_active=True,
                    sort_order=index,
                    created_at=datetime.now(UTC).replace(tzinfo=None),
                )
            )
            db.commit()
            print(f"Đã thêm {name}: {asset.media_url}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
