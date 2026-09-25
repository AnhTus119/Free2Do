"""Đưa business_media hiện có vào đúng Dynamic Folders trên Cloudinary.

Lệnh này không đổi public_id hoặc URL đang lưu trong database.
"""

import argparse
import sys

from app import models
from app.config import settings
from app.database import SessionLocal
from app.services.cloudinary_storage import set_asset_folder


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sắp xếp asset vào Dynamic Folders")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    root = settings.CLOUDINARY_FOLDER.strip("/") or "free2do"

    db = SessionLocal()
    moved = failed = 0
    try:
        media_items = db.query(models.BusinessMedia).order_by(models.BusinessMedia.business_id).all()
        for media in media_items:
            asset_folder = f"{root}/businesses/{media.business_id}/{media.media_kind}"
            if args.dry_run:
                print(f"[DRY]  {media.public_id} -> {asset_folder}")
                moved += 1
                continue
            try:
                display_name = media.public_id.rsplit("/", 1)[-1]
                set_asset_folder(
                    public_id=media.public_id,
                    asset_folder=asset_folder,
                    media_type=media.media_type,
                    display_name=display_name,
                )
                moved += 1
                print(f"[OK]   {media.public_id} -> {asset_folder}")
            except Exception as exc:
                failed += 1
                print(f"[FAIL] {media.public_id}: {exc}")
    finally:
        db.close()
    print(f"Hoàn tất: moved={moved}, failed={failed}")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
