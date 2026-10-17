import logging
import unicodedata
from datetime import datetime, timedelta
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import func

from app.database import get_db
from app import models, schemas
from app.auth import get_current_business_user, get_current_operator
from app.utils.email import (
    send_activity_approved_email,
    send_activity_expired_email,
    send_activity_hidden_email,
    send_activity_rejected_email,
)
import requests

from app.utils.geocoding import address_matches_place, address_shape_ok, geocode_address, resolve_location
from app.utils.google_maps import is_google_maps_url
from app.utils.distance import haversine_km
from app.services.supabase_storage import delete_asset

router = APIRouter(prefix="/activities", tags=["activities"])
logger = logging.getLogger("free2do.activities")
DUPLICATE_WINDOW_SECONDS = 10
PENDING_REVIEW_DAYS = 30  # chờ duyệt quá số ngày này thì hoạt động hết hạn
# Hoạt động ở các trạng thái này không còn "chiếm chỗ": được phép gửi hoạt động mới giống hệt.
RELEASED_STATUSES = ("expired", "rejected", "cancelled")
SAME_PLACE_KM = 0.05  # hai toạ độ cách nhau dưới 50 m coi là cùng vị trí


def _review_deadline(now: datetime | None = None) -> datetime:
    return (now or datetime.utcnow()) + timedelta(days=PENDING_REVIEW_DAYS)


def expire_overdue_activities(db: Session) -> int:
    """Chuyển hoạt động chờ duyệt quá hạn sang "expired" và gửi email cho doanh nghiệp.

    Gọi ở các API đọc danh sách và chạy định kỳ trong app/main.py, nên không cần cron riêng."""
    now = datetime.utcnow()
    overdue = (
        db.query(models.Activity)
        .filter(
            models.Activity.status == "pending",
            models.Activity.expire_at.isnot(None),
            models.Activity.expire_at <= now,
        )
        .all()
    )
    if not overdue:
        return 0
    for activity in overdue:
        activity.status = "expired"
        activity.updated_at = now
    db.commit()
    for activity in overdue:
        send_activity_expired_email(activity)  # best-effort, lỗi email đã được log bên trong
    logger.info("Đã chuyển %s hoạt động sang hết hạn", len(overdue))
    return len(overdue)


def _normalized(text: str | None) -> str:
    return " ".join(unicodedata.normalize("NFC", text or "").casefold().split())


def _ensure_not_duplicate(
    db: Session,
    name: str,
    address: str | None,
    latitude: float | None,
    longitude: float | None,
    exclude_id: str | None = None,
) -> None:
    """Toàn hệ thống không có 2 hoạt động trùng nhau: phải khác tên hoặc khác vị trí."""
    target_name, target_address = _normalized(name), _normalized(address)
    # ponytail: quét mọi hoạt động còn hiệu lực trong Python (vài trăm dòng), đủ nhanh;
    # nếu dữ liệu lên hàng chục nghìn thì thêm cột tên đã chuẩn hoá + index.
    query = db.query(
        models.Activity.activity_id, models.Activity.code, models.Activity.name,
        models.Activity.address, models.Activity.latitude, models.Activity.longitude,
    ).filter(models.Activity.status.notin_(RELEASED_STATUSES))
    if exclude_id:
        query = query.filter(models.Activity.activity_id != exclude_id)
    for other in query.all():
        if _normalized(other.name) != target_name:
            continue
        same_address = bool(target_address) and _normalized(other.address) == target_address
        near = (
            None not in (latitude, longitude, other.latitude, other.longitude)
            and haversine_km(latitude, longitude, other.latitude, other.longitude) < SAME_PLACE_KM
        )
        if same_address or near:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Đã có hoạt động trùng tên và vị trí ({other.code or other.name}). "
                "Hãy đổi tên cơ sở hoặc vị trí, hoặc chờ hoạt động cũ hết hạn.",
            )


