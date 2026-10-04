import json
import logging
import threading
import time
from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.routers.search import search_activities

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger(__name__)

_rate_lock = threading.Lock()
_requests_by_user: dict[str, list[float]] = {}
_RATE_LIMIT = 12
_RATE_WINDOW_SECONDS = 60
_AI_UNAVAILABLE_MESSAGE = (
    "Hiện AI chưa thể gợi ý (có thể đã hết credit/hạn mức hoặc dịch vụ tạm thời không khả dụng). "
    "Bạn vẫn có thể nhập vị trí, ngân sách và sở thích ở các bộ lọc để tìm hoạt động thủ công."
)


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class AIChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=10)
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    radius: float = Field(5, ge=1, le=20)
    budget: float | None = Field(None, ge=0)
    free_time: int | None = Field(None, ge=30, le=1440)
    selected_date: date | None = None
    category_ids: list[str] = Field(default_factory=list, max_length=30)


_SEARCH_TOOL = {
    "type": "function",
    "name": "search_free2do_activities",
    "description": "Find real, currently available activities in Free2Do's database using the user's constraints.",
    "strict": True,
    "parameters": {
        "type": "object",
        "properties": {
            "keyword": {"type": ["string", "null"], "description": "Vietnamese activity/place keyword, or null."},
            "budget": {"type": ["number", "null"], "description": "Maximum VND per person, or null when unspecified."},
            "category_ids": {"type": "array", "items": {"type": "string"}, "description": "Only IDs from the category list supplied by the app."},
            "radius": {"type": "number", "description": "Search radius in km, between 1 and 20."},
            "free_time": {"type": ["integer", "null"], "description": "Available minutes, or null when unspecified."},
            "selected_date": {"type": ["string", "null"], "description": "Date in YYYY-MM-DD format, or null for today."},
        },
        "required": ["keyword", "budget", "category_ids", "radius", "free_time", "selected_date"],
        "additionalProperties": False,
    },
}

_BASE_INSTRUCTIONS = """Bạn là trợ lý FREE2DO, trả lời bằng tiếng Việt tự nhiên, ngắn gọn.
Khi người dùng muốn gợi ý/tìm hoạt động, phải gọi search_free2do_activities; không tự bịa tên, giá, địa chỉ, khoảng cách, đánh giá hoặc tình trạng hoạt động.
Chỉ được đề xuất từ kết quả công cụ do backend lấy từ database. Nếu kết quả rỗng, nói rõ chưa tìm thấy và gợi ý nới bộ lọc.
Nếu chưa có tọa độ vị trí, hỏi người dùng chọn vị trí hoặc bật GPS, không đoán vị trí.
Không nói rằng đã đánh dấu map nếu backend chưa trả kết quả. Có thể trả lời câu hỏi thông thường về cách dùng FREE2DO mà không gọi công cụ."""


def _check_rate_limit(user_id: str) -> None:
    now = time.monotonic()
    with _rate_lock:
        recent = [stamp for stamp in _requests_by_user.get(user_id, []) if now - stamp < _RATE_WINDOW_SECONDS]
        if len(recent) >= _RATE_LIMIT:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Bạn gửi yêu cầu AI quá nhanh. Vui lòng thử lại sau một phút.")
        recent.append(now)
        _requests_by_user[user_id] = recent


