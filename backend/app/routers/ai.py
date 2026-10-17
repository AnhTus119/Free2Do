"""Trợ lý FREE2DO "hybrid": bộ phân tích tiếng Việt chạy local (0đ, tức thì) đọc yêu cầu -> tìm thẳng
trong database bằng đúng logic POST /search. Chỉ khi bộ local không hiểu gì mới hỏi LLM (OpenAI) để
trích ý định, nên gần như không tốn token. Câu trả lời luôn được dựng bằng template từ dữ liệu thật."""
import json
import logging
import re
import threading
import time
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Literal, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.routers.search import search_activities
from app.utils.geocoding import resolve_location

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger(__name__)

_rate_lock = threading.Lock()
_requests_by_user: dict[str, list[float]] = {}
_RATE_LIMIT = 20
_RATE_WINDOW_SECONDS = 60
_VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
_MAX_RESULTS = 5


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class AIChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=10)
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    location_label: str | None = Field(None, max_length=200)
    radius: float = Field(5, ge=1, le=20)
    budget: float | None = Field(None, ge=0)
    free_time: int | None = Field(None, ge=30, le=1440)
    selected_date: date | None = None
    category_ids: list[str] = Field(default_factory=list, max_length=30)


def _check_rate_limit(user_id: str) -> None:
    now = time.monotonic()
    with _rate_lock:
        recent = [stamp for stamp in _requests_by_user.get(user_id, []) if now - stamp < _RATE_WINDOW_SECONDS]
        if len(recent) >= _RATE_LIMIT:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Bạn gửi yêu cầu AI quá nhanh. Vui lòng thử lại sau một phút.")
        recent.append(now)
        _requests_by_user[user_id] = recent


# ---------------------------------------------------------------------------
# Bộ phân tích ngữ cảnh tiếng Việt (local)
# ---------------------------------------------------------------------------
def fold(value: str) -> str:
    """Chữ thường, bỏ dấu: "Hai Bà Trưng" -> "hai ba trung"."""
    value = (value or "").replace("đ", "d").replace("Đ", "D")
    value = unicodedata.normalize("NFD", value)
    return re.sub(r"\s+", " ", "".join(ch for ch in value if unicodedata.category(ch) != "Mn").lower()).strip()


