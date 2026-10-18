import unittest
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, schemas
from app.auth import verify_password
from app.routers.activities import get_activity, get_activity_summary
from app.routers.operator_users import (
    get_business_summary,
    get_customer_summary,
    get_dashboard,
)
from app.routers.search import search_activities
from app.routers.users import update_my_categories, update_my_profile
from app.utils.google_maps import coordinates_from_google_maps_url
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
            recovery_email="customer@test.local",
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

    def test_activity_has_multiple_tags_and_matches_each_tag(self):
        activity = self.db.query(models.Activity).filter_by(activity_id="A003").one()
        self.assertEqual(
            {item.category.name for item in activity.categories},
            {"Giải trí", "Ca hát"},
        )
        for tag_name in ("Giải trí", "Ca hát"):
            category = self.db.query(models.Category).filter_by(name=tag_name).one()
            results = search_activities(
                schemas.SearchParams(
                    latitude=20.99796,
                    longitude=105.84987,
                    radius=2,
                    category_ids=[category.category_id],
                    record_history=False,
                ),
                db=self.db,
                user=self.customer,
            )
            self.assertIn("A003", {item.activity_id for item in results})

    def test_seed_sets_tags_and_maps_links(self):
        activity = self.db.query(models.Activity).filter_by(activity_id="A023").one()
        self.assertEqual(
            {item.category.name for item in activity.categories},
            {"Cà phê", "Ăn uống", "Làm việc", "Thư giãn"},
        )
        self.assertEqual(activity.google_maps_url, seed_activities.GOOGLE_MAP_URLS["A023"])

    def test_seeded_businesses_cannot_log_in_and_rerun_keeps_passwords(self):
        from fastapi import HTTPException as _HTTPException
        from fastapi.security import OAuth2PasswordRequestForm
        from app.auth import hash_password
        from app.routers.auth import login

        accounts = self.db.query(models.Account).filter(models.Account.account_id.like("ACC-B%")).all()
        self.assertEqual(len(accounts), 28)
        self.assertTrue(all(account.password_hash is None for account in accounts))
        business = self.db.query(models.User).filter_by(user_id="B001").one()
        for identifier in (business.account.phone, business.account.email):
            with self.assertRaises(_HTTPException) as raised:
                login(OAuth2PasswordRequestForm(username=identifier, password="Doanhnghiep123"), db=self.db)
            self.assertEqual(raised.exception.status_code, 401)

        # Chủ doanh nghiệp được cấp mật khẩu riêng sau này: chạy lại seed không được đụng tới.
        business.account.password_hash = own = hash_password("mat-khau-rieng")
        self.db.commit()
        seed_activities.main()
        self.db.expire_all()
        self.assertEqual(self.db.query(models.User).filter_by(user_id="B001").one().account.password_hash, own)

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
                latitude=20.9971704,
                longitude=105.8510251,
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

    def test_google_maps_url_coordinates_are_extracted(self):
        coordinates = coordinates_from_google_maps_url(
            "https://www.google.com/maps/place/Free2Do/@21.03125,105.85111,17z"
        )
        self.assertEqual(coordinates, (21.03125, 105.85111))

    def test_google_maps_page_coordinates_are_extracted(self):
        from app.utils.google_maps import _extract_page_coordinates

        coordinates = _extract_page_coordinates(
            "preview?pb=!1m3!1d14899!2d105.8407837!3d20.9967994!2m3"
        )
        self.assertEqual(coordinates, (20.9967994, 105.8407837))

    def test_customer_can_update_profile_and_preferences(self):
        response = update_my_profile(
            schemas.UserProfileUpdate(name="Customer Updated", phone="0901234567"),
            db=self.db,
            user=self.customer,
        )
        self.assertEqual(response.name, "Customer Updated")
        self.assertEqual(response.phone, "0901234567")
        category = self.db.query(models.Category).first()
        result = update_my_categories(
            schemas.UserCategoriesUpdate(category_ids=[category.category_id, category.category_id]),
            db=self.db,
            user=self.customer,
        )
        self.assertEqual([item.category_id for item in result], [category.category_id])

    def test_customer_preferences_reject_unknown_category(self):
        with self.assertRaises(HTTPException) as context:
            update_my_categories(
                schemas.UserCategoriesUpdate(category_ids=["missing-category"]),
                db=self.db,
                user=self.customer,
            )
        self.assertEqual(context.exception.status_code, 422)

if __name__ == "__main__":
    unittest.main()
