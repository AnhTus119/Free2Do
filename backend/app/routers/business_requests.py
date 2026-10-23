from datetime import datetime
import re
from typing import Optional
from fastapi import APIRouter, Depends, File, HTTPException, status, Query, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user, get_current_operator
from app.services.supabase_storage import InvalidMedia, StorageNotConfigured, delete_asset, sniff_image_type, upload_asset
from app.utils.email import send_business_request_approved_email, send_business_request_rejected_email
from app.routers.action_logs import log_action
from app.utils.identity import clean_phone

router = APIRouter(tags=["business-requests"])

MAX_PROOFS = 5
PROOF_TYPES = {"image/jpeg", "image/png", "image/webp"}


@router.post("/business-requests", response_model=schemas.BusinessRequest, status_code=status.HTTP_201_CREATED)
def create_business_request(
    payload: schemas.BusinessRequestCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Customer gửi yêu cầu nâng cấp thành tài khoản Doanh nghiệp."""
    if user.business_profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tài khoản đã là Doanh nghiệp")

    pending = (
        db.query(models.BusinessRequest)
        .filter(models.BusinessRequest.user_id == user.user_id, models.BusinessRequest.status == "pending")
        .first()
    )
    if pending:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bạn đã có một yêu cầu đang chờ duyệt")

    try:
        phone = clean_phone(db, payload.phone, user_id=user.user_id, account_id=user.account_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    request = models.BusinessRequest(
        user_id=user.user_id,
        business_name=payload.business_name,
        phone=phone,
        business_address=payload.business_address.strip() if payload.business_address else None,
        description=payload.description,
        status="pending",
        created_at=datetime.utcnow(),
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    # Operator nhận thông báo trong web (GET /notifications, loại pending_request), không gửi Gmail.
    return request


@router.post(
    "/business-requests/{request_id}/proofs",
    response_model=schemas.BusinessRequest,
    status_code=status.HTTP_201_CREATED,
)
async def upload_business_request_proofs(
    request_id: str,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Ảnh minh chứng (jpg/png/webp, tối đa 5 ảnh/đơn) cho đơn đang chờ duyệt.

    Lưu ở bảng business_request_proofs + thư mục business-proofs/{request_id} trên Storage,
    không bao giờ ghi vào activities_media."""
    request = (
        db.query(models.BusinessRequest)
        .filter(models.BusinessRequest.request_id == request_id, models.BusinessRequest.user_id == user.user_id)
        .first()
    )
    if not request:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu")
    if request.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chỉ thêm minh chứng cho yêu cầu đang chờ duyệt")
    return await _append_business_request_proofs(request, files, db)


async def _append_business_request_proofs(
    request: models.BusinessRequest,
    files: list[UploadFile],
    db: Session,
) -> models.BusinessRequest:
    if len(request.proofs) + len(files) > MAX_PROOFS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Mỗi yêu cầu có tối đa {MAX_PROOFS} ảnh minh chứng")

    contents = []
    for file in files:
        content = await file.read()
        content_type = sniff_image_type(content)
        if content_type not in PROOF_TYPES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Minh chứng chỉ nhận ảnh JPG, PNG hoặc WEBP")
        contents.append((content, content_type))
    try:
        for content, content_type in contents:
            asset = upload_asset(
                content=content, content_type=content_type,
                folder=f"business-proofs/{request.request_id}", owner_id=request.user_id, kind="proof",
            )
            request.proofs.append(models.BusinessRequestProof(
                media_url=asset.media_url, public_id=asset.public_id, bytes=asset.bytes, created_at=datetime.utcnow(),
            ))
    except StorageNotConfigured as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except InvalidMedia as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Không thể tải ảnh minh chứng lên Storage") from exc
    finally:
        db.commit()  # giữ lại các ảnh đã tải thành công trước khi lỗi
    db.refresh(request)
    return request


@router.delete("/business-requests/{request_id}", response_model=schemas.MessageResponse)
def cancel_business_request(
    request_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Customer hủy đơn đang chờ duyệt (form gọi khi tải ảnh minh chứng lỗi để không để lại đơn thiếu ảnh)."""
    request = (
        db.query(models.BusinessRequest)
        .filter(models.BusinessRequest.request_id == request_id, models.BusinessRequest.user_id == user.user_id)
        .first()
    )
    if not request:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu")
    if request.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chỉ hủy được yêu cầu đang chờ duyệt")
    public_ids = [proof.public_id for proof in request.proofs if proof.public_id]
    db.delete(request)
    db.commit()
    for public_id in public_ids:
        try:
            delete_asset(public_id)
        except Exception:
            pass  # ảnh mồ côi trên Storage không ảnh hưởng dữ liệu
    return {"message": "Đã hủy yêu cầu"}


@router.get("/business-requests/me", response_model=list[schemas.BusinessRequest])
def list_my_business_requests(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.BusinessRequest)
        .filter(models.BusinessRequest.user_id == user.user_id)
        .order_by(models.BusinessRequest.created_at.desc())
        .all()
    )


# ---------------------------------------------------------------------------
# Operator -- duyệt yêu cầu trở thành Doanh nghiệp
# ---------------------------------------------------------------------------
operator_router = APIRouter(prefix="/operator/business-requests", tags=["operator-business-requests"])


@operator_router.get("", response_model=list[schemas.BusinessRequest])
def list_business_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    query = db.query(models.BusinessRequest)
    if status_filter:
        query = query.filter(models.BusinessRequest.status == status_filter)
    if user_id:
        query = query.filter(models.BusinessRequest.user_id == user_id)
    return query.order_by(models.BusinessRequest.created_at.desc()).all()


@operator_router.get("/{request_id}", response_model=schemas.BusinessRequest)
def get_business_request(
    request_id: str,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    request = db.query(models.BusinessRequest).filter(models.BusinessRequest.request_id == request_id).first()
    if not request:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu")
    return request


@operator_router.post(
    "/{request_id}/proofs",
    response_model=schemas.BusinessRequest,
    status_code=status.HTTP_201_CREATED,
)
async def operator_upload_business_request_proofs(
    request_id: str,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    request = db.query(models.BusinessRequest).filter(models.BusinessRequest.request_id == request_id).first()
    if not request:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu")
    return await _append_business_request_proofs(request, files, db)


@operator_router.patch("/{request_id}/approve", response_model=schemas.BusinessRequest)
def approve_business_request(
    request_id: str,
    db: Session = Depends(get_db),
    operator: models.Operator = Depends(get_current_operator),
):
    request = db.query(models.BusinessRequest).filter(models.BusinessRequest.request_id == request_id).first()
    if not request:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu")
    if request.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Yêu cầu đã được xử lý")

    now = datetime.utcnow()
    request.status = "approved"
    request.reviewed_by = operator.operator_id
    request.reviewed_at = now

    business_profile = db.query(models.BusinessProfile).filter(
        models.BusinessProfile.user_id == request.user_id
    ).first()
    if not business_profile:
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(hashtext('free2do_business_code_sequence'))"))
        # Giữ dạng B1, B2...; các hồ sơ cũ chưa có code vẫn được tính bằng tổng số hồ sơ.
        existing_codes = db.query(models.BusinessProfile.business_code).filter(
            models.BusinessProfile.business_code.is_not(None)
        ).all()
        code_numbers = [
            int(match.group(1))
            for (code,) in existing_codes
            if (match := re.fullmatch(r"B(\d+)", code or ""))
        ]
        max_code = max(code_numbers, default=0)
        number = max(max_code, db.query(models.BusinessProfile).count()) + 1
        business_profile = models.BusinessProfile(
            user_id=request.user_id,
            business_code=f"B{number}",
            business_name=request.business_name,
            phone=request.phone,
            description=request.description,
            business_address=request.business_address,
            verified_by=operator.operator_id,
            verified_at=now,
        )
        db.add(business_profile)

    # Nâng role user lên "business" nếu role tương ứng đã tồn tại trong bảng roles
    business_role = db.query(models.Role).filter(models.Role.role_name == "business").first()
    if business_role:
        request.user.role_id = business_role.role_id
    log_action(db, operator, "Duyệt đăng ký doanh nghiệp", "business", request.user_id, request.user_id,
               request.business_name)

    db.commit()
    db.refresh(request)

    try:
        recipient = request.user.account.email or request.user.account.recovery_email
        if recipient:
            send_business_request_approved_email(recipient, request.business_name)
    except Exception:
        # Duyệt đã ghi vào DB; lỗi SMTP không được làm operator tưởng rằng request thất bại.
        pass
    return request


@operator_router.patch("/{request_id}/reject", response_model=schemas.BusinessRequest)
def reject_business_request(
    request_id: str,
    payload: schemas.BusinessRequestRejectRequest,
    db: Session = Depends(get_db),
    operator: models.Operator = Depends(get_current_operator),
):
    request = db.query(models.BusinessRequest).filter(models.BusinessRequest.request_id == request_id).first()
    if not request:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu")
    if request.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Yêu cầu đã được xử lý")

    request.status = "rejected"
    request.rejection_reason = payload.reason.strip()
    request.reviewed_by = operator.operator_id
    request.reviewed_at = datetime.utcnow()
    # User vẫn là khách hàng sau khi bị từ chối nên log nằm ở hồ sơ khách hàng.
    log_action(db, operator, "Từ chối đăng ký doanh nghiệp", "customer", request.user_id, None, request.business_name)
    db.commit()
    db.refresh(request)

    try:
        recipient = request.user.account.email or request.user.account.recovery_email
        if recipient:
            send_business_request_rejected_email(recipient, request.business_name, request.rejection_reason)
    except Exception:
        pass
    return request
