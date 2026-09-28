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
    select_group_activity,
    update_payment,
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

        recommendations = asyncio.run(group_recommendations(
            group.group_id, db=self.db, user=self.host,
        ))
        self.assertEqual(recommendations[0].activity_id, self.activity.activity_id)
        self.assertGreater(recommendations[0].match_score, 0)

        selected = asyncio.run(select_group_activity(
            group.group_id,
            schemas.GroupActivitySelect(activity_id=self.activity.activity_id),
            db=self.db,
            user=self.host,
        ))
        self.assertEqual(selected.total_amount, 240000)
        self.assertTrue(all(item.payment.amount == 120000 for item in selected.members))

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
