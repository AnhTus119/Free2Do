import asyncio
import json
import random
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


REMIND_COOLDOWN_SECONDS = 30 * 60

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
        business_logo_url=activity.business.avatar_url if activity.business else None,
    )


def _ballots_by_activity(db: Session, group_id: str) -> dict[str, list[str]]:
    """{activity_id: [member_id, ...]} theo thứ tự bỏ phiếu."""
    tally: dict[str, list[str]] = defaultdict(list)
    for ballot in (
        db.query(models.GroupActivityBallot)
        .filter(models.GroupActivityBallot.group_id == group_id)
        .order_by(models.GroupActivityBallot.created_at, models.GroupActivityBallot.ballot_id)
    ):
        tally[ballot.activity_id].append(ballot.member_id)
    return dict(tally)


def _top_activity_ids(tally: dict[str, list[str]]) -> list[str]:
    """Các hoạt động có nhiều phiếu nhất (nhiều hơn 1 phần tử nghĩa là đang hòa)."""
    if not tally:
        return []
    best = max(len(voters) for voters in tally.values())
    return [activity_id for activity_id, voters in tally.items() if len(voters) == best]


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
    votes = {
        vote.member_id: vote
        for vote in db.query(models.GroupActivityVote)
        .filter(models.GroupActivityVote.group_id == group.group_id)
        .all()
    }
    tally = _ballots_by_activity(db, group.group_id)
    member_votes: dict[str, list[str]] = defaultdict(list)
    for activity_id, voter_ids in tally.items():
        for voter_id in voter_ids:
            member_votes[voter_id].append(activity_id)
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
                activity_vote_id=votes[member.member_id].activity_id if member.member_id in votes else None,
                vote_activity_ids=member_votes.get(member.member_id, []),
                confirmation_status=votes[member.member_id].confirmation_status if member.member_id in votes else None,
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
        group_name=group.group_name,
        host_user_id=group.host_user_id,
        is_host=group.host_user_id == current_user_id,
        status=group.status,
        search_started=group.search_started,
        all_ready=bool(group.members) and all(member.is_ready for member in group.members),
        confirmation_complete=bool(group.selected_activity_id) and bool(group.members) and all(
            votes.get(member.member_id) and votes[member.member_id].confirmation_status == "accepted"
            for member in group.members
        ),
        selected_activity=_activity_out(db, group.selected_activity),
        voting_closed=group.voting_closed_at is not None,
        vote_tally=_tally_out(db, tally),
        tied_activity_ids=(
            _top_activity_ids(tally)
            if group.voting_closed_at and not group.selected_activity_id and len(_top_activity_ids(tally)) > 1
            else []
        ),
        random_pick=(
            _activity_out(db, db.get(models.Activity, group.random_pick_activity_id))
            if group.random_pick_activity_id and not group.selected_activity_id
            else None
        ),
        random_seq=group.random_seq or 0,
        final_method=group.final_method,
        members=members,
        total_amount=total,
        paid_amount=paid,
        missing_amount=max(total - paid, 0),
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


def _tally_out(db: Session, tally: dict[str, list[str]]) -> list[schemas.GroupVoteTallyOut]:
    if not tally:
        return []
    activities = {
        item.activity_id: item
        for item in db.query(models.Activity).filter(models.Activity.activity_id.in_(list(tally))).all()
    }
    rows = []
    for activity_id, voter_ids in tally.items():
        activity = activities.get(activity_id)
        if not activity:
            continue
        rows.append(schemas.GroupVoteTallyOut(
            activity_id=activity_id,
            name=activity.name,
            votes=len(voter_ids),
            voter_member_ids=voter_ids,
            business_logo_url=activity.business.avatar_url if activity.business else None,
            media_url=next((m.media_url for m in sorted(activity.media, key=lambda m: (m.media_kind != "cover", m.media_id))), None),
        ))
    return sorted(rows, key=lambda row: -row.votes)


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
        group_name=payload.group_name,
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
        .filter(models.GroupMember.user_id == user.user_id, models.Group.status == "active")
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


