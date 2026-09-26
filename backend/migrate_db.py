"""Áp dụng migration.sql bằng DATABASE_URL trong backend/.env."""

from pathlib import Path

from app.database import engine


def main():
    sql_path = Path(__file__).resolve().parent.parent / "migration.sql"
    sql = sql_path.read_text(encoding="utf-8")
    with engine.begin() as connection:
        # Chạy nguyên script bằng DBAPI cursor để ký tự % trong câu LIKE không
        # bị SQLAlchemy/psycopg2 hiểu nhầm là placeholder tham số.
        cursor = connection.connection.cursor()
        try:
            cursor.execute(sql)
        finally:
            cursor.close()
    print("Database migration completed.")


if __name__ == "__main__":
    main()