# Từ khóa (đã bỏ dấu) -> tên tag trong bảng categories (so khớp không dấu). Từ khóa cũng dùng để
# cộng điểm hoạt động có tên/mô tả chứa đúng từ đó (vd "gốm", "lẩu", "máy ảnh").
_TAG_TRIGGERS: dict[str, tuple[str, ...]] = {
    # Tránh từ không dấu trùng nghĩa: "pho" (phố), "lau" (lâu), "nhau" (cùng nhau), "gom" (bao gồm), "mai" (Hoàng Mai).
    "an uong": ("an uong", "an gi", "do an", "doi bung", "an toi", "an trua", "an sang", "nha hang", "quan an", "an lau",
                "quan lau", "lau nuong", "do nuong", "an bun", "an pho", "buffet", "di nhau", "quan nhau", "an vat", "tra sua", "an"),
    "ca phe": ("ca phe", "cafe", "caphe", "coffee", "cf", "tra chieu", "ngoi chill"),
    "billiard": ("billiard", "bida", "bi-a", "bi a"),
    "ca hat": ("ca hat", "karaoke", "hat hoi", "di hat"),
    "chup anh": ("chup anh", "song ao", "check-in", "check in", "may anh", "photo", "studio", "chup hinh"),
    "game": ("game", "choi game", "net", "playstation", "ps5", "board game", "boardgame", "esport"),
    "giai tri": ("giai tri", "vui choi", "khu vui choi", "escape room", "giai doc", "bowling"),
    "lam dep": ("lam dep", "spa", "nail", "lam toc", "cat toc", "goi dau", "massage", "skincare"),
    "lam viec": ("lam viec", "hoc bai", "on thi", "deadline", "laptop", "lam bai", "cowork", "yen tinh"),
    "mua sam": ("mua sam", "shopping", "quan ao", "trung tam thuong mai", "mall", "di cho"),
    "tham quan": ("tham quan", "bao tang", "di tich", "di dao", "dao pho", "ngam canh", "du lich", "check in pho co"),
    "the thao": ("the thao", "gym", "bong da", "cau long", "boi loi", "be boi", "chay bo", "yoga", "tennis", "pickleball",
                 "leo nui", "truot patin", "van dong"),
    "thu gian": ("thu gian", "chill", "xa stress", "met moi", "nghi ngoi", "binh yen", "doc sach"),
    "workshop": ("workshop", "lam gom", "do gom", "gom su", "ve tranh", "handmade", "lop hoc", "lam nen", "cam hoa", "hoc lam"),
    "xem phim": ("xem phim", "rap phim", "phim", "cgv", "lotte cinema", "bhd"),
}
# Ngữ cảnh -> tag gợi ý thêm (không bắt buộc).
_OCCASION_TAGS: dict[tuple[str, ...], tuple[str, ...]] = {
    ("hen ho", "date", "nguoi yeu", "crush", "ban gai", "ban trai", "lang man"): ("ca phe", "xem phim", "an uong", "workshop"),
    ("gia dinh", "bo me", "tre con", "con nho", "em be", "ca nha"): ("tham quan", "an uong", "giai tri"),
    ("ban be", "hoi ban", "ca nhom", "team", "dong nghiep"): ("billiard", "ca hat", "game", "an uong", "giai tri"),
    ("mot minh", "co don", "buon"): ("ca phe", "thu gian", "xem phim", "workshop"),
}
# Theo lựa chọn khi phỏng vấn: trong/ngoài trời suy từ tag (không đổi database).
_INDOOR = {"ca phe", "xem phim", "workshop", "billiard", "ca hat", "game", "lam dep", "mua sam", "lam viec"}
_OUTDOOR = {"the thao", "tham quan", "chup anh"}
_RAIN = re.compile(r"(?<!không )(?<!hết )\b(mưa|bão|giông|dông|ẩm ướt|lạnh|rét|gió to)\b")
_HOT = re.compile(r"\b(nóng|oi bức|oi nồng|nắng gắt|nắng nóng)\b")
_SUNNY = re.compile(r"\b(nắng đẹp|nắng nhẹ|trời đẹp|đẹp trời|trời nắng|có nắng|mát mẻ|trời mát|trời trong|tạnh mưa|hết mưa|nắng)\b")
# Buổi khớp trên chữ CÓ dấu ("toi" không dấu còn là "tôi").
_TIME_OF_DAY = {"sáng": 9 * 60, "trưa": 12 * 60, "chiều": 15 * 60 + 30, "tối": 19 * 60, "đêm": 22 * 60, "khuya": 23 * 60}
_PLACE_PREFIX = r"(?:khu vực|xung quanh|khu|ở|tại|gần|quanh|bên)"
_PLACE_STOP = (r"(?=\s+(?:với|có|dưới|tầm|khoảng|budget|giá|ngân sách|tối|sáng|trưa|chiều|đêm|hôm|ngày|cuối|cho|để|và|mà|thì|"
               r"nhé|nha|không|trong|đi|chơi|ăn|uống|xem|khi|lúc|vì|lâu|một|rồi|nhưng|nên|thôi|ạ|à|hay|hoặc|được|gì|nào|đâu|chỗ|cùng|giúp)\b|[,.!?;:]|\s+\d|$)")
_PLACE_RE = re.compile(_PLACE_PREFIX + r"\s+(.+?)" + _PLACE_STOP)
_ADMIN_PLACE_RE = re.compile(r"((?:quận|phường|phố|đường|ngõ)\s+.+?)" + _PLACE_STOP)  # giữ nguyên "phố Huế"
_NOT_PLACES = {"day", "nha", "trong nha", "ngoai troi", "do", "nay", "gan day", "quanh day", "nha minh", "nha toi", "dau",
               "dau do", "dau day", "ben ngoai", "ngoai", "trong", "minh", "toi", "ban", "cong ty", "truong"}
_DISTRICTS = ("hoan kiem", "ba dinh", "dong da", "hai ba trung", "cau giay", "thanh xuan", "hoang mai", "long bien",
              "tay ho", "nam tu liem", "bac tu liem", "ha dong", "my dinh", "ho guom", "pho co", "ho tay", "times city",
              "royal city", "duong noi", "van quan", "kim ma", "linh dam", "trung hoa", "nguyen trai", "bach khoa")
