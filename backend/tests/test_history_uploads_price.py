import asyncio
import io
import json
import unittest
from datetime import datetime
from unittest.mock import patch

from fastapi import UploadFile
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.datastructures import Headers

from app import models
from app.auth import create_access_token
from app.database import get_db
from app.main import app
from app.routers import activities as activities_router
from app.routers import media as media_router
from app.services import supabase_storage

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32
MAPS = "https://maps.app.goo.gl/abc"


def fake_upload(content, content_type, object_path, upsert):
    return supabase_storage.UploadedAsset(media_url=f"https://cdn.test/{object_path}", public_id=object_path,
                                          media_type="image", bytes=len(content))


class Base(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        models.Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)
        self.db = db = self.Session()
        now = datetime.utcnow()
        db.add_all([models.Role(role_id="RB", role_name="business"), models.Role(role_id="RC", role_name="customer")])
        for aid, kind in (("AO", "operator"), ("AB", "user"), ("AC", "user"), ("AD", "user")):
            db.add(models.Account(account_id=aid, email=f"{aid.lower()}@t.local", recovery_email=f"{aid.lower()}@t.local",
                                  auth_provider="email", account_type=kind, status="active", created_at=now))
        db.flush()
        db.add(models.Operator(operator_id="OP", account_id="AO", name="Op", level="admin", status="active", created_at=now))
        db.add_all([models.User(user_id="B1", account_id="AB", role_id="RB", name="Biz"),
                    models.User(user_id="C1", account_id="AC", role_id="RC", name="Khach"),
                    models.User(user_id="C2", account_id="AD", role_id="RC", name="Khach Hai")])
        db.flush()
        db.add(models.BusinessProfile(user_id="B1", business_name="Quán Một"))
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
                    for name, aid in (("operator", "AO"), ("business", "AB"), ("customer", "AC"), ("customer2", "AD"))}
        patches = [patch.object(activities_router, "_coordinates", return_value=(21.0, 105.85)),
                   patch.object(supabase_storage, "_upload", side_effect=fake_upload)]
        self.upload_mock = patches[1].start()
        patches[0].start()
        self.addCleanup(lambda: [p.stop() for p in patches])

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()

    def payload(self, **extra):
        return {"name": "Cà phê Sáng", "description": "Mô tả", "address": "1 Phố Huế", "google_maps_url": MAPS, **extra}


class SearchHistoryTests(Base):
    def add_history(self, user_id, n):
        ids = [f"{user_id}-{i}" for i in range(n)]
        self.db.add_all(models.SearchHistory(search_id=i, user_id=user_id, latitude=21, longitude=105, radius=5,
                                             created_at=datetime.utcnow()) for i in ids)
        self.db.commit()
        return ids

    def delete(self, ids, who="customer"):
        return self.client.request("DELETE", "/users/me/search-history", headers=self.as_[who], json={"search_ids": ids})

    def remaining(self, user_id):
        self.db.expire_all()
        return {i for (i,) in self.db.query(models.SearchHistory.search_id).filter_by(user_id=user_id)}

    def test_delete_one_selected_and_all_only_own_entries(self):
        mine, theirs = self.add_history("C1", 5), self.add_history("C2", 2)
        self.assertEqual(self.delete([mine[0]]).json(), {"deleted": 1})
        self.assertEqual(self.delete([mine[1], mine[2], mine[2]]).json(), {"deleted": 2})
        self.assertEqual(self.delete(theirs).json(), {"deleted": 0})  # của người khác: không xóa
        self.assertEqual(self.remaining("C2"), set(theirs))
        self.assertEqual(self.delete(sorted(self.remaining("C1"))).json(), {"deleted": 2})  # xóa tất cả đang hiển thị
        self.assertEqual(self.remaining("C1"), set())
        self.assertEqual(self.delete([mine[0]]).json(), {"deleted": 0})  # đã xóa rồi

    def test_validation_and_roles(self):
        self.assertEqual(self.delete([]).status_code, 422)
        self.assertEqual(self.delete(["x"], who="operator").status_code, 403)
        self.assertEqual(self.client.request("DELETE", "/users/me/search-history", json={"search_ids": ["x"]}).status_code, 401)


