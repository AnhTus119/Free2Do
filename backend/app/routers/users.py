from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user
from app.utils.identity import normalize_person_name

router = APIRouter(prefix="/users/me", tags=["users"])


@router.patch("", response_model=schemas.MeResponse)
def update_my_profile(
    payload: schemas.UserProfileUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        try:
            user.name = normalize_person_name(data["name"])
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    if "phone" in data:
        raw_phone = data["phone"]
        user.phone = raw_phone.strip() or None if raw_phone is not None else None

    db.commit()
    db.refresh(user)
    profile = user.business_profile or user.customer_profile
    role_name = user.role.role_name if user.role else None
    account = user.account
    return schemas.MeResponse(
        account_id=account.account_id,
        email=account.email,
        account_type="user",
        role=role_name,
        name=user.name,
        username=user.name,
        user_id=user.user_id,
        phone=account.phone or user.phone,
        recovery_email=account.recovery_email,
        requires_recovery_email=account.auth_provider == "phone" and not account.recovery_email,
        avatar_url=profile.avatar_url if profile else None,
        redirect=(
            "Demo Trang Business/business-home.html"
            if role_name == "business"
            else "Demo Trang Customer/home.html"
        ),
    )


MAX_INTERESTS = 20
MAX_INTEREST_LENGTH = 60


def _clean_interests(values: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for value in values:
        label = " ".join(str(value).split())[:MAX_INTEREST_LENGTH]
        key = label.casefold()
        if label and key not in seen:
            cleaned.append(label)
            seen.add(key)
    return cleaned


def _interest_labels(db: Session, user_id: str) -> list[str]:
    rows = (
        db.query(models.UserInterest.label)
        .filter(models.UserInterest.user_id == user_id)
        .order_by(models.UserInterest.created_at, models.UserInterest.interest_id)
        .all()
    )
    return [row[0] for row in rows]


@router.get("/interests", response_model=schemas.UserInterestsOut)
def get_my_interests(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return {"interests": _interest_labels(db, user.user_id)}


@router.put("/interests", response_model=schemas.UserInterestsOut)
def replace_my_interests(
    payload: schemas.UserInterestsUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Ghi đè danh sách sở thích cá nhân (tối đa 20, mỗi sở thích tối đa 60 ký tự)."""
    labels = _clean_interests(payload.interests)
    if len(labels) > MAX_INTERESTS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Bạn chỉ có thể lưu tối đa {MAX_INTERESTS} sở thích cá nhân")
    existing = {
        row.label_key: row
        for row in db.query(models.UserInterest).filter(models.UserInterest.user_id == user.user_id)
    }
    wanted = {label.casefold() for label in labels}
    for key, row in existing.items():
        if key not in wanted:
            db.delete(row)
    now = datetime.utcnow()
    for offset, label in enumerate(labels):
        key = label.casefold()
        if key in existing:
            existing[key].label = label
        else:
            db.add(models.UserInterest(user_id=user.user_id, label=label, label_key=key, created_at=now + timedelta(microseconds=offset)))
    db.commit()
    return {"interests": _interest_labels(db, user.user_id)}


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
    category_ids = list(dict.fromkeys(payload.category_ids))
    existing_ids = {
        row[0]
        for row in db.query(models.Category.category_id)
        .filter(models.Category.category_id.in_(category_ids))
        .all()
    } if category_ids else set()
    missing = [category_id for category_id in category_ids if category_id not in existing_ids]
    if missing:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Danh mục không tồn tại: {', '.join(missing)}",
        )
    db.query(models.UserCategory).filter(models.UserCategory.user_id == user.user_id).delete()
    for category_id in category_ids:
        db.add(models.UserCategory(user_id=user.user_id, category_id=category_id))
    db.commit()
    db.refresh(user)
    return [uc.category for uc in user.categories]

