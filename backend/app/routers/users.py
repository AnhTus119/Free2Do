from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user

router = APIRouter(prefix="/users/me", tags=["users"])


@router.get("/search-history", response_model=list[schemas.SearchHistory])
def get_my_search_history(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.SearchHistory)
        .filter(models.SearchHistory.user_id == user.user_id)
        .order_by(models.SearchHistory.created_at.desc())
        .all()
    )


@router.get("/categories", response_model=list[schemas.Category])
def get_my_categories(user: models.User = Depends(get_current_user)):
    return [uc.category for uc in user.categories]


@router.put("/categories", response_model=list[schemas.Category])
def update_my_categories(
    payload: schemas.UserCategoriesUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Ghi đè toàn bộ danh sách sở thích của user bằng danh sách category_ids truyền lên."""
    db.query(models.UserCategory).filter(models.UserCategory.user_id == user.user_id).delete()
    for category_id in payload.category_ids:
        db.add(models.UserCategory(user_id=user.user_id, category_id=category_id))
    db.commit()
    db.refresh(user)
    return [uc.category for uc in user.categories]
