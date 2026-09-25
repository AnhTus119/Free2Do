from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.config import settings
from app.database import engine
from app.routers import (
    search,
    auth,
    operator,
    operator_users,
    categories,
    users,
    business_requests,
    activities,
    reviews,
    bookmarks,
    reports,
    complaints,
    businesses,
    media,
    public_businesses,
)

app = FastAPI(title="Free2Do API", version="1.1.0")
cors_origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https://[a-zA-Z0-9-]+\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search.router)
app.include_router(auth.router)
app.include_router(operator.router)

# Customer
app.include_router(categories.router)
app.include_router(users.router)
app.include_router(business_requests.router)
app.include_router(activities.router)
app.include_router(reviews.router)
app.include_router(bookmarks.router)
app.include_router(reports.router)
app.include_router(complaints.router)
app.include_router(businesses.router)
app.include_router(media.router)
app.include_router(public_businesses.router)

# Operator
app.include_router(categories.operator_router)
app.include_router(business_requests.operator_router)
app.include_router(activities.operator_router)
app.include_router(reports.operator_router)
app.include_router(complaints.operator_router)
app.include_router(operator_users.router)


@app.get("/")
def root():
    return {"message": "Free2Do API is running"}


@app.get("/health/live", tags=["health"])
def health_live():
    """Health check nhẹ cho Render; không phụ thuộc dịch vụ ngoài."""
    return {"status": "ok"}


@app.get("/health/ready", tags=["health"])
def health_ready():
    """Kiểm tra kết nối database và trạng thái cấu hình, không lộ secret."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Database chưa sẵn sàng") from exc
    return {
        "status": "ready",
        "database": "connected",
        "cloudinary_configured": bool(
            settings.CLOUDINARY_CLOUD_NAME
            and settings.CLOUDINARY_API_KEY
            and settings.CLOUDINARY_API_SECRET
        ),
    }