_SEARCH_WORDS = ("di choi", "lam gi", "goi y", "tim", "co gi", "o dau", "choi", "di dau", "dia diem", "hoat dong", "cho nao", "noi nao", "quan nao")
_FOLLOW_UP = ("con", "khac", "them", "nua", "re hon", "thi sao", "the con", "gan hon")


@dataclass
class Intent:
    tags: list[str] = field(default_factory=list)         # tên tag đã bỏ dấu
    boost_terms: list[str] = field(default_factory=list)  # từ khóa cụ thể để cộng điểm
    budget: Optional[float] = None
    free_minutes: Optional[int] = None
    radius: Optional[float] = None
    place: Optional[str] = None
    weather: Optional[str] = None                         # "rain" | "hot" | "sun"
    day: Optional[date] = None
    day_label: Optional[str] = None
    time_of_day: Optional[str] = None
    small_talk: Optional[str] = None                      # "greet" | "thanks" | "help"
    asks_search: bool = False

    @property
    def understood(self) -> bool:
        return bool(self.tags or self.boost_terms or self.budget is not None or self.free_minutes or self.place
                    or self.weather or self.day or self.time_of_day or self.radius or self.asks_search)


def _has(folded: str, phrase: str) -> bool:
    return re.search(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", folded) is not None


def _money(number: str, unit: str) -> float:
    value = float(number.replace(",", "."))
    if unit in ("k", "nghin", "ngan"):
        return value * 1000
    if unit in ("tr", "trieu", "cu"):
        return value * 1_000_000
    return value


def parse_message(message: str, today: date) -> Intent:
    """Đọc yêu cầu tiếng Việt thành Intent. Thuần Python, không gọi mạng."""
    text = re.sub(r"\s+", " ", message.lower()).strip()
    folded = fold(message)
    intent = Intent()

    # Tiền: "200k", "200 nghìn", "1tr5", "150.000đ", "budget 200", "miễn phí".
    compact = re.sub(r"(\d)\.(\d{3})", r"\1\2", folded)  # 150.000 -> 150000
    if re.search(r"\b(mien phi|free|khong mat tien|0d)\b", folded):
        intent.budget = 0
    for match in re.finditer(r"(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan|trieu|tr|cu|vnd|dong|d)?(\d)?(?![a-z0-9])", compact):
        number, unit, tail = match.group(1), match.group(2) or "", match.group(3)
        after = compact[match.end():match.end() + 8]
        if re.match(r"\s*(tieng|gio|h\b|phut|p\b|km|nguoi|ban|sao|lan|ngay|thang|tuoi)", after) or unit == "" and re.match(r"(h|p)\b", after):
            continue
        before = compact[max(0, match.start() - 25):match.start()]
        if unit in ("tr", "cu") and tail:          # 1tr5 = 1.5 triệu
            number = f"{number}.{tail}"
        if unit:
            intent.budget = _money(number, unit)
        elif float(number.replace(",", ".")) >= 1000:
            intent.budget = float(number.replace(",", "."))
        elif re.search(r"(budget|ngan sach|duoi|toi da|khong qua|tam|khoang|gia|co)\s*$", before):
            intent.budget = float(number.replace(",", ".")) * 1000  # "dưới 200" ~ 200k
    if intent.budget is None and re.search(r"\b(re thoi|gia re|binh dan|sinh vien|tiet kiem)\b", folded):
        intent.budget = 100_000

    # Thời gian rảnh: "2 tiếng", "1 tiếng rưỡi", "90 phút", "2h"; bán kính: "3km".
    minutes = 0
    for match in re.finditer(r"(\d+(?:[.,]\d+)?)\s*(tieng|gio|h|phut|p)(?![a-z])", folded):
        if re.search(r"(luc|tu|den|truoc|sau)\s*$", folded[:match.start()]):
            continue  # "lúc 19h" là giờ hẹn, không phải thời gian rảnh
        number, unit = match.groups()
        value = float(number.replace(",", "."))
        minutes += value if unit in ("phut", "p") else value * 60
    if re.search(r"(tieng|gio) ruoi", folded):
        minutes += 30
    if re.search(r"\b(ca ngay|nguyen ngay)\b", folded):
        minutes = max(minutes, 6 * 60)
    if minutes >= 30:
        intent.free_minutes = int(min(minutes, 1440))
    if radius := re.search(r"(\d+(?:[.,]\d+)?)\s*km", folded):
        intent.radius = min(20.0, max(1.0, float(radius.group(1).replace(",", "."))))

    # Ngày / buổi.
    if re.search(r"\b(ngay mai|sang mai|trua mai|chieu mai|toi mai|mai di)\b", folded):
        intent.day, intent.day_label = today + timedelta(days=1), "ngày mai"
    elif _has(folded, "cuoi tuan"):
        intent.day = today if today.weekday() >= 5 else today + timedelta(days=5 - today.weekday())
        intent.day_label = "cuối tuần"
    elif _has(folded, "hom nay") or _has(folded, "toi nay") or _has(folded, "chieu nay") or _has(folded, "bay gio"):
        intent.day, intent.day_label = today, "hôm nay"
    for key in _TIME_OF_DAY:
        if re.search(rf"(?<!\w){key}(?!\w)", text):
            intent.time_of_day = key
            break

    # Thời tiết (khớp trên chữ có dấu vì "mua" không dấu còn là "mua sắm").
    if _RAIN.search(text) and not re.search(r"(không|hết|tạnh) mưa", text):
        intent.weather = "rain"
    elif _HOT.search(text):
        intent.weather = "hot"
    elif _SUNNY.search(text):
        intent.weather = "sun"

    # Tag theo từ khóa + ngữ cảnh.
    for tag, words in _TAG_TRIGGERS.items():
        hits = [word for word in words if _has(folded, word)]
        if not hits:
            continue
        if hits == ["an"] and not re.search(r"\b(di an|an gi|an o|muon an|an toi|an trua|an sang)\b", folded):
            continue  # "ăn" đứng lẻ quá mơ hồ
        intent.tags.append(tag)
        # "an lau" -> "lau" để khớp tên kiểu "Lẩu Phan"
        terms = (re.sub(r"^(an|di|quan|do|choi) ", "", word) for word in hits if word != tag)
        intent.boost_terms.extend(term for term in terms if len(term) >= 3)
    for words, tags in _OCCASION_TAGS.items():
        if any(_has(folded, word) for word in words) and not intent.tags:
            intent.tags.extend(tags)
    if intent.weather == "sun":
        intent.boost_terms.extend(["may anh", "chup anh", "thue may anh"])

    # Khu vực: "khu vực Hai Bà Trưng", "ở Cầu Giấy", hoặc tên quận/khu quen thuộc đứng một mình.
    for match in [*_ADMIN_PLACE_RE.finditer(text), *_PLACE_RE.finditer(text)]:
        place = " ".join(match.group(1).strip(" -").split()[:5])  # tên khu vực hiếm khi dài hơn 5 từ
        if fold(place) not in _NOT_PLACES and len(fold(place)) >= 3 and fold(place) not in _TAG_TRIGGERS:
            intent.place = place
            break
    if not intent.place:
        for district in _DISTRICTS:
            if _has(folded, district):
                start = folded.index(district)
                intent.place = message[start:start + len(district)].strip()
                break

    intent.asks_search = any(_has(folded, word) for word in _SEARCH_WORDS)
    if not intent.understood:
        if re.match(r"^(xin chao|chao|hello|hi|hey|alo|yo)\b", folded):
            intent.small_talk = "greet"
        elif re.search(r"\b(cam on|thanks|thank|tks)\b", folded):
            intent.small_talk = "thanks"
        elif re.search(r"(ban (la ai|lam duoc gi|giup duoc gi)|huong dan|cach dung|giup toi)", folded):
            intent.small_talk = "help"
    return intent


def _merge_follow_up(current: Intent, previous: Intent, message: str) -> Intent:
    """"Còn chỗ nào khác không?", "rẻ hơn thì sao?" -> giữ ngữ cảnh của câu trước."""
    folded = fold(message)
    if not any(_has(folded, word) for word in _FOLLOW_UP):
        return current
    current.place = current.place or previous.place
    current.tags = current.tags or previous.tags
    current.weather = current.weather or previous.weather
    current.time_of_day = current.time_of_day or previous.time_of_day
    current.day, current.day_label = (current.day, current.day_label) if current.day else (previous.day, previous.day_label)
    if current.budget is None and previous.budget is not None:
        current.budget = previous.budget * 0.7 if _has(folded, "re hon") else previous.budget
    current.asks_search = True
    return current


_LLM_SCHEMA = {
    "type": "object",
    "properties": {
        "tags": {"type": "array", "items": {"type": "string"}},
        "budget": {"type": ["number", "null"]},
        "place": {"type": ["string", "null"]},
        "weather": {"type": ["string", "null"], "enum": ["rain", "hot", "sun", None]},
        "free_minutes": {"type": ["integer", "null"]},
        "keywords": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["tags", "budget", "place", "weather", "free_minutes", "keywords"],
    "additionalProperties": False,
}


def _llm_intent(message: str, tag_names: list[str]) -> Optional[Intent]:
    """Chỉ gọi khi bộ local không hiểu gì. Một lượt gọi ngắn (~200 token), lỗi thì bỏ qua."""
    if not settings.OPENAI_API_KEY.strip():
        return None
    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=8, max_retries=0)
        response = client.responses.create(
            model=settings.OPENAI_MODEL.strip() or "gpt-6-luna",
            instructions=(
                "Trích ý định tìm hoạt động giải trí từ câu tiếng Việt. tags chỉ chọn trong: " + ", ".join(tag_names)
                + ". budget là VND tối đa/người. place là tên khu vực nếu có. weather: rain (mưa/lạnh), hot (nóng), sun (nắng đẹp)."
                " Suy luận ngữ cảnh: trời mưa -> hoạt động trong nhà; nắng đẹp -> ngoài trời/chụp ảnh. Không bịa."
            ),
            input=message,
            max_output_tokens=200,
            text={"format": {"type": "json_schema", "name": "free2do_intent", "strict": True, "schema": _LLM_SCHEMA}},
        )
        data = json.loads(response.output_text)
    except Exception:
        logger.warning("LLM fallback failed", exc_info=True)
        return None
    known = {fold(name) for name in tag_names}
    return Intent(
        tags=[fold(tag) for tag in data.get("tags", []) if fold(tag) in known],
        boost_terms=[fold(word) for word in data.get("keywords", []) if len(fold(word)) >= 3][:5],
        budget=data.get("budget") if isinstance(data.get("budget"), (int, float)) and data["budget"] >= 0 else None,
        place=(data.get("place") or None),
        weather=data.get("weather"),
        free_minutes=data.get("free_minutes") if isinstance(data.get("free_minutes"), int) and data["free_minutes"] >= 30 else None,
        asks_search=True,
    )


# ---------------------------------------------------------------------------
# Tìm kiếm + xếp hạng + dựng câu trả lời
# ---------------------------------------------------------------------------
def _vnd(value: float) -> str:
    return f"{int(value):,}".replace(",", ".") + "đ"


def _geocode_place(place: str) -> Optional[tuple[float, float]]:
    for query in (f"{place}, Hà Nội", place):
        try:
            result = resolve_location(query)
        except Exception:
            logger.warning("Geocode failed for %s", query, exc_info=True)
            return None
        if result:
            return result[0], result[1]
    return None


def _open_at(row, minute_of_day: int) -> bool:
    if row.time_open is None or row.time_close is None:
        return True
    start = row.time_open.hour * 60 + row.time_open.minute
    end = row.time_close.hour * 60 + row.time_close.minute
    if end <= start:
        end += 24 * 60
    return start <= minute_of_day <= end or start <= minute_of_day + 24 * 60 <= end


def _rank(rows: list, intent: Intent) -> list[tuple[float, object]]:
    ranked = []
    for row in rows:
        tags = {fold(name) for name in row.category_names}
        text = fold(f"{row.name} {row.description or ''}")
        if intent.weather in ("rain", "hot") and tags and tags <= _OUTDOOR:
            continue  # mưa/nóng: bỏ hoạt động chỉ ngoài trời
        if intent.time_of_day and not _open_at(row, _TIME_OF_DAY[intent.time_of_day]):
            continue
        score = row.match_score
        score += 12 * sum(1 for term in set(intent.boost_terms) if term in text)
        if intent.weather in ("rain", "hot") and tags & _INDOOR:
            score += 10
        if intent.weather == "sun" and tags & _OUTDOOR:
            score += 15
        score += (row.avg_rating or 0) * 2
        ranked.append((score, row))
    return sorted(ranked, key=lambda item: (-item[0], item[1].distance_km or 0))


def _reason(row, intent: Intent) -> str:
    tags = {fold(name): name for name in row.category_names}
    parts = []
    wanted = [tags[tag] for tag in intent.tags if tag in tags]
    if wanted:
        parts.append(", ".join(wanted[:2]))
    if intent.weather in ("rain", "hot") and set(tags) & _INDOOR:
        parts.append("trong nhà" + (", tránh mưa" if intent.weather == "rain" else ", mát mẻ"))
    if intent.weather == "sun" and set(tags) & _OUTDOOR:
        parts.append("hợp trời nắng đẹp")
    if intent.budget is not None and row.price is not None:
        parts.append("trong ngân sách" if row.price <= intent.budget else "")
    if row.avg_rating:
        parts.append(f"★ {row.avg_rating}")
    return " · ".join(part for part in parts if part) or "Phù hợp bộ lọc của bạn"


def _card(row, intent: Intent) -> dict:
    return {
        "activity_id": row.activity_id,
        "name": row.name,
        "business_name": row.business_name,
        "address": row.address,
        "time_open": row.time_open,
        "time_close": row.time_close,
        "price": row.price,
        "price_text": row.price_text,
        "distance_km": row.distance_km,
        "match_score": row.match_score,
        "avg_rating": row.avg_rating,
        "review_count": row.review_count,
        "category_names": row.category_names,
        "latitude": row.latitude,
        "longitude": row.longitude,
        "image_url": row.image_url,
        "business_logo_url": row.business_logo_url,
        "reason": _reason(row, intent),
    }


def _small_talk_reply(kind: str) -> str:
    if kind == "thanks":
        return "Không có gì! Cần tìm thêm hoạt động thì cứ nhắn mình nhé 😊"
    return ("Chào bạn! Mình là trợ lý FREE2DO. Bạn có thể hỏi kiểu:\n"
            "• \"Tối nay đi chơi khu vực Hai Bà Trưng dưới 200k\"\n"
            "• \"Trời mưa, rảnh 2 tiếng thì đi đâu?\"\n"
            "• \"Nắng đẹp muốn đi chụp ảnh\"\n"
            "Mình sẽ tìm trong các hoạt động thật trên FREE2DO cho bạn.")


@router.post("/chat")
def chat(
    payload: AIChatRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Trả về {reply, understood, recommendations, location, source}."""
    _check_rate_limit(user.user_id)
    today = datetime.now(_VN_TZ).date()
    intent = parse_message(payload.message, today)
    previous_user = [turn.content for turn in payload.history if turn.role == "user"]
    if previous_user:
        intent = _merge_follow_up(intent, parse_message(previous_user[-1], today), payload.message)

    if intent.small_talk:
        return {"reply": _small_talk_reply(intent.small_talk), "understood": [], "recommendations": [], "location": None, "source": "local"}

    categories = db.query(models.Category).all()
    tag_ids = {fold(item.name): item.category_id for item in categories}
    source = "local"
    if not intent.understood:
        llm = _llm_intent(payload.message, [item.name for item in categories])
        if llm is not None and llm.understood:
            intent, source = llm, "llm"

    understood: list[str] = []
    location = None
    if intent.place:
        coordinates = _geocode_place(intent.place)
        if coordinates:
            location = {"latitude": coordinates[0], "longitude": coordinates[1], "label": intent.place.title()}
            understood.append(f"📍 {intent.place.title()}")
        else:
            understood.append(f"📍 Không tìm thấy “{intent.place}”, dùng vị trí của bạn")
    if location is None and payload.latitude is not None and payload.longitude is not None:
        location = {"latitude": payload.latitude, "longitude": payload.longitude,
                    "label": payload.location_label or "Vị trí của bạn"}
    if location is None:
        return {
            "reply": "Mình chưa biết bạn đang ở đâu. Hãy nói khu vực (vd: \"ở Cầu Giấy\") hoặc bật vị trí ở trang chủ nhé.",
            "understood": understood, "recommendations": [], "location": None, "source": source,
        }

    budget = intent.budget if intent.budget is not None else payload.budget
    free_minutes = intent.free_minutes or payload.free_time
    tag_names = {fold(item.name): item.name for item in categories}
    category_ids = [tag_ids[tag] for tag in dict.fromkeys(intent.tags) if tag in tag_ids]
    if not category_ids and not intent.understood:
        category_ids = [item for item in payload.category_ids if item in set(tag_ids.values())]
    if budget is not None:
        understood.append(f"💰 ≤ {_vnd(budget)}" if budget else "💰 Miễn phí")
    if free_minutes:
        understood.append(f"⏱ Rảnh {free_minutes // 60}h{free_minutes % 60:02d}" if free_minutes % 60 else f"⏱ Rảnh {free_minutes // 60} giờ")
    if intent.day_label or intent.time_of_day:
        understood.append("🕒 " + " ".join(filter(None, [intent.time_of_day, intent.day_label])).capitalize())
    if intent.weather:
        understood.append({"rain": "☔ Trời mưa → ưu tiên trong nhà", "hot": "🌡 Trời nóng → ưu tiên trong nhà",
                           "sun": "☀️ Nắng đẹp → ưu tiên ngoài trời, chụp ảnh"}[intent.weather])
    if category_ids:
        understood.append("🏷 " + ", ".join(tag_names[tag] for tag in dict.fromkeys(intent.tags) if tag in tag_names))

    # Tìm theo bán kính tăng dần; vẫn rỗng thì bỏ tag. Ngân sách luôn giữ cứng.
    first_radius = intent.radius or payload.radius or 5
    radii = sorted({first_radius, max(first_radius, 10.0), 20.0})
    attempts = [(radius, category_ids) for radius in radii]
    if category_ids:
        attempts.append((20.0, []))
    ranked, used_radius, used_tags = [], first_radius, category_ids
    for radius, ids in attempts:
        params = schemas.SearchParams(
            latitude=location["latitude"], longitude=location["longitude"], radius=radius, budget=budget,
            free_time=free_minutes, selected_date=intent.day or payload.selected_date, category_ids=ids,
            sort_by="match", record_history=False,
        )
        ranked = _rank(search_activities(params, db, user, None), intent)
        used_radius, used_tags = radius, ids
        if ranked:
            break

    place_text = f" quanh {location['label']}" if intent.place and location["label"] else ""
    budget_text = f" dưới {_vnd(budget)}" if budget else ""
    if not ranked:
        tip = "tăng ngân sách" if budget is not None else "đổi khu vực hoặc loại hoạt động"
        reply = f"Mình chưa tìm thấy hoạt động nào{budget_text}{place_text} trong bán kính 20 km. Bạn thử {tip} nhé."
        return {"reply": reply, "understood": understood, "recommendations": [], "location": location, "source": source}

    top = [row for _score, row in ranked[:_MAX_RESULTS]]
    notes = []
    if used_radius > first_radius:
        notes.append(f"Trong {first_radius:g} km chưa có nên mình mở rộng tới {used_radius:g} km.")
    if category_ids and not used_tags:
        notes.append("Chưa có đúng loại bạn muốn, đây là lựa chọn khác vẫn trong điều kiện của bạn.")
    if not intent.understood:
        notes.insert(0, "Mình chưa hiểu rõ yêu cầu nên gợi ý theo vị trí và bộ lọc hiện tại của bạn.")
    if intent.weather == "rain":
        notes.append("Trời mưa nên mình ưu tiên chỗ trong nhà.")
    elif intent.weather == "sun":
        notes.append("Nắng đẹp nên mình ưu tiên chỗ ngoài trời và chụp ảnh.")
    first = top[0]
    reply = (f"Mình tìm được {len(ranked)} hoạt động{budget_text}{place_text}. "
             f"Gợi ý nổi bật: {first.name} ({_reason(first, intent)}). " + " ".join(notes)).strip()
    return {
        "reply": reply,
        "understood": understood,
        "recommendations": [_card(row, intent) for row in top],
        "location": location,
        "source": source,
    }
