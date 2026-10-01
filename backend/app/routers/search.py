import time
from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session, joinedload, selectinload

from app import models, schemas
from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.utils.distance import haversine_km
from app.utils.geocoding import resolve_location

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/location", response_model=schemas.LocationResolveOut)
def resolve_search_location(
    query: str = Query(..., min_length=3, max_length=1000),
    _user: models.User = Depends(get_current_user),
):
    """Resolve one explicit address/Google Maps link; this is not autocomplete."""
    try:
        result = resolve_location(query)
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Không thể kết nối dịch vụ bản đồ") from exc
    if not result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy địa chỉ này")
    latitude, longitude, display_name, source = result
    return schemas.LocationResolveOut(
        latitude=latitude,
        longitude=longitude,
        display_name=display_name,
        source=source,
    )


# Việc có PostGIS hay không gần như không đổi, nên chỉ hỏi database một lần mỗi
# 10 phút thay vì thêm một lượt truy vấn information_schema cho MỖI lần tìm kiếm.
_POSTGIS_CACHE_SECONDS = 600
_postgis_cache: dict[str, float | bool] = {"value": False, "checked_at": 0.0}


def _postgis_available(db: Session) -> bool:
    """Chỉ dùng ST_DWithin khi cả extension và cột geography đã sẵn sàng."""
    if (
        not settings.POSTGIS_EXTENSION_ENABLED
        or db.bind is None
        or db.bind.dialect.name != "postgresql"
    ):
        return False
    now = time.monotonic()
    if _postgis_cache["checked_at"] and now - _postgis_cache["checked_at"] < _POSTGIS_CACHE_SECONDS:
        return bool(_postgis_cache["value"])
    available = bool(
        db.execute(
            text(
                "SELECT "
                "EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') "
                "AND EXISTS ("
                "  SELECT 1 FROM information_schema.columns "
                "  WHERE table_schema = 'public' AND table_name = 'activities' "
                "  AND column_name = 'location'"
                ")"
            )
        ).scalar()
    )
    _postgis_cache.update(value=available, checked_at=now)
    return available


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


def _save_search_history(bind, values: dict) -> None:
    """Lưu lịch sử bằng session riêng (session của request đã đóng khi task chạy)."""
    with Session(bind=bind) as session:
        try:
            session.add(models.SearchHistory(**values))
            session.commit()
        except Exception:
            session.rollback()


@router.post("", response_model=list[schemas.ActivityWithScore])
def search_activities(
    payload: schemas.SearchParams,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    background_tasks: BackgroundTasks = None,
):
    """Lọc và xếp hạng hoạt động ở backend; frontend chỉ hiển thị kết quả đã tính."""
    use_postgis = _postgis_available(db)
    query = db.query(models.Activity).options(
        selectinload(models.Activity.categories).joinedload(models.ActivityCategory.category),
        selectinload(models.Activity.media),
        joinedload(models.Activity.business),
    ).filter(
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
        if distance > payload.radius:
            continue
        duration = _opening_window_minutes(activity)
        if payload.free_time is not None and (duration is None or duration < payload.free_time):
            continue
        rows.append((activity, distance))

    activity_ids = [activity.activity_id for activity, _distance in rows]
    rating_rows = (
        db.query(
            models.Review.activity_id,
            func.avg(models.Review.rating),
            func.count(models.Review.review_id),
        )
        .filter(models.Review.activity_id.in_(activity_ids))
        .group_by(models.Review.activity_id)
        .all()
        if activity_ids else []
    )
    ratings = {activity_id: (average, count) for activity_id, average, count in rating_rows}

    results = []
    for activity, distance_km in rows:
        avg_rating, review_count = ratings.get(activity.activity_id, (None, 0))
        image = next((item.media_url for item in activity.media if item.media_type == "image"), None)
        results.append(
            schemas.ActivityWithScore(
                **schemas.Activity.model_validate(activity).model_dump(),
                match_score=_score_activity(activity, payload, distance_km),
                distance_km=round(distance_km, 2),
                business_name=activity.business.business_name,
                category_ids=[item.category_id for item in activity.categories],
                category_names=[item.category.name for item in activity.categories if item.category],
                avg_rating=round(float(avg_rating), 1) if avg_rating is not None else None,
                review_count=review_count or 0,
                image_url=image,
            )
        )

    if payload.record_history:
        history = dict(
            user_id=user.user_id,
            keyword=payload.keyword,
            latitude=payload.latitude,
            longitude=payload.longitude,
            radius=payload.radius,
            budget=payload.budget,
            free_time=payload.free_time,
            created_at=datetime.now(UTC).replace(tzinfo=None),
        )
        if background_tasks is not None:
            # Ghi lịch sử sau khi đã trả kết quả để người dùng không phải chờ thêm
            # các lượt INSERT/COMMIT tới database.
            background_tasks.add_task(_save_search_history, db.get_bind(), history)
        else:
            _save_search_history(db.get_bind(), history)
    sort_keys = {
        "match": lambda item: (-item.match_score, item.distance_km or 0),
        "distance": lambda item: (item.distance_km or 0, -item.match_score),
        "price": lambda item: (item.price is None, item.price or 0, -item.match_score),
        "rating": lambda item: (item.avg_rating is None, -(item.avg_rating or 0), -item.match_score),
    }
    return sorted(results, key=sort_keys[payload.sort_by])
