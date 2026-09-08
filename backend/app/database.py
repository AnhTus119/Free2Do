from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings
# pool_pre_ping=True để tránh lỗi "connection closed" do Supabase tự ngắt kết nối rảnh
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    #Dependency dùng trong router: db: Session = Depends(get_db)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()