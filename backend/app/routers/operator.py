from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import hash_password, get_current_operator, require_admin_operator

router = APIRouter(prefix="/operator", tags=["operator"])


def _to_operator_out(operator: models.Operator) -> schemas.OperatorOut:
    return schemas.OperatorOut(
        operator_id=operator.operator_id,
        account_id=operator.account_id,
        email=operator.account.email,
        name=operator.name,
        level=operator.level,
        status=operator.status,
        created_at=operator.created_at,
    )


@router.get("/me", response_model=schemas.OperatorOut)
def read_my_operator_profile(operator: models.Operator = Depends(get_current_operator)):
    """Operator (admin hoặc staff) xem hồ sơ của chính mình."""
    return _to_operator_out(operator)


@router.get("/operators", response_model=list[schemas.OperatorOut])
def list_operators(
    db: Session = Depends(get_db),
    _admin: models.Operator = Depends(require_admin_operator),
):
    """Chỉ Operator cấp cao (admin) mới xem được danh sách toàn bộ Operator."""
    operators = db.query(models.Operator).order_by(models.Operator.created_at.desc()).all()
    return [_to_operator_out(op) for op in operators]


@router.get("/operators/{operator_id}", response_model=schemas.OperatorOut)
def get_operator(
    operator_id: str,
    db: Session = Depends(get_db),
    _admin: models.Operator = Depends(require_admin_operator),
):
    operator = db.query(models.Operator).filter(models.Operator.operator_id == operator_id).first()
    if not operator:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy Operator")
    return _to_operator_out(operator)


@router.post("/operators", response_model=schemas.OperatorOut, status_code=status.HTTP_201_CREATED)
def create_operator(
    payload: schemas.OperatorCreateRequest,
    db: Session = Depends(get_db),
    _admin: models.Operator = Depends(require_admin_operator),
):
    """Tạo tài khoản Operator mới. Chỉ Operator cấp cao (admin) mới được tạo.
    Tài khoản do admin tạo nên coi như đã xác thực -- không cần luồng OTP."""
    existing = db.query(models.Account).filter(models.Account.email == payload.email).first()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email đã được sử dụng")

    now = datetime.utcnow()
    account = models.Account(
        email=payload.email,
        password_hash=hash_password(payload.password),
        auth_provider="email",
        email_verified=True,
        account_type="operator",
        status="active",
        created_at=now,
    )
    db.add(account)
    db.flush()  # có account_id trước khi tạo Operator

    operator = models.Operator(
        account_id=account.account_id,
        name=payload.name,
        level=payload.level,
        status="active",
        created_at=now,
    )
    db.add(operator)
    db.commit()
    db.refresh(operator)

    return _to_operator_out(operator)


@router.patch("/operators/{operator_id}", response_model=schemas.OperatorOut)
def update_operator(
    operator_id: str,
    payload: schemas.OperatorUpdateRequest,
    db: Session = Depends(get_db),
    admin: models.Operator = Depends(require_admin_operator),
):
    """Sửa tên / cấp bậc (level) / trạng thái (status) của Operator.
    Chỉ admin mới được sửa; không được tự hạ cấp/khóa chính mình,
    và luôn phải còn ít nhất 1 admin đang hoạt động."""
    operator = db.query(models.Operator).filter(models.Operator.operator_id == operator_id).first()
    if not operator:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy Operator")

    is_self = operator.operator_id == admin.operator_id
    demoting_or_disabling = operator.level == "admin" and (
        (payload.level is not None and payload.level != "admin")
        or (payload.status is not None and payload.status != "active")
    )

    if is_self and demoting_or_disabling:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không thể tự hạ cấp hoặc khóa chính mình")

    if demoting_or_disabling:
        remaining_admins = (
            db.query(models.Operator)
            .filter(
                models.Operator.level == "admin",
                models.Operator.status == "active",
                models.Operator.operator_id != operator.operator_id,
            )
            .count()
        )
        if remaining_admins == 0:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Phải còn ít nhất 1 Operator cấp cao (admin) đang hoạt động",
            )

    if payload.name is not None:
        operator.name = payload.name
    if payload.level is not None:
        operator.level = payload.level
    if payload.status is not None:
        operator.status = payload.status

    db.commit()
    db.refresh(operator)
    return _to_operator_out(operator)


@router.delete("/operators/{operator_id}", response_model=schemas.MessageResponse)
def disable_operator(
    operator_id: str,
    db: Session = Depends(get_db),
    admin: models.Operator = Depends(require_admin_operator),
):
    """"Xóa" Operator = vô hiệu hóa (status='disabled'), không xóa hẳn khỏi database
    vì operator_id còn được các bảng khác tham chiếu tới (activities.verified_by,
    reports.resolved_by, complaints.resolved_by, business_requests.reviewed_by...).
    """
    if operator_id == admin.operator_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không thể tự khóa chính mình")

    operator = db.query(models.Operator).filter(models.Operator.operator_id == operator_id).first()
    if not operator:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy Operator")

    if operator.level == "admin":
        remaining_admins = (
            db.query(models.Operator)
            .filter(
                models.Operator.level == "admin",
                models.Operator.status == "active",
                models.Operator.operator_id != operator.operator_id,
            )
            .count()
        )
        if remaining_admins == 0:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Phải còn ít nhất 1 Operator cấp cao (admin) đang hoạt động",
            )

    operator.status = "disabled"
    db.commit()
    return {"message": "Đã vô hiệu hóa tài khoản Operator"}
