from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import (
    search,
    auth,
    operator,
    categories,
    users,
    business_requests,
    activities,
    reviews,
    bookmarks,
    reports,
    complaints,
)

app = FastAPI(title="Free2Do API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "https://free2-do.vercel.app",
    ],
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

# Operator
app.include_router(categories.operator_router)
app.include_router(business_requests.operator_router)
app.include_router(activities.operator_router)
app.include_router(reports.operator_router)
app.include_router(complaints.operator_router)


@app.get("/")
def root():
    return {"message": "Free2Do API is running"}
