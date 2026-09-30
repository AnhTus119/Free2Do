import re
import unittest
from pathlib import Path
from urllib.parse import unquote

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
            "/users/me": "patch",
            "/search": "post",
            "/businesses": "get",
            "/businesses/{business_id}": "get",
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
            "/groups": "post",
            "/groups/invite/{invite_code}/join": "post",
            "/groups/{group_id}": "get",
            "/groups/{group_id}/recommendations": "get",
            "/groups/{group_id}/activity": "put",
            "/groups/{group_id}/payments/{member_id}": "patch",
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
                target = page.parent / unquote(url.split("?", 1)[0].split("#", 1)[0])
                if not target.exists():
                    missing.append(f"{page.relative_to(self.frontend)} -> {url}")
        self.assertEqual([], missing)

    def test_frontend_has_no_removed_demo_logic(self):
        for marker in ("21.0352", "105.7944", "fetch('/api", "const REVIEWS"):
            self.assertNotIn(marker, self.source)
        self.assertIn("api.request('/search'", self.source)
        self.assertIn("request('/businesses')", self.source)

    def test_group_page_uses_backend_only(self):
        group_html = (self.frontend / "Demo Trang Customer" / "group.html").read_text(encoding="utf-8")
        group_js = (self.frontend / "js" / "group.js").read_text(encoding="utf-8")
        self.assertIn('../js/group.js', group_html)
        self.assertIn("api.request('/categories')", group_js)
        self.assertIn("api.request('/groups'", group_js)
        self.assertIn("/recommendations`", group_js)
        self.assertIn("new WebSocket", group_js)
        for marker in ("Math.random", "const INTERESTS", "window.AdminData", "paymentStates"):
            self.assertNotIn(marker, group_html + group_js)

    def test_removed_empty_demo_files_are_gone(self):
        removed = (
            "js/main.js", "js/search.js", "js/results.js", "js/detail.js",
            "js/review.js", "js/admin.js", "search-results.html",
            "activity-detail.html", "review.html", "js/public-data.js",
            "js/user-nav.js", "js/api.js",
        )
        for path in removed:
            self.assertFalse((self.frontend / path).exists(), path)

    def test_customer_pages_call_every_customer_api_group(self):
        markers = (
            "api.requireUser()", "api.request('/activities')", "api.request('/categories')",
            "api.request('/search'", "api.request('/bookmarks/me')", "api.request('/reviews'",
            "api.request('/reports'", "api.request('/users/me'", "api.request('/users/me/categories'",
            "api.request('/users/me/search-history')", "api.request('/media/avatar-presets')",
            "api.request('/media/avatar'", "api.request('/business-requests'",
            "api.request('/business-requests/me')",
        )
        for marker in markers:
            self.assertIn(marker, self.source)

    def test_customer_detail_controls_are_wired(self):
        detail = (self.frontend / "Demo Trang Customer" / "activity-detail.html").read_text(encoding="utf-8")
        detail_source = (self.frontend / "js" / "customer-detail.js").read_text(encoding="utf-8")
        self.assertIn('id="reportActivity"', detail)
        self.assertIn('id="mapLink"', detail)
        self.assertIn('id="detailSearchForm"', detail)
        self.assertIn("api.requireUser()", detail_source)
        self.assertIn("mapLink.href = activity.google_maps_url", detail_source)

    def test_map_icons_exist_and_zoom_does_not_depend_on_leaflet(self):
        icon_source = (self.frontend / "js" / "customer-activity-icons.js").read_text(encoding="utf-8")
        map_source = (self.frontend / "js" / "customer-map.js").read_text(encoding="utf-8")
        filenames = re.findall(r"\.\./img/map-icons/([^'\"`\r\n]+)['\"]", icon_source)
        self.assertGreaterEqual(len(filenames), 14)
        for filename in filenames:
            self.assertTrue((self.frontend / "img" / "map-icons" / filename).is_file(), filename)
        for marker in ("zoomBy", "addEventListener('wheel'", "addEventListener('dblclick'", "addEventListener('touchmove'", "addEventListener('pointermove'", "onSelectPosition"):
            self.assertIn(marker, map_source)
        self.assertIn("document.createElement('img')", map_source)
        self.assertIn("https://tile.openstreetmap.org/", map_source)
        self.assertNotIn("canvas.getContext", map_source)
        self.assertNotIn("leaflet", map_source.lower())

    def test_customer_nav_uses_backend_username(self):
        api_source = (self.frontend / "js" / "customer-api.js").read_text(encoding="utf-8")
        self.assertIn("me.username || me.name", api_source)
        self.assertIn("el.textContent = username", api_source)


if __name__ == "__main__":
    unittest.main()
