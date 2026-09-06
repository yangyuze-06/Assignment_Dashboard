"""Regression tests for persistent file ignore behavior."""

import tempfile
import unittest
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "py"))
import server


class IgnoredFilesTest(unittest.TestCase):
    def test_ignored_file_is_not_returned_by_new_file_scan(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            ignored_file = root / "作业.pdf"
            ignored_file.write_bytes(b"placeholder")
            original_config_path = server.CONFIG_PATH
            original_watch_dirs = server.get_effective_watch_dirs
            server.CONFIG_PATH = root / "config.json"
            cfg = server.default_config()
            cfg.update({
                "scan_dirs": [str(root)],
                "file_keywords": [],
                "file_types": [".pdf"],
                "ignored_files": [str(ignored_file)],
            })
            try:
                server.get_effective_watch_dirs = lambda _cfg: [str(root)]
                server.save_json(server.CONFIG_PATH, cfg)
                self.assertEqual(server.scan_new_files(set()), [])

                cfg["ignored_files"] = []
                server.save_json(server.CONFIG_PATH, cfg)
                found = server.scan_new_files(set())
                self.assertEqual([item["path"] for item in found], [str(ignored_file)])
            finally:
                server.CONFIG_PATH = original_config_path
                server.get_effective_watch_dirs = original_watch_dirs


if __name__ == "__main__":
    unittest.main(verbosity=2)
