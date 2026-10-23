import asyncio
import json
import random
import secrets
from collections import defaultdict
from datetime import UTC, datetime
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import decode_token, get_current_user
from app.database import SessionLocal, get_db
from app.utils.distance import haversine_km
from app.utils.geocoding import resolve_location


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


def _resolve_member_location(address: str, latitude: Optional[float], longitude: Optional[float]) -> tuple[float, float]:
    """Tọa độ thành viên: GPS/điểm frontend đã tra, không có thì tra địa chỉ trên bản đồ (không đoán)."""
    if latitude is not None and longitude is not None:
        return latitude, longitude
    try:
        result = resolve_location(address)
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Không thể kết nối dịch vụ bản đồ để tra địa chỉ") from exc
    if not result:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Không tìm thấy địa chỉ “{address}” trên bản đồ. Hãy nhập rõ hơn (phường, quận) hoặc dùng vị trí hiện tại.",
        )
    return result[0], result[1]


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
    tally = _ballots_by_activity(db, group.group_id)
    in_tie = _in_tie_decision(group, tally)
    member_votes: dict[str, list[str]] = defaultdict(list)
    for activity_id, voter_ids in tally.items():
        for voter_id in voter_ids:
            member_votes[voter_id].append(activity_id)
    members = []
    for member in sorted(group.members, key=lambda item: (not item.is_host, item.joined_at)):
        category_ids = _category_ids(member)
        members.append(
            schemas.GroupMemberOut(
                member_id=member.member_id,
                user_id=member.user_id,
                name=member.name,
                free_hours=member.free_hours,
                address=member.address,
                latitude=member.latitude,
                longitude=member.longitude,
                budget=member.budget,
                category_ids=category_ids,
                category_names=[category_map[value] for value in category_ids if value in category_map],
                is_host=member.is_host,
                is_ready=member.is_ready,
                vote_activity_ids=member_votes.get(member.member_id, []),
                decision_choice=member.decision_choice if in_tie else None,
                is_online=bool(member.user_id and member.user_id in online_user_ids),
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
        selected_activity=_activity_out(db, group.selected_activity),
        voting_open=bool(group.voting_open),
        voting_closed=group.voting_closed_at is not None,
        vote_tally=_tally_out(db, tally),
        tied_activity_ids=_top_activity_ids(tally) if in_tie else [],
        random_pick=(
            _activity_out(db, db.get(models.Activity, group.random_pick_activity_id))
            if group.random_pick_activity_id and not group.selected_activity_id
            else None
        ),
        random_seq=group.random_seq or 0,
        final_method=group.final_method,
        members=members,
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


def _in_tie_decision(group: models.Group, tally: dict[str, list[str]]) -> bool:
    """Đã đóng bình chọn, chưa có hoạt động thắng và nhiều hoạt động cùng phiếu cao nhất."""
    return bool(group.voting_closed_at) and not group.selected_activity_id and len(_top_activity_ids(tally)) > 1


def _reset_voting(db: Session, group: models.Group) -> None:
    """Về trạng thái chưa bình chọn: xóa phiếu, kết quả, gợi ý random và thẻ thành viên đang chọn."""
    group.voting_open = False
    group.voting_closed_at = None
    group.selected_activity_id = None
    group.random_pick_activity_id = None
    group.final_method = None
    db.query(models.GroupActivityBallot).filter(
        models.GroupActivityBallot.group_id == group.group_id
    ).delete(synchronize_session=False)
    _clear_decisions(group)


def _clear_decisions(group: models.Group) -> None:
    for member in group.members:
        member.decision_choice = None


async def _respond(db: Session, group: models.Group, user_id: str) -> schemas.GroupOut:
    """Lưu, báo realtime cho cả nhóm và trả trạng thái nhóm mới."""
    group.updated_at = _now()
    db.commit()
    db.refresh(group)
    await _changed(group.group_id)
    return _group_out(db, group, user_id, await group_connections.online_users(group.group_id))


def _require_host(group: models.Group, user: models.User, message: str) -> None:
    if group.host_user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, message)


def _require_tie_decision(db: Session, group: models.Group) -> list[str]:
    """Các hoạt động đang hòa phiếu cao nhất; lỗi 409 nếu nhóm không ở bước chọn Vote lại/Random."""
    tally = _ballots_by_activity(db, group.group_id)
    if not _in_tie_decision(group, tally):
        raise HTTPException(status.HTTP_409_CONFLICT, "Nhóm không có hoạt động nào đang hòa phiếu")
    return _top_activity_ids(tally)


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
    host_lat, host_lon = _resolve_member_location(payload.host.address, payload.host.latitude, payload.host.longitude)
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
        latitude=host_lat,
        longitude=host_lon,
        budget=item.budget,
        category_ids_json=json.dumps(item.category_ids),
        is_host=True,
        is_ready=False,
        joined_at=now,
        updated_at=now,
    )
    db.add(member)
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
    member_lat, member_lon = _resolve_member_location(payload.address, payload.latitude, payload.longitude)
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
    member.name = payload.name
    member.free_hours = payload.free_hours
    member.address = payload.address
    member.latitude, member.longitude = member_lat, member_lon
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
    latitude, longitude = data.pop("latitude", None), data.pop("longitude", None)
    if "address" in data or latitude is not None:
        member.latitude, member.longitude = _resolve_member_location(data.get("address", member.address), latitude, longitude)
    for field, value in data.items():
        setattr(member, field, value)
    member.is_ready = False
    group.search_started = False
    _reset_voting(db, group)
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
    _reset_voting(db, group)
    group.updated_at = _now()
    db.commit()
    db.refresh(group)
    await _changed(group_id)
    return _group_out(db, group, user.user_id, await group_connections.online_users(group_id))


