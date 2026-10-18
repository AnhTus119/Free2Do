import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, retention
from app.auth import create_access_token
from app.database import get_db
from app.main import app
from app.routers.complaints import expire_overdue_complaints

DAY = timedelta(days=1)


class Base(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        models.Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)
        self.db = self.Session()
        self.now = now = datetime.utcnow()
        db = self.db
        db.add_all([models.Role(role_id="RB", role_name="business"), models.Role(role_id="RC", role_name="customer")])
        for aid, kind in (("AO", "operator"), ("AB", "user"), ("AB2", "user"), ("AC", "user")):
            db.add(models.Account(account_id=aid, email=f"{aid.lower()}@t.local", recovery_email=f"{aid.lower()}@t.local",
                                  auth_provider="email", account_type=kind, status="active", created_at=now))
        db.flush()
        db.add(models.Operator(operator_id="OP", account_id="AO", name="Op", level="admin", status="active", created_at=now))
        db.add_all([models.User(user_id="B1", account_id="AB", role_id="RB", name="Biz"),
                    models.User(user_id="B2", account_id="AB2", role_id="RB", name="Biz Hai"),
                    models.User(user_id="C1", account_id="AC", role_id="RC", name="Khach")])
        db.flush()
        db.add_all([models.BusinessProfile(user_id="B1", business_name="Quán Một"),
                    models.BusinessProfile(user_id="B2", business_name="Quán Hai")])
        db.flush()
        db.add_all([models.Activity(activity_id="A1", business_id="B1", name="Một", address="1 Phố", status="active", created_at=now),
                    models.Activity(activity_id="A2", business_id="B2", name="Hai", address="2 Phố", status="active", created_at=now)])
        db.flush()
        db.add_all([models.Review(review_id="R1", activity_id="A1", user_id="C1", rating=2, content="Tệ", created_at=now),
                    models.Review(review_id="R2", activity_id="A2", user_id="C1", rating=1, content="Rất tệ", created_at=now)])
        db.commit()

        def override_db():
            session = self.Session()
            try:
                yield session
            finally:
                session.close()

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)
        self.as_ = {name: {"Authorization": f"Bearer {create_access_token(aid)}"}
                    for name, aid in (("operator", "AO"), ("business", "AB"), ("business2", "AB2"), ("customer", "AC"))}

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()


class ComplaintTests(Base):
    def complain(self, who="business", review_id="R1"):
        return self.client.post("/complaints", headers=self.as_[who], json={"review_id": review_id, "reason": "Sai sự thật"})

    def age_complaints(self, age):
        self.db.query(models.Complaint).update({models.Complaint.created_at: self.now - age})
        self.db.commit()

    def test_only_owning_business_can_complain(self):
        created = self.complain()
        self.assertEqual(created.status_code, 201, created.text)
        body = created.json()
        self.assertEqual(body["status"], "pending")
        deadline = datetime.fromisoformat(body["deadline"]) - datetime.fromisoformat(body["created_at"])
        self.assertEqual(deadline, timedelta(days=30))
        self.assertEqual(self.complain("customer").status_code, 403)
        self.assertEqual(self.complain("operator").status_code, 403)
        self.assertEqual(self.complain("business2").status_code, 404)  # đánh giá của doanh nghiệp khác
        self.assertEqual(self.complain().status_code, 409)  # đã có khiếu nại chưa xử lý

    def test_deadline_boundary_and_expiry(self):
        self.complain()
        self.age_complaints(timedelta(days=30) - timedelta(minutes=1))
        self.assertEqual(expire_overdue_complaints(self.db), 0)
        self.age_complaints(timedelta(days=30, seconds=1))
        listed = self.client.get("/business/complaints", headers=self.as_["business"]).json()  # API danh sách tự quét
        self.assertEqual([item["status"] for item in listed], ["expired"])
        self.assertEqual(self.complain().status_code, 409)  # quá hạn vẫn là chưa xử lý

    def test_operator_handles_expired_complaints(self):
        self.complain()
        self.complain("business2", "R2")
        self.age_complaints(31 * DAY)
        self.assertEqual(self.client.get("/operator/complaints", headers=self.as_["customer"]).status_code, 403)
        listed = self.client.get("/operator/complaints", headers=self.as_["operator"]).json()
        self.assertEqual({item["status"] for item in listed}, {"expired"})
        self.assertTrue(all(item["deadline"] for item in listed))
        by_review = {item["review_id"]: item["complaint_id"] for item in listed}

        dismissed = self.client.patch(f"/operator/complaints/{by_review['R1']}/resolve", headers=self.as_["operator"], json={"action": "dismiss"})
        self.assertEqual(dismissed.status_code, 200, dismissed.text)
        removed = self.client.patch(f"/operator/complaints/{by_review['R2']}/resolve", headers=self.as_["operator"], json={"action": "delete_review"})
        self.assertEqual(removed.status_code, 200, removed.text)
        self.db.expire_all()
        self.assertIsNone(self.db.get(models.Review, "R2"))
        self.assertIsNotNone(self.db.get(models.Review, "R1"))
        self.assertEqual(self.client.patch(f"/operator/complaints/{by_review['R1']}/resolve", headers=self.as_["operator"], json={"action": "dismiss"}).status_code, 404)


