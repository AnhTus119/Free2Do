"""Seed logo và gallery từ cấu trúc ROOT/<business_id>/* lên Supabase Storage.

Ví dụ:
    python seed_business_media.py --root "C:/data/QLDACNTT" --dry-run
    python seed_business_media.py --root "C:/data/QLDACNTT"

File tên Logo.* được lưu với kind=logo; các ảnh còn lại mặc định là gallery.
Script idempotent theo public_id chứa hash nội dung và có thể chạy lại an toàn.
"""

import argparse
import hashlib
import re
import sys
from datetime import UTC, datetime
from pathlib import Path

from app import models
from app.database import SessionLocal
from app.services.supabase_storage import delete_asset, upload_seed_image


SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def _slug(value: str) -> str:
    result = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip()).strip("-").lower()
    return result or "image"


def _seed_public_id(path: Path) -> str:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()[:12]
    return f"seed-{_slug(path.stem)}-{digest}"


def _full_public_id(business_id: str, kind: str, public_id: str, suffix: str) -> str:
    extension = ".jpg" if suffix.lower() in {".jpg", ".jpeg"} else suffix.lower()
    return f"businesses/{business_id}/{kind}/{public_id}{extension}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed ảnh doanh nghiệp lên Supabase Storage")
    parser.add_argument("--root", required=True, type=Path, help="Thư mục chứa B001, B002, ...")
    parser.add_argument(
        "--image-kind",
        choices=("gallery", "menu"),
        default="gallery",
        help="Loại của các file không phải Logo.*",
    )
    parser.add_argument("--dry-run", action="store_true", help="Chỉ kiểm tra, không upload/ghi database")
    parser.add_argument(
        "--replace-existing-logo",
        action="store_true",
        help="Cho phép seed ghi đè logo hiện tại của doanh nghiệp",
    )
    args = parser.parse_args()
    root = args.root.resolve()
    if not root.is_dir():
        raise SystemExit(f"Không tìm thấy thư mục: {root}")

    db = SessionLocal()
    planned = uploaded = skipped = failed = 0
    try:
        for business_dir in sorted(path for path in root.iterdir() if path.is_dir()):
            business_id = business_dir.name
            business = (
                db.query(models.BusinessProfile)
                .filter(models.BusinessProfile.user_id == business_id)
                .first()
            )
            if not business:
                print(f"[SKIP] {business_id}: không tồn tại trong business_profiles")
                skipped += 1
                continue

            files = sorted(
                path for path in business_dir.iterdir()
                if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
            )
            for image_path in files:
                kind = "logo" if image_path.stem.lower() == "logo" else args.image_kind
                short_public_id = _seed_public_id(image_path)
                expected_public_id = _full_public_id(
                    business_id, kind, short_public_id, image_path.suffix
                )
                existing = (
                    db.query(models.BusinessMedia)
                    .filter(models.BusinessMedia.public_id == expected_public_id)
                    .first()
                )
                if existing:
                    print(f"[SKIP] {business_id}/{image_path.name}: đã seed")
                    skipped += 1
                    continue
                if (
                    kind == "logo"
                    and business.avatar_public_id
                    and not args.replace_existing_logo
                ):
                    print(f"[SKIP] {business_id}/{image_path.name}: doanh nghiệp đã có logo")
                    skipped += 1
                    continue
                if args.dry_run:
                    print(f"[DRY]  {business_id}/{image_path.name} -> {kind}")
                    planned += 1
                    continue

                old_logo_public_id = business.avatar_public_id if kind == "logo" else None
                asset = None
                try:
                    asset = upload_seed_image(
                        source=str(image_path),
                        folder=f"businesses/{business_id}/{kind}",
                        public_id=short_public_id,
                        owner_id=business_id,
                        kind=kind,
                    )
                    media = models.BusinessMedia(
                        business_id=business_id,
                        media_url=asset.media_url,
                        public_id=asset.public_id,
                        media_type=asset.media_type,
                        media_kind=kind,
                        bytes=asset.bytes,
                        width=asset.width,
                        height=asset.height,
                        created_at=datetime.now(UTC).replace(tzinfo=None),
                    )
                    db.add(media)
                    if kind == "logo":
                        old_logo_media = None
                        if old_logo_public_id and old_logo_public_id != asset.public_id:
                            old_logo_media = (
                                db.query(models.BusinessMedia)
                                .filter(models.BusinessMedia.public_id == old_logo_public_id)
                                .first()
                            )
                        if old_logo_media:
                            db.delete(old_logo_media)
                        business.avatar_url = asset.media_url
                        business.avatar_public_id = asset.public_id
                    db.commit()
                    if old_logo_public_id and old_logo_public_id != asset.public_id:
                        try:
                            delete_asset(old_logo_public_id)
                        except Exception:
                            print(f"[WARN] Không xóa được logo cũ {old_logo_public_id}")
                    uploaded += 1
                    print(f"[OK]   {business_id}/{image_path.name} -> {asset.public_id}")
                except Exception as exc:
                    db.rollback()
                    if asset:
                        try:
                            delete_asset(asset.public_id)
                        except Exception:
                            pass
                    failed += 1
                    print(f"[FAIL] {business_id}/{image_path.name}: {exc}")
    finally:
        db.close()

    print(
        f"Hoàn tất: planned={planned}, uploaded={uploaded}, "
        f"skipped={skipped}, failed={failed}"
    )
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
