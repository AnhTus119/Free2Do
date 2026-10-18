from datetime import datetime
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user, get_current_operator
from app.utils.email import send_activity_hidden_email

router = APIRouter(tags=["reports"])


@router.post("/reports", response_model=schemas.Report, status_code=status.HTTP_201_CREATED)
def create_report(
    payload: schemas.ReportCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    reason, description = payload.reason.strip(), (payload.description or "").strip()
    # Cột description là bắt buộc: báo lỗi rõ ràng thay vì để database từ chối (500).
    if not reason:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Vui lòng nhập lý do báo cáo")
    if not description:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Vui lòng nhập mô tả báo cáo")
    activity = db.query(models.Activity).filter(models.Activity.activity_id == payload.activity_id).first()
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")

    report = models.Report(
        user_id=user.user_id,
        activity_id=payload.activity_id,
        reason=reason,
        description=description,
        status="pending",
        created_at=datetime.utcnow(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


# ---------------------------------------------------------------------------
# Operator -- xử lý báo cáo hoạt động
# ---------------------------------------------------------------------------
operator_router = APIRouter(prefix="/operator/reports", tags=["operator-reports"])


@operator_router.get("", response_model=list[schemas.Report])
def list_reports(
    status_filter: Optional[Literal["pending", "resolved", "dismissed"]] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    query = db.query(models.Report).options(joinedload(models.Report.activity), joinedload(models.Report.user))
    if status_filter:
        query = query.filter(models.Report.status == status_filter)
    return [
        schemas.Report.model_validate(report).model_copy(update={
            "activity_name": report.activity.name if report.activity else None,
            "activity_code": report.activity.code if report.activity else None,
            "reporter_name": report.user.name if report.user else None,
        })
        for report in query.order_by(models.Report.created_at.desc()).all()
    ]


@operator_router.patch("/{report_id}/resolve", response_model=schemas.MessageResponse)
def resolve_report(
    report_id: str,
    payload: schemas.ReportResolveRequest,
    db: Session = Depends(get_db),
    operator: models.Operator = Depends(get_current_operator),
):
    """Operator xử lý báo cáo: ẩn hoạt động ("resolved") hoặc bỏ qua ("dismissed"). Bản ghi được
    giữ lại để lọc theo trạng thái; app/retention.py xóa hẳn sau 60 ngày kể từ lúc xử lý."""
    report = db.query(models.Report).filter(models.Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy báo cáo")
    if report.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Báo cáo đã được xử lý")

    now = datetime.utcnow()
    hidden_activity = None
    if payload.action == "hide_activity":
        activity = report.activity
        if activity.status in ("pending", "active"):
            activity.status = "hidden"
            activity.verified_by = operator.operator_id
            activity.verified_at = now
            activity.updated_at = now
            hidden_activity = activity

    report.status = "resolved" if payload.action == "hide_activity" else "dismissed"
    report.resolved_at = now
    report.resolved_by = operator.operator_id
    db.commit()
    if hidden_activity is not None:
        send_activity_hidden_email(hidden_activity)  # sau commit, lỗi email không làm hỏng thao tác
    return {"message": "Đã xử lý báo cáo"}
