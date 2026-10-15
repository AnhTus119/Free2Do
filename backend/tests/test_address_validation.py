import unittest
from unittest.mock import patch

from app.routers import activities
from app.utils import geocoding


class AddressValidationTests(unittest.TestCase):
    def test_nonsense_addresses_are_rejected_by_shape(self):
        for value in ("dfb", "bbb dfb", "a b", "123", ""):
            self.assertFalse(geocoding.address_shape_ok(value), value)
        self.assertTrue(geocoding.address_shape_ok("67 P. Lê Thanh Nghị, Bạch Mai, Hà Nội"))
        self.assertTrue(geocoding.address_shape_ok("Hai Bà Trưng"))

    def test_coordinates_reject_nonsense_address_with_vietnamese_message(self):
        with self.assertRaisesRegex(ValueError, "Địa chỉ không hợp lệ"):
            activities._coordinates(None, None, "https://maps.app.goo.gl/abc", "dfb")

    def test_coordinates_reject_address_that_does_not_match_google_maps_point(self):
        with patch.object(activities, "resolve_location", return_value=(21.0, 105.85, "x", "google_maps")), \
             patch.object(activities, "address_matches_place", return_value=False):
            with self.assertRaisesRegex(ValueError, "không khớp"):
                activities._coordinates(None, None, "https://maps.app.goo.gl/abc", "12 Phố Giả Mạo, Hà Nội")

    def test_coordinates_accept_matching_or_unverifiable_address(self):
        for verdict in (True, None):
            with patch.object(activities, "resolve_location", return_value=(21.0, 105.85, "x", "google_maps")), \
                 patch.object(activities, "address_matches_place", return_value=verdict):
                self.assertEqual((21.0, 105.85), activities._coordinates(None, None, "https://maps.app.goo.gl/abc", "67 Lê Thanh Nghị, Hà Nội"))

    def test_address_not_found_without_link_is_rejected(self):
        with patch.object(activities, "geocode_address", return_value=None):
            with self.assertRaisesRegex(ValueError, "Không tìm thấy địa chỉ"):
                activities._coordinates(None, None, None, "Xin chào các bạn nhé")

    def test_address_matches_place_uses_distance_then_reverse_names(self):
        with patch.object(geocoding, "geocode_address", return_value=(21.0, 105.85, "x")):
            self.assertTrue(geocoding.address_matches_place("67 Lê Thanh Nghị Hà Nội", 21.0, 105.851))
            self.assertFalse(geocoding.address_matches_place("67 Lê Thanh Nghị Hà Nội", 10.0, 106.0))
        with patch.object(geocoding, "geocode_address", return_value=None), \
             patch.object(geocoding, "reverse_geocode_name", return_value="Phố Lê Thanh Nghị, Bạch Mai, Hà Nội"):
            self.assertTrue(geocoding.address_matches_place("67 Lê Thanh Nghị Hà Nội", 21.0, 105.85))
            self.assertFalse(geocoding.address_matches_place("asdf ghjk lmno", 21.0, 105.85))


if __name__ == "__main__":
    unittest.main()
