"""Sao chép URL media cũ sang bucket Supabase Storage; chạy lại an toàn."""

from app import models
from app.config import settings
from app.database import SessionLocal
from app.services.supabase_storage import upload_existing_url


def _already_migrated(url: str | None) -> bool:
    return bool(url and "/storage/v1/object/public/" in url)


def main() -> None:
    db = SessionLocal()
    migrated = 0
    failed: list[str] = []
    replacements: dict[str, tuple[str, str]] = {}
    try:
        targets = []
        targets.extend(
            (preset, "media_url", "public_id", f"default-avatars/{preset.preset_id}", False)
            for preset in db.query(models.AvatarPreset).all()
        )
        targets.extend(
            (media, "media_url", "public_id", f"businesses/{media.business_id}/{media.media_kind}/{media.media_id}", False)
            for media in db.query(models.BusinessMedia).all()
        )
        targets.extend(
            (media, "media_url", "public_id", f"activities/{media.activity_id}/{media.media_id}", True)
            for media in db.query(models.ActivityMedia).all()
        )
        targets.extend(
            (media, "media_url", "public_id", f"reviews/{media.review_id}/{media.media_id}", True)
            for media in db.query(models.ReviewMedia).all()
        )
        targets.extend(
            (media, "media_url", "public_id", f"review-replies/{media.reply_id}/{media.media_id}", True)
            for media in db.query(models.ReviewReplyMedia).all()
        )

        for row, url_field, id_field, object_path, allow_video in targets:
            old_url = getattr(row, url_field)
            if not old_url or _already_migrated(old_url):
                continue
            try:
                asset = upload_existing_url(
                    source=old_url,
                    object_path=object_path,
                    allow_video=allow_video,
                )
                setattr(row, url_field, asset.media_url)
                setattr(row, id_field, asset.public_id)
                replacements[old_url] = (asset.media_url, asset.public_id)
                migrated += 1
                print(f"Migrated {migrated}: {object_path}", flush=True)
            except Exception as exc:
                failed.append(f"{object_path}: {exc}")

        for profile in db.query(models.BusinessProfile).all():
            replacement = replacements.get(profile.avatar_url)
            if replacement:
                profile.avatar_url, profile.avatar_public_id = replacement
        for profile in db.query(models.CustomerProfile).all():
            replacement = replacements.get(profile.avatar_url)
            if replacement:
                profile.avatar_url, profile.avatar_public_id = replacement

        db.commit()
        print(f"Migrated {migrated} media objects to bucket {settings.SUPABASE_STORAGE_BUCKET}.")
        if failed:
            print(f"Skipped {len(failed)} inaccessible objects:")
            for item in failed:
                print(f"- {item}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
