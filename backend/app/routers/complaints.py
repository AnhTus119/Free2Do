from datetime import UTC, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload, selectinload

from app.database import get_db
from app import models, schemas
from app.auth import get_current_business_user, get_current_operator

router = APIRouter(tags=["complaints"])
UNRESOLVED = ("pending", "expired")


def expire_overdue_complaints(db: Session) -> int:
    """Khiếu nại chờ quá 30 ngày -> "expired". Gọi ở các API danh sách và trong vòng quét
    định kỳ của app/main.py (giống expire_overdue_activities), không cần cron riêng."""
    cutoff = datetime.now(UTC).replace(tzinfo=None) - models.COMPLAINT_DEADLINE
    count = (
        db.query(models.Complaint)
        .filter(models.Complaint.status == "pending", models.Complaint.created_at <= cutoff)
        .update({models.Complaint.status: "expired"}, synchronize_session=False)
    )
    if count:
        db.commit()
    return count


@router.post("/complaints", response_model=schemas.Complaint, status_code=status.HTTP_201_CREATED)
def create_complaint(
    payload: schemas.ComplaintCreate,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    review = (
        db.query(models.Review)
        .join(models.Activity, models.Activity.activity_id == models.Review.activity_id)
        .filter(
            models.Review.review_id == payload.review_id,
            models.Activity.business_id == business.user_id,
        )
        .first()
    )
    if not review:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy đánh giá")

    existing = (
        db.query(models.Complaint)
        .filter(
            models.Complaint.user_id == business.user_id,
            models.Complaint.review_id == payload.review_id,
            models.Complaint.status.in_(UNRESOLVED),
        )
        .first()
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Đánh giá đã có khiếu nại đang chờ xử lý")

    complaint = models.Complaint(
        user_id=business.user_id,
        review_id=payload.review_id,
        reason=payload.reason,
        description=payload.description,
        status="pending",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(complaint)
    db.commit()
    db.refresh(complaint)
    return complaint


@router.get("/business/complaints", response_model=list[schemas.Complaint])
def list_business_complaints(
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    expire_overdue_complaints(db)
    return (
        db.query(models.Complaint)
        .filter(models.Complaint.user_id == business.user_id)
        .order_by(models.Complaint.created_at.desc())
        .all()
    )


# ---------------------------------------------------------------------------
# Operator -- xử lý khiếu nại đánh giá
# ---------------------------------------------------------------------------
operator_router = APIRouter(prefix="/operator/complaints", tags=["operator-complaints"])


@operator_router.get("", response_model=list[schemas.Complaint])
def list_complaints(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    expire_overdue_complaints(db)
    query = db.query(models.Complaint).options(
        joinedload(models.Complaint.review).joinedload(models.Review.activity),
        joinedload(models.Complaint.review).joinedload(models.Review.user),
        joinedload(models.Complaint.review).selectinload(models.Review.media),
        joinedload(models.Complaint.review).joinedload(models.Review.reply),
        joinedload(models.Complaint.user).joinedload(models.User.business_profile),
    )
    if status_filter:
        query = query.filter(models.Complaint.status == status_filter)
    complaints = query.order_by(models.Complaint.created_at.desc()).all()
    return [schemas.Complaint(
        complaint_id=item.complaint_id,
        user_id=item.user_id,
        review_id=item.review_id,
        reason=item.reason,
        description=item.description,
        status=item.status,
        created_at=item.created_at,
        deadline=item.deadline,
        resolved_at=item.resolved_at,
        activity_name=item.review.activity.name if item.review and item.review.activity else None,
        activity_id=item.review.activity_id if item.review else None,
        activity_code=item.review.activity.code if item.review and item.review.activity else None,
        complainant_name=(
            item.user.business_profile.business_name if item.user and item.user.business_profile
            else (item.user.name if item.user else None)
        ),
        review_created_at=item.review.created_at if item.review else None,
        reply_content=item.review.reply.content if item.review and item.review.reply else None,
        reviewer_name=item.review.user.name if item.review and item.review.user else None,
        review_rating=item.review.rating if item.review else None,
        review_content=item.review.content if item.review else None,
        evidence=[schemas.ReviewMedia.model_validate(media) for media in item.review.media] if item.review else [],
    ) for item in complaints]


@operator_router.patch("/{complaint_id}/resolve", response_model=schemas.MessageResponse)
def resolve_complaint(
    complaint_id: str,
    payload: schemas.ComplaintResolveRequest,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    """Operator xử lý khiếu nại (xóa đánh giá bị khiếu nại hoặc bỏ qua) rồi xóa hẳn bản ghi
    khiếu nại khỏi database -- không lưu lại lịch sử sau khi đã xử lý (theo đúng đặc tả usecase)."""
    complaint = db.query(models.Complaint).filter(models.Complaint.complaint_id == complaint_id).first()
    if not complaint:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy khiếu nại")
    # Quá hạn 30 ngày vẫn xử lý được: hạn là của Operator, không phải lý do bỏ khiếu nại.
    if complaint.status not in UNRESOLVED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Khiếu nại đã được xử lý")

    if payload.action == "delete_review":
        review_id = complaint.review_id
        # Xóa complaint (kể cả complaint khác cùng trỏ tới review này) trước khi xóa review,
        # vì complaints.review_id là FK not null -- xóa review trước sẽ vi phạm ràng buộc.
        db.query(models.Complaint).filter(models.Complaint.review_id == review_id).delete()
        db.query(models.ReviewMedia).filter(models.ReviewMedia.review_id == review_id).delete()
        # Phản hồi của doanh nghiệp (và media của phản hồi) cũng trỏ FK tới review.
        reply_ids = [row.reply_id for row in db.query(models.ReviewReply.reply_id).filter(models.ReviewReply.review_id == review_id)]
        if reply_ids:
            db.query(models.ReviewReplyMedia).filter(models.ReviewReplyMedia.reply_id.in_(reply_ids)).delete(synchronize_session=False)
            db.query(models.ReviewReply).filter(models.ReviewReply.reply_id.in_(reply_ids)).delete(synchronize_session=False)
        db.query(models.Review).filter(models.Review.review_id == review_id).delete()
        db.commit()
        return {"message": "Đã xóa đánh giá và xử lý khiếu nại"}

    db.delete(complaint)
    db.commit()
    return {"message": "Đã xử lý và xóa khiếu nại"}