class CoverCreateTests(Base):
    def create(self, payload, cover=("cover.png", PNG, "image/png"), who="business", path="/activities/with-cover"):
        files = {"cover": cover} if cover else {}
        return self.client.post(path, headers=self.as_[who], data={"payload": json.dumps(payload)}, files=files)

    def activity_count(self):
        self.db.expire_all()
        return self.db.query(models.Activity).count(), self.db.query(models.ActivityMedia).count()

    def test_creates_activity_and_cover_together(self):
        response = self.create(self.payload())
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["status"], "pending")
        self.assertEqual(self.activity_count(), (1, 1))
        self.assertEqual(self.db.query(models.ActivityMedia).one().media_kind, "cover")
        # Bấm lặp trong vài giây: trả lại hoạt động vừa tạo, không upload thêm file nào.
        again = self.create(self.payload())
        self.assertEqual(again.json()["activity_id"], response.json()["activity_id"])
        self.assertEqual((self.upload_mock.call_count, self.activity_count()), (1, (1, 1)))

    def test_operator_create_is_active_immediately(self):
        response = self.create(self.payload(business_id="B1"), who="operator", path="/operator/activities/with-cover")
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["status"], "active")
        self.assertEqual(self.activity_count(), (1, 1))
        self.assertEqual(self.create(self.payload(), who="customer").status_code, 403)

    def test_invalid_or_missing_cover_saves_nothing(self):
        cases = [
            ("cover.png", b"not really a png", "image/png"),     # nội dung không khớp định dạng
            ("cover.heic", PNG, "image/heic"),                    # định dạng không hỗ trợ
            ("cover.mp4", b"\x00\x00\x00\x18ftypmp42", "video/mp4"),  # ảnh bìa không nhận video
            ("cover.png", b"", "image/png"),                      # file rỗng
        ]
        for cover in cases:
            response = self.create(self.payload(name=f"Thử {cover[0]}"), cover=cover)
            self.assertEqual(response.status_code, 400, (cover[0], response.text))
            self.assertIn("Ảnh bìa không hợp lệ", response.json()["detail"])
        self.assertEqual(self.create(self.payload(), cover=None).status_code, 422)
        self.assertEqual(self.client.post("/activities/with-cover", headers=self.as_["business"],
                                          data={"payload": "{}"}, files={"cover": ("c.png", PNG, "image/png")}).status_code, 422)
        self.assertEqual((self.upload_mock.call_count, self.activity_count()), (0, (0, 0)))

    def test_upload_failure_saves_nothing(self):
        self.upload_mock.side_effect = RuntimeError("storage down")
        response = self.create(self.payload())
        self.assertEqual(response.status_code, 502)
        self.assertEqual(self.activity_count(), (0, 0))

    def test_database_failure_removes_uploaded_cover(self):
        with patch.object(activities_router, "_set_categories", side_effect=RuntimeError("db down")), \
                patch.object(activities_router, "delete_quietly") as cleanup:
            self.assertEqual(self.create(self.payload()).status_code, 500)  # middleware trả 500 có CORS
        self.assertEqual(self.activity_count(), (0, 0))
        uploaded_path = self.upload_mock.call_args.args[2]
        cleanup.assert_called_once_with(uploaded_path, "image")


class CoverReplaceTests(Base):
    def setUp(self):
        super().setUp()
        self.db.add(models.Activity(activity_id="A1", business_id="B1", name="A", address="1 Phố", status="active",
                                    created_at=datetime.utcnow()))
        self.db.flush()
        self.db.add(models.ActivityMedia(media_id="OLD", activity_id="A1", media_url="u", media_type="image",
                                         public_id="old/cover.png", media_kind="cover"))
        self.db.commit()

    def replace(self, db):
        file = UploadFile(io.BytesIO(PNG), filename="new.png", headers=Headers({"content-type": "image/png"}))
        return asyncio.run(media_router._save_activity_media(db, db.get(models.Activity, "A1"), file, "cover"))

    def test_old_cover_file_removed_only_after_commit(self):
        with patch.object(media_router, "delete_asset", side_effect=RuntimeError("storage hiccup")) as delete:
            media = self.replace(self.db)  # xóa file cũ lỗi không làm hỏng thao tác
        self.assertEqual(delete.call_args.args[0], "old/cover.png")
        self.db.expire_all()
        covers = self.db.query(models.ActivityMedia).filter_by(activity_id="A1", media_kind="cover").all()
        self.assertEqual([c.media_id for c in covers], [media.media_id])

    def test_failed_commit_keeps_old_cover_and_removes_new_file(self):
        with patch.object(self.db, "commit", side_effect=RuntimeError("db down")), \
                patch.object(media_router, "delete_asset") as delete:
            with self.assertRaises(RuntimeError):
                self.replace(self.db)
        self.assertEqual(len(delete.call_args_list), 1)
        self.assertTrue(delete.call_args.args[0].startswith("businesses/B1/activities/A1/"))  # chỉ xóa file mới
        self.db.expire_all()
        self.assertEqual([c.media_id for c in self.db.query(models.ActivityMedia).filter_by(media_kind="cover")], ["OLD"])


class PriceTests(Base):
    def test_price_round_trips_exactly(self):
        for index, price in enumerate((0, 1, 99984, 100000, 150000, 2_000_000_000)):
            created = self.client.post("/activities", headers=self.as_["business"],
                                       json=self.payload(name=f"Giá {index}", address=f"{index + 1} Phố Huế", price=price))
            self.assertEqual(created.status_code, 201, created.text)
            fetched = self.client.get(f"/operator/activities/{created.json()['activity_id']}", headers=self.as_["operator"]).json()
            self.assertEqual((created.json()["price"], fetched["price"]), (price, price))
            self.assertEqual(fetched["price_text"], f"{price:,} ₫".replace(",", "."))
        for bad in (-1, 100000.5, "100.000"):
            response = self.client.post("/activities", headers=self.as_["business"], json=self.payload(name="Sai", price=bad))
            self.assertEqual(response.status_code, 422, bad)


class ReviewListTests(Base):
    def test_operator_activity_page_can_list_reviews_of_hidden_activity(self):
        now = datetime.utcnow()
        self.db.add(models.Activity(activity_id="H1", business_id="B1", name="Ẩn", address="1 Phố", status="hidden", created_at=now))
        self.db.flush()
        self.db.add(models.Review(review_id="RV", activity_id="H1", user_id="C1", rating=4, content="Ổn", created_at=now))
        self.db.flush()
        self.db.add_all([models.ReviewMedia(media_id="RM", review_id="RV", media_url="https://cdn.test/a.jpg", media_type="image"),
                         models.ReviewReply(reply_id="RP", review_id="RV", business_id="B1", content="Cảm ơn", created_at=now)])
        self.db.commit()
        reviews = self.client.get("/activities/H1/reviews").json()
        self.assertEqual(len(reviews), 1)
        self.assertEqual((reviews[0]["content"], reviews[0]["reviewer_name"], reviews[0]["reply"]["content"]), ("Ổn", "Khach", "Cảm ơn"))
        self.assertEqual([m["media_url"] for m in reviews[0]["media"]], ["https://cdn.test/a.jpg"])


if __name__ == "__main__":
    unittest.main()