@router.post("/{group_id}/leave", response_model=schemas.MessageResponse)
async def leave_group(
    group_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Thành viên tự rời nhóm bất cứ lúc nào, không cần host duyệt (host chỉ có thể xóa nhóm)."""
    group, member = _require_group_member(db, group_id, user.user_id)
    if member.is_host:
        raise HTTPException(status.HTTP_409_CONFLICT, "Host không thể rời nhóm, chỉ có thể xóa nhóm")
    db.query(models.GroupActivityBallot).filter(
        models.GroupActivityBallot.member_id == member.member_id
    ).delete(synchronize_session=False)
    db.delete(member)
    group.updated_at = _now()
    db.commit()
    await _changed(group_id)
    return schemas.MessageResponse(message="Bạn đã rời nhóm")


_GROUP_RADII_KM = (5.0, 10.0, 20.0)   # bắt đầu 5 km quanh điểm giữa, ít kết quả thì nới dần
_MIN_GROUP_RESULTS = 3
_VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def _open_long_enough(activity: models.Activity, now_minutes: int, need_minutes: int) -> bool:
    """Đang mở cửa lúc tìm và còn mở ít nhất need_minutes (hỗ trợ khung giờ qua đêm)."""
    if not activity.time_open or not activity.time_close:
        return True  # không khai giờ = mở cả ngày
    start = activity.time_open.hour * 60 + activity.time_open.minute
    end = activity.time_close.hour * 60 + activity.time_close.minute
    if end <= start:
        end += 24 * 60
    return any(start <= current and current + need_minutes <= end for current in (now_minutes, now_minutes + 24 * 60))


@router.get("/{group_id}/recommendations", response_model=list[schemas.GroupRecommendationOut])
async def group_recommendations(
    group_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Tìm quanh điểm giữa (trung bình tọa độ) của mọi thành viên.
    Ngân sách = người thấp nhất, thời gian rảnh = người ít nhất, tag = gộp của cả nhóm (càng nhiều người khớp càng cao)."""
    group, _ = _require_group_member(db, group_id, user.user_id)
    if not group.search_started:
        raise HTTPException(status.HTTP_409_CONFLICT, "Host cần bắt đầu tìm hoạt động sau khi mọi người sẵn sàng")
    members = list(group.members)
    missing = [member for member in members if member.latitude is None or member.longitude is None]
    for member in missing:  # nhóm tạo trước khi lưu tọa độ: tra địa chỉ 1 lần rồi lưu lại
        try:
            member.latitude, member.longitude = _resolve_member_location(member.address, None, None)
        except HTTPException as exc:
            raise HTTPException(
                status.HTTP_409_CONFLICT, f"Chưa xác định được vị trí của {member.name}. Thành viên này cần cập nhật địa chỉ.",
            ) from exc
    if missing:
        db.commit()
    center_lat = sum(member.latitude for member in members) / len(members)
    center_lon = sum(member.longitude for member in members) / len(members)
    min_budget = min(member.budget for member in members)
    need_minutes = round(min(member.free_hours for member in members) * 60)
    now_vn = datetime.now(_VN_TZ)
    now_minutes = now_vn.hour * 60 + now_vn.minute
    member_tags = {member.member_id: set(_category_ids(member)) for member in members}
    group_tags = set().union(*member_tags.values())

    activities = (
        db.query(models.Activity)
        .filter(
            models.Activity.status == "active",
            models.Activity.latitude.is_not(None),
            models.Activity.longitude.is_not(None),
            or_(models.Activity.price.is_(None), models.Activity.price <= min_budget),
            or_(
                models.Activity.always_available.is_(True),
                and_(
                    or_(models.Activity.available_from.is_(None), func.date(models.Activity.available_from) <= now_vn.date()),
                    or_(models.Activity.available_until.is_(None), func.date(models.Activity.available_until) >= now_vn.date()),
                ),
            ),
        )
        .all()
    )
    candidates = []
    for activity in activities:
        if not _open_long_enough(activity, now_minutes, need_minutes):
            continue
        tags = {item.category_id for item in activity.categories}
        matched = {member_id for member_id, wanted in member_tags.items() if wanted & tags}
        if group_tags and not matched:
            continue
        distance = haversine_km(center_lat, center_lon, activity.latitude, activity.longitude)
        candidates.append((activity, distance, matched))

    radius, chosen = _GROUP_RADII_KM[-1], []
    for radius in _GROUP_RADII_KM:
        chosen = [item for item in candidates if item[1] <= radius]
        if len(chosen) >= _MIN_GROUP_RESULTS:
            break

    results = []
    for activity, distance, matched in chosen:
        member_scores: dict[str, int] = {}
        for member in members:
            interest = 50 if member.member_id in matched else 0
            member_distance = haversine_km(member.latitude, member.longitude, activity.latitude, activity.longitude)
            proximity = 30 * max(0.0, 1 - member_distance / (radius * 2))
            price = float(activity.price or 0)
            budget = 20 * (1 - price / member.budget) if member.budget > 0 else (20 if price == 0 else 0)
            member_scores[member.member_id] = round(interest + proximity + max(0.0, budget))
        base = _activity_out(db, activity)
        results.append(schemas.GroupRecommendationOut(
            **base.model_dump(),
            match_score=round(sum(member_scores.values()) / len(member_scores)),
            member_scores=member_scores,
            distance_km=round(distance, 2),
        ))
    return sorted(results, key=lambda item: (-item.match_score, item.distance_km))[:11]


@router.post("/{group_id}/voting/open", response_model=schemas.GroupOut)
async def open_group_voting(
    group_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Host bật bình chọn (mặc định nhóm chỉ xem danh sách gợi ý, chưa vote)."""
    group, _ = _require_group_member(db, group_id, user.user_id)
    _require_host(group, user, "Chỉ host được mở bình chọn")
    if not group.search_started or group.voting_open:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nhóm hiện không thể mở bình chọn")
    group.voting_open = True
    return await _respond(db, group, user.user_id)


@router.post("/{group_id}/voting/cancel", response_model=schemas.GroupOut)
async def cancel_group_voting(
    group_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Host tắt bình chọn, quay về chỉ xem gợi ý. Toàn bộ phiếu bị xóa."""
    group, _ = _require_group_member(db, group_id, user.user_id)
    _require_host(group, user, "Chỉ host được tắt bình chọn")
    if not group.voting_open or group.selected_activity_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nhóm hiện không thể tắt bình chọn")
    _reset_voting(db, group)
    return await _respond(db, group, user.user_id)


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
    if not group.search_started or not group.voting_open or group.selected_activity_id or group.voting_closed_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bình chọn chưa mở hoặc đã đóng")
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
    return await _respond(db, group, user.user_id)


@router.post("/{group_id}/voting/close", response_model=schemas.GroupOut)
async def close_group_voting(
    group_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Host đóng bình chọn. Một hoạt động nhiều phiếu nhất -> chúc mừng cả nhóm; hòa -> chọn Vote lại/Random."""
    group, _ = _require_group_member(db, group_id, user.user_id)
    _require_host(group, user, "Chỉ host được đóng bình chọn")
    if not group.search_started or not group.voting_open or group.selected_activity_id or group.voting_closed_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nhóm hiện không thể đóng bình chọn")
    top = _top_activity_ids(_ballots_by_activity(db, group_id))
    if not top:
        raise HTTPException(status.HTTP_409_CONFLICT, "Chưa có ai bình chọn hoạt động nào")
    group.voting_closed_at = _now()
    _clear_decisions(group)
    if len(top) == 1:
        activity = (
            db.query(models.Activity)
            .filter(models.Activity.activity_id == top[0], models.Activity.status == "active")
            .first()
        )
        if not activity:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")
        group.selected_activity_id = activity.activity_id
        group.random_pick_activity_id = None
        group.final_method = "top_vote"
    return await _respond(db, group, user.user_id)


@router.post("/{group_id}/voting/reopen", response_model=schemas.GroupOut)
async def reopen_group_voting(
    group_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Host chọn "Vote tiếp/Vote lại" khi hòa: mở lại bình chọn toàn danh sách, giữ phiếu cũ (được đổi)."""
    group, _ = _require_group_member(db, group_id, user.user_id)
    _require_host(group, user, "Chỉ host được mở lại bình chọn")
    _require_tie_decision(db, group)
    group.voting_closed_at = None
    group.random_pick_activity_id = None
    _clear_decisions(group)
    return await _respond(db, group, user.user_id)


@router.post("/{group_id}/randomize", response_model=schemas.GroupOut)
async def randomize_group_activity(
    group_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Host random một hoạt động trong nhóm hòa phiếu cao nhất ("Random tiếp" = gọi lại)."""
    group, _ = _require_group_member(db, group_id, user.user_id)
    _require_host(group, user, "Chỉ host được random hoạt động")
    tied = _require_tie_decision(db, group)
    group.random_pick_activity_id = random.choice(tied)
    group.random_seq = (group.random_seq or 0) + 1
    _clear_decisions(group)
    return await _respond(db, group, user.user_id)


@router.patch("/{group_id}/members/{member_id}/decision", response_model=schemas.GroupOut)
async def choose_group_decision(
    group_id: str,
    member_id: str,
    payload: schemas.GroupDecisionRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Thành viên chọn thẻ Vote lại/Random khi hòa để gợi ý cho host (host bấm thẻ mới thực hiện)."""
    group, _ = _require_group_member(db, group_id, user.user_id)
    member = next((item for item in group.members if item.member_id == member_id), None)
    if not member or member.user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Mỗi thành viên chỉ được tự chọn")
    if member.is_host:
        raise HTTPException(status.HTTP_409_CONFLICT, "Host bấm thẻ để thực hiện luôn")
    _require_tie_decision(db, group)
    member.decision_choice = payload.choice
    return await _respond(db, group, user.user_id)


@router.websocket("/{group_id}/ws")
async def group_websocket(websocket: WebSocket, group_id: str, token: str):
    account_id = decode_token(token, expected_type="access")
    db = SessionLocal()
    user_id: Optional[str] = None
    try:
        account = (
            db.query(models.Account)
            .filter(
                models.Account.account_id == account_id,
                models.Account.status == "active",
                models.Account.must_change_password.isnot(True),
            )
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
