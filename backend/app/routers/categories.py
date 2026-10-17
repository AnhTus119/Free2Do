from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_operator

router = APIRouter(tags=["categories"])


@router.get("/categories", response_model=list[schemas.Category])
def list_categories(db: Session = Depends(get_db)):
    """Danh sách danh mục -- công khai, dùng cho filter tìm kiếm và chọn sở thích."""
    return db.query(models.Category).order_by(models.Category.name).all()


# ---------------------------------------------------------------------------
# Operator -- quản lý danh mục (thêm/sửa/xóa)
# ---------------------------------------------------------------------------
operator_router = APIRouter(prefix="/operator/categories", tags=["operator-categories"])


def _ensure_unique_name(db: Session, name: str, exclude_id: str | None = None) -> None:
    """Không cho 2 danh mục trùng tên (không phân biệt hoa/thường)."""
    target = name.casefold()
    for category_id, existing in db.query(models.Category.category_id, models.Category.name).all():
        if category_id != exclude_id and existing.casefold() == target:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f'Danh mục "{existing}" đã tồn tại')


@operator_router.get("", response_model=list[schemas.CategoryAdminOut])
def list_categories_for_operator(
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    counts = dict(
        db.query(models.ActivityCategory.category_id, func.count(models.ActivityCategory.activity_id))
        .group_by(models.ActivityCategory.category_id)
        .all()
    )
    return [
        schemas.CategoryAdminOut(category_id=item.category_id, name=item.name, activity_count=counts.get(item.category_id, 0))
        for item in db.query(models.Category).order_by(models.Category.name).all()
    ]


@operator_router.post("", response_model=schemas.Category, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: schemas.CategoryCreate,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    _ensure_unique_name(db, payload.name)
    category = models.Category(name=payload.name)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@operator_router.patch("/{category_id}", response_model=schemas.Category)
def update_category(
    category_id: str,
    payload: schemas.CategoryCreate,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    category = db.query(models.Category).filter(models.Category.category_id == category_id).first()
    if not category:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy danh mục")
    _ensure_unique_name(db, payload.name, exclude_id=category_id)

    category.name = payload.name
    db.commit()
    db.refresh(category)
    return category


@operator_router.delete("/{category_id}", response_model=schemas.MessageResponse)
def delete_category(
    category_id: str,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    category = db.query(models.Category).filter(models.Category.category_id == category_id).first()
    if not category:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy danh mục")
    in_use = db.query(models.ActivityCategory).filter(models.ActivityCategory.category_id == category_id).count()
    if in_use:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Danh mục đang gắn với {in_use} hoạt động. Hãy bỏ danh mục khỏi các hoạt động đó trước khi xóa.",
        )

    # Sở thích của khách hàng trỏ tới danh mục này không còn ý nghĩa -> gỡ cùng lúc để không vướng khóa ngoại.
    db.query(models.UserCategory).filter(models.UserCategory.category_id == category_id).delete()
    db.delete(category)
    db.commit()
    return {"message": "Đã xóa danh mục"}
