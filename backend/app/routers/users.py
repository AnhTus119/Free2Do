from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user

router = APIRouter(prefix="/users/me", tags=["users"])


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


@router.get("", response_model=schemas.UserSelf)
def get_my_profile(user: models.User = Depends(get_current_user)):
    return schemas.UserSelf(user_id=user.user_id, name=user.name, phone=user.phone, email=user.account.email)


@router.patch("", response_model=schemas.UserSelf)
def update_my_profile(payload: schemas.UserSelfUpdate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tên không được để trống")
    user.name = name
    user.phone = payload.phone
    db.commit()
    return get_my_profile(user)
