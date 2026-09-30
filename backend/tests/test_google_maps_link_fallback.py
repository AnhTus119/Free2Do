import unittest
from datetime import datetime

from app import schemas
from app.utils.google_maps import build_google_maps_url

BASE = dict(
    activity_id="A1", business_id="B1", name="Workshop", status="active",
    address="12 Bạch Mai, Hai Bà Trưng, Hà Nội", created_at=datetime(2026, 1, 1),
    business_name="Studio",
)


class GoogleMapsLinkFallbackTests(unittest.TestCase):
    def test_uses_coordinates_when_available(self):
        self.assertEqual(
            build_google_maps_url(21.0, 105.85, "x"),
            "https://www.google.com/maps/search/?api=1&query=21.0,105.85",
        )

    def test_falls_back_to_address_then_none(self):
        self.assertIn("query=12+B", build_google_maps_url(None, None, "12 Bạch Mai"))
        self.assertIsNone(build_google_maps_url(None, None, ""))

    def test_public_detail_gets_link_when_missing(self):
        out = schemas.ActivityPublicOut(**BASE, latitude=21.0, longitude=105.85)
        self.assertTrue(out.google_maps_url.startswith("https://www.google.com/maps/"))

    def test_search_result_gets_link_when_missing(self):
        out = schemas.ActivityWithScore(**BASE, match_score=90, latitude=21.0, longitude=105.85)
        self.assertTrue(out.google_maps_url.startswith("https://www.google.com/maps/"))

    def test_stored_link_is_kept(self):
        link = "https://maps.app.goo.gl/abc"
        out = schemas.ActivityPublicOut(**BASE, google_maps_url=link)
        self.assertEqual(out.google_maps_url, link)


if __name__ == "__main__":
    unittest.main()