def _coordinates(latitude, longitude, google_maps_url, address=None):
    """Xác định toạ độ và xác minh địa chỉ. Lỗi trả về ValueError với thông báo hiển thị cho người dùng."""
    if address is not None and not address_shape_ok(address):
        raise ValueError("Địa chỉ không hợp lệ. Hãy nhập địa chỉ cụ thể (số nhà, đường, phường...) để tìm được trên bản đồ.")
    # Link Google Maps là nguồn toạ độ chính, kể cả khi client gửi kèm toạ độ cũ.
    if google_maps_url:
        if not is_google_maps_url(google_maps_url):
            raise ValueError("Hãy nhập link Google Maps hợp lệ.")
        resolved = resolve_location(google_maps_url, address)
        if not resolved:
            raise ValueError("Không xác minh được link Google Maps; hãy kiểm tra link hoặc chọn lại vị trí.")
        if address and address_matches_place(address, resolved[0], resolved[1]) is False:
            raise ValueError("Địa chỉ không khớp với vị trí trên Google Maps; hãy kiểm tra và nhập lại địa chỉ.")
        return resolved[0], resolved[1]
    if latitude is not None and longitude is not None:
        return latitude, longitude
    if address:
        try:
            resolved = geocode_address(address)
        except requests.RequestException:
            raise ValueError("Chưa xác minh được địa chỉ lúc này. Hãy dán link Google Maps của địa điểm rồi thử lại.")
        if not resolved:
            raise ValueError("Không tìm thấy địa chỉ này trên bản đồ. Hãy nhập lại địa chỉ hoặc dán link Google Maps.")
        return resolved[0], resolved[1]
    return latitude, longitude


# Nạp sẵn quan hệ cần cho ActivityPublicOut: 3 truy vấn cho cả danh sách thay vì
# 3 truy vấn lazy-load cho TỪNG hoạt động.
DETAIL_LOAD_OPTIONS = (
    joinedload(models.Activity.business),
    selectinload(models.Activity.categories),
    selectinload(models.Activity.media),
)


def _review_stats(db: Session, activity_ids: list[str]) -> dict[str, tuple[float | None, int]]:
    """Điểm trung bình + số đánh giá của nhiều hoạt động chỉ bằng 1 truy vấn."""
    if not activity_ids:
        return {}
    rows = (
        db.query(
            models.Review.activity_id,
            func.avg(models.Review.rating),
            func.count(models.Review.review_id),
        )
        .filter(models.Review.activity_id.in_(activity_ids))
        .group_by(models.Review.activity_id)
        .all()
    )
    return {activity_id: (average, count) for activity_id, average, count in rows}


def _is_approved(activity: models.Activity) -> bool:
    return activity.status == "active" or (
        activity.status == "pending" and activity.verified_at is not None
    )


def _to_detail(
    db: Session,
    activity: models.Activity,
    origin_latitude: float | None = None,
    origin_longitude: float | None = None,
    stats: dict[str, tuple[float | None, int]] | None = None,
    include_business_media: bool = False,
) -> schemas.ActivityPublicOut:
    if stats is None:
        stats = _review_stats(db, [activity.activity_id])
    avg_rating, review_count = stats.get(activity.activity_id, (None, 0))
    return schemas.ActivityPublicOut(
        **schemas.Activity.model_validate(activity).model_dump(),
        business_name=activity.business.business_name,
        business_avatar_url=activity.business.avatar_url,
        is_approved=_is_approved(activity),
        # Chỉ trang chi tiết mới cần ảnh gallery của doanh nghiệp (tránh N+1 truy vấn ở danh sách).
        business_media=[
            schemas.ActivityBusinessPhoto(media_url=item.media_url, media_type=item.media_type)
            for item in sorted(activity.business.media, key=lambda m: (m.created_at, m.media_id))
            if item.media_kind == "gallery"
        ] if include_business_media else [],
        category_ids=[c.category_id for c in activity.categories],
        media=[schemas.ActivityMedia.model_validate(m) for m in sorted(activity.media, key=lambda item: (item.media_kind != "cover", item.media_id))],
        avg_rating=round(float(avg_rating), 1) if avg_rating else None,
        review_count=review_count or 0,
        distance_km=(
            round(haversine_km(origin_latitude, origin_longitude, activity.latitude, activity.longitude), 2)
            if isinstance(origin_latitude, (int, float)) and isinstance(origin_longitude, (int, float))
            and activity.latitude is not None and activity.longitude is not None
            else None
        ),
    )


def _to_details(db: Session, activities: list[models.Activity]) -> list[schemas.ActivityPublicOut]:
    """Chuyển cả danh sách hoạt động sang schema với số truy vấn cố định."""
    approved_ids = [activity.activity_id for activity in activities if _is_approved(activity)]
    stats = _review_stats(db, approved_ids)
    return [_to_detail(db, activity, stats=stats) for activity in activities]


