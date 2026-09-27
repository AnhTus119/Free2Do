from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings
# Giữ một pool nhỏ cho Render/Supabase, tái sử dụng kết nối nhưng loại bỏ kết nối
# rảnh quá lâu trước khi Supabase đóng nó.
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_use_lifo=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    #Dependency dùng trong router: db: Session = Depends(get_db)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
