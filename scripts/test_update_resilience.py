"""Regression tests for Windows-safe startup and cross-platform updates."""

import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PY_DIR = ROOT / "py"
sys.path.insert(0, str(PY_DIR))

import restart_helper
import repair_update
import server


class UpdateResilienceTest(unittest.TestCase):
    def test_update_asset_prefers_current_platform(self):
        assets = [
            {"name": "dashboard_update_v0.2.0_macos.zip"},
            {"name": "dashboard_update_v0.2.0_windows.zip"},
            {"name": "dashboard_update_v0.2.0.zip"},
        ]
        self.assertEqual(
            "dashboard_update_v0.2.0_windows.zip",
            server._select_update_asset(assets, "win32")["name"],
        )
        self.assertEqual(
            "dashboard_update_v0.2.0_macos.zip",
            server._select_update_asset(assets, "darwin")["name"],
        )

    def test_update_asset_rejects_wrong_platform_without_generic_fallback(self):
        assets = [{"name": "dashboard_update_v0.2.0_macos.zip"}]
        self.assertIsNone(server._select_update_asset(assets, "win32"))

    def test_manifest_platform_matching(self):
        self.assertTrue(server._update_platform_matches("windows", "win32"))
        self.assertTrue(server._update_platform_matches("all", "win32"))
        self.assertFalse(server._update_platform_matches("macos", "win32"))

    def test_update_members_reject_absolute_and_traversal_paths(self):
        for name in ("/tmp/update.py", "C:/temp/update.py", "../update.py", "a/../../update.py"):
            self.assertEqual("", server._normalize_update_member(name))
            self.assertEqual("", restart_helper._normalize_member(name))
            self.assertIsNone(repair_update.normalize_member(name))

    def test_restart_helper_restores_backup_and_removes_created_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            backup_dir = base / "backups"
            backup_dir.mkdir()
            backup = backup_dir / "backup.zip"
            (base / "existing.txt").write_text("new", encoding="utf-8")
            (base / "created.txt").write_text("created", encoding="utf-8")
            lock = base / "data" / "server.lock"
            lock.parent.mkdir()
            lock.write_text('{"pid": 123}', encoding="utf-8")

            with zipfile.ZipFile(backup, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("existing.txt", "old")
                archive.writestr("data/server.lock", '{"pid": 456}')

            restart_helper.restore_backup(base, backup, ["created.txt"])

            self.assertEqual("old", (base / "existing.txt").read_text(encoding="utf-8"))
            self.assertFalse((base / "created.txt").exists())
            self.assertFalse(lock.exists())

    def test_redirected_windows_style_output_uses_utf8(self):
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "gbk"
        result = subprocess.run(
            [sys.executable, "-c", "import server; print('⚠ Unicode output')"],
            cwd=PY_DIR,
            env=env,
            capture_output=True,
            timeout=20,
        )
        self.assertEqual(0, result.returncode, result.stderr.decode("utf-8", errors="replace"))
        self.assertIn("⚠ Unicode output", result.stdout.decode("utf-8"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
