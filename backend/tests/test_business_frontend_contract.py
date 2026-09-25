import unittest
from pathlib import Path

from app.main import app


class BusinessFrontendContractTests(unittest.TestCase):
    def test_frontend_endpoints_exist_in_openapi(self):
        paths = app.openapi()["paths"]
        expected = {
            "/auth/me": "get",
            "/business/me": "get",
            "/business/dashboard": "get",
            "/business/analytics": "get",
            "/business/activities": "get",
            "/business/reviews": "get",
            "/business/complaints": "get",
            "/business/media": "post",
            "/activities": "post",
            "/activities/{activity_id}": "patch",
            "/activities/{activity_id}/media/upload": "post",
            "/business/reviews/{review_id}/reply": "post",
            "/business/review-replies/{reply_id}": "patch",
            "/complaints": "post",
        }
        for path, method in expected.items():
            self.assertIn(path, paths)
            self.assertIn(method, paths[path])

    def test_business_pages_do_not_contain_demo_records(self):
        root = Path(__file__).resolve().parents[2] / "frontend" / "Demo Trang Business"
        source = "\n".join(
            path.read_text(encoding="utf-8")
            for path in [*root.glob("*.html"), *root.glob("*.js")]
        )
        for marker in ("const REVIEWS", "She.slays", "Whimsical Crown", "ratingCounts"):
            self.assertNotIn(marker, source)
        self.assertIn("BusinessAPI.request('/business/dashboard')", source)
        self.assertIn("BusinessAPI.request('/business/reviews')", source)


if __name__ == "__main__":
    unittest.main()
