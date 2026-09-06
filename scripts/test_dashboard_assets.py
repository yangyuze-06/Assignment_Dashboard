"""Regression tests for dashboard CSS and JavaScript asset references."""

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXTERNAL_PAGES = {
    "html/dashboard.html": ("classic.css", "classic.js"),
}
INLINE_COMPATIBILITY_PAGES = {"html/dashboard_modern.html"}


class DashboardAssetsTest(unittest.TestCase):
    def test_external_pages_reference_external_assets(self):
        for page, (css_name, js_name) in EXTERNAL_PAGES.items():
            with self.subTest(page=page):
                html = (ROOT / page).read_text(encoding="utf-8")
                self.assertIn(f'href="/static/{css_name}"', html)
                self.assertIn(f'src="/static/{js_name}"', html)
                self.assertNotIn("<style>", html)
                self.assertNotIn("<script>", html)

    def test_compatibility_pages_keep_their_runtime_assets_inline(self):
        for page in INLINE_COMPATIBILITY_PAGES:
            with self.subTest(page=page):
                html = (ROOT / page).read_text(encoding="utf-8")
                self.assertIn("<style>", html)
                self.assertIn("<script>", html)

    def test_referenced_assets_are_nonempty(self):
        for css_name, js_name in EXTERNAL_PAGES.values():
            with self.subTest(asset=css_name):
                self.assertGreater((ROOT / "html" / "static" / css_name).stat().st_size, 100)
            with self.subTest(asset=js_name):
                self.assertGreater((ROOT / "html" / "static" / js_name).stat().st_size, 100)


if __name__ == "__main__":
    unittest.main(verbosity=2)
