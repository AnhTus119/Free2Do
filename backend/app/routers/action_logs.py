"""Nhật ký thao tác operator: ghi kèm từng thao tác và đọc theo trang hồ sơ đang xem."""
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.auth import get_current_operator
from app.database import get_db

router = APIRouter(prefix="/operator/action-logs", tags=["operator-action-logs"])


STATUS_LABELS = {
    "active": "Đang hoạt động", "pending": "Chờ duyệt", "hidden": "Đã ẩn", "rejected": "Từ chối", "expired": "Hết hạn",
    "cancelled": "Đã hủy", "blocked": "Đã khóa", "suspended": "Tạm khóa",
}


def status_change(previous: str, new: str) -> str:
    return f"{STATUS_LABELS.get(previous, previous)} → {STATUS_LABELS.get(new, new)}"


def log_action(db: Session, operator: models.Operator, action: str, target_type: str, target_id: str,
               business_id: str | None = None, detail: str | None = None) -> None:
    """Thêm vào session hiện tại; được commit cùng thao tác chính (thao tác lỗi thì không có log)."""
    db.add(models.OperatorActionLog(
        operator_id=operator.operator_id, target_type=target_type, target_id=target_id,
        business_id=business_id, action=action, detail=detail, created_at=datetime.utcnow(),
    ))


def log_user_action(db: Session, operator: models.Operator, user: models.User, action: str, detail: str | None = None) -> None:
    """Khách hàng hay doanh nghiệp tùy role hiện tại của user."""
    if user.role and user.role.role_name == "business":
        log_action(db, operator, action, "business", user.user_id, user.user_id, detail)
    else:
        log_action(db, operator, action, "customer", user.user_id, None, detail)


@router.get("", response_model=list[schemas.OperatorActionLogOut])
def list_action_logs(
    target_type: Literal["customer", "business", "activity"],
    target_id: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    """KH: thao tác với KH đó. DN: thao tác với DN + mọi hoạt động của DN.
    Hoạt động: thao tác cấp DN của chủ hoạt động + thao tác với chính hoạt động đó."""
    Log = models.OperatorActionLog
    if target_type == "customer":
        condition = and_(Log.target_type == "customer", Log.target_id == target_id)
    elif target_type == "business":
        condition = Log.business_id == target_id
    else:
        activity = db.query(models.Activity).filter(models.Activity.activity_id == target_id).first()
        if not activity:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")
        condition = or_(
            and_(Log.target_type == "activity", Log.target_id == target_id),
            and_(Log.target_type == "business", Log.target_id == activity.business_id),
        )
    rows = (
        db.query(Log).options(joinedload(Log.operator)).filter(condition)
        .order_by(Log.created_at.desc()).limit(200).all()
    )
    activity_ids = {row.target_id for row in rows if row.target_type == "activity"}
    names = dict(
        db.query(models.Activity.activity_id, models.Activity.name)
        .filter(models.Activity.activity_id.in_(activity_ids)).all()
    ) if activity_ids else {}
    return [
        schemas.OperatorActionLogOut(
            log_id=row.log_id, action=row.action, detail=row.detail, created_at=row.created_at,
            target_type=row.target_type, target_id=row.target_id,
            target_name=names.get(row.target_id) if row.target_type == "activity" else None,
            operator_name=row.operator.name if row.operator else "Operator đã xóa",
        )
        for row in rows
    ]
