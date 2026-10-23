"""Xóa vĩnh viễn dữ liệu đã kết thúc quá 60 ngày (chạy trong vòng quét định kỳ của app/main.py).

- Hoạt động "rejected" / "cancelled" / "expired" / "hidden": 60 ngày kể từ lần đổi trạng thái cuối,
  xóa cùng mọi dữ liệu phụ thuộc (đánh giá + ảnh + phản hồi + khiếu nại, bookmark, báo cáo,
  phiếu bầu nhóm, ảnh/video) và file trên Storage. Nhóm đã chọn hoạt động đó vẫn giữ, chỉ bỏ chọn.
- Báo cáo đã xử lý ("resolved" / "dismissed"): 60 ngày kể từ resolved_at.
Hoạt động "active"/"pending" và báo cáo "pending" không bao giờ bị xóa ở đây.
"""
import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app import models
from app.services.supabase_storage import StorageNotConfigured, delete_asset

logger = logging.getLogger("free2do.retention")

RETENTION = timedelta(days=60)
PURGEABLE_ACTIVITY_STATUSES = ("rejected", "cancelled", "expired", "hidden")
HANDLED_REPORT_STATUSES = ("resolved", "dismissed")


def _last_status_change(activity: models.Activity) -> datetime:
    # Một số đường đổi trạng thái cũ chỉ ghi verified_at, nên lấy mốc muộn nhất đang có.
    return max(t for t in (activity.updated_at, activity.verified_at, activity.created_at) if t)


def _delete_files(files: list[tuple[str, str]]) -> None:
    for public_id, media_type in files:
        try:
            delete_asset(public_id, media_type)
        except StorageNotConfigured:
            return
        except Exception:  # noqa: BLE001 -- file mồ côi không được làm hỏng việc dọn database
            logger.exception("Không xóa được file %s trên Storage", public_id)


def purge_stale_records(db: Session, now: datetime | None = None) -> tuple[int, int]:
    """Trả về (số hoạt động, số báo cáo) đã xóa."""
    cutoff = (now or datetime.utcnow()) - RETENTION
    reports = (
        db.query(models.Report)
        .filter(models.Report.status.in_(HANDLED_REPORT_STATUSES), models.Report.resolved_at <= cutoff)
        .delete(synchronize_session=False)
    )

    candidates = db.query(models.Activity).filter(models.Activity.status.in_(PURGEABLE_ACTIVITY_STATUSES)).all()
    ids = [activity.activity_id for activity in candidates if _last_status_change(activity) <= cutoff]
    files: list[tuple[str, str]] = []
    if ids:
        review_ids = [r for (r,) in db.query(models.Review.review_id).filter(models.Review.activity_id.in_(ids))]
        reply_ids = [r for (r,) in db.query(models.ReviewReply.reply_id).filter(models.ReviewReply.review_id.in_(review_ids))]
        for model, column in (
            (models.ActivityMedia, models.ActivityMedia.activity_id.in_(ids)),
            (models.ReviewMedia, models.ReviewMedia.review_id.in_(review_ids)),
            (models.ReviewReplyMedia, models.ReviewReplyMedia.reply_id.in_(reply_ids)),
        ):
            files += [(m.public_id, m.media_type) for m in db.query(model).filter(column) if m.public_id]
        # Xóa theo thứ tự khóa ngoại: bảng con trước, activities sau cùng.
        for model, condition in (
            (models.Complaint, models.Complaint.review_id.in_(review_ids)),
            (models.ReviewReplyMedia, models.ReviewReplyMedia.reply_id.in_(reply_ids)),
            (models.ReviewReply, models.ReviewReply.reply_id.in_(reply_ids)),
            (models.ReviewMedia, models.ReviewMedia.review_id.in_(review_ids)),
            (models.Review, models.Review.review_id.in_(review_ids)),
            (models.Report, models.Report.activity_id.in_(ids)),
            (models.Bookmark, models.Bookmark.activity_id.in_(ids)),
            (models.ActivityCategory, models.ActivityCategory.activity_id.in_(ids)),
            (models.ActivityMedia, models.ActivityMedia.activity_id.in_(ids)),
            (models.GroupActivityBallot, models.GroupActivityBallot.activity_id.in_(ids)),
        ):
            db.query(model).filter(condition).delete(synchronize_session=False)
        db.query(models.Group).filter(models.Group.selected_activity_id.in_(ids)).update(
            {models.Group.selected_activity_id: None}, synchronize_session=False)
        db.query(models.Group).filter(models.Group.random_pick_activity_id.in_(ids)).update(
            {models.Group.random_pick_activity_id: None}, synchronize_session=False)
        db.query(models.Activity).filter(models.Activity.activity_id.in_(ids)).delete(synchronize_session=False)
    if ids or reports:
        db.commit()
        logger.warning("Đã xóa vĩnh viễn %s hoạt động và %s báo cáo quá 60 ngày", len(ids), reports)
    _delete_files(files)  # sau commit: database không bao giờ trỏ tới file đã xóa
    return len(ids), reports
