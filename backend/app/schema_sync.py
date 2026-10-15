"""Đồng bộ nhẹ giữa models và database khi khởi động.

Lỗi hay gặp: code mới thêm bảng/cột nhưng database production chưa được migrate ->
truy vấn lỗi 500 -> trình duyệt báo "CORS / không kết nối được máy chủ". Module này tự
tạo bảng thiếu, tự thêm cột thiếu (nullable) và cho /health/ready biết còn thiếu gì
(danh sách rỗng = schema đầy đủ).
"""
import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app import models

logger = logging.getLogger("free2do.schema")


def find_schema_gaps(engine: Engine) -> list[str]:
    """Trả về các mục còn thiếu, ví dụ ["table:groups", "groups.group_name"]. Rỗng = đầy đủ."""
    inspector = inspect(engine)
    existing = set(inspector.get_table_names())
    gaps: list[str] = []
    for table in models.Base.metadata.sorted_tables:
        if table.name not in existing:
            gaps.append(f"table:{table.name}")
            continue
        have = {column["name"] for column in inspector.get_columns(table.name)}
        gaps.extend(f"{table.name}.{column.name}" for column in table.columns if column.name not in have)
    return gaps


def _default_clause(column) -> str:
    default = column.server_default
    if default is None:
        return ""
    arg = getattr(default, "arg", None)
    if isinstance(arg, str):
        return " DEFAULT '" + arg.replace("'", "''") + "'"
    return f" DEFAULT {arg}" if arg is not None else ""


def sync_schema(engine: Engine) -> list[str]:
    """Tạo bảng thiếu và thêm cột thiếu. Idempotent; trả về những gì đã sửa."""
    fixed: list[str] = []
    models.Base.metadata.create_all(bind=engine, checkfirst=True)  # chỉ tạo bảng chưa có
    inspector = inspect(engine)
    for table in models.Base.metadata.sorted_tables:
        have = {column["name"] for column in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in have:
                continue
            column_type = column.type.compile(dialect=engine.dialect)
            ddl = f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {column_type}{_default_clause(column)}'
            with engine.begin() as connection:
                connection.execute(text(ddl))
            fixed.append(f"{table.name}.{column.name}")
    return fixed


def sync_schema_safely(engine: Engine) -> None:
    """Dùng lúc khởi động: không bao giờ làm app sập nếu database tạm lỗi."""
    try:
        fixed = sync_schema(engine)
        if fixed:
            logger.warning("Đã tự bổ sung schema: %s", ", ".join(fixed))
    except Exception:  # noqa: BLE001
        logger.exception("Không thể đồng bộ schema khi khởi động")