def _set_categories(db: Session, activity_id: str, category_ids: list[str]) -> None:
    db.query(models.ActivityCategory).filter(models.ActivityCategory.activity_id == activity_id).delete()
    for category_id in category_ids:
        db.add(models.ActivityCategory(activity_id=activity_id, category_id=category_id))


# ---------------------------------------------------------------------------
# Customer -- xem chi tiết hoạt động (chỉ thấy pending/active, không thấy hidden/cancelled)
# ---------------------------------------------------------------------------
@router.get("", response_model=list[schemas.ActivityPublicOut])
def list_public_activities(
    status_filter: Literal["active", "pending", "all"] = Query("active", alias="status"),
    db: Session = Depends(get_db),
):
    """Danh sách hoạt động công khai cho customer: chỉ hoạt động đã duyệt và đang hiển thị.

    ``status`` được giữ để không vỡ link cũ nhưng mọi giá trị đều trả về ``active``;
    hoạt động chờ duyệt/bị ẩn/đã hủy chỉ xem qua API của business và operator.
    """
    query = db.query(models.Activity).filter(models.Activity.status == "active")
    activities = query.options(*DETAIL_LOAD_OPTIONS).order_by(models.Activity.created_at.desc()).all()
    return _to_details(db, activities)


@router.get("/{activity_id}", response_model=schemas.ActivityPublicOut)
def get_activity(
    activity_id: str,
    latitude: float | None = Query(None, ge=-90, le=90),
    longitude: float | None = Query(None, ge=-180, le=180),
    db: Session = Depends(get_db),
):
    activity = (
        db.query(models.Activity)
        .options(*DETAIL_LOAD_OPTIONS)
        .filter(models.Activity.activity_id == activity_id)
        .first()
    )
    if not activity or activity.status != "active":  # customer không thấy hoạt động chưa duyệt/bị ẩn
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")
    return _to_detail(db, activity, latitude, longitude, include_business_media=True)


