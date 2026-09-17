from fastapi import APIRouter, Depends, HTTPException, status
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


@operator_router.post("", response_model=schemas.Category, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: schemas.CategoryCreate,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    existing = db.query(models.Category).filter(models.Category.name == payload.name).first()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Danh mục đã tồn tại")

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

    db.delete(category)
    db.commit()
    return {"message": "Đã xóa danh mục"}
