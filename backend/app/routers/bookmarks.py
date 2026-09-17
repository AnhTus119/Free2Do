from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user

router = APIRouter(prefix="/bookmarks", tags=["bookmarks"])


@router.get("/me", response_model=list[schemas.Bookmark])
def list_my_bookmarks(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Bookmark)
        .filter(models.Bookmark.user_id == user.user_id)
        .order_by(models.Bookmark.created_at.desc())
        .all()
    )


@router.post("/{activity_id}", response_model=schemas.Bookmark, status_code=status.HTTP_201_CREATED)
def add_bookmark(
    activity_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")

    existing = (
        db.query(models.Bookmark)
        .filter(models.Bookmark.user_id == user.user_id, models.Bookmark.activity_id == activity_id)
        .first()
    )
    if existing:
        return existing

    bookmark = models.Bookmark(user_id=user.user_id, activity_id=activity_id, created_at=datetime.utcnow())
    db.add(bookmark)
    db.commit()
    db.refresh(bookmark)
    return bookmark


@router.delete("/{activity_id}", response_model=schemas.MessageResponse)
def remove_bookmark(
    activity_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    bookmark = (
        db.query(models.Bookmark)
        .filter(models.Bookmark.user_id == user.user_id, models.Bookmark.activity_id == activity_id)
        .first()
    )
    if not bookmark:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chưa lưu hoạt động này")

    db.delete(bookmark)
    db.commit()
    return {"message": "Đã bỏ lưu hoạt động"}
