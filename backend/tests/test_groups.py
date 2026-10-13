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
    create_group,
    group_recommendations,
    join_group,
    randomize_group_activity,
    respond_to_group_activity,
    set_member_ready,
    start_group_search,
    select_group_activity,
    update_payment,
    vote_group_activity,
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
            address="Cầu Giấy, Hà Nội",
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
            budget=200000,
            category_ids=[self.category.category_id],
        )

    def test_create_join_recommend_select_and_pay(self):
        group = asyncio.run(create_group(
            schemas.GroupCreateRequest(members=[self._member_input("Host")]),
            db=self.db,
            user=self.host,
        ))
        self.assertTrue(group.invite_code)
        self.assertTrue(group.members[0].is_host)
        self.assertEqual(group.members[0].user_id, self.host.user_id)

        joined = asyncio.run(join_group(
            group.invite_code,
            schemas.GroupJoinRequest(**self._member_input("Member").model_dump()),
            db=self.db,
            user=self.member,
        ))
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
        recommendations = asyncio.run(group_recommendations(
            group.group_id, db=self.db, user=self.host,
        ))
        self.assertEqual(recommendations[0].activity_id, self.activity.activity_id)
        self.assertGreater(recommendations[0].match_score, 0)

        selected_by_host = asyncio.run(vote_group_activity(
            group.group_id,
            started.members[0].member_id,
            schemas.GroupActivitySelect(activity_id=self.activity.activity_id),
            db=self.db,
            user=self.host,
        ))
        selected_by_member = asyncio.run(vote_group_activity(
            group.group_id,
            member_row.member_id,
            schemas.GroupActivitySelect(activity_id=self.activity.activity_id),
            db=self.db,
            user=self.member,
        ))
        selected = asyncio.run(select_group_activity(
            group.group_id,
            schemas.GroupActivitySelect(activity_id=self.activity.activity_id),
            db=self.db,
            user=self.host,
        ))
        self.assertEqual(selected_by_host.members[0].activity_vote_id, self.activity.activity_id)
        self.assertEqual(selected_by_member.members[1].activity_vote_id, self.activity.activity_id)
        self.assertEqual(selected.total_amount, 240000)
        self.assertTrue(all(item.payment.amount == 120000 for item in selected.members))

        with self.assertRaises(HTTPException) as confirmation_required:
            asyncio.run(update_payment(
                group.group_id,
                member_row.member_id,
                schemas.GroupPaymentAction(action="paid"),
                db=self.db,
                user=self.host,
            ))
        self.assertEqual(confirmation_required.exception.status_code, 409)

        selected = asyncio.run(respond_to_group_activity(
            group.group_id,
            member_row.member_id,
            schemas.GroupActivityConfirmation(action="accept"),
            db=self.db,
            user=self.member,
        ))
        self.assertTrue(selected.confirmation_complete)
        paid = asyncio.run(update_payment(
            group.group_id,
            selected.members[1].member_id,
            schemas.GroupPaymentAction(action="paid"),
            db=self.db,
            user=self.host,
        ))
        self.assertEqual(paid.paid_amount, 120000)
        with self.assertRaises(HTTPException) as denied:
            asyncio.run(update_payment(
                group.group_id,
                selected.members[0].member_id,
                schemas.GroupPaymentAction(action="paid"),
                db=self.db,
                user=self.member,
            ))
        self.assertEqual(denied.exception.status_code, 403)

    def test_host_randomizes_only_member_selected_activities(self):
        now = datetime.now(UTC).replace(tzinfo=None)
        business = self.db.query(models.BusinessProfile).first()
        other_activity = models.Activity(
            business_id=business.user_id,
            name="Lớp vẽ",
            description="Vẽ tranh cùng nhóm",
            price=150000,
            address="Cầu Giấy, Hà Nội",
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
        self.assertEqual(member_group.members[1].activity_vote_id, recommendations[1].activity_id)

        randomized = asyncio.run(randomize_group_activity(group.group_id, db=self.db, user=self.host))
        self.assertIn(randomized.selected_activity.activity_id, selected_ids)
        self.assertEqual(randomized.members[0].confirmation_status, "accepted")
        self.assertEqual(randomized.members[1].confirmation_status, "pending")
        left = asyncio.run(respond_to_group_activity(
            group.group_id,
            joined.members[1].member_id,
            schemas.GroupActivityConfirmation(action="reject"),
            db=self.db,
            user=self.member,
        ))
        self.assertEqual(len(left.members), 1)
        self.assertTrue(left.confirmation_complete)

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


if __name__ == "__main__":
    unittest.main()
