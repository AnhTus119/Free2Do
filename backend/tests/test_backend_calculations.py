import unittest
from datetime import UTC, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, schemas
from app.routers.activities import get_activity, get_activity_summary
from app.routers.operator_users import (
    get_business_summary,
    get_customer_summary,
    get_dashboard,
)
from app.routers.search import search_activities
import seed_activities


class BackendCalculationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        models.Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)
        seed_activities.SessionLocal = cls.Session
        seed_activities.main()

        db = cls.Session()
        customer_role = models.Role(role_name="customer")
        db.add(customer_role)
        db.flush()
        account = models.Account(
            account_id="ACC-C001",
            email="customer@test.local",
            auth_provider="email",
            email_verified=True,
            account_type="user",
            status="active",
            created_at=datetime.now(UTC).replace(tzinfo=None),
        )
        db.add(account)
        cls.customer = models.User(
            user_id="C001",
            account_id=account.account_id,
            role_id=customer_role.role_id,
            name="Customer Test",
        )
        db.add(cls.customer)
        db.commit()
        db.close()

    @classmethod
    def tearDownClass(cls):
        models.Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()

    def setUp(self):
        self.db = self.Session()
        self.customer = self.db.query(models.User).filter_by(user_id="C001").one()

    def tearDown(self):
        self.db.close()

    def test_seed_imports_all_workbook_rows_idempotently(self):
        self.assertEqual(self.db.query(models.Activity).count(), 30)
        self.assertEqual(self.db.query(models.BusinessProfile).count(), 28)
        seed_activities.SessionLocal = self.Session
        seed_activities.main()
        self.assertEqual(self.db.query(models.Activity).count(), 30)
        self.assertEqual(
            self.db.query(models.Activity).filter(models.Activity.google_maps_url.is_not(None)).count(),
            30,
        )
        activity = self.db.query(models.Activity).filter_by(activity_id="A001").one()
        self.assertEqual(activity.google_maps_url, seed_activities.GOOGLE_MAP_URLS["A001"])
        response = get_activity("A001", db=self.db)
        self.assertEqual(response.google_maps_url, seed_activities.GOOGLE_MAP_URLS["A001"])

    def test_operator_summaries_are_calculated_by_backend(self):
        dashboard = get_dashboard(db=self.db, _operator=None)
        customer_summary = get_customer_summary(db=self.db, _operator=None)
        business_summary = get_business_summary(db=self.db, _operator=None)
        activity_summary = get_activity_summary(db=self.db, _operator=None)

        self.assertEqual(dashboard.customer_count, 1)
        self.assertEqual(dashboard.business_count, 28)
        self.assertEqual(dashboard.activity_count, 30)
        self.assertEqual(customer_summary.total_count, 1)
        self.assertEqual(business_summary.active_count, 28)
        self.assertEqual(activity_summary.active_count, 30)

    def test_search_filters_and_scores_in_backend(self):
        results = search_activities(
            schemas.SearchParams(
                keyword="Whimsical",
                latitude=20.99614,
                longitude=105.85003,
                radius=2,
                budget=250000,
                free_time=60,
            ),
            db=self.db,
            user=self.customer,
        )
        self.assertEqual(results[0].activity_id, "A001")
        self.assertEqual(results[0].distance_km, 0)
        self.assertGreater(results[0].match_score, 0)
        self.assertEqual(self.db.query(models.SearchHistory).filter_by(user_id="C001").count(), 1)


if __name__ == "__main__":
    unittest.main()
