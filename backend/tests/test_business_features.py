import unittest
from datetime import UTC, datetime
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, schemas
from app.routers.businesses import (
    create_review_reply,
    get_business_analytics,
    get_business_dashboard,
    update_business_profile,
)
from app.routers.complaints import create_complaint
from app.services.cloudinary_storage import InvalidMedia, upload_asset, validate_upload


class BusinessFeatureTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        models.Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        now = datetime.now(UTC).replace(tzinfo=None)
        business_role = models.Role(role_id="RB", role_name="business")
        customer_role = models.Role(role_id="RC", role_name="customer")
        self.db.add_all([business_role, customer_role])
        self.db.add_all(
            [
                models.Account(
                    account_id="AB",
                    email="business@test.local",
                    account_type="user",
                    status="active",
                    auth_provider="email",
                    email_verified=True,
                    created_at=now,
                ),
                models.Account(
                    account_id="AC",
                    email="customer@test.local",
                    account_type="user",
                    status="active",
                    auth_provider="email",
                    email_verified=True,
                    created_at=now,
                ),
            ]
        )
        self.db.add_all(
            [
                models.User(user_id="B1", account_id="AB", role_id="RB", name="Business"),
                models.User(user_id="C1", account_id="AC", role_id="RC", name="Customer"),
            ]
        )
        self.business = models.BusinessProfile(
            user_id="B1",
            business_name="Old name",
            business_address="Hà Nội",
        )
        self.db.add(self.business)
        self.activity = models.Activity(
            activity_id="A1",
            business_id="B1",
            name="Activity",
            address="Hà Nội",
            status="active",
            created_at=now,
        )
        self.db.add(self.activity)
        self.review = models.Review(
            review_id="R1",
            user_id="C1",
            activity_id="A1",
            rating=4,
            content="Tốt",
            created_at=now,
        )
        self.db.add(self.review)
        self.db.add(models.Bookmark(user_id="C1", activity_id="A1", created_at=now))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        models.Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_dashboard_profile_reply_and_complaint(self):
        dashboard = get_business_dashboard(db=self.db, business=self.business)
        self.assertEqual(dashboard.activity_count, 1)
        self.assertEqual(dashboard.review_count, 1)
        self.assertEqual(dashboard.unanswered_review_count, 1)
        self.assertEqual(dashboard.bookmark_count, 1)
        self.assertEqual(dashboard.average_rating, 4.0)

        updated = update_business_profile(
            schemas.BusinessProfileUpdate(business_name="New name"),
            db=self.db,
            business=self.business,
        )
        self.assertEqual(updated.business_name, "New name")

        reply = create_review_reply(
            "R1",
            schemas.ReviewReplyCreate(content="Cảm ơn bạn"),
            db=self.db,
            business=self.business,
        )
        self.assertEqual(reply.review_id, "R1")
        dashboard = get_business_dashboard(db=self.db, business=self.business)
        self.assertEqual(dashboard.unanswered_review_count, 0)

        complaint = create_complaint(
            schemas.ComplaintCreate(review_id="R1", reason="spam"),
            db=self.db,
            business=self.business,
        )
        self.assertEqual(complaint.user_id, "B1")
        with self.assertRaises(HTTPException) as context:
            create_complaint(
                schemas.ComplaintCreate(review_id="R1", reason="duplicate"),
                db=self.db,
                business=self.business,
            )
        self.assertEqual(context.exception.status_code, 409)

    def test_analytics_is_aggregated_from_database(self):
        analytics = get_business_analytics(
            days=30,
            activity_id=None,
            db=self.db,
            business=self.business,
        )
        self.assertEqual(analytics.summary.period_review_count, 1)
        self.assertEqual(analytics.summary.period_bookmark_count, 1)
        self.assertEqual(analytics.summary.period_interaction_count, 2)
        self.assertEqual(analytics.summary.period_average_rating, 4.0)
        self.assertEqual(sum(point.review_count for point in analytics.engagement_trend), 1)
        self.assertEqual(sum(point.bookmark_count for point in analytics.engagement_trend), 1)
        self.assertEqual(analytics.rating_distribution[3].count, 1)
        self.assertEqual(analytics.activity_performance[0].activity_id, "A1")
        self.assertEqual(analytics.activity_performance[0].interaction_count, 2)

    def test_cloudinary_validation_and_metadata(self):
        self.assertEqual(validate_upload(b"image", "image/png", False), "image")
        with self.assertRaises(InvalidMedia):
            validate_upload(b"payload", "application/pdf", False)

        fake_result = {
            "secure_url": "https://res.cloudinary.com/demo/image/upload/avatar.png",
            "public_id": "free2do/users/B1/avatar/avatar-1",
            "resource_type": "image",
            "bytes": 5,
            "width": 512,
            "height": 512,
        }
        with (
            patch("app.services.cloudinary_storage.settings.CLOUDINARY_CLOUD_NAME", "demo"),
            patch("app.services.cloudinary_storage.settings.CLOUDINARY_API_KEY", "key"),
            patch("app.services.cloudinary_storage.settings.CLOUDINARY_API_SECRET", "secret"),
            patch("app.services.cloudinary_storage.cloudinary.uploader.upload", return_value=fake_result),
        ):
            asset = upload_asset(
                content=b"image",
                content_type="image/png",
                folder="users/B1/avatar",
                owner_id="B1",
                kind="avatar",
            )
        self.assertEqual(asset.public_id, fake_result["public_id"])
        self.assertEqual(asset.width, 512)


if __name__ == "__main__":
    unittest.main()
