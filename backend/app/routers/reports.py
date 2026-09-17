from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

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
    activity = db.query(models.Activity).filter(models.Activity.activity_id == payload.activity_id).first()
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")

    report = models.Report(
        user_id=user.user_id,
        activity_id=payload.activity_id,
        reason=payload.reason,
        description=payload.description,
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
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    query = db.query(models.Report)
    if status_filter:
        query = query.filter(models.Report.status == status_filter)
    return query.order_by(models.Report.created_at.desc()).all()


@operator_router.patch("/{report_id}/resolve", response_model=schemas.Report)
def resolve_report(
    report_id: str,
    payload: schemas.ReportResolveRequest,
    db: Session = Depends(get_db),
    operator: models.Operator = Depends(get_current_operator),
):
    report = db.query(models.Report).filter(models.Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy báo cáo")
    if report.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Báo cáo đã được xử lý")

    if payload.action == "hide_activity":
        activity = report.activity
        if activity.status in ("pending", "active"):
            activity.status = "hidden"
            activity.verified_by = operator.operator_id
            activity.verified_at = datetime.utcnow()
            send_activity_hidden_email(activity.business.user.account.email, activity.name)

    report.status = "resolved"
    report.resolved_by = operator.operator_id
    report.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(report)
    return report
