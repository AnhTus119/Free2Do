from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

url = settings.DATABASE_URL.strip().strip("\"'")
if url.startswith("postgres://"):  # SQLAlchemy 2.x chỉ nhận "postgresql://"
    url = "postgresql://" + url[len("postgres://"):]

# Pool đủ lớn cho lúc frontend gọi nhiều API song song (mặc định 5+10 dễ cạn -> timeout
# 30s, nhìn giống "mất kết nối DB"); connect_timeout để lỗi mạng/DB tạm dừng báo nhanh.
engine = create_engine(
    url,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_use_lifo=True,
    pool_size=10,
    max_overflow=10,
    pool_timeout=15,
    connect_args={"connect_timeout": 10} if url.startswith("postgresql") else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
