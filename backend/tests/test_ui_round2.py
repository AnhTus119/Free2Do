"""Kiểm tra các sửa đổi backend của đợt UI round 2 (chạy trên SQLite trong bộ nhớ)."""
import asyncio
import io
import unittest
from datetime import UTC, datetime
from unittest.mock import patch

from fastapi import HTTPException, UploadFile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, schemas
from app.routers import activities as activities_router
from app.routers import business_requests as requests_router
from app.routers import media as media_router
from app.routers import public_businesses as public_businesses_router
from app.routers.complaints import create_complaint, list_complaints, resolve_complaint
from app.routers.reports import list_reports, resolve_report
from app.services import supabase_storage
from app.services.supabase_storage import UploadedAsset

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32


class UiRound2Tests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        models.Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        now = datetime.now(UTC).replace(tzinfo=None)
        self.now = now
        self.db.add_all([models.Role(role_id="RB", role_name="business"), models.Role(role_id="RC", role_name="customer")])
        self.db.add_all([
            # Doanh nghiệp đăng ký bằng số điện thoại: không có email.
            models.Account(account_id="AB", phone="0900000000", account_type="user", status="active",
                           auth_provider="phone", email_verified=True, created_at=now),
            models.Account(account_id="AC", email="c@test.local", account_type="user", status="active",
                           auth_provider="email", email_verified=True, created_at=now),
            models.Account(account_id="AO", email="o@test.local", account_type="operator", status="active",
                           auth_provider="email", email_verified=True, created_at=now),
        ])
        self.db.add_all([
            models.User(user_id="B1", account_id="AB", role_id="RB", name="Chủ quán"),
            models.User(user_id="C1", account_id="AC", role_id="RC", name="Khách"),
        ])
        self.operator = models.Operator(operator_id="O1", account_id="AO", name="Op", created_at=now)
        self.business = models.BusinessProfile(user_id="B1", business_name="Quán A", business_address="Hà Nội")
        self.db.add_all([self.operator, self.business])
        self.db.add_all([
            models.Activity(activity_id="X1", business_id="B1", name="Một", address="HN", status="active", created_at=now),
            models.Activity(activity_id="X2", business_id="B1", name="Hai", address="HN", status="active", created_at=now),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_activity_codes_are_sequential_without_padding(self):
        codes = [a.code for a in self.db.query(models.Activity).order_by(models.Activity.code)]
        self.assertEqual(len(codes), 2)
        self.assertTrue(all(code.startswith("A") and not code[1:].startswith("0") for code in codes))
        number = int(max(codes, key=lambda c: int(c[1:]))[1:])
        self.db.query(models.Activity).filter_by(activity_id="X2").delete()
        self.db.commit()
        self.db.add(models.Activity(activity_id="X3", business_id="B1", name="Ba", address="HN", status="pending", created_at=self.now))
        self.db.commit()
        self.assertGreater(int(self.db.get(models.Activity, "X3").code[1:]), number)  # mã đã xóa không dùng lại

    def test_hide_never_500_when_email_fails(self):
        with patch("app.utils.email.send_notification_email", side_effect=RuntimeError("SMTP blocked")):
            out = activities_router.set_activity_status(
                "X1", schemas.ActivityStatusUpdate(status="hidden"), db=self.db, operator=self.operator)
            self.assertEqual(out.status, "hidden")
            self.db.get(models.Activity, "X1").status = "active"
            self.db.add(models.Report(report_id="P1", user_id="C1", activity_id="X1", reason="spam",
                                      status="pending", created_at=self.now))
            self.db.commit()
            reports = list_reports(status_filter=None, db=self.db, _operator=self.operator)
            self.assertEqual((reports[0].activity_name, reports[0].reporter_name), ("Một", "Khách"))
            self.assertTrue(reports[0].activity_code.startswith("A"))
            resolve_report("P1", schemas.ReportResolveRequest(action="hide_activity"), db=self.db, operator=self.operator)
            hidden = activities_router.hide_activity("X2", db=self.db, operator=self.operator)
        self.assertEqual(self.db.get(models.Activity, "X1").status, "hidden")
        self.assertEqual(hidden.status, "hidden")
        self.assertIsNone(self.db.get(models.Report, "P1"))

    def test_complaint_after_reply_then_delete_review(self):
        self.db.add(models.Review(review_id="R1", user_id="C1", activity_id="X1", rating=1, created_at=self.now))
        self.db.add(models.ReviewReply(reply_id="RP1", review_id="R1", business_id="B1", content="Xin lỗi", created_at=self.now))
        self.db.add(models.ReviewReplyMedia(media_id="M1", reply_id="RP1", media_url="u", public_id="p",
                                            media_type="image", created_at=self.now))
        self.db.commit()
        complaint = create_complaint(schemas.ComplaintCreate(review_id="R1", reason="sai sự thật"), db=self.db, business=self.business)
        listed = list_complaints(status_filter=None, db=self.db, _operator=self.operator)[0]
        self.assertEqual((listed.reply_content, listed.complainant_name, listed.activity_id), ("Xin lỗi", "Quán A", "X1"))
        resolve_complaint(complaint.complaint_id, schemas.ComplaintResolveRequest(action="delete_review"), db=self.db, _operator=self.operator)
        self.assertIsNone(self.db.get(models.Review, "R1"))
        self.assertIsNone(self.db.get(models.ReviewReply, "RP1"))

    def test_operator_filter_by_business(self):
        other = models.User(user_id="B2", account_id="AC", role_id="RB", name="Khác")
        self.db.add_all([other, models.BusinessProfile(user_id="B2", business_name="Quán B")])
        self.db.add(models.Activity(activity_id="Y1", business_id="B2", name="Khác", address="HN", status="active", created_at=self.now))
        self.db.commit()
        rows = activities_router.list_activities_for_review(status_filter=None, business_id="B1", db=self.db, _operator=self.operator)
        self.assertEqual({row.activity_id for row in rows}, {"X1", "X2"})

    def test_double_submit_returns_same_activity(self):
        payload = schemas.ActivityCreate(name="Mới", address="1 Phố Huế, Hà Nội", google_maps_url="https://maps.google.com/?q=1")
        with patch.object(activities_router, "_coordinates", return_value=(21.0, 105.8)):
            first = activities_router._create_activity_record(self.db, self.business, payload)
            second = activities_router._create_activity_record(self.db, self.business, payload)
        self.assertEqual(first.activity_id, second.activity_id)

    def test_proofs_are_images_only_and_capped(self):
        user = self.db.get(models.User, "C1")
        request = models.BusinessRequest(request_id="Q1", user_id="C1", business_name="Shop", status="pending", created_at=self.now)
        self.db.add(request)
        self.db.commit()
        upload = lambda data, name="a.png": UploadFile(file=io.BytesIO(data), filename=name)
        fake = UploadedAsset(media_url="https://s/business-proofs/Q1/x.png", public_id="business-proofs/Q1/x.png", media_type="image", bytes=40)
        with patch.object(requests_router, "upload_asset", return_value=fake) as uploaded:
            with self.assertRaises(HTTPException) as bad:
                asyncio.run(requests_router.upload_business_request_proofs("Q1", [upload(b"%PDF-1.4", "a.pdf")], db=self.db, user=user))
            self.assertEqual(bad.exception.status_code, 400)
            out = asyncio.run(requests_router.upload_business_request_proofs("Q1", [upload(PNG), upload(PNG)], db=self.db, user=user))
            self.assertEqual(len(out.proofs), 2)
            self.assertTrue(uploaded.call_args.kwargs["folder"].startswith("business-proofs/"))
            with self.assertRaises(HTTPException):
                asyncio.run(requests_router.upload_business_request_proofs("Q1", [upload(PNG)] * 4, db=self.db, user=user))
        self.assertEqual(self.db.query(models.ActivityMedia).count(), 0)  # không lẫn vào ảnh hoạt động

    def test_operator_can_add_proofs_to_approved_business_request(self):
        request = models.BusinessRequest(
            request_id="Q2", user_id="B1", business_name="Quán A",
            status="approved", created_at=self.now,
        )
        self.db.add(request)
        self.db.commit()
        upload = UploadFile(file=io.BytesIO(PNG), filename="proof.png")
        asset = UploadedAsset(
            media_url="https://s/business-proofs/Q2/proof.png",
            public_id="business-proofs/Q2/proof.png",
            media_type="image",
            bytes=len(PNG),
        )
        with patch.object(requests_router, "upload_asset", return_value=asset):
            result = asyncio.run(requests_router.operator_upload_business_request_proofs(
                "Q2", [upload], db=self.db, _operator=self.operator,
            ))
        self.assertEqual(result.status, "approved")
        self.assertEqual(len(result.proofs), 1)
        self.assertTrue(result.proofs[0].media_url.endswith("proof.png"))

    def test_operator_can_add_unlimited_business_profile_files(self):
        contents = b"%PDF-1.7 arbitrary file proof"
        uploads = [
            UploadFile(file=io.BytesIO(contents), filename=f"proof-{number}.pdf")
            for number in range(6)
        ]
        asset = UploadedAsset(
            media_url="https://s/business-proofs/B1/proof.pdf",
            public_id="business-proofs/B1/proof.pdf",
            media_type="file",
            bytes=len(contents),
        )
        with patch.object(media_router, "upload_proof_asset", return_value=asset) as upload_proof:
            result = asyncio.run(media_router.upload_operator_business_proofs(
                "B1", uploads, db=self.db, _operator=self.operator,
            ))
        self.assertEqual(len(result), 6)
        self.assertTrue(all(item.media_kind == "proof" for item in result))
        self.assertTrue(all(item.business_id == "B1" for item in result))
        self.assertTrue(all(item.media_type == "file" for item in result))
        self.assertEqual(upload_proof.call_count, 6)
        self.assertEqual(upload_proof.call_args.kwargs["filename"], "proof-5.pdf")

    def test_proof_upload_accepts_non_image_file_format(self):
        with patch.object(
            supabase_storage,
            "_upload",
            return_value=UploadedAsset(
                media_url="https://s/business-proofs/B1/proof-1.pdf",
                public_id="business-proofs/B1/proof-1.pdf",
                media_type="image",
                bytes=4,
            ),
        ) as storage_upload:
            asset = supabase_storage.upload_proof_asset(
                content=b"%PDF",
                filename="giay-phep.pdf",
                folder="business-proofs/B1",
            )
        self.assertEqual(asset.media_type, "file")
        self.assertTrue(asset.public_id.endswith(".pdf"))
        self.assertEqual(storage_upload.call_args.args[1], "application/octet-stream")

    def test_business_proofs_are_not_in_public_business_media(self):
        self.db.add_all([
            models.BusinessMedia(
                media_id="proof", business_id="B1", media_url="proof-url",
                public_id="proof", media_type="image", media_kind="proof",
                created_at=self.now,
            ),
            models.BusinessMedia(
                media_id="gallery", business_id="B1", media_url="gallery-url",
                public_id="gallery", media_type="image", media_kind="gallery",
                created_at=self.now,
            ),
        ])
        self.db.commit()
        public = public_businesses_router._to_public(
            self.db, self.db.get(models.BusinessProfile, "B1"),
        )
        self.assertEqual([media.media_kind for media in public.media], ["gallery"])

    def test_public_business_allows_missing_address(self):
        # Doanh nghiệp chưa có địa chỉ không được làm GET /businesses lỗi 500.
        out = schemas.BusinessPublicOut(user_id="B1", business_name="X", business_address=None)
        self.assertIsNone(out.business_address)


if __name__ == "__main__":
    unittest.main()
