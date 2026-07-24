"""Regression tests for dashboard CSS and JavaScript asset references."""

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGES = {
    "dashboard.html": ("classic.css", "classic.js"),
    "dashboard_modern.html": ("modern.css", "modern.js"),
}


class DashboardAssetsTest(unittest.TestCase):
    def test_pages_reference_external_assets(self):
        for page, (css_name, js_name) in PAGES.items():
            with self.subTest(page=page):
                html = (ROOT / page).read_text(encoding="utf-8")
                self.assertIn(f'href="/static/{css_name}"', html)
                self.assertIn(f'src="/static/{js_name}"', html)
                self.assertNotIn("<style>", html)
                self.assertNotIn("<script>", html)

    def test_referenced_assets_are_nonempty(self):
        for css_name, js_name in PAGES.values():
            with self.subTest(asset=css_name):
                self.assertGreater((ROOT / "static" / css_name).stat().st_size, 100)
            with self.subTest(asset=js_name):
                self.assertGreater((ROOT / "static" / js_name).stat().st_size, 100)


if __name__ == "__main__":
    unittest.main(verbosity=2)
