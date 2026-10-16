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
    list_business_activities,
    list_business_reviews,
    update_business_profile,
)
from app.routers.activities import update_activity
from app.routers.activities import get_activity_for_review
from app.routers.complaints import create_complaint
from app.routers.public_businesses import get_public_business
from app.routers.reviews import _to_review_out
from app.services.supabase_storage import InvalidMedia, upload_asset, validate_upload


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
                    recovery_email="business@test.local",
                    account_type="user",
                    status="active",
                    auth_provider="email",
                    email_verified=True,
                    created_at=now,
                ),
                models.Account(
                    account_id="AC",
                    email="customer@test.local",
                    recovery_email="customer@test.local",
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

    def test_unapproved_activities_do_not_expose_reviews_or_interactions(self):
        now = datetime.now(UTC).replace(tzinfo=None)
        pending_activity = models.Activity(
            activity_id="A2",
            business_id="B1",
            name="Pending activity",
            address="Hà Nội",
            status="pending",
            created_at=now,
        )
        pending_review = models.Review(
            review_id="R2",
            user_id="C1",
            activity_id="A2",
            rating=1,
            content="Chưa duyệt",
            created_at=now,
        )
        self.db.add_all([pending_activity, pending_review, models.Bookmark(
            user_id="C1", activity_id="A2", created_at=now
        )])
        self.db.commit()

        dashboard = get_business_dashboard(db=self.db, business=self.business)
        self.assertEqual(dashboard.activity_count, 2)
        self.assertEqual(dashboard.review_count, 1)
        self.assertEqual(dashboard.bookmark_count, 1)

        reviews = list_business_reviews(db=self.db, business=self.business)
        self.assertEqual([review.review_id for review in reviews], ["R1"])
        listed_activities = {
            item.activity_id: item
            for item in list_business_activities(db=self.db, business=self.business)
        }
        self.assertTrue(listed_activities["A1"].is_approved)
        self.assertEqual(listed_activities["A1"].review_count, 1)
        self.assertFalse(listed_activities["A2"].is_approved)
        self.assertEqual(listed_activities["A2"].review_count, 0)

        analytics = get_business_analytics(days=30, activity_id=None, db=self.db, business=self.business)
        self.assertEqual(analytics.summary.period_review_count, 1)
        self.assertEqual(analytics.summary.period_bookmark_count, 1)
        self.assertEqual([item.activity_id for item in analytics.activity_performance], ["A1"])

    def test_previously_approved_activity_keeps_metrics_during_edit_review(self):
        now = datetime.now(UTC).replace(tzinfo=None)
        self.activity.verified_at = now
        self.db.commit()

        result = update_activity(
            "A1",
            schemas.ActivityUpdate(description="Updated details"),
            db=self.db,
            business=self.business,
        )

        self.assertEqual(result.status, "pending")
        self.assertTrue(result.is_approved)
        self.assertIsNotNone(self.activity.verified_at)
        dashboard = get_business_dashboard(db=self.db, business=self.business)
        self.assertEqual(dashboard.review_count, 1)
        self.assertEqual(dashboard.bookmark_count, 1)
        self.assertEqual(
            [review.review_id for review in list_business_reviews(db=self.db, business=self.business)],
            ["R1"],
        )
        listed_activity = list_business_activities(db=self.db, business=self.business)[0]
        self.assertTrue(listed_activity.is_approved)
        self.assertEqual(listed_activity.review_count, 1)
        analytics = get_business_analytics(days=30, activity_id=None, db=self.db, business=self.business)
        self.assertEqual(analytics.summary.period_interaction_count, 2)
        self.assertEqual(analytics.activity_performance[0].activity_id, "A1")

    def test_operator_activity_detail_includes_latest_uploaded_media_and_fields(self):
        media = models.ActivityMedia(
            media_id="AM1",
            activity_id="A1",
            media_url="https://storage.test/activity-cover.jpg",
            media_type="image",
            media_kind="cover",
        )
        self.activity.description = "Mô tả vừa cập nhật"
        self.db.add(media)
        self.db.commit()

        detail = get_activity_for_review("A1", db=self.db, _operator=None)

        self.assertEqual(detail.description, "Mô tả vừa cập nhật")
        self.assertEqual(detail.media[0].media_url, "https://storage.test/activity-cover.jpg")
        self.assertEqual(detail.media[0].media_kind, "cover")

    def test_public_business_media_and_review_reply_are_exposed(self):
        media = models.BusinessMedia(
            media_id="M1",
            business_id="B1",
            media_url="https://res.cloudinary.com/demo/image/upload/gallery.jpg",
            public_id="free2do/businesses/B1/gallery/gallery-1",
            media_type="image",
            media_kind="gallery",
            created_at=datetime.now(UTC).replace(tzinfo=None),
        )
        review_media = models.ReviewMedia(
            media_id="RM1",
            review_id="R1",
            media_url="https://res.cloudinary.com/demo/image/upload/review.jpg",
            media_type="image",
        )
        self.db.add_all([media, review_media])
        create_review_reply(
            "R1",
            schemas.ReviewReplyCreate(content="Cảm ơn bạn"),
            db=self.db,
            business=self.business,
        )
        public_business = get_public_business("B1", db=self.db)
        public_review = _to_review_out(self.db.query(models.Review).filter_by(review_id="R1").one())
        self.assertEqual(public_business.activity_count, 1)
        self.assertEqual(public_business.media[0].media_kind, "gallery")
        self.assertEqual(public_review.media[0].media_type, "image")
        self.assertEqual(public_review.reply.content, "Cảm ơn bạn")

    def test_supabase_storage_validation_and_metadata(self):
        png = b"\x89PNG\r\n\x1a\n" + b"pixels"
        self.assertEqual(validate_upload(png, "image/png", False), "image")
        with self.assertRaises(InvalidMedia):  # đuôi/Content-Type là PNG nhưng nội dung không phải ảnh
            validate_upload(b"image", "image/png", False)
        with self.assertRaises(InvalidMedia):
            validate_upload(b"payload", "application/pdf", False)

        with (
            patch("app.services.supabase_storage.settings.SUPABASE_URL", "https://demo.supabase.co"),
            patch("app.services.supabase_storage.settings.SUPABASE_SERVICE_KEY", "secret"),
            patch("app.services.supabase_storage.ensure_bucket"),
            patch("app.services.supabase_storage.requests.post") as upload_mock,
        ):
            upload_mock.return_value.status_code = 200
            asset = upload_asset(
                content=png,
                content_type="image/png",
                folder="users/B1/avatar",
                owner_id="B1",
                kind="avatar",
            )
        self.assertTrue(asset.public_id.startswith("users/B1/avatar/avatar-"))
        self.assertTrue(asset.public_id.endswith(".png"))
        self.assertIn("/storage/v1/object/public/free2do-media/", asset.media_url)
        self.assertEqual(asset.bytes, len(png))
        self.assertEqual(upload_mock.call_args.kwargs["headers"]["Content-Type"], "image/png")


if __name__ == "__main__":
    unittest.main()
