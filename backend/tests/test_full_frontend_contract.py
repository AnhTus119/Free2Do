import re
import unittest
from pathlib import Path

from app.main import app


class FullFrontendContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frontend = Path(__file__).resolve().parents[2] / "frontend"
        cls.source = "\n".join(
            path.read_text(encoding="utf-8")
            for pattern in ("*.html", "*.js")
            for path in cls.frontend.rglob(pattern)
        )

    def test_new_frontend_flows_are_backed_by_openapi(self):
        paths = app.openapi()["paths"]
        expected = {
            "/search": "post",
            "/businesses": "get",
            "/media/avatar-presets": "get",
            "/media/avatar": "post",
            "/media/avatar/preset/{preset_id}": "put",
            "/reviews/{review_id}/media/upload": "post",
            "/operator/me": "get",
            "/operator/operators": "get",
            "/operator/categories": "post",
            "/operator/reports": "get",
            "/operator/complaints": "get",
            "/auth/recovery-email/request": "post",
            "/auth/recovery-email/verify": "put",
        }
        for path, method in expected.items():
            self.assertIn(path, paths)
            self.assertIn(method, paths[path])

    def test_local_html_assets_exist(self):
        missing = []
        pattern = re.compile(r'(?:src|href)=["\']([^"\']+)')
        for page in self.frontend.rglob("*.html"):
            for url in pattern.findall(page.read_text(encoding="utf-8")):
                if url.startswith(("http:", "https:", "#", "mailto:", "javascript:")) or "{" in url:
                    continue
                target = page.parent / url.split("?", 1)[0].split("#", 1)[0]
                if not target.exists():
                    missing.append(f"{page.relative_to(self.frontend)} -> {url}")
        self.assertEqual([], missing)

    def test_frontend_has_no_removed_demo_logic(self):
        for marker in ("21.0352", "105.7944", "fetch('/api", "const REVIEWS", "group.html"):
            self.assertNotIn(marker, self.source)
        self.assertIn("api.request('/search'", self.source)
        self.assertIn("request('/businesses')", self.source)


if __name__ == "__main__":
    unittest.main()