def _build_search_results(args: dict, payload: AIChatRequest, db: Session, user: models.User, valid_categories: set[str]) -> list[dict]:
    if payload.latitude is None or payload.longitude is None:
        return []
    try:
        radius = min(20.0, max(1.0, float(args.get("radius") or payload.radius)))
        budget_value = args.get("budget")
        budget = max(0.0, float(budget_value)) if budget_value is not None else payload.budget
        minutes_value = args.get("free_time")
        free_time = int(minutes_value) if minutes_value is not None and int(minutes_value) >= 30 else payload.free_time
        date_value = args.get("selected_date") or (payload.selected_date.isoformat() if payload.selected_date else None)
        category_ids = [item for item in args.get("category_ids", []) if item in valid_categories]
        if not category_ids:
            category_ids = [item for item in payload.category_ids if item in valid_categories]
        params = schemas.SearchParams(
            keyword=(str(args.get("keyword") or "").strip()[:120] or None),
            latitude=payload.latitude,
            longitude=payload.longitude,
            radius=radius,
            budget=budget,
            free_time=free_time,
            selected_date=date_value,
            category_ids=category_ids,
            sort_by="match",
            record_history=False,
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Bộ lọc tìm kiếm AI không hợp lệ.") from exc

    # Reuse the exact database/PostGIS/Haversine scoring used by POST /search.
    rows = search_activities(params, db, user, None)
    return [
        {
            "activity_id": row.activity_id,
            "name": row.name,
            "address": row.address,
            "description": (row.description or "")[:500],
            "price": row.price,
            "price_text": row.price_text,
            "distance_km": row.distance_km,
            "match_score": row.match_score,
            "avg_rating": row.avg_rating,
            "review_count": row.review_count,
            "category_ids": row.category_ids,
            "category_names": row.category_names,
            "latitude": row.latitude,
            "longitude": row.longitude,
            "image_url": row.image_url,
            "google_maps_url": row.google_maps_url,
        }
        for row in rows[:8]
    ]


@router.post("/chat")
def chat(
    payload: AIChatRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """AI conversation with an allowlisted tool that invokes Free2Do's own search."""
    _check_rate_limit(user.user_id)
    if not settings.OPENAI_API_KEY.strip():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, _AI_UNAVAILABLE_MESSAGE)

    try:
        from openai import OpenAI
    except ImportError as exc:
        logger.exception("OpenAI SDK is missing")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, _AI_UNAVAILABLE_MESSAGE) from exc

    categories = db.query(models.Category).order_by(models.Category.name).all()
    category_names = {item.category_id: item.name for item in categories}
    context = {
        "user_search_location": {"latitude": payload.latitude, "longitude": payload.longitude},
        "current_radius_km": payload.radius,
        "current_budget_vnd": payload.budget,
        "current_free_minutes": payload.free_time,
        "selected_category_ids": payload.category_ids,
        "today": datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date().isoformat(),
    }
    instructions = _BASE_INSTRUCTIONS + "\nDanh mục hợp lệ (ID: tên): " + json.dumps(category_names, ensure_ascii=False)
    messages = [{"role": item.role, "content": item.content} for item in payload.history[-8:]]
    messages.append({
        "role": "user",
        "content": f"Ngữ cảnh tìm kiếm do ứng dụng cung cấp: {json.dumps(context, ensure_ascii=False)}\nYêu cầu: {payload.message}",
    })
    can_search = payload.latitude is not None and payload.longitude is not None
    tools = [_SEARCH_TOOL] if can_search else []
    try:
        client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=18, max_retries=0)
        response = client.responses.create(
            model=settings.OPENAI_MODEL.strip() or "gpt-6-luna",
            instructions=instructions,
            input=messages,
            tools=tools,
            tool_choice="auto" if tools else "none",
            parallel_tool_calls=False,
            max_output_tokens=500,
        )
        calls = [item for item in response.output if getattr(item, "type", None) == "function_call"]
        recommendations = []
        reply = response.output_text or "Mình chưa có câu trả lời lúc này. Bạn thử diễn đạt lại nhé."
        if calls:
            call = calls[0]
            if call.name != "search_free2do_activities":
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, "AI yêu cầu một tác vụ không được hỗ trợ.")
            arguments = json.loads(call.arguments)
            recommendations = _build_search_results(arguments, payload, db, user, set(category_names))
            output = json.dumps({"activities": recommendations}, ensure_ascii=False)
            final = client.responses.create(
                model=settings.OPENAI_MODEL.strip() or "gpt-6-luna",
                instructions=instructions,
                previous_response_id=response.id,
                input=[{"type": "function_call_output", "call_id": call.call_id, "output": output}],
                tools=tools,
                tool_choice="none",
                max_output_tokens=500,
            )
            reply = final.output_text or ("Mình tìm thấy một số hoạt động phù hợp bên dưới." if recommendations else "Mình chưa tìm thấy hoạt động phù hợp. Bạn thử nới ngân sách hoặc bán kính nhé.")
        return {"reply": reply, "recommendations": recommendations}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("OpenAI request failed")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, _AI_UNAVAILABLE_MESSAGE) from exc
