"""Chặn lỗi N+1: số truy vấn của các API công khai phải cố định, không tăng theo số hoạt động."""
import unittest
from datetime import UTC, datetime

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, schemas
from app.routers import activities, public_businesses, reviews, search
import seed_activities


class QueryCountTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        models.Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)
        seed_activities.SessionLocal = cls.Session
        seed_activities.main()
        db = cls.Session()
        role = models.Role(role_name="customer")
        db.add(role)
        db.flush()
        now = datetime.now(UTC).replace(tzinfo=None)
        db.add(models.Account(
            account_id="ACC-Q", email="q@test.local", recovery_email="q@test.local",
            auth_provider="email", email_verified=True, account_type="user", status="active", created_at=now,
        ))
        db.add(models.User(user_id="UQ", account_id="ACC-Q", role_id=role.role_id, name="Q"))
        cls.activity_ids = [a.activity_id for a in db.query(models.Activity).all()]
        for activity_id in cls.activity_ids[:10]:
            db.add(models.Review(user_id="UQ", activity_id=activity_id, rating=4, content="ok", created_at=now))
        db.commit()
        db.close()
        cls.statements = 0

        @event.listens_for(cls.engine, "before_cursor_execute")
        def _count(*_args):
            cls.statements += 1

    def measure(self, call):
        db = self.Session()
        type(self).statements = 0
        try:
            result = call(db)
            return result, type(self).statements
        finally:
            db.close()

    def test_public_activity_list_has_constant_query_count(self):
        result, count = self.measure(lambda db: activities.list_public_activities("active", db))
        self.assertGreaterEqual(len(result), 30)
        self.assertLessEqual(count, 6)
        rated = [item for item in result if item.review_count]
        self.assertEqual(len(rated), 10)
        self.assertTrue(all(item.avg_rating == 4.0 for item in rated))

    def test_public_business_list_has_constant_query_count(self):
        result, count = self.measure(public_businesses.list_public_businesses)
        self.assertGreaterEqual(len(result), 28)
        self.assertLessEqual(count, 5)
        self.assertEqual(sum(item.activity_count for item in result), 30)

    def test_activity_detail_and_reviews_are_flat(self):
        activity_id = self.activity_ids[0]
        _, detail_count = self.measure(lambda db: activities.get_activity(activity_id, 21.0, 105.85, db))
        self.assertLessEqual(detail_count, 6)
        listed, review_count = self.measure(lambda db: reviews.list_activity_reviews(activity_id, db))
        self.assertEqual(len(listed), 1)
        self.assertLessEqual(review_count, 5)

    def test_search_query_count_is_flat(self):
        def run(db):
            user = db.query(models.User).filter_by(user_id="UQ").one()
            return search.search_activities(
                schemas.SearchParams(latitude=20.9971704, longitude=105.8510251, radius=5, record_history=False),
                db=db, user=user,
            )
        result, count = self.measure(run)
        self.assertTrue(result)
        self.assertLessEqual(count, 7)


if __name__ == "__main__":
    unittest.main()
