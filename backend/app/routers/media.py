from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_current_business_user, get_current_user
from app.database import get_db
from app.services.cloudinary_storage import (
    CloudinaryNotConfigured,
    InvalidMedia,
    delete_asset,
    upload_asset,
)


router = APIRouter(tags=["media"])


async def _upload(
    file: UploadFile,
    *,
    folder: str,
    owner_id: str,
    kind: str,
    allow_video: bool = False,
):
    try:
        content = await file.read()
        return upload_asset(
            content=content,
            content_type=file.content_type or "application/octet-stream",
            folder=folder,
            owner_id=owner_id,
            kind=kind,
            allow_video=allow_video,
        )
    except CloudinaryNotConfigured as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except InvalidMedia as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Không thể tải file lên Cloudinary") from exc


def _delete_or_502(public_id: str | None, media_type: str = "image") -> None:
    if not public_id:
        return
    try:
        delete_asset(public_id, media_type)
    except CloudinaryNotConfigured as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Không thể xóa file trên Cloudinary") from exc


def _avatar_target(db: Session, user: models.User):
    if user.business_profile:
        return user.business_profile
    profile = user.customer_profile
    if not profile:
        profile = models.CustomerProfile(user_id=user.user_id)
        db.add(profile)
        db.flush()
    return profile


@router.get("/media/avatar-presets", response_model=list[schemas.AvatarPresetOut])
def list_avatar_presets(db: Session = Depends(get_db)):
    return (
        db.query(models.AvatarPreset)
        .filter(models.AvatarPreset.is_active.is_(True))
        .order_by(models.AvatarPreset.sort_order, models.AvatarPreset.name)
        .all()
    )


@router.post("/media/avatar", response_model=schemas.MediaUploadOut)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    asset = await _upload(
        file,
        folder=f"users/{user.user_id}/avatar",
        owner_id=user.user_id,
        kind="avatar",
    )
    target = _avatar_target(db, user)
    old_public_id = target.avatar_public_id
    target.avatar_url = asset.media_url
    target.avatar_public_id = asset.public_id
    db.commit()
    if old_public_id:
        try:
            delete_asset(old_public_id)
        except Exception:
            pass
    return schemas.MediaUploadOut(**asset.__dict__)