class ReportTests(Base):
    def report(self, description, reason="Sai giờ mở cửa"):
        return self.client.post("/reports", headers=self.as_["customer"], json={"activity_id": "A1", "reason": reason, "description": description})

    def test_description_is_required_with_clear_message(self):
        for blank in (None, "", "   \n"):
            response = self.report(blank)
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json()["detail"], "Vui lòng nhập mô tả báo cáo")
        self.assertEqual(self.report("Có mô tả", reason="  ").json()["detail"], "Vui lòng nhập lý do báo cáo")
        created = self.report("  Quán đóng cửa lúc 18h  ")
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["description"], "Quán đóng cửa lúc 18h")

    def test_handled_reports_are_kept_with_status_and_filterable(self):
        first, second, third = (self.report(f"Mô tả {i}").json()["report_id"] for i in range(3))
        op = self.as_["operator"]
        self.assertEqual(self.client.patch(f"/operator/reports/{first}/resolve", headers=op, json={"action": "hide_activity"}).status_code, 200)
        self.assertEqual(self.client.patch(f"/operator/reports/{second}/resolve", headers=op, json={"action": "dismiss"}).status_code, 200)
        self.assertEqual(self.client.patch(f"/operator/reports/{second}/resolve", headers=op, json={"action": "dismiss"}).status_code, 400)
        self.db.expire_all()
        self.assertEqual(self.db.get(models.Activity, "A1").status, "hidden")
        report = self.db.get(models.Report, first)
        self.assertEqual((report.status, report.resolved_by), ("resolved", "OP"))
        self.assertIsNotNone(report.resolved_at)

        def ids(status=None):
            query = f"?status={status}" if status else ""
            return {item["report_id"] for item in self.client.get(f"/operator/reports{query}", headers=op).json()}
        self.assertEqual(ids("pending"), {third})
        self.assertEqual(ids("resolved"), {first})
        self.assertEqual(ids("dismissed"), {second})
        self.assertEqual(ids(), {first, second, third})
        self.assertEqual(self.client.get("/operator/reports?status=deleted", headers=op).status_code, 422)
        self.assertEqual(self.client.get("/operator/reports", headers=self.as_["customer"]).status_code, 403)


class BusinessRejectTests(Base):
    def setUp(self):
        super().setUp()
        self.db.add_all([models.BusinessRequest(request_id=rid, user_id="C1", business_name=name, status="pending", created_at=self.now)
                         for rid, name in (("BR1", "Shop Một"), ("BR2", "Shop Hai"))])
        self.db.commit()

    def act(self, request_id, action, who="operator"):
        return self.client.patch(f"/operator/business-requests/{request_id}/{action}", headers=self.as_[who])

    def test_only_operator_can_reject_pending_request(self):
        self.assertEqual(self.act("BR1", "reject", "customer").status_code, 403)
        self.assertEqual(self.act("BR1", "reject", "business").status_code, 403)
        rejected = self.act("BR1", "reject")
        self.assertEqual(rejected.status_code, 200, rejected.text)
        self.assertEqual(rejected.json()["status"], "rejected")
        self.db.expire_all()
        request = self.db.get(models.BusinessRequest, "BR1")
        self.assertEqual((request.reviewed_by, request.user.role.role_name), ("OP", "customer"))  # vẫn là khách hàng
        self.assertIsNone(self.db.query(models.BusinessProfile).filter_by(user_id="C1").first())

    def test_reject_only_from_pending(self):
        self.assertEqual(self.act("BR1", "reject").status_code, 200)
        self.assertEqual(self.act("BR1", "reject").status_code, 400)   # đã từ chối
        self.assertEqual(self.act("BR1", "approve").status_code, 400)  # không duyệt lại đơn đã từ chối
        self.assertEqual(self.act("BR2", "approve").status_code, 200)
        self.assertEqual(self.act("BR2", "reject").status_code, 400)   # đã duyệt thì không từ chối được
        self.assertEqual(self.act("KHONG-CO", "reject").status_code, 404)


