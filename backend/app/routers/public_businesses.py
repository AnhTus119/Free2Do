from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db


router = APIRouter(prefix="/businesses", tags=["public-businesses"])


def _to_public(db: Session, business: models.BusinessProfile) -> schemas.BusinessPublicOut:
    activity_count = (
        db.query(func.count(models.Activity.activity_id))
        .filter(
            models.Activity.business_id == business.user_id,
            models.Activity.status == "active",
        )
        .scalar()
        or 0
    )
    return schemas.BusinessPublicOut(
        user_id=business.user_id,
        business_name=business.business_name,
        phone=business.phone,
        description=business.description,
        business_address=business.business_address,
        avatar_url=business.avatar_url,
        activity_count=activity_count,
        media=[schemas.BusinessMediaOut.model_validate(item) for item in business.media],
    )


@router.get("", response_model=list[schemas.BusinessPublicOut])
def list_public_businesses(db: Session = Depends(get_db)):
    businesses = (
        db.query(models.BusinessProfile)
        .join(models.Activity, models.Activity.business_id == models.BusinessProfile.user_id)
        .filter(models.Activity.status == "active")
        .distinct()
        .order_by(models.BusinessProfile.business_name)
        .all()
    )
    return [_to_public(db, business) for business in businesses]


@router.get("/{business_id}", response_model=schemas.BusinessPublicOut)
def get_public_business(business_id: str, db: Session = Depends(get_db)):
    business = db.query(models.BusinessProfile).filter(models.BusinessProfile.user_id == business_id).first()
    if not business:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy doanh nghiệp")
    return _to_public(db, business)
