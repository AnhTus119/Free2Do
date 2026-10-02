import asyncio
import json
import secrets
from collections import defaultdict
from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import decode_token, get_current_user
from app.database import SessionLocal, get_db
from app.utils.email import send_notification_email


router = APIRouter(prefix="/groups", tags=["groups"])


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class GroupConnectionManager:
    """Presence theo user, hỗ trợ nhiều tab và không giữ lock lúc gửi socket."""

    def __init__(self) -> None:
        self._connections: dict[str, dict[str, set[WebSocket]]] = defaultdict(
            lambda: defaultdict(set)
        )
        self._send_locks: dict[WebSocket, asyncio.Lock] = {}
        self._lock = asyncio.Lock()

    async def connect(self, group_id: str, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[group_id][user_id].add(websocket)
            self._send_locks[websocket] = asyncio.Lock()

    async def disconnect(self, group_id: str, user_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.get(group_id, {}).get(user_id)
            if sockets:
                sockets.discard(websocket)
                if not sockets:
                    self._connections[group_id].pop(user_id, None)
            if group_id in self._connections and not self._connections[group_id]:
                self._connections.pop(group_id, None)
            self._send_locks.pop(websocket, None)

    async def online_users(self, group_id: str) -> set[str]:
        async with self._lock:
            return {
                user_id
                for user_id, sockets in self._connections.get(group_id, {}).items()
                if sockets
            }

    async def _safe_send(self, websocket: WebSocket, payload: dict) -> bool:
        lock = self._send_locks.get(websocket)
        if lock is None:
            return False
        try:
            async with lock:
                await asyncio.wait_for(websocket.send_json(payload), timeout=1.0)
            return True
        except Exception:
            return False

    async def send(self, websocket: WebSocket, payload: dict) -> bool:
        return await self._safe_send(websocket, payload)

    async def broadcast(self, group_id: str, payload: dict) -> None:
        async with self._lock:
            targets = [
                (user_id, websocket)
                for user_id, sockets in self._connections.get(group_id, {}).items()
                for websocket in tuple(sockets)
            ]
        if not targets:
            return
        results = await asyncio.gather(
            *(self._safe_send(websocket, payload) for _, websocket in targets),
            return_exceptions=True,
        )
        failed = [
            (user_id, websocket)
            for (user_id, websocket), result in zip(targets, results)
            if result is not True
        ]
        for user_id, websocket in failed:
            await self.disconnect(group_id, user_id, websocket)

    async def broadcast_presence(self, group_id: str) -> None:
        users = sorted(await self.online_users(group_id))
        await self.broadcast(group_id, {"type": "presence", "online_user_ids": users})


group_connections = GroupConnectionManager()


def _category_ids(member: models.GroupMember) -> list[str]:
    try:
        value = json.loads(member.category_ids_json or "[]")
    except (TypeError, json.JSONDecodeError):
        return []
    return [str(item) for item in value if item]


def _validate_categories(db: Session, category_ids: list[str]) -> None:
    requested = set(category_ids)
    found = {
        value
        for (value,) in db.query(models.Category.category_id)
        .filter(models.Category.category_id.in_(requested))
        .all()
    }
    if found != requested:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Có danh mục không tồn tại")


def _require_group_member(db: Session, group_id: str, user_id: str) -> tuple[models.Group, models.GroupMember]:
    group = db.query(models.Group).filter(models.Group.group_id == group_id).first()
    if not group or group.status != "active":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy nhóm")
    membership = (
        db.query(models.GroupMember)
        .filter(models.GroupMember.group_id == group_id, models.GroupMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn không thuộc nhóm này")
    return group, membership


def _activity_out(db: Session, activity: Optional[models.Activity]) -> Optional[schemas.GroupSelectedActivityOut]:
    if not activity:
        return None
    avg_rating = (
        db.query(func.avg(models.Review.rating))
        .filter(models.Review.activity_id == activity.activity_id)
        .scalar()
    )
    return schemas.GroupSelectedActivityOut(
        activity_id=activity.activity_id,
        name=activity.name,
        description=activity.description,
        address=activity.address,
        price=activity.price,
        price_text=activity.price_text,
        time_open=activity.time_open,
        time_close=activity.time_close,
        avg_rating=round(float(avg_rating), 1) if avg_rating is not None else None,
        category_ids=[item.category_id for item in activity.categories],
        media_url=next((item.media_url for item in sorted(activity.media, key=lambda media: (media.media_kind != "cover", media.media_id))), None),
    )


def _group_out(
    db: Session,
    group: models.Group,
    current_user_id: str,
    online_user_ids: Optional[set[str]] = None,
) -> schemas.GroupOut:
    online_user_ids = online_user_ids or set()
    category_map = {
        category.category_id: category.name
        for category in db.query(models.Category).all()
    }
    members = []
    total = 0.0
    paid = 0.0
    for member in sorted(group.members, key=lambda item: (not item.is_host, item.joined_at)):
        payment = member.payment
        if not payment:
            payment = models.GroupPayment(
                group_id=group.group_id,
                member_id=member.member_id,
                amount=0,
                status="unpaid",
                updated_at=_now(),
            )
            db.add(payment)
            db.flush()
        category_ids = _category_ids(member)
        total += float(payment.amount or 0)
        if payment.status == "paid":
            paid += float(payment.amount or 0)
        members.append(
            schemas.GroupMemberOut(
                member_id=member.member_id,
                user_id=member.user_id,
                name=member.name,
                free_hours=member.free_hours,
                address=member.address,
                budget=member.budget,
                category_ids=category_ids,
                category_names=[category_map[value] for value in category_ids if value in category_map],
                is_host=member.is_host,
                is_ready=member.is_ready,
                leave_requested_at=member.leave_requested_at,
                leave_status=member.leave_status,
                is_online=bool(member.user_id and member.user_id in online_user_ids),
                payment=schemas.GroupPaymentOut(
                    payment_id=payment.payment_id,
                    member_id=member.member_id,
                    amount=payment.amount or 0,
                    status=payment.status,
                    reminded_at=payment.reminded_at,
                    paid_at=payment.paid_at,
                ),
            )
        )
    return schemas.GroupOut(
        group_id=group.group_id,
        invite_code=group.invite_code,
        invite_url=f"?groupInvite={group.invite_code}",
        host_user_id=group.host_user_id,
        is_host=group.host_user_id == current_user_id,
        status=group.status,
        search_started=group.search_started,
        all_ready=bool(group.members) and all(member.is_ready for member in group.members),
        selected_activity=_activity_out(db, group.selected_activity),
        members=members,
        total_amount=total,
        paid_amount=paid,
        missing_amount=max(total - paid, 0),
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


async def _changed(group_id: str) -> None:
    await group_connections.broadcast(
        group_id,
        {"type": "group_updated", "group_id": group_id, "at": _now().isoformat()},
    )


@router.post("", response_model=schemas.GroupOut, status_code=status.HTTP_201_CREATED)
async def create_group(
    payload: schemas.GroupCreateRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _validate_categories(db, payload.host.category_ids)
    now = _now()
    group = models.Group(
        invite_code=secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12],
        host_user_id=user.user_id,
        status="active",
        created_at=now,
        updated_at=now,
    )
    db.add(group)
    db.flush()
    item = payload.host
    member = models.GroupMember(
        group_id=group.group_id,
        user_id=user.user_id,
        name=item.name,
        free_hours=item.free_hours,
        address=item.address,
        budget=item.budget,
        category_ids_json=json.dumps(item.category_ids),
        is_host=True,
        is_ready=False,
        joined_at=now,
        updated_at=now,
    )
    db.add(member)
    db.flush()
    db.add(models.GroupPayment(
        group_id=group.group_id,
        member_id=member.member_id,
        amount=0,
        status="unpaid",
        updated_at=now,
    ))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Không thể tạo nhóm, vui lòng thử lại") from exc
    db.refresh(group)
    return _group_out(db, group, user.user_id)


@router.get("/invite/{invite_code}", response_model=schemas.GroupOut)
async def get_group_by_invite(
    invite_code: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    group = db.query(models.Group).filter(models.Group.invite_code == invite_code).first()
    if not group or group.status != "active":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Link mời không hợp lệ")
    membership = next((m for m in group.members if m.user_id == user.user_id), None)
    if not membership:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn chưa tham gia nhóm")
    return _group_out(db, group, user.user_id, await group_connections.online_users(group.group_id))


@router.post("/invite/{invite_code}/join", response_model=schemas.GroupOut)
async def join_group(
    invite_code: str,
    payload: schemas.GroupJoinRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _validate_categories(db, payload.category_ids)
    group = (
        db.query(models.Group)
        .filter(models.Group.invite_code == invite_code, models.Group.status == "active")
        .with_for_update()
        .first()
    )
    if not group:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Link mời không hợp lệ")
    if group.search_started:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nhóm đã bắt đầu tìm hoạt động, không nhận thêm thành viên")
    existing = next((member for member in group.members if member.user_id == user.user_id), None)
    now = _now()
    if existing:
        member = existing
    else:
        if len(group.members) >= 30:
            raise HTTPException(status.HTTP_409_CONFLICT, "Nhóm đã đủ 30 thành viên")
        member = models.GroupMember(
            group_id=group.group_id,
            user_id=user.user_id,
            name=payload.name,
            free_hours=payload.free_hours,
            address=payload.address,
            budget=payload.budget,
            category_ids_json=json.dumps(payload.category_ids),
            is_host=False,
            is_ready=False,
            joined_at=now,
            updated_at=now,
        )
        db.add(member)
        db.flush()
        db.add(models.GroupPayment(
            group_id=group.group_id,
            member_id=member.member_id,
            amount=float(group.selected_activity.price or 0) if group.selected_activity else 0,
            status="unpaid",
            updated_at=now,
        ))
    member.name = payload.name
    member.free_hours = payload.free_hours
    member.address = payload.address
    member.budget = payload.budget
    member.category_ids_json = json.dumps(payload.category_ids)
    member.is_ready = False
    group.search_started = False
    member.updated_at = now
    group.updated_at = now
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Tài khoản đã tham gia nhóm") from exc
    db.refresh(group)
    await _changed(group.group_id)
    return _group_out(db, group, user.user_id, await group_connections.online_users(group.group_id))


@router.get("/me", response_model=list[schemas.GroupOut])
async def list_my_groups(
    limit: int = 100,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    limit = max(1, min(limit, 500))
    groups = (
        db.query(models.Group)
        .join(models.GroupMember, models.GroupMember.group_id == models.Group.group_id)
        .filter(models.GroupMember.user_id == user.user_id)
        .order_by(models.Group.updated_at.desc())
        .limit(limit)
        .all()
    )
    online = {group.group_id: await group_connections.online_users(group.group_id) for group in groups}
    return [_group_out(db, group, user.user_id, online[group.group_id]) for group in groups]


@router.get("/{group_id}", response_model=schemas.GroupOut)
async def get_group(
    group_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    group, _ = _require_group_member(db, group_id, user.user_id)
    return _group_out(db, group, user.user_id, await group_connections.online_users(group_id))


@router.patch("/{group_id}/members/{member_id}", response_model=schemas.GroupOut)
async def update_member(
    group_id: str,
    member_id: str,
    payload: schemas.GroupMemberUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    group, membership = _require_group_member(db, group_id, user.user_id)
    member = next((item for item in group.members if item.member_id == member_id), None)
    if not member:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thành viên")
    if group.host_user_id != user.user_id and member.user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn chỉ được sửa thông tin của mình")
    data = payload.model_dump(exclude_unset=True)
    category_ids = data.pop("category_ids", None)
    if category_ids is not None:
        _validate_categories(db, category_ids)
        member.category_ids_json = json.dumps(category_ids)
    for field, value in data.items():
        setattr(member, field, value)
    member.is_ready = False
    group.search_started = False
    now = _now()
    member.updated_at = now
    group.updated_at = now
    db.commit()
    db.refresh(group)
    await _changed(group_id)
    return _group_out(db, group, user.user_id, await group_connections.online_users(group_id))


@router.patch("/{group_id}/members/{member_id}/ready", response_model=schemas.GroupOut)
async def set_member_ready(
    group_id: str,
    member_id: str,
    payload: schemas.GroupReadyRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    group, _ = _require_group_member(db, group_id, user.user_id)
    member = next((item for item in group.members if item.member_id == member_id), None)
    if not member or member.user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Mỗi thành viên chỉ được tự cập nhật trạng thái sẵn sàng")
    if group.search_started:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nhóm đã bắt đầu tìm hoạt động")
    member.is_ready = payload.is_ready
    member.updated_at = group.updated_at = _now()
    db.commit()
    db.refresh(group)
    await _changed(group_id)
    return _group_out(db, group, user.user_id, await group_connections.online_users(group_id))


@router.post("/{group_id}/start", response_model=schemas.GroupOut)
async def start_group_search(
    group_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    group, _ = _require_group_member(db, group_id, user.user_id)
    if group.host_user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ host được bắt đầu tìm hoạt động")
    if not group.members or not all(member.is_ready for member in group.members):
        raise HTTPException(status.HTTP_409_CONFLICT, "Tất cả thành viên cần nhấn sẵn sàng trước")
    group.search_started = True
    group.updated_at = _now()
    db.commit()
    db.refresh(group)
    await _changed(group_id)
    return _group_out(db, group, user.user_id, await group_connections.online_users(group_id))


@router.post("/{group_id}/members/{member_id}/leave-request", response_model=schemas.GroupOut)
async def request_group_leave(
    group_id: str,
    member_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    group, _ = _require_group_member(db, group_id, user.user_id)
    member = next((item for item in group.members if item.member_id == member_id), None)
    if not member or member.user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ được yêu cầu rời nhóm cho chính mình")
    if not group.search_started:
        raise HTTPException(status.HTTP_409_CONFLICT, "Chỉ cần trưởng nhóm duyệt rời sau khi bắt đầu tìm hoạt động")
    member.leave_requested_at = _now()
    member.leave_status = "pending"
    group.updated_at = member.updated_at = _now()
    db.commit()
    db.refresh(group)
    await _changed(group_id)
    return _group_out(db, group, user.user_id, await group_connections.online_users(group_id))


@router.patch("/{group_id}/members/{member_id}/leave-request", response_model=schemas.GroupOut)
async def resolve_group_leave(
    group_id: str,
    member_id: str,
    payload: schemas.GroupLeaveRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    group, _ = _require_group_member(db, group_id, user.user_id)
    if group.host_user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ trưởng nhóm được xử lý yêu cầu rời nhóm")
    member = next((item for item in group.members if item.member_id == member_id), None)
    if not member or member.leave_status != "pending":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không có yêu cầu rời nhóm đang chờ")
    if payload.action == "approve":
        db.delete(member)
    else:
        member.leave_status = "rejected"
        member.leave_requested_at = None
        member.updated_at = _now()
    group.updated_at = _now()
    db.commit()
    db.refresh(group)
    await _changed(group_id)
    return _group_out(db, group, user.user_id, await group_connections.online_users(group_id))


def _duration_hours(activity: models.Activity) -> float:
    if not activity.time_open or not activity.time_close:
        return 24.0
    seconds = (activity.time_close - activity.time_open).total_seconds()
    if seconds <= 0:
        seconds += 24 * 3600
    return max(seconds / 3600, 0)


@router.get("/{group_id}/recommendations", response_model=list[schemas.GroupRecommendationOut])
async def group_recommendations(
    group_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    group, _ = _require_group_member(db, group_id, user.user_id)
    if not group.search_started:
        raise HTTPException(status.HTTP_409_CONFLICT, "Host cần bắt đầu tìm hoạt động sau khi mọi người sẵn sàng")
    activities = (
        db.query(models.Activity)
        .filter(
            models.Activity.status == "active",
            or_(
                models.Activity.always_available.is_(True),
                and_(
                    or_(models.Activity.available_from.is_(None), func.date(models.Activity.available_from) <= _now().date()),
                    or_(models.Activity.available_until.is_(None), func.date(models.Activity.available_until) >= _now().date()),
                ),
            ),
        )
        .order_by(models.Activity.created_at.desc())
        .all()
    )
    results = []
    for activity in activities:
        activity_categories = {item.category_id for item in activity.categories}
        duration = _duration_hours(activity)
        if activity.price is not None and any(float(activity.price) > member.budget for member in group.members):
            continue
        if any(
            _category_ids(member) and not (set(_category_ids(member)) & activity_categories)
            for member in group.members
        ):
            continue
        member_scores: dict[str, int] = {}
        for member in group.members:
            interests = set(_category_ids(member))
            interest_score = 35 if interests & activity_categories else 10
            budget_score = 30 if activity.price is None or float(activity.price) <= member.budget else 0
            time_score = 25 if duration >= member.free_hours else 0
            member_address = member.address.strip().casefold()
            activity_address = activity.address.strip().casefold()
            address_score = 10 if member_address and (
                member_address in activity_address or activity_address in member_address
            ) else 4
            member_scores[member.member_id] = interest_score + budget_score + time_score + address_score
        if not member_scores:
            continue
        base = _activity_out(db, activity)
        results.append(schemas.GroupRecommendationOut(
            **base.model_dump(),
            match_score=round(sum(member_scores.values()) / len(member_scores)),
            member_scores=member_scores,
        ))
    return sorted(results, key=lambda item: (-item.match_score, item.price or 0))[:20]


@router.put("/{group_id}/activity", response_model=schemas.GroupOut)
async def select_group_activity(
    group_id: str,
    payload: schemas.GroupActivitySelect,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    group, _ = _require_group_member(db, group_id, user.user_id)
    if group.host_user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ host được chốt hoạt động")
    activity = (
        db.query(models.Activity)
        .filter(models.Activity.activity_id == payload.activity_id, models.Activity.status == "active")
        .first()
    )
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")
    group.selected_activity_id = activity.activity_id
    group.updated_at = _now()
    amount = float(activity.price or 0)
    for payment in group.payments:
        payment.amount = amount
        payment.status = "unpaid"
        payment.paid_at = None
        payment.reminded_at = None
        payment.overdue_since = None
        payment.updated_at = group.updated_at
    db.commit()
    db.refresh(group)
    await _changed(group_id)
    return _group_out(db, group, user.user_id, await group_connections.online_users(group_id))


@router.patch("/{group_id}/payments/{member_id}", response_model=schemas.GroupOut)
async def update_payment(
    group_id: str,
    member_id: str,
    payload: schemas.GroupPaymentAction,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    group, _ = _require_group_member(db, group_id, user.user_id)
    if group.host_user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ host được cập nhật thanh toán")
    payment = next((item for item in group.payments if item.member_id == member_id), None)
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thanh toán")
    now = _now()
    if payload.action == "paid":
        payment.status = "paid"
        payment.paid_at = now
        payment.overdue_since = None
    elif payload.action == "unpaid":
        payment.status = "unpaid"
        payment.paid_at = None
        payment.overdue_since = payment.overdue_since or now
    else:
        target = payment.member.user if payment.member else None
        recipient = (target.account.email or target.account.recovery_email) if target and target.account else None
        if not recipient:
            raise HTTPException(status.HTTP_409_CONFLICT, "Thành viên chưa có email nhận thông báo")
        try:
            send_notification_email(
                recipient,
                f"Nhắc thanh toán nhóm FREE2DO — {group.selected_activity.name if group.selected_activity else 'hoạt động nhóm'}",
                f"Trưởng nhóm nhắc bạn thanh toán {payment.amount:,.0f} đ cho hoạt động "
                f"{group.selected_activity.name if group.selected_activity else 'đã chọn'}. "
                "Nếu đã thanh toán, vui lòng liên hệ trưởng nhóm để cập nhật trạng thái.",
            )
        except Exception as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Không gửi được email nhắc thanh toán") from exc
        payment.reminded_at = now
        payment.overdue_since = payment.overdue_since or now
    payment.updated_at = now
    group.updated_at = now
    db.commit()
    db.refresh(group)
    await _changed(group_id)
    return _group_out(db, group, user.user_id, await group_connections.online_users(group_id))


@router.websocket("/{group_id}/ws")
async def group_websocket(websocket: WebSocket, group_id: str, token: str):
    account_id = decode_token(token, expected_type="access")
    db = SessionLocal()
    user_id: Optional[str] = None
    try:
        account = (
            db.query(models.Account)
            .filter(models.Account.account_id == account_id, models.Account.status == "active")
            .first()
            if account_id else None
        )
        user = db.query(models.User).filter(models.User.account_id == account_id).first() if account else None
        membership = (
            db.query(models.GroupMember)
            .filter(models.GroupMember.group_id == group_id, models.GroupMember.user_id == user.user_id)
            .first()
            if user else None
        )
        if not user or not membership:
            await websocket.close(code=4403)
            return
        user_id = user.user_id
        await group_connections.connect(group_id, user_id, websocket)
        await group_connections.send(websocket, {"type": "connected", "group_id": group_id})
        await group_connections.broadcast_presence(group_id)
        while True:
            message = await websocket.receive_text()
            if message == "ping":
                await group_connections.send(websocket, {"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        db.close()
        if user_id:
            await group_connections.disconnect(group_id, user_id, websocket)
            await group_connections.broadcast_presence(group_id)