# ---------------------------------------------------------------------------
# Business -- quản lý hoạt động của chính mình
# ---------------------------------------------------------------------------
def _create_activity_record(
    db: Session,
    business: models.BusinessProfile,
    payload: schemas.ActivityCreate,
    *,
    operator: models.Operator | None = None,
) -> models.Activity:
    """Tạo hoạt động. Business tự tạo -> chờ duyệt; Operator tạo -> duyệt và hiển thị ngay."""
    now = datetime.utcnow()
    if not payload.google_maps_url:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Link Google Maps là bắt buộc để xác minh vị trí")
    if not payload.always_available and (not payload.available_from or not payload.available_until):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hãy nhập ngày bắt đầu và ngày kết thúc hoặc chọn mở vĩnh viễn")
    if payload.available_from and payload.available_until and payload.available_until < payload.available_from:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ngày kết thúc phải sau ngày bắt đầu")
    try:
        latitude, longitude = _coordinates(
            payload.latitude, payload.longitude, payload.google_maps_url, payload.address
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Không thể xác định vị trí hoạt động") from exc
    # Chặn bấm lặp/gửi lại: cùng doanh nghiệp + cùng tên trong vài giây -> trả lại bản ghi vừa tạo.
    recent = (
        db.query(models.Activity)
        .filter(
            models.Activity.business_id == business.user_id,
            models.Activity.name == payload.name,
            models.Activity.created_at >= now - timedelta(seconds=DUPLICATE_WINDOW_SECONDS),
        )
        .order_by(models.Activity.created_at.desc())
        .first()
    )
    if recent:
        return recent
    _ensure_not_duplicate(db, payload.name, payload.address, latitude, longitude)
    activity = models.Activity(
        business_id=business.user_id,
        name=payload.name,
        description=payload.description,
        price=payload.price,
        price_text=(f"{int(payload.price):,} ₫".replace(",", ".") if payload.price is not None else None),
        address=payload.address,
        latitude=latitude,
        longitude=longitude,
        time_open=payload.time_open,
        time_close=payload.time_close,
        available_from=payload.available_from,
        available_until=payload.available_until,
        always_available=payload.always_available,
        status="active" if operator else "pending",
        verified_by=operator.operator_id if operator else None,
        verified_at=now if operator else None,
        expire_at=None if operator else _review_deadline(now),
        created_at=now,
        source_url=payload.source_url,
        google_maps_url=payload.google_maps_url,
    )
    db.add(activity)
    db.flush()
    _set_categories(db, activity.activity_id, payload.category_ids)
    db.commit()
    db.refresh(activity)
    return activity


@router.post("", response_model=schemas.ActivityDetail, status_code=status.HTTP_201_CREATED)
def create_activity(
    payload: schemas.ActivityCreate,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    activity = _create_activity_record(db, business, payload)
    # Operator nhận thông báo trong web (GET /notifications, loại pending_activity), không gửi Gmail.
    return _to_detail(db, activity)


@router.patch("/{activity_id}", response_model=schemas.ActivityDetail)
def update_activity(
    activity_id: str,
    payload: schemas.ActivityUpdate,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity or activity.business_id != business.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")

    data = payload.model_dump(exclude_unset=True, exclude={"category_ids"})
    if "price" in data:
        data["price_text"] = f"{int(data['price']):,} ₫".replace(",", ".") if data["price"] is not None else None
    effective_always = data.get("always_available", activity.always_available)
    effective_from = data.get("available_from", activity.available_from)
    effective_until = data.get("available_until", activity.available_until)
    if not effective_always and (not effective_from or not effective_until):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hãy nhập ngày bắt đầu và ngày kết thúc hoặc chọn mở vĩnh viễn")
    if effective_from and effective_until and effective_until < effective_from:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ngày kết thúc phải sau ngày bắt đầu")
    if "google_maps_url" in data or "address" in data:
        maps_url = data.get("google_maps_url", activity.google_maps_url)
        if not maps_url:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Link Google Maps là bắt buộc để xác minh vị trí")
        try:
            coordinates = _coordinates(
                data.get("latitude", activity.latitude), data.get("longitude", activity.longitude), maps_url,
                data.get("address", activity.address),
            )
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Không thể xác định vị trí hoạt động") from exc
        if coordinates != (None, None):
            data["latitude"], data["longitude"] = coordinates
        data["google_maps_url"] = maps_url
    resubmit = activity.status in ("active", "expired")
    if resubmit or {"name", "address", "latitude", "longitude"} & data.keys():
        _ensure_not_duplicate(
            db, data.get("name", activity.name), data.get("address", activity.address),
            data.get("latitude", activity.latitude), data.get("longitude", activity.longitude),
            exclude_id=activity.activity_id,
        )
    for field, value in data.items():
        setattr(activity, field, value)
    if payload.category_ids is not None:
        _set_categories(db, activity.activity_id, payload.category_ids)

    # Sửa hoạt động đang hiển thị hoặc gửi lại hoạt động đã hết hạn -> chờ duyệt lại 30 ngày.
    # Giữ dấu xác nhận cũ để các trang Business vẫn nhận ra hoạt động từng được duyệt.
    if resubmit:
        activity.status = "pending"
        activity.expire_at = _review_deadline()

    activity.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(activity)
    return _to_detail(db, activity)


@router.delete("/{activity_id}", response_model=schemas.MessageResponse)
def cancel_activity(
    activity_id: str,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity or activity.business_id != business.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")

    activity.status = "cancelled"
    activity.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Đã hủy hoạt động"}


@router.delete("/media/{media_id}", response_model=schemas.MessageResponse)
def delete_activity_media(
    media_id: str,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    media = db.query(models.ActivityMedia).filter(models.ActivityMedia.media_id == media_id).first()
    if not media or media.activity.business_id != business.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy media")

    if media.public_id:
        try:
            delete_asset(media.public_id, media.media_type)
        except Exception as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Không thể xóa file trên Supabase Storage") from exc
    db.delete(media)
    db.commit()
    return {"message": "Đã xóa media"}


# ---------------------------------------------------------------------------
# Operator -- duyệt / ẩn hoạt động
# ---------------------------------------------------------------------------
operator_router = APIRouter(prefix="/operator/activities", tags=["operator-activities"])


@operator_router.post("", response_model=schemas.ActivityDetail, status_code=status.HTTP_201_CREATED)
def operator_create_activity(
    payload: schemas.OperatorActivityCreate,
    db: Session = Depends(get_db),
    operator: models.Operator = Depends(get_current_operator),
):
    """Operator tạo hoạt động thay doanh nghiệp. Doanh nghiệp phải đã có tài khoản trong hệ thống."""
    business = db.query(models.BusinessProfile).filter(models.BusinessProfile.user_id == payload.business_id).first()
    if not business:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Không tìm thấy doanh nghiệp. Operator chỉ tạo hoạt động cho doanh nghiệp đã có tài khoản.",
        )
    activity = _create_activity_record(db, business, payload, operator=operator)
    return _to_detail(db, activity)


@operator_router.get("", response_model=list[schemas.ActivityAdminOut])
def list_activities_for_review(
    status_filter: Optional[str] = Query(None, alias="status"),
    business_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    expire_overdue_activities(db)
    query = db.query(models.Activity).options(*DETAIL_LOAD_OPTIONS)
    if status_filter:
        query = query.filter(models.Activity.status == status_filter)
    if business_id:
        query = query.filter(models.Activity.business_id == business_id)
    activities = query.order_by(models.Activity.created_at.desc()).all()
    stats = _review_stats(db, [activity.activity_id for activity in activities])

    return [
        schemas.ActivityAdminOut(
            **_to_detail(db, activity, stats=stats).model_dump(),
            verified_by=activity.verified_by,
            verified_at=activity.verified_at,
        )
        for activity in activities
    ]


@operator_router.get("/summary/counts", response_model=schemas.ActivitySummaryOut)
def get_activity_summary(
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    """Các bộ đếm của trang Hoạt động được tính trực tiếp trong database."""
    expire_overdue_activities(db)
    grouped = dict(
        db.query(models.Activity.status, func.count(models.Activity.activity_id))
        .group_by(models.Activity.status)
        .all()
    )
    return schemas.ActivitySummaryOut(
        total_count=sum(grouped.values()),
        active_count=grouped.get("active", 0),
        pending_count=grouped.get("pending", 0),
        hidden_count=grouped.get("hidden", 0),
        cancelled_count=grouped.get("cancelled", 0),
        expired_count=grouped.get("expired", 0),
        rejected_count=grouped.get("rejected", 0),
    )


@operator_router.get("/{activity_id}", response_model=schemas.ActivityAdminOut)
def get_activity_for_review(
    activity_id: str,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    """Operator xem chi tiết hoạt động ở bất kỳ trạng thái nào (kể cả hidden/cancelled)."""
    activity = (
        db.query(models.Activity)
        .options(*DETAIL_LOAD_OPTIONS)
        .filter(models.Activity.activity_id == activity_id)
        .first()
    )
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")
    return schemas.ActivityAdminOut(
        **_to_detail(db, activity).model_dump(),
        verified_by=activity.verified_by,
        verified_at=activity.verified_at,
    )


@operator_router.patch("/{activity_id}", response_model=schemas.ActivityDetail)
def update_activity_as_operator(
    activity_id: str,
    payload: schemas.ActivityUpdate,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    """Operator sửa trực tiếp thông tin hoạt động (không cần đổi trạng thái)."""
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")

    data = payload.model_dump(exclude_unset=True, exclude={"category_ids"})
    if "price" in data:
        data["price_text"] = f"{int(data['price']):,} ₫".replace(",", ".") if data["price"] is not None else None
    effective_always = data.get("always_available", activity.always_available)
    effective_from = data.get("available_from", activity.available_from)
    effective_until = data.get("available_until", activity.available_until)
    if not effective_always and (not effective_from or not effective_until):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hãy nhập ngày bắt đầu và ngày kết thúc hoặc chọn mở vĩnh viễn")
    if effective_from and effective_until and effective_until < effective_from:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ngày kết thúc phải sau ngày bắt đầu")
    if "google_maps_url" in data or "address" in data:
        maps_url = data.get("google_maps_url", activity.google_maps_url)
        if not maps_url:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Link Google Maps là bắt buộc để xác minh vị trí")
        try:
            coordinates = _coordinates(
                data.get("latitude", activity.latitude), data.get("longitude", activity.longitude), maps_url,
                data.get("address", activity.address),
            )
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Không thể xác định vị trí hoạt động") from exc
        if coordinates != (None, None):
            data["latitude"], data["longitude"] = coordinates
        data["google_maps_url"] = maps_url
    if {"name", "address", "latitude", "longitude"} & data.keys():
        _ensure_not_duplicate(
            db, data.get("name", activity.name), data.get("address", activity.address),
            data.get("latitude", activity.latitude), data.get("longitude", activity.longitude),
            exclude_id=activity.activity_id,
        )
    for field, value in data.items():
        setattr(activity, field, value)
    if payload.category_ids is not None:
        _set_categories(db, activity.activity_id, payload.category_ids)

    activity.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(activity)
    return _to_detail(db, activity)


@operator_router.patch("/{activity_id}/status", response_model=schemas.Activity)
def set_activity_status(
    activity_id: str,
    payload: schemas.ActivityStatusUpdate,
    db: Session = Depends(get_db),
    operator: models.Operator = Depends(get_current_operator),
):
    """Đổi trạng thái hoạt động sang bất kỳ giá trị hợp lệ nào -- linh hoạt hơn approve/hide
    (vd trả 1 activity đã hidden về active mà không cần đi qua lại luồng duyệt)."""
    expire_overdue_activities(db)
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")
    if activity.status == "expired" and payload.status == "active":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hoạt động đã hết hạn chờ duyệt nên không thể duyệt nữa")

    activity.status = payload.status
    if payload.status == "active":
        activity.verified_by = operator.operator_id
        activity.verified_at = datetime.utcnow()
        activity.expire_at = None
    elif payload.status == "pending":
        activity.expire_at = _review_deadline()
    db.commit()
    db.refresh(activity)
    return activity


@operator_router.patch("/{activity_id}/approve", response_model=schemas.Activity)
def approve_activity(
    activity_id: str,
    db: Session = Depends(get_db),
    operator: models.Operator = Depends(get_current_operator),
):
    expire_overdue_activities(db)
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")
    if activity.status == "expired":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hoạt động đã hết hạn chờ duyệt nên không thể duyệt nữa")
    if activity.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hoạt động không ở trạng thái chờ duyệt")

    activity.status = "active"
    activity.verified_by = operator.operator_id
    activity.verified_at = datetime.utcnow()
    activity.expire_at = None
    db.commit()
    db.refresh(activity)

    send_activity_approved_email(activity)
    return activity


@operator_router.patch("/{activity_id}/hide", response_model=schemas.Activity)
def hide_activity(
    activity_id: str,
    db: Session = Depends(get_db),
    operator: models.Operator = Depends(get_current_operator),
):
    """Dùng để: (1) từ chối hoạt động đang pending, hoặc (2) ẩn hoạt động active do vi phạm."""
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")
    if activity.status not in ("pending", "active"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hoạt động đã ở trạng thái ẩn hoặc đã hủy")

    activity.status = "hidden"
    activity.verified_by = operator.operator_id
    activity.verified_at = datetime.utcnow()
    db.commit()
    db.refresh(activity)

    send_activity_hidden_email(activity)
    return activity


@operator_router.patch("/{activity_id}/reject", response_model=schemas.Activity)
def reject_activity(
    activity_id: str,
    payload: schemas.ActivityRejectRequest,
    db: Session = Depends(get_db),
    operator: models.Operator = Depends(get_current_operator),
):
    """Từ chối hoạt động đang chờ duyệt, lưu lý do và gửi email cho doanh nghiệp."""
    expire_overdue_activities(db)
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")
    if activity.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chỉ từ chối được hoạt động đang chờ duyệt")

    activity.status = "rejected"
    activity.rejection_reason = payload.reason.strip()
    activity.verified_by = operator.operator_id
    activity.verified_at = datetime.utcnow()
    activity.expire_at = None
    activity.updated_at = activity.verified_at
    db.commit()
    db.refresh(activity)

    send_activity_rejected_email(activity)
    return activity


@operator_router.delete("/{activity_id}", response_model=schemas.MessageResponse)
def delete_activity_as_operator(
    activity_id: str,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    """Gỡ hoạt động đang hiển thị khỏi nền tảng. Xóa mềm (trạng thái "cancelled") để giữ
    lịch sử đánh giá, nhóm và báo cáo đang trỏ tới hoạt động."""
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")
    if activity.status != "active":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chỉ xóa được hoạt động đang hiển thị")

    activity.status = "cancelled"
    activity.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Đã xóa hoạt động"}
