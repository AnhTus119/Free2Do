from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import search, auth, operator

app = FastAPI(title="Free2Do API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://free2-do.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(search.router)
app.include_router(auth.router)
app.include_router(operator.router)

@app.get("/")
def root():
    return {"message": "Free2Do API is running"}


# Khi có router theo từng chức năng, import và include tại đây, ví dụ:
# from app.routers import auth, activities, reviews
# app.include_router(auth.router)
# app.include_router(activities.router)
# app.include_router(reviews.router)