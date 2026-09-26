from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_current_user
from app.database import get_db
from app.utils.distance import haversine_km

router = APIRouter(prefix="/search", tags=["search"])


def _opening_window_minutes(activity: models.Activity) -> Optional[int]:
    if activity.time_open is None or activity.time_close is None:
        return None
    start = activity.time_open.hour * 60 + activity.time_open.minute
    end = activity.time_close.hour * 60 + activity.time_close.minute
    return end - start if end >= start else 24 * 60 - start + end


def _score_activity(
    activity: models.Activity,
    payload: schemas.SearchParams,
    distance_km: float,
) -> float:
    parts: list[tuple[float, float]] = []
    parts.append((25.0, max(0.0, 1.0 - distance_km / payload.radius)))

    if payload.budget is not None:
        if activity.price is None:
            parts.append((25.0, 0.0))
        elif payload.budget == 0:
            parts.append((25.0, 1.0 if activity.price == 0 else 0.0))
        else:
            parts.append((25.0, max(0.0, 1.0 - activity.price / payload.budget)))

    if payload.category_ids:
        activity_categories = {item.category_id for item in activity.categories}
        overlap = len(activity_categories.intersection(payload.category_ids))
        parts.append((35.0, overlap / len(set(payload.category_ids))))

    if payload.free_time is not None:
        duration = _opening_window_minutes(activity)
        parts.append((15.0, min(1.0, duration / payload.free_time) if duration is not None else 0.0))

    total_weight = sum(weight for weight, _ in parts)
    return round(sum(weight * value for weight, value in parts) / total_weight * 100, 1)


@router.post("", response_model=list[schemas.ActivityWithScore])
def search_activities(
    payload: schemas.SearchParams,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Lọc và xếp hạng hoạt động ở backend; frontend chỉ hiển thị kết quả đã tính."""
    use_postgis = db.bind is not None and db.bind.dialect.name == "postgresql"
    query = db.query(models.Activity).filter(
        models.Activity.status == "active",
        models.Activity.latitude.is_not(None),
        models.Activity.longitude.is_not(None),
    )

    if payload.keyword:
        keyword = f"%{payload.keyword.strip()}%"
        query = query.filter(
            or_(
                models.Activity.name.ilike(keyword),
                models.Activity.description.ilike(keyword),
                models.Activity.address.ilike(keyword),
            )
        )
    if payload.budget is not None:
        query = query.filter(models.Activity.price.is_not(None), models.Activity.price <= payload.budget)
    if payload.category_ids:
        query = query.join(models.ActivityCategory).filter(
            models.ActivityCategory.category_id.in_(payload.category_ids)
        ).distinct()

    if use_postgis:
        query = query.filter(
            text(
                "extensions.ST_DWithin(activities.location, "
                "extensions.ST_SetSRID(extensions.ST_MakePoint(:search_lon, :search_lat), 4326)::extensions.geography, "
                ":radius_m)"
            )
        ).params(
            search_lon=payload.longitude,
            search_lat=payload.latitude,
            radius_m=payload.radius * 1000,
        )
    rows = []
    for activity in query.all():
        distance = haversine_km(payload.latitude, payload.longitude, activity.latitude, activity.longitude)
        if distance <= payload.radius:
            rows.append((activity, distance))

    results = []
    for activity, distance_km in rows:
        avg_rating, review_count = (
            db.query(func.avg(models.Review.rating), func.count(models.Review.review_id))
            .filter(models.Review.activity_id == activity.activity_id)
            .one()
        )
        results.append(
            schemas.ActivityWithScore(
                **schemas.Activity.model_validate(activity).model_dump(),
                match_score=_score_activity(activity, payload, distance_km),
                distance_km=round(distance_km, 2),
                business_name=activity.business.business_name,
                category_ids=[item.category_id for item in activity.categories],
                avg_rating=round(float(avg_rating), 1) if avg_rating is not None else None,
                review_count=review_count or 0,
            )
        )

    db.add(
        models.SearchHistory(
            user_id=user.user_id,
            keyword=payload.keyword,
            latitude=payload.latitude,
            longitude=payload.longitude,
            radius=payload.radius,
            budget=payload.budget,
            free_time=payload.free_time,
            created_at=datetime.now(UTC).replace(tzinfo=None),
        )
    )
    db.commit()
    sort_keys = {
        "match": lambda item: (-item.match_score, item.distance_km or 0),
        "distance": lambda item: (item.distance_km or 0, -item.match_score),
        "price": lambda item: (item.price is None, item.price or 0, -item.match_score),
        "rating": lambda item: (item.avg_rating is None, -(item.avg_rating or 0), -item.match_score),
    }
    return sorted(results, key=sort_keys[payload.sort_by])
