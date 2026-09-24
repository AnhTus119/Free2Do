"""Áp dụng migration.sql bằng DATABASE_URL trong backend/.env."""

from pathlib import Path

from app.database import engine


def main():
    sql_path = Path(__file__).resolve().parent.parent / "migration.sql"
    sql = sql_path.read_text(encoding="utf-8")
    with engine.begin() as connection:
        connection.exec_driver_sql(sql)
    print("Database migration completed.")


if __name__ == "__main__":
    main()
