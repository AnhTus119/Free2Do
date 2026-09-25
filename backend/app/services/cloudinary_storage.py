import io
import uuid
from dataclasses import dataclass

import cloudinary
import cloudinary.uploader

from app.config import settings


IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}


class CloudinaryNotConfigured(RuntimeError):
    pass


class InvalidMedia(ValueError):
    pass


@dataclass(frozen=True)
class UploadedAsset:
    media_url: str
    public_id: str
    media_type: str
    bytes: int | None
    width: int | None
    height: int | None


def _configure() -> None:
    if not all(
        (
            settings.CLOUDINARY_CLOUD_NAME,
            settings.CLOUDINARY_API_KEY,
            settings.CLOUDINARY_API_SECRET,
        )
    ):
        raise CloudinaryNotConfigured(
            "Cloudinary chưa được cấu hình. Hãy thêm CLOUDINARY_CLOUD_NAME, "
            "CLOUDINARY_API_KEY và CLOUDINARY_API_SECRET vào backend/.env."
        )
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )


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


def upload_asset(
    *,
    content: bytes,
    content_type: str,
    folder: str,
    owner_id: str,
    kind: str,
    allow_video: bool = False,
) -> UploadedAsset:
    _configure()
    media_type = validate_upload(content, content_type, allow_video)
    root = settings.CLOUDINARY_FOLDER.strip("/") or "free2do"
    target_folder = f"{root}/{folder.strip('/')}"
    options = {
        "resource_type": media_type,
        "folder": target_folder,
        "public_id": f"{kind}-{uuid.uuid4().hex}",
        "overwrite": False,
        "tags": ["free2do", kind, f"owner:{owner_id}"],
    }
    if media_type == "image":
        if kind == "avatar":
            options["transformation"] = {
                "width": 512,
                "height": 512,
                "crop": "fill",
                "gravity": "auto",
                "quality": "auto",
            }
        else:
            options["transformation"] = {
                "width": 2000,
                "height": 2000,
                "crop": "limit",
                "quality": "auto",
            }
    result = cloudinary.uploader.upload(io.BytesIO(content), **options)
    return UploadedAsset(
        media_url=result["secure_url"],
        public_id=result["public_id"],
        media_type=result.get("resource_type", media_type),
        bytes=result.get("bytes"),
        width=result.get("width"),
        height=result.get("height"),
    )


def upload_source(*, source: str, name: str) -> UploadedAsset:
    """Upload URL hoặc đường dẫn file khi seed thư viện avatar mẫu."""
    _configure()
    root = settings.CLOUDINARY_FOLDER.strip("/") or "free2do"
    result = cloudinary.uploader.upload(
        source,
        resource_type="image",
        folder=f"{root}/default-avatars",
        public_id=name,
        overwrite=False,
        tags=["free2do", "default-avatar"],
        transformation={
            "width": 512,
            "height": 512,
            "crop": "fill",
            "gravity": "auto",
            "quality": "auto",
        },
    )
    return UploadedAsset(
        media_url=result["secure_url"],
        public_id=result["public_id"],
        media_type="image",
        bytes=result.get("bytes"),
        width=result.get("width"),
        height=result.get("height"),
    )


def upload_seed_image(
    *,
    source: str,
    folder: str,
    public_id: str,
    owner_id: str,
    kind: str,
) -> UploadedAsset:
    """Upload ảnh seed với public_id ổn định để có thể chạy script nhiều lần."""
    _configure()
    root = settings.CLOUDINARY_FOLDER.strip("/") or "free2do"
    full_public_id = f"{root}/{folder.strip('/')}/{public_id}"
    result = cloudinary.uploader.upload(
        source,
        resource_type="image",
        public_id=full_public_id,
        overwrite=True,
        invalidate=True,
        tags=["free2do", "seed", kind, f"owner:{owner_id}"],
        transformation={
            "width": 2000,
            "height": 2000,
            "crop": "limit",
            "quality": "auto",
        },
    )
    return UploadedAsset(
        media_url=result["secure_url"],
        public_id=result["public_id"],
        media_type="image",
        bytes=result.get("bytes"),
        width=result.get("width"),
        height=result.get("height"),
    )


def delete_asset(public_id: str, media_type: str = "image") -> None:
    if not public_id:
        return
    _configure()
    cloudinary.uploader.destroy(public_id, resource_type=media_type, invalidate=True)
