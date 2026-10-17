"""Bộ phân tích tiếng Việt local của trợ lý AI + luồng /ai/chat không cần OpenAI."""
import unittest
from datetime import date, datetime, time
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.routers import ai

TODAY = date(2026, 10, 18)  # chủ nhật


class ParserTests(unittest.TestCase):
    def test_user_example_place_and_budget(self):
        intent = ai.parse_message("tôi muốn đi chơi khu vực Hai Bà Trưng với budget dưới 200k", TODAY)
        self.assertEqual("hai bà trưng", intent.place)
        self.assertEqual(200_000, intent.budget)
        self.assertIsNone(intent.time_of_day)  # "tôi" không phải "tối"
        self.assertTrue(intent.understood)

    def test_rain_and_free_time(self):
        intent = ai.parse_message("Hôm nay trời mưa, rảnh 2 tiếng rưỡi thì đi đâu?", TODAY)
        self.assertEqual("rain", intent.weather)
        self.assertEqual(150, intent.free_minutes)
        self.assertEqual(TODAY, intent.day)

    def test_sunny_wants_camera_and_outdoor(self):
        intent = ai.parse_message("nắng đẹp quá muốn đi chụp ảnh", TODAY)
        self.assertEqual("sun", intent.weather)
        self.assertIn("chup anh", intent.tags)
        self.assertIn("may anh", intent.boost_terms)

    def test_money_formats(self):
        self.assertEqual(150_000, ai.parse_message("tối nay có gì dưới 150.000đ", TODAY).budget)
        self.assertEqual(1_500_000, ai.parse_message("ngân sách 1tr5", TODAY).budget)
        self.assertEqual(0, ai.parse_message("chỗ nào miễn phí", TODAY).budget)
        self.assertIsNone(ai.parse_message("rảnh 2h, đi 5 người", TODAY).budget)

    def test_ambiguous_words_do_not_mislead(self):
        intent = ai.parse_message("đi chơi cùng nhau ở phố cổ lâu lâu một lần", TODAY)
        self.assertNotIn("an uong", intent.tags)       # "nhau", "lâu", "phố" không phải ăn uống
        self.assertEqual("phố cổ", intent.place)
        self.assertIsNone(ai.parse_message("khu vực Hoàng Mai", TODAY).day)  # "Mai" không phải ngày mai
        self.assertIsNone(ai.parse_message("tôi muốn mua sắm", TODAY).weather)  # "mua" không phải "mưa"
        self.assertEqual("tối", ai.parse_message("tối nay đi đâu", TODAY).time_of_day)

    def test_occasion_and_tags(self):
        self.assertIn("ca hat", ai.parse_message("đi karaoke với hội bạn", TODAY).tags)
        self.assertIn("xem phim", ai.parse_message("hẹn hò với người yêu", TODAY).tags)
        self.assertEqual(TODAY, ai.parse_message("cuối tuần này", TODAY).day)

    def test_small_talk_and_follow_up(self):
        self.assertEqual("greet", ai.parse_message("xin chào", TODAY).small_talk)
        previous = ai.parse_message("cà phê ở Cầu Giấy dưới 100k", TODAY)
        merged = ai._merge_follow_up(ai.parse_message("còn chỗ nào rẻ hơn không", TODAY), previous, "còn chỗ nào rẻ hơn không")
        self.assertEqual(("cầu giấy", ["ca phe"]), (merged.place, merged.tags))
        self.assertAlmostEqual(70_000, merged.budget)


class ChatFlowTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        models.Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        now = datetime(2026, 10, 1)
        self.db.add_all([models.Role(role_id="RC", role_name="customer"), models.Role(role_id="RB", role_name="business")])
        self.db.add_all([models.Account(account_id=a, email=f"{a}@t.local", account_type="user", status="active",
                                        auth_provider="email", email_verified=True, created_at=now) for a in ("AC", "AB")])
        self.db.flush()
        self.db.add_all([models.User(user_id="UC", account_id="AC", role_id="RC", name="Cus"),
                         models.User(user_id="UB", account_id="AB", role_id="RB", name="Biz")])
        self.db.flush()
        self.db.add(models.BusinessProfile(user_id="UB", business_name="Biz"))
        cafe, park = models.Category(category_id="C1", name="Cà phê"), models.Category(category_id="C2", name="Tham quan")
        self.db.add_all([cafe, park])
        for activity_id, name, price, lat, tag in (("A1", "Cà phê mưa", 50_000, 21.0068, "C1"),
                                                   ("A2", "Công viên", 0, 21.0070, "C2"),
                                                   ("A3", "Cà phê đắt", 300_000, 21.0069, "C1"),
                                                   ("A4", "Cà phê xa", 40_000, 21.08, "C1")):
            self.db.add(models.Activity(activity_id=activity_id, business_id="UB", name=name, price=price, address="Hà Nội",
                                        latitude=lat, longitude=105.8576, status="active", created_at=now,
                                        time_open=datetime.combine(TODAY, time(7)), time_close=datetime.combine(TODAY, time(22))))
            self.db.add(models.ActivityCategory(activity_id=activity_id, category_id=tag))
        self.db.commit()
        self.user = self.db.get(models.User, "UC")

    def chat(self, message, **extra):
        payload = ai.AIChatRequest(message=message, **extra)
        with patch.object(ai, "_geocode_place", return_value=(21.0068, 105.8576)) as geocode, \
             patch.object(ai, "_llm_intent", side_effect=AssertionError("không được gọi LLM")):
            return ai.chat(payload, self.db, self.user), geocode

    def test_place_from_prompt_overrides_home_location(self):
        result, geocode = self.chat("đi chơi khu vực Hai Bà Trưng dưới 200k", latitude=20.95, longitude=105.75)
        geocode.assert_called_once_with("hai bà trưng")
        ids = [item["activity_id"] for item in result["recommendations"]]
        self.assertEqual({"A1", "A2"}, set(ids))  # A3 vượt ngân sách, A4 ngoài 5 km
        self.assertEqual("local", result["source"])
        self.assertIn("📍 Hai Bà Trưng", result["understood"])

    def test_rain_drops_outdoor_only(self):
        result, _ = self.chat("trời mưa thì đi đâu dưới 100k", latitude=21.0068, longitude=105.8576)
        self.assertEqual(["A1"], [item["activity_id"] for item in result["recommendations"]])
        self.assertIn("trong nhà", result["recommendations"][0]["reason"])

    def test_widens_radius_but_keeps_budget(self):
        result, _ = self.chat("cà phê dưới 45k", latitude=21.0068, longitude=105.8576, radius=5)
        self.assertEqual(["A4"], [item["activity_id"] for item in result["recommendations"]])
        self.assertIn("mở rộng tới 10 km", result["reply"])

    def test_without_location_asks_for_it(self):
        result, _ = self.chat("đi chơi dưới 100k")
        self.assertEqual([], result["recommendations"])
        self.assertIn("ở đâu", result["reply"])


if __name__ == "__main__":
    unittest.main()