@router.put("/media/avatar/preset/{preset_id}", response_model=schemas.AvatarPresetOut)
def select_avatar_preset(
    preset_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    preset = (
        db.query(models.AvatarPreset)
        .filter(models.AvatarPreset.preset_id == preset_id, models.AvatarPreset.is_active.is_(True))
        .first()
    )
    if not preset:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy avatar mẫu")
    target = _avatar_target(db, user)
    old_public_id = target.avatar_public_id
    target.avatar_url = preset.media_url
    target.avatar_public_id = None  # preset dùng chung, không được xóa khi user đổi avatar
    db.commit()
    if old_public_id:
        try:
            delete_asset(old_public_id)
        except Exception:
            pass
    return preset


@router.delete("/media/avatar", response_model=schemas.MessageResponse)
def remove_avatar(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    target = _avatar_target(db, user)
    _delete_or_502(target.avatar_public_id)
    target.avatar_url = None
    target.avatar_public_id = None
    db.commit()
    return {"message": "Đã xóa avatar"}


@router.get("/business/media", response_model=list[schemas.BusinessMediaOut])
def list_business_media(
    kind: Literal["menu", "gallery", "logo"] | None = None,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    query = db.query(models.BusinessMedia).filter(models.BusinessMedia.business_id == business.user_id)
    if kind:
        query = query.filter(models.BusinessMedia.media_kind == kind)
    return query.order_by(models.BusinessMedia.created_at.desc()).all()


@router.post("/business/media", response_model=schemas.BusinessMediaOut, status_code=status.HTTP_201_CREATED)
async def upload_business_media(
    kind: Literal["menu", "gallery", "logo"],
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    asset = await _upload(
        file,
        folder=f"businesses/{business.user_id}/{kind}",
        owner_id=business.user_id,
        kind=kind,
    )
    media = models.BusinessMedia(
        business_id=business.user_id,
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
        old_public_id = business.avatar_public_id
        old_logo = None
        if old_public_id:
            old_logo = (
                db.query(models.BusinessMedia)
                .filter(
                    models.BusinessMedia.business_id == business.user_id,
                    models.BusinessMedia.public_id == old_public_id,
                )
                .first()
            )
            if old_logo:
                db.delete(old_logo)
        business.avatar_url = asset.media_url
        business.avatar_public_id = asset.public_id
    else:
        old_public_id = None
    db.commit()
    db.refresh(media)
    if old_public_id:
        try:
            delete_asset(old_public_id)
        except Exception:
            pass
    return media


@router.delete("/business/media/{media_id}", response_model=schemas.MessageResponse)
def remove_business_media(
    media_id: str,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    media = db.query(models.BusinessMedia).filter(models.BusinessMedia.media_id == media_id).first()
    if not media or media.business_id != business.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy media")
    _delete_or_502(media.public_id, media.media_type)
    if business.avatar_public_id == media.public_id:
        business.avatar_url = None
        business.avatar_public_id = None
    db.delete(media)
    db.commit()
    return {"message": "Đã xóa media doanh nghiệp"}


@router.post(
    "/activities/{activity_id}/media/upload",
    response_model=schemas.ActivityMedia,
    status_code=status.HTTP_201_CREATED,
)
async def upload_activity_media(
    activity_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity or activity.business_id != business.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")
    asset = await _upload(
        file,
        folder=f"businesses/{business.user_id}/activities/{activity_id}",
        owner_id=business.user_id,
        kind="activity",
        allow_video=True,
    )
    media = models.ActivityMedia(
        activity_id=activity_id,
        media_url=asset.media_url,
        media_type=asset.media_type,
        public_id=asset.public_id,
        bytes=asset.bytes,
        width=asset.width,
        height=asset.height,
    )
    db.add(media)
    db.commit()
    db.refresh(media)
    return media


@router.post(
    "/reviews/{review_id}/media/upload",
    response_model=schemas.ReviewMedia,
    status_code=status.HTTP_201_CREATED,
)
async def upload_review_media(
    review_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    review = db.query(models.Review).filter(models.Review.review_id == review_id).first()
    if not review or review.user_id != user.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy đánh giá")
    asset = await _upload(
        file,
        folder=f"users/{user.user_id}/reviews/{review_id}",
        owner_id=user.user_id,
        kind="review",
        allow_video=True,
    )
    media = models.ReviewMedia(
        review_id=review_id,
        media_url=asset.media_url,
        media_type=asset.media_type,
        public_id=asset.public_id,
        bytes=asset.bytes,
    )
    db.add(media)
    db.commit()
    db.refresh(media)
    return media


@router.delete("/reviews/media/{media_id}", response_model=schemas.MessageResponse)
def remove_review_media(
    media_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    media = db.query(models.ReviewMedia).filter(models.ReviewMedia.media_id == media_id).first()
    if not media or media.review.user_id != user.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy media")
    _delete_or_502(media.public_id, media.media_type)
    db.delete(media)
    db.commit()
    return {"message": "Đã xóa media đánh giá"}


@router.post(
    "/business/review-replies/{reply_id}/media/upload",
    response_model=schemas.ReviewReplyMediaOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_reply_media(
    reply_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    reply = db.query(models.ReviewReply).filter(models.ReviewReply.reply_id == reply_id).first()
    if not reply or reply.business_id != business.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phản hồi")
    asset = await _upload(
        file,
        folder=f"businesses/{business.user_id}/review-replies/{reply_id}",
        owner_id=business.user_id,
        kind="review-reply",
        allow_video=True,
    )
    media = models.ReviewReplyMedia(
        reply_id=reply_id,
        media_url=asset.media_url,
        public_id=asset.public_id,
        media_type=asset.media_type,
        bytes=asset.bytes,
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(media)
    db.commit()
    db.refresh(media)
    return media


@router.delete("/business/review-replies/media/{media_id}", response_model=schemas.MessageResponse)
def remove_reply_media(
    media_id: str,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    media = db.query(models.ReviewReplyMedia).filter(models.ReviewReplyMedia.media_id == media_id).first()
    if not media or media.reply.business_id != business.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy media")
    _delete_or_502(media.public_id, media.media_type)
    db.delete(media)
    db.commit()
    return {"message": "Đã xóa media phản hồi"}
