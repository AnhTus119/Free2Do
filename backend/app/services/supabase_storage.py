import mimetypes
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote, urlparse

import requests

from app.config import settings


IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
_bucket_ready = False


class StorageNotConfigured(RuntimeError):
    pass


class InvalidMedia(ValueError):
    pass


@dataclass(frozen=True)
class UploadedAsset:
    media_url: str
    public_id: str
    media_type: str
    bytes: int | None
    width: int | None = None
    height: int | None = None


def _config() -> tuple[str, str, str]:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise StorageNotConfigured(
            "Supabase Storage chưa được cấu hình. Hãy thêm SUPABASE_URL và "
            "SUPABASE_SERVICE_KEY vào backend/.env hoặc Render Environment."
        )
    return (
        settings.SUPABASE_URL.rstrip("/"),
        settings.SUPABASE_SERVICE_KEY,
        settings.SUPABASE_STORAGE_BUCKET.strip() or "free2do-media",
    )


def _headers(key: str) -> dict[str, str]:
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def ensure_bucket() -> None:
    global _bucket_ready
    if _bucket_ready:
        return
    base, key, bucket = _config()
    existing = requests.get(
        f"{base}/storage/v1/bucket/{quote(bucket, safe='')}",
        headers=_headers(key),
        timeout=20,
    )
    if existing.status_code == 200:
        _bucket_ready = True
        return
    response = requests.post(
        f"{base}/storage/v1/bucket",
        headers={**_headers(key), "Content-Type": "application/json"},
        json={
            "id": bucket,
            "name": bucket,
            "public": True,
            "file_size_limit": settings.MAX_VIDEO_UPLOAD_MB * 1024 * 1024,
            "allowed_mime_types": sorted(IMAGE_TYPES | VIDEO_TYPES),
        },
        timeout=20,
    )
    duplicate = response.status_code == 400 and response.json().get("code") == "BucketAlreadyExists"
    if response.status_code not in (200, 201, 409) and not duplicate:
        raise RuntimeError("Không thể tạo hoặc truy cập bucket Supabase Storage")
    _bucket_ready = True


def validate_upload(content: bytes, content_type: str, allow_video: bool) -> str:
    allowed = IMAGE_TYPES | (VIDEO_TYPES if allow_video else set())
    if content_type not in allowed:
        raise InvalidMedia("Định dạng file không được hỗ trợ")
    media_type = "video" if content_type in VIDEO_TYPES else "image"
    limit_mb = settings.MAX_VIDEO_UPLOAD_MB if media_type == "video" else settings.MAX_IMAGE_UPLOAD_MB
    if not content:
        raise InvalidMedia("File rỗng")
    if len(content) > limit_mb * 1024 * 1024:
        raise InvalidMedia(f"File vượt quá giới hạn {limit_mb} MB")
    return media_type


def _extension(content_type: str) -> str:
    return {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "video/quicktime": ".mov",
    }[content_type]


def _upload(content: bytes, content_type: str, object_path: str, upsert: bool) -> UploadedAsset:
    base, key, bucket = _config()
    ensure_bucket()
    encoded_path = quote(object_path.strip("/"), safe="/")
    response = requests.post(
        f"{base}/storage/v1/object/{quote(bucket, safe='')}/{encoded_path}",
        headers={
            **_headers(key),
            "Content-Type": content_type,
            "x-upsert": "true" if upsert else "false",
        },
        data=content,
        timeout=60,
    )
    if response.status_code not in (200, 201):
        raise RuntimeError("Không thể tải file lên Supabase Storage")
    return UploadedAsset(
        media_url=f"{base}/storage/v1/object/public/{quote(bucket, safe='')}/{encoded_path}",
        public_id=object_path.strip("/"),
        media_type="video" if content_type in VIDEO_TYPES else "image",
        bytes=len(content),
    )


def upload_asset(*, content: bytes, content_type: str, folder: str, owner_id: str, kind: str, allow_video: bool = False) -> UploadedAsset:
    media_type = validate_upload(content, content_type, allow_video)
    object_path = f"{folder.strip('/')}/{kind}-{uuid.uuid4().hex}{_extension(content_type)}"
    asset = _upload(content, content_type, object_path, upsert=False)
    return UploadedAsset(**{**asset.__dict__, "media_type": media_type})


def _read_source(source: str) -> tuple[bytes, str]:
    parsed = urlparse(source)
    if parsed.scheme in ("http", "https"):
        response = requests.get(source, timeout=60)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").split(";", 1)[0]
        return response.content, content_type
    path = Path(source)
    return path.read_bytes(), mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def upload_source(*, source: str, name: str) -> UploadedAsset:
    content, content_type = _read_source(source)
    validate_upload(content, content_type, allow_video=False)
    return _upload(content, content_type, f"default-avatars/{name}{_extension(content_type)}", upsert=True)


def upload_seed_image(*, source: str, folder: str, public_id: str, owner_id: str, kind: str) -> UploadedAsset:
    content, content_type = _read_source(source)
    validate_upload(content, content_type, allow_video=False)
    return _upload(content, content_type, f"{folder.strip('/')}/{public_id}{_extension(content_type)}", upsert=True)


def upload_existing_url(*, source: str, object_path: str, allow_video: bool = True) -> UploadedAsset:
    """Sao chép một media URL cũ sang Storage bằng object path ổn định."""
    content, content_type = _read_source(source)
    validate_upload(content, content_type, allow_video=allow_video)
    path = object_path.rsplit(".", 1)[0] + _extension(content_type)
    return _upload(content, content_type, path, upsert=True)


def delete_asset(public_id: str, media_type: str = "image") -> None:
    if not public_id:
        return
    base, key, bucket = _config()
    response = requests.delete(
        f"{base}/storage/v1/object/{quote(bucket, safe='')}",
        headers={**_headers(key), "Content-Type": "application/json"},
        json={"prefixes": [public_id]},
        timeout=20,
    )
    if response.status_code not in (200, 204):
        raise RuntimeError("Không thể xóa file trên Supabase Storage")