class RetentionTests(Base):
    def add_activity(self, activity_id, status, changed_days_ago, with_children=False):
        changed = self.now - changed_days_ago * DAY
        self.db.add(models.Activity(activity_id=activity_id, business_id="B1", name=activity_id, address="Phố", status=status,
                                    created_at=changed - DAY, updated_at=changed))
        if with_children:
            self.db.flush()
            self.db.add_all([
                models.ActivityMedia(media_id=f"{activity_id}-m", activity_id=activity_id, media_url="u", media_type="image", public_id=f"pub/{activity_id}.jpg"),
                models.Bookmark(user_id="C1", activity_id=activity_id, created_at=changed),
                models.Review(review_id=f"{activity_id}-r", activity_id=activity_id, user_id="C1", rating=3, created_at=changed),
                models.Report(report_id=f"{activity_id}-rp", user_id="C1", activity_id=activity_id, reason="x", description="y", status="pending", created_at=changed),
            ])
            self.db.flush()
            self.db.add_all([
                models.ReviewMedia(media_id=f"{activity_id}-rm", review_id=f"{activity_id}-r", media_url="u", media_type="image", public_id=f"pub/{activity_id}-review.jpg"),
                models.Complaint(complaint_id=f"{activity_id}-c", user_id="B1", review_id=f"{activity_id}-r", reason="x", status="pending", created_at=changed),
            ])
        self.db.commit()

    def test_purges_only_finished_records_older_than_60_days(self):
        for status in retention.PURGEABLE_ACTIVITY_STATUSES:
            self.add_activity(f"OLD-{status}", status, 61, with_children=True)
            self.add_activity(f"NEW-{status}", status, 59)
        self.add_activity("OLD-active", "active", 400)
        self.add_activity("OLD-pending", "pending", 400)
        self.db.add(models.Group(group_id="G1", invite_code="INV1", host_user_id="C1", selected_activity_id="OLD-hidden",
                                 status="planning", search_started=False, created_at=self.now, updated_at=self.now))
        for report_id, status, resolved_days_ago in (("RP-old-res", "resolved", 61), ("RP-old-dis", "dismissed", 61),
                                                     ("RP-new-dis", "dismissed", 59), ("RP-old-pending", "pending", None)):
            self.db.add(models.Report(report_id=report_id, user_id="C1", activity_id="A1", reason="x", description="y", status=status,
                                      created_at=self.now - 400 * DAY,
                                      resolved_at=self.now - resolved_days_ago * DAY if resolved_days_ago else None))
        self.db.commit()

        with patch.object(retention, "delete_asset") as delete_asset:
            purged = retention.purge_stale_records(self.db)
        self.assertEqual(purged, (4, 2))
        self.db.expire_all()
        remaining = {a for (a,) in self.db.query(models.Activity.activity_id)}
        self.assertEqual(remaining, {"A1", "A2", "OLD-active", "OLD-pending"} | {f"NEW-{s}" for s in retention.PURGEABLE_ACTIVITY_STATUSES})
        for model in (models.ActivityMedia, models.Bookmark, models.ReviewMedia, models.Complaint):
            self.assertEqual(self.db.query(model).count(), 0, model.__name__)
        self.assertEqual({r for (r,) in self.db.query(models.Review.review_id)}, {"R1", "R2"})
        self.assertEqual({r for (r,) in self.db.query(models.Report.report_id)}, {"RP-new-dis", "RP-old-pending"})
        self.assertIsNone(self.db.get(models.Group, "G1").selected_activity_id)
        deleted_files = {call.args[0] for call in delete_asset.call_args_list}
        self.assertEqual(len(deleted_files), 8)  # ảnh hoạt động + ảnh đánh giá của 4 hoạt động bị xóa
        self.assertEqual(retention.purge_stale_records(self.db), (0, 0))

    def test_hidden_via_report_counts_from_hide_time(self):
        # Ẩn qua báo cáo trước đây chỉ ghi verified_at: mốc mới nhất mới là lần đổi trạng thái.
        self.db.add(models.Activity(activity_id="H", business_id="B1", name="H", address="Phố", status="hidden",
                                    created_at=self.now - 400 * DAY, updated_at=self.now - 300 * DAY, verified_at=self.now - 10 * DAY))
        self.db.commit()
        self.assertEqual(retention.purge_stale_records(self.db), (0, 0))
        self.assertEqual(retention.purge_stale_records(self.db, now=self.now + 51 * DAY), (1, 0))


if __name__ == "__main__":
    unittest.main()
