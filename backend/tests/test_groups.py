import asyncio
import unittest
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, schemas
from app.routers.groups import (
    GroupConnectionManager,
    cancel_group_voting,
    choose_group_decision,
    create_group,
    delete_group,
    get_group,
    group_recommendations,
    join_group,
    leave_group,
    list_my_groups,
    open_group_voting,
    randomize_group_activity,
    reopen_group_voting,
    set_member_ready,
    start_group_search,
    vote_group_activity,
    close_group_voting,
)


class FakeWebSocket:
    def __init__(self, block=False):
        self.accepted = False
        self.messages = []
        self.block = block

    async def accept(self):
        self.accepted = True

    async def send_json(self, payload):
        if self.block:
            await asyncio.Event().wait()
        self.messages.append(payload)


class GroupFeatureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        models.Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        models.Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()

    def setUp(self):
        self.db = self.Session()
        now = datetime.now(UTC).replace(tzinfo=None)
        role = models.Role(role_name="customer")
        business_role = models.Role(role_name="business")
        self.db.add_all([role, business_role])
        self.db.flush()
        self.host = self._user("host", role.role_id, now)
        self.member = self._user("member", role.role_id, now)
        business = self._user("business", business_role.role_id, now)
        self.db.add(models.BusinessProfile(
            user_id=business.user_id,
            business_name="Business",
            business_address="Hà Nội",
        ))
        self.category = models.Category(name="Workshop")
        self.db.add(self.category)
        self.db.flush()
        self.activity = models.Activity(
            business_id=business.user_id,
            name="Workshop gốm",
            description="Làm gốm cùng nhóm",
            price=120000,
            price_text="120.000 ₫",
            address="Cầu Giấy, Hà Nội", latitude=21.03, longitude=105.79,
            status="active",
            created_at=now,
        )
        self.db.add(self.activity)
        self.db.flush()
        self.db.add(models.ActivityCategory(
            activity_id=self.activity.activity_id,
            category_id=self.category.category_id,
        ))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        models.Base.metadata.drop_all(self.engine)
        models.Base.metadata.create_all(self.engine)

    def _user(self, prefix, role_id, now):
        account = models.Account(
            email=f"{prefix}@test.local",
            recovery_email=f"{prefix}@test.local",
            auth_provider="email",
            account_type="user",
            status="active",
            created_at=now,
        )
        self.db.add(account)
        self.db.flush()
        user = models.User(
            account_id=account.account_id,
            role_id=role_id,
            name=prefix.title(),
        )
        self.db.add(user)
        self.db.flush()
        return user

    def _member_input(self, name):
        return schemas.GroupMemberInput(
            name=name,
            free_hours=2,
            address="Cầu Giấy",
            latitude=21.031,
            longitude=105.791,
            budget=200000,
            category_ids=[self.category.category_id],
        )

    def test_create_join_recommend_vote_is_optional_and_top_wins(self):
        group = asyncio.run(create_group(
            schemas.GroupCreateRequest(
                members=[self._member_input("Host")],
                group_name="Cuối tuần đi chơi",
            ),
            db=self.db,
            user=self.host,
        ))
        self.assertTrue(group.invite_code)
        self.assertEqual(group.group_name, "Cuối tuần đi chơi")
        self.assertTrue(group.members[0].is_host)
        self.assertEqual(group.members[0].user_id, self.host.user_id)

        joined = asyncio.run(join_group(
            group.invite_code,
            schemas.GroupJoinRequest(**self._member_input("Member").model_dump()),
            db=self.db,
            user=self.member,
        ))
        self.assertEqual(joined.group_name, "Cuối tuần đi chơi")
        self.assertEqual(len(joined.members), 2)

        host_member = joined.members[0]
        joined = asyncio.run(set_member_ready(
            group.group_id,
            host_member.member_id,
            schemas.GroupReadyRequest(is_ready=True),
            db=self.db,
            user=self.host,
        ))
        member_row = next(item for item in joined.members if item.user_id == self.member.user_id)
        joined = asyncio.run(set_member_ready(
            group.group_id,
            member_row.member_id,
            schemas.GroupReadyRequest(is_ready=True),
            db=self.db,
            user=self.member,
        ))
        started = asyncio.run(start_group_search(group.group_id, db=self.db, user=self.host))
        self.assertFalse(started.voting_open)
        recommendations = asyncio.run(group_recommendations(
            group.group_id, db=self.db, user=self.host,
        ))
        self.assertEqual(recommendations[0].activity_id, self.activity.activity_id)
        self.assertGreater(recommendations[0].match_score, 0)

        vote = lambda user, member_id: asyncio.run(vote_group_activity(
            group.group_id, member_id, schemas.GroupActivitySelect(activity_id=self.activity.activity_id),
            db=self.db, user=user,
        ))
        # Bình chọn là tùy chọn: chưa mở thì chưa vote được, chỉ host được mở.
        with self.assertRaises(HTTPException) as not_open:
            vote(self.host, started.members[0].member_id)
        self.assertEqual(not_open.exception.status_code, 409)
        with self.assertRaises(HTTPException) as only_host_opens:
            asyncio.run(open_group_voting(group.group_id, db=self.db, user=self.member))
        self.assertEqual(only_host_opens.exception.status_code, 403)
        self.assertTrue(asyncio.run(open_group_voting(group.group_id, db=self.db, user=self.host)).voting_open)

        selected_by_host = vote(self.host, started.members[0].member_id)
        selected_by_member = vote(self.member, member_row.member_id)
        with self.assertRaises(HTTPException) as only_host:
            asyncio.run(close_group_voting(group.group_id, db=self.db, user=self.member))
        self.assertEqual(only_host.exception.status_code, 403)
        # Một hoạt động có nhiều phiếu nhất -> đóng bình chọn là có kết quả (chúc mừng), không còn chốt/chia tiền.
        selected = asyncio.run(close_group_voting(group.group_id, db=self.db, user=self.host))
        self.assertEqual(selected_by_host.members[0].vote_activity_ids, [self.activity.activity_id])
        self.assertEqual(selected_by_member.members[1].vote_activity_ids, [self.activity.activity_id])
        self.assertTrue(selected.voting_closed)
        self.assertEqual(selected.final_method, "top_vote")
        self.assertEqual(selected.selected_activity.activity_id, self.activity.activity_id)
        self.assertEqual(selected.vote_tally[0].votes, 2)
        with self.assertRaises(HTTPException) as closed:
            vote(self.member, member_row.member_id)
        self.assertEqual(closed.exception.status_code, 409)
        with self.assertRaises(HTTPException) as no_cancel_after_result:
            asyncio.run(cancel_group_voting(group.group_id, db=self.db, user=self.host))
        self.assertEqual(no_cancel_after_result.exception.status_code, 409)

        # Thành viên tự rời nhóm, không cần host duyệt; host không rời được (chỉ xóa nhóm).
        with self.assertRaises(HTTPException) as host_cannot_leave:
            asyncio.run(leave_group(group.group_id, db=self.db, user=self.host))
        self.assertEqual(host_cannot_leave.exception.status_code, 409)
        self.assertEqual(asyncio.run(leave_group(group.group_id, db=self.db, user=self.member)).message, "Bạn đã rời nhóm")
        after = asyncio.run(get_group(group.group_id, db=self.db, user=self.host))
        self.assertEqual([item.user_id for item in after.members], [self.host.user_id])
        self.assertEqual(after.vote_tally[0].votes, 1)  # phiếu của người rời nhóm bị xóa

    def test_tie_decision_cards_revote_keeps_ballots_and_random_repeats(self):
        now = datetime.now(UTC).replace(tzinfo=None)
        business = self.db.query(models.BusinessProfile).first()
        other_activity = models.Activity(
            business_id=business.user_id,
            name="Lớp vẽ",
            description="Vẽ tranh cùng nhóm",
            price=150000,
            address="Cầu Giấy, Hà Nội", latitude=21.03, longitude=105.79,
            status="active",
            created_at=now,
        )
        self.db.add(other_activity)
        self.db.flush()
        self.db.add(models.ActivityCategory(
            activity_id=other_activity.activity_id,
            category_id=self.category.category_id,
        ))
        self.db.commit()

        group = asyncio.run(create_group(
            schemas.GroupCreateRequest(host=self._member_input("Host")),
            db=self.db,
            user=self.host,
        ))
        joined = asyncio.run(join_group(
            group.invite_code,
            schemas.GroupJoinRequest(**self._member_input("Member").model_dump()),
            db=self.db,
            user=self.member,
        ))
        for user, member in ((self.host, joined.members[0]), (self.member, joined.members[1])):
            asyncio.run(set_member_ready(
                group.group_id,
                member.member_id,
                schemas.GroupReadyRequest(is_ready=True),
                db=self.db,
                user=user,
            ))
        started = asyncio.run(start_group_search(group.group_id, db=self.db, user=self.host))
        asyncio.run(open_group_voting(group.group_id, db=self.db, user=self.host))
        recommendations = asyncio.run(group_recommendations(group.group_id, db=self.db, user=self.host))
        self.assertGreaterEqual(len(recommendations), 2)
        selected_ids = {recommendations[0].activity_id, recommendations[1].activity_id}
        asyncio.run(vote_group_activity(
            group.group_id, started.members[0].member_id,
            schemas.GroupActivitySelect(activity_id=recommendations[0].activity_id),
            db=self.db, user=self.host,
        ))
        member_group = asyncio.run(vote_group_activity(
            group.group_id, started.members[1].member_id,
            schemas.GroupActivitySelect(activity_id=recommendations[1].activity_id),
            db=self.db, user=self.member,
        ))
        self.assertEqual(member_group.members[1].vote_activity_ids, [recommendations[1].activity_id])
        with self.assertRaises(HTTPException):  # chưa đóng bình chọn thì chưa random
            asyncio.run(randomize_group_activity(group.group_id, db=self.db, user=self.host))

        closed = asyncio.run(close_group_voting(group.group_id, db=self.db, user=self.host))
        self.assertIsNone(closed.selected_activity)
        self.assertEqual(set(closed.tied_activity_ids), selected_ids)

        # Thẻ "Vote tiếp"/"Random": thành viên chọn để gợi ý (đổi/bỏ được), host bấm thẻ là thực hiện.
        decide = lambda choice: asyncio.run(choose_group_decision(
            group.group_id, started.members[1].member_id, schemas.GroupDecisionRequest(choice=choice),
            db=self.db, user=self.member,
        ))
        self.assertEqual(decide("random").members[1].decision_choice, "random")
        self.assertEqual(decide("revote").members[1].decision_choice, "revote")
        with self.assertRaises(HTTPException) as host_executes:
            asyncio.run(choose_group_decision(
                group.group_id, started.members[0].member_id, schemas.GroupDecisionRequest(choice="random"),
                db=self.db, user=self.host,
            ))
        self.assertEqual(host_executes.exception.status_code, 409)

        # Vote lại: mở lại cả danh sách, giữ phiếu cũ, xóa lựa chọn thẻ.
        with self.assertRaises(HTTPException) as only_host_reopens:
            asyncio.run(reopen_group_voting(group.group_id, db=self.db, user=self.member))
        self.assertEqual(only_host_reopens.exception.status_code, 403)
        reopened = asyncio.run(reopen_group_voting(group.group_id, db=self.db, user=self.host))
        self.assertFalse(reopened.voting_closed)
        self.assertEqual(reopened.members[1].vote_activity_ids, [recommendations[1].activity_id])
        self.assertIsNone(reopened.members[1].decision_choice)
        self.assertEqual(reopened.tied_activity_ids, [])

        closed = asyncio.run(close_group_voting(group.group_id, db=self.db, user=self.host))
        self.assertEqual(set(closed.tied_activity_ids), selected_ids)
        with self.assertRaises(HTTPException) as only_host:
            asyncio.run(randomize_group_activity(group.group_id, db=self.db, user=self.member))
        self.assertEqual(only_host.exception.status_code, 403)

        decide("random")
        first = asyncio.run(randomize_group_activity(group.group_id, db=self.db, user=self.host))
        self.assertIsNone(first.members[1].decision_choice)  # sang bước mới thì lựa chọn thẻ được xóa
        again = asyncio.run(randomize_group_activity(group.group_id, db=self.db, user=self.host))
        self.assertIn(again.random_pick.activity_id, selected_ids)
        self.assertEqual(again.random_seq, first.random_seq + 1)
        self.assertIsNone(again.selected_activity)  # random chỉ là gợi ý, không chốt
        self.assertEqual(decide("revote").members[1].decision_choice, "revote")  # sau random vẫn chọn thẻ được

        reopened = asyncio.run(reopen_group_voting(group.group_id, db=self.db, user=self.host))
        self.assertIsNone(reopened.random_pick)
        # Tắt bình chọn: xóa hết phiếu, quay về chỉ xem gợi ý.
        cancelled = asyncio.run(cancel_group_voting(group.group_id, db=self.db, user=self.host))
        self.assertFalse(cancelled.voting_open)
        self.assertEqual(cancelled.vote_tally, [])
        self.assertTrue(all(not item.vote_activity_ids for item in cancelled.members))

    def test_multi_vote_toggle_and_unique_top_wins(self):
        now = datetime.now(UTC).replace(tzinfo=None)
        business = self.db.query(models.BusinessProfile).first()
        other = models.Activity(business_id=business.user_id, name="Lớp vẽ", price=150000,
                                address="Cầu Giấy, Hà Nội", latitude=21.03, longitude=105.79, status="active", created_at=now)
        self.db.add(other)
        self.db.flush()
        self.db.add(models.ActivityCategory(activity_id=other.activity_id, category_id=self.category.category_id))
        self.db.commit()
        group = asyncio.run(create_group(schemas.GroupCreateRequest(host=self._member_input("Host")), db=self.db, user=self.host))
        joined = asyncio.run(join_group(group.invite_code, schemas.GroupJoinRequest(**self._member_input("Member").model_dump()),
                                        db=self.db, user=self.member))
        for user, member in ((self.host, joined.members[0]), (self.member, joined.members[1])):
            asyncio.run(set_member_ready(group.group_id, member.member_id, schemas.GroupReadyRequest(is_ready=True), db=self.db, user=user))
        started = asyncio.run(start_group_search(group.group_id, db=self.db, user=self.host))
        asyncio.run(open_group_voting(group.group_id, db=self.db, user=self.host))
        vote = lambda user, member, activity_id: asyncio.run(vote_group_activity(
            group.group_id, member.member_id, schemas.GroupActivitySelect(activity_id=activity_id), db=self.db, user=user))
        vote(self.host, started.members[0], self.activity.activity_id)
        vote(self.host, started.members[0], other.activity_id)       # host chọn cả 2
        toggled = vote(self.host, started.members[0], other.activity_id)  # bấm lại = bỏ chọn
        self.assertEqual(toggled.members[0].vote_activity_ids, [self.activity.activity_id])
        vote(self.host, started.members[0], other.activity_id)
        vote(self.member, started.members[1], self.activity.activity_id)
        closed = asyncio.run(close_group_voting(group.group_id, db=self.db, user=self.host))
        self.assertEqual(closed.selected_activity.activity_id, self.activity.activity_id)  # 2 phiếu > 1 phiếu
        self.assertEqual([row.votes for row in closed.vote_tally], [2, 1])
        self.assertEqual(closed.tied_activity_ids, [])

    def test_host_can_delete_group_and_deleted_group_is_hidden(self):
        group = asyncio.run(create_group(
            schemas.GroupCreateRequest(
                host=self._member_input("Host"),
                group_name="Nhóm cần xóa",
            ),
            db=self.db,
            user=self.host,
        ))

        result = asyncio.run(delete_group(group.group_id, db=self.db, user=self.host))

        self.assertEqual(result.message, "Đã xóa nhóm")
        self.assertEqual(
            self.db.query(models.Group).filter_by(group_id=group.group_id).one().status,
            "deleted",
        )
        self.assertEqual(asyncio.run(list_my_groups(db=self.db, user=self.host)), [])
        with self.assertRaises(HTTPException) as deleted:
            asyncio.run(get_group(group.group_id, db=self.db, user=self.host))
        self.assertEqual(deleted.exception.status_code, 404)

    def test_same_user_two_tabs_stay_online_until_last_tab_closes(self):
        async def scenario():
            manager = GroupConnectionManager()
            first = FakeWebSocket()
            second = FakeWebSocket()
            await manager.connect("group", "user", first)
            await manager.connect("group", "user", second)
            self.assertEqual(await manager.online_users("group"), {"user"})
            await manager.disconnect("group", "user", first)
            self.assertEqual(await manager.online_users("group"), {"user"})
            await manager.broadcast_presence("group")
            self.assertEqual(second.messages[-1]["online_user_ids"], ["user"])
            await manager.disconnect("group", "user", second)
            self.assertEqual(await manager.online_users("group"), set())
        asyncio.run(scenario())

    def test_blocked_socket_cannot_hang_broadcast(self):
        async def scenario():
            manager = GroupConnectionManager()
            blocked = FakeWebSocket(block=True)
            await manager.connect("group", "user", blocked)
            await asyncio.wait_for(manager.broadcast_presence("group"), timeout=2)
            self.assertEqual(await manager.online_users("group"), set())
        asyncio.run(scenario())


    def test_recommendations_use_midpoint_min_budget_and_any_member_tag(self):
        from unittest.mock import patch
        business = self.db.query(models.BusinessProfile).first()
        other_tag = models.Category(name="Cà phê")
        self.db.add(other_tag)
        self.db.flush()
        now = datetime.now(UTC).replace(tzinfo=None)

        def add(name, lat, lon, price, tag):
            activity = models.Activity(business_id=business.user_id, name=name, price=price, address="Hà Nội",
                                       latitude=lat, longitude=lon, status="active", created_at=now)
            self.db.add(activity)
            self.db.flush()
            self.db.add(models.ActivityCategory(activity_id=activity.activity_id, category_id=tag.category_id))
            return activity.activity_id

        middle = add("Cà phê giữa", 21.0, 105.85, 50000, other_tag)          # chỉ Member thích, ngay điểm giữa
        expensive = add("Cà phê đắt", 21.0, 105.85, 150000, other_tag)       # vượt ngân sách thấp nhất (100k)
        host_side = add("Gốm gần Host", 21.0, 105.75, 80000, self.category)  # cách điểm giữa ~10 km
        host = schemas.GroupMemberInput(name="Host", free_hours=2, address="A", latitude=21.0, longitude=105.75,
                                        budget=300000, category_ids=[self.category.category_id])
        group = asyncio.run(create_group(schemas.GroupCreateRequest(host=host), db=self.db, user=self.host))
        member = schemas.GroupJoinRequest(name="Member", free_hours=3, address="B", latitude=21.0, longitude=105.95,
                                          budget=100000, category_ids=[other_tag.category_id])
        asyncio.run(join_group(group.invite_code, member, db=self.db, user=self.member))
        self.db.query(models.Group).filter_by(group_id=group.group_id).update({"search_started": True})
        self.db.commit()

        with patch("app.routers.groups.resolve_location", side_effect=AssertionError("không được tra lại")):
            rows = asyncio.run(group_recommendations(group.group_id, db=self.db, user=self.host))
        ids = [row.activity_id for row in rows]
        self.assertEqual(middle, ids[0])                  # gần điểm giữa nhất
        self.assertIn(host_side, ids)                     # khớp tag của 1 người là đủ (radius tự nới lên 10/20 km)
        self.assertNotIn(expensive, ids)                  # ngân sách lấy người thấp nhất
        self.assertNotIn(self.activity.activity_id, ids)  # 120k > 100k

    def test_open_long_enough_handles_overnight(self):
        from app.routers.groups import _open_long_enough
        activity = models.Activity(time_open=datetime(2000, 1, 1, 19), time_close=datetime(2000, 1, 1, 2))
        self.assertTrue(_open_long_enough(activity, 20 * 60, 120))       # 20h, rảnh 2h -> tới 22h
        self.assertTrue(_open_long_enough(activity, 60, 60))             # 1h sáng còn mở tới 2h
        self.assertFalse(_open_long_enough(activity, 60, 120))           # không đủ 2h
        self.assertFalse(_open_long_enough(activity, 15 * 60, 60))       # chưa mở cửa


if __name__ == "__main__":
    unittest.main()
