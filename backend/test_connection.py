from sqlalchemy import text
from app.database import engine

def main():
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT version();"))
            version = result.scalar()
            print("Kết nối Supabase thành công!")
            print(f"PostgreSQL version: {version}")
    except Exception as e:
        print("Kết nối thất bại:")
        print(e)

if __name__ == "__main__":
    main()