@router.delete("/{group_id}", response_model=schemas.MessageResponse)
async def delete_group(
    group_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    group, _ = _require_group_member(db, group_id, user.user_id)
    if group.host_user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ host được xóa nhóm")
    group.status = "deleted"
    group.updated_at = _now()
    db.commit()
    await _changed(group_id)
    return schemas.MessageResponse(message="Đã xóa nhóm")


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
    group.selected_activity_id = None
    db.query(models.GroupActivityVote).filter(
        models.GroupActivityVote.group_id == group_id
    ).delete(synchronize_session=False)
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
    group.selected_activity_id = None
    group.voting_closed_at = None
    group.random_pick_activity_id = None
    group.final_method = None
    for table in (models.GroupActivityVote, models.GroupActivityBallot):
        db.query(table).filter(table.group_id == group_id).delete(synchronize_session=False)
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
    return sorted(results, key=lambda item: (-item.match_score, item.price or 0))[:11]


@router.post("/{group_id}/members/{member_id}/vote", response_model=schemas.GroupOut)
async def vote_group_activity(
    group_id: str,
    member_id: str,
    payload: schemas.GroupActivitySelect,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Bật/tắt phiếu cho một hoạt động. Mỗi thành viên được chọn không giới hạn số hoạt động."""
    group, _ = _require_group_member(db, group_id, user.user_id)
    member = next((item for item in group.members if item.member_id == member_id), None)
    if not member or member.user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Mỗi thành viên chỉ được tự bình chọn")
    if not group.search_started or group.selected_activity_id or group.voting_closed_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bình chọn đã đóng")
    ballot = db.query(models.GroupActivityBallot).filter(
        models.GroupActivityBallot.member_id == member_id,
        models.GroupActivityBallot.activity_id == payload.activity_id,
    ).first()
    if ballot:
        db.delete(ballot)
    else:
        recommendations = await group_recommendations(group_id, db, user)
        if payload.activity_id not in {item.activity_id for item in recommendations}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hoạt động không nằm trong danh sách gợi ý của nhóm")
        db.add(models.GroupActivityBallot(
            group_id=group_id, member_id=member_id, activity_id=payload.activity_id, created_at=_now(),
        ))
    group.updated_at = _now()
    db.commit()
    db.refresh(group)
    await _changed(group_id)
    return _group_out(db, group, user.user_id, await group_connections.online_users(group_id))


@router.post("/{group_id}/voting/close", response_model=schemas.GroupOut)
async def close_group_voting(
    group_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Host đóng bình chọn. Một hoạt động nhiều phiếu nhất -> chốt luôn; hòa -> chờ host random."""
    group, _ = _require_group_member(db, group_id, user.user_id)
    if group.host_user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ host được đóng bình chọn")
    if not group.search_started or group.selected_activity_id or group.voting_closed_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nhóm hiện không thể đóng bình chọn")
    top = _top_activity_ids(_ballots_by_activity(db, group_id))
    if not top:
        raise HTTPException(status.HTTP_409_CONFLICT, "Chưa có ai bình chọn hoạt động nào")
    group.voting_closed_at = _now()
    if len(top) == 1:
        _set_final_activity(db, group, top[0])
        group.final_method = "top_vote"
    group.updated_at = _now()
    db.commit()
    db.refresh(group)
    await _changed(group_id)
    return _group_out(db, group, user.user_id, await group_connections.online_users(group_id))


def _set_final_activity(db: Session, group: models.Group, activity_id: str) -> None:
    activity = (
        db.query(models.Activity)
        .filter(models.Activity.activity_id == activity_id, models.Activity.status == "active")
        .first()
    )
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")
    # GroupActivityVote giữ trạng thái xác nhận tham gia của từng thành viên với hoạt động đã chốt.
    vote_by_member = {
        vote.member_id: vote
        for vote in db.query(models.GroupActivityVote).filter(models.GroupActivityVote.group_id == group.group_id)
    }
    for member in group.members:
        if member.member_id not in vote_by_member:
            vote_by_member[member.member_id] = models.GroupActivityVote(
                group_id=group.group_id, member_id=member.member_id, activity_id=activity.activity_id,
            )
            db.add(vote_by_member[member.member_id])
        vote_by_member[member.member_id].activity_id = activity.activity_id

    group.selected_activity_id = activity.activity_id
    group.random_pick_activity_id = None
    group.updated_at = _now()
    amount = float(activity.price or 0)
    for member in group.members:
        vote = vote_by_member[member.member_id]
        vote.confirmation_status = "accepted" if member.is_host else "pending"
        payment = member.payment
        if payment:
            payment.amount = amount
            payment.status = "unpaid"
            payment.paid_at = None
            payment.reminded_at = None
            payment.overdue_since = None
            payment.updated_at = group.updated_at


@router.post("/{group_id}/randomize", response_model=schemas.GroupOut)
async def randomize_group_activity(
    group_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Host random một hoạt động trong nhóm hòa phiếu cao nhất (gọi lại = Random Again)."""
    group, _ = _require_group_member(db, group_id, user.user_id)
    if group.host_user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ host được random hoạt động")
    if not group.voting_closed_at or group.selected_activity_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Chỉ random được sau khi đóng bình chọn và chưa chốt hoạt động")
    tied = _top_activity_ids(_ballots_by_activity(db, group_id))
    if len(tied) < 2:
        raise HTTPException(status.HTTP_409_CONFLICT, "Không có hoạt động nào hòa phiếu để random")
    group.random_pick_activity_id = random.choice(tied)
    group.random_seq = (group.random_seq or 0) + 1
    group.updated_at = _now()
    db.commit()
    db.refresh(group)
    await _changed(group_id)
    return _group_out(db, group, user.user_id, await group_connections.online_users(group_id))


@router.put("/{group_id}/activity", response_model=schemas.GroupOut)
async def select_group_activity(
    group_id: str,
    payload: schemas.GroupActivitySelect,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Host chốt hoạt động vừa random."""
    group, _ = _require_group_member(db, group_id, user.user_id)
    if group.host_user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ host được chốt hoạt động")
    if not group.voting_closed_at or group.selected_activity_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nhóm hiện không thể chốt hoạt động")
    if payload.activity_id != group.random_pick_activity_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Chỉ chốt được hoạt động vừa random")
    _set_final_activity(db, group, payload.activity_id)
    group.final_method = "random"
    db.commit()
    db.refresh(group)
    await _changed(group_id)
    return _group_out(db, group, user.user_id, await group_connections.online_users(group_id))


@router.patch("/{group_id}/members/{member_id}/confirmation", response_model=schemas.GroupOut)
async def respond_to_group_activity(
    group_id: str,
    member_id: str,
    payload: schemas.GroupActivityConfirmation,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    group, _ = _require_group_member(db, group_id, user.user_id)
    member = next((item for item in group.members if item.member_id == member_id), None)
    if not member or member.user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ được xác nhận hoạt động cho chính mình")
    if not group.selected_activity_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Host chưa chọn hoạt động cho nhóm")
    if member.is_host and payload.action == "reject":
        raise HTTPException(status.HTTP_409_CONFLICT, "Host không thể từ chối hoạt động đã chốt")
    vote = db.query(models.GroupActivityVote).filter(
        models.GroupActivityVote.group_id == group_id,
        models.GroupActivityVote.member_id == member_id,
    ).first()
    if not vote:
        raise HTTPException(status.HTTP_409_CONFLICT, "Không tìm thấy lựa chọn hoạt động của thành viên")
    now = _now()
    if payload.action == "reject":
        db.delete(vote)
        if member.payment:
            db.delete(member.payment)
        db.delete(member)
    else:
        vote.confirmation_status = "accepted"
        member.updated_at = now
    group.updated_at = now
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
    if not group.selected_activity_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nhóm chưa chốt hoạt động")
    votes = {
        vote.member_id: vote
        for vote in db.query(models.GroupActivityVote)
        .filter(models.GroupActivityVote.group_id == group_id)
        .all()
    }
    if not group.members or any(
        votes.get(member.member_id) is None
        or votes[member.member_id].confirmation_status != "accepted"
        for member in group.members
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Tất cả thành viên cần đồng ý trước khi chia chi phí")
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
        if payment.reminded_at and (now - payment.reminded_at).total_seconds() < REMIND_COOLDOWN_SECONDS:
            wait = int((REMIND_COOLDOWN_SECONDS - (now - payment.reminded_at).total_seconds()) // 60) + 1
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Bạn vừa nhắc thành viên này rồi. Có thể nhắc lại sau khoảng {wait} phút.",
            )
        target = payment.member.user if payment.member else None
        recipient = (target.account.email or target.account.recovery_email) if target and target.account else None
        if not recipient:
            raise HTTPException(status.HTTP_409_CONFLICT, "Thành viên chưa có email nhận thông báo")
        try:
            send_notification_email(
                recipient,
                f"Nhắc thanh toán nhóm FREE2DO — {group.selected_activity.name if group.selected_activity else 'hoạt động nhóm'}",
                f"Yo bro, trưởng nhóm nhờ tôi nhắc bạn thanh toán {payment.amount:,.0f} đ cho hoạt động "
                f"\"{group.selected_activity.name if group.selected_activity else 'đã chọn'}\" hôm bữa đó nhớ không?"
                "\nNếu đã thanh toán rồi thì liên hệ lại trưởng nhóm để cập nhật trạng thái nhé."
                "\nCòn nếu chưa chuyển thì tự giác đê, anh biết nhà em đấy.",
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


@router.put("/{group_id}/expense", response_model=schemas.GroupOut)
async def update_group_expense(
    group_id: str,
    payload: schemas.GroupExpenseUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    group, _ = _require_group_member(db, group_id, user.user_id)
    if group.host_user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ host được cập nhật tổng chi phí")
    if not group.selected_activity_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nhóm chưa chốt hoạt động")

    votes = {
        vote.member_id: vote
        for vote in db.query(models.GroupActivityVote)
        .filter(models.GroupActivityVote.group_id == group_id)
        .all()
    }
    if not group.members or any(
        votes.get(member.member_id) is None
        or votes[member.member_id].confirmation_status != "accepted"
        for member in group.members
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Tất cả thành viên cần đồng ý trước khi chia chi phí")

    payments = []
    for member in group.members:
        payment = member.payment
        if not payment:
            payment = models.GroupPayment(
                group_id=group_id,
                member_id=member.member_id,
                amount=0,
                status="unpaid",
                updated_at=_now(),
            )
            db.add(payment)
        payments.append(payment)

    current_total = sum(int(round(payment.amount or 0)) for payment in payments)
    if current_total != payload.total_amount:
        now = _now()
        base_amount, remainder = divmod(payload.total_amount, len(payments))
        for index, payment in enumerate(payments):
            payment.amount = base_amount + (1 if index < remainder else 0)
            payment.status = "unpaid"
            payment.paid_at = None
            payment.reminded_at = None
            payment.overdue_since = None
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
