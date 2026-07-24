"""Regression tests for the public static-file boundary."""

import tempfile
import unittest
from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class StaticFileTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.parent = Path(self.tmp.name)
        self.root = self.parent / "app"
        self.root.mkdir()
        (self.root / "assets").mkdir()
        (self.root / "assets" / "app.js").write_text("// fixture", encoding="utf-8")
        (self.root / "config.json").write_text("{}", encoding="utf-8")
        (self.parent / "outside.js").write_text("// private", encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def test_allows_known_static_asset_inside_root(self):
        expected = (self.root / "assets" / "app.js").resolve()
        self.assertEqual(server.resolve_static_file("/assets/app.js", self.root), expected)

    def test_rejects_parent_traversal(self):
        self.assertIsNone(server.resolve_static_file("/../outside.js", self.root))

    def test_rejects_windows_style_traversal(self):
        self.assertIsNone(server.resolve_static_file(r"\..\outside.js", self.root))

    def test_rejects_non_public_file_type(self):
        self.assertIsNone(server.resolve_static_file("/config.json", self.root))

    def test_rejects_symlink_outside_root(self):
        link = self.root / "assets" / "outside.js"
        try:
            link.symlink_to(self.parent / "outside.js")
        except (NotImplementedError, OSError):
            self.skipTest("symlinks are unavailable")
        self.assertIsNone(server.resolve_static_file("/assets/outside.js", self.root))


if __name__ == "__main__":
    unittest.main(verbosity=2)
