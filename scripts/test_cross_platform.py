"""Focused regression tests for macOS discovery and transactional updates."""

import importlib.util
import os
import stat
import sys
import tempfile
import unittest
import zipfile
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PY_DIR = ROOT / "py"
sys.path.insert(0, str(PY_DIR))

import pack
import repair_update


def load_server():
    spec = importlib.util.spec_from_file_location("cross_platform_server", PY_DIR / "server.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


server = load_server()


class CrossPlatformTest(unittest.TestCase):
    def test_macos_wechat_container_discovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            account = (home / "Library" / "Containers" / "com.tencent.xinWeChat" / "Data" /
                       "Documents" / "xwechat_files" / "account-redacted")
            (account / "msg" / "file").mkdir(parents=True)
            group = home / "Library" / "Group Containers" / "TEAMID.com.tencent.xinWeChat"
            group.mkdir(parents=True)

            candidates = server.wechat_base_candidates(home, "darwin")
            self.assertIn(account.parent, candidates)
            self.assertIn(group, candidates)

            previous = server.WECHAT_BASE_CANDIDATES
            try:
                server.WECHAT_BASE_CANDIDATES = candidates
                self.assertEqual([str(account)], server.discover_wechat_accounts())
            finally:
                server.WECHAT_BASE_CANDIDATES = previous

    def test_platform_package_file_filter(self):
        files = ["py/server.py", "start.sh", "repair_update.bat", "启动作业追踪器.bat"]
        self.assertEqual(["py/server.py", "start.sh"], pack.files_for_platform(files, "darwin"))
        self.assertEqual(
            ["py/server.py", "repair_update.bat", "启动作业追踪器.bat"],
            pack.files_for_platform(files, "windows"),
        )

    def test_real_macos_package_excludes_windows_launchers(self):
        with tempfile.TemporaryDirectory() as tmp:
            previous_output = pack.PACK_CONFIG["output_dir"]
            pack.PACK_CONFIG["output_dir"] = tmp
            try:
                archive = pack.create_update_package(version="test", target_platform="darwin")
            finally:
                pack.PACK_CONFIG["output_dir"] = previous_output
            with zipfile.ZipFile(archive) as zf:
                names = set(zf.namelist())
                manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
            self.assertIn("start.sh", names)
            self.assertFalse({"repair_update.bat", "启动作业追踪器.bat", "更新修复工具.bat"} & names)
            self.assertEqual("darwin", manifest["platform"])

    def test_failure_injection_restores_existing_and_removes_new_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / "existing.txt").write_text("old", encoding="utf-8")
            archive = base / "update.zip"
            members = ["existing.txt", "new.txt", "failure.txt", "start.sh"]
            with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
                zf.writestr("existing.txt", "new-existing")
                zf.writestr("new.txt", "created-by-update")
                zf.writestr("failure.txt", "never-written")
                zf.writestr("start.sh", "#!/bin/bash\nexit 0\n")

            previous = (repair_update.BASE_DIR, repair_update.DATA_DIR, repair_update.BACKUP_DIR,
                        repair_update.LOG_DIR, repair_update.LOCK_PATH)
            repair_update.BASE_DIR = base
            repair_update.DATA_DIR = base / "data"
            repair_update.BACKUP_DIR = base / "backups"
            repair_update.LOG_DIR = base / "logs"
            repair_update.LOCK_PATH = repair_update.DATA_DIR / "server.lock"
            try:
                backup = repair_update.create_backup(members)

                def injected_writer(target, content, executable):
                    if Path(target).name == "failure.txt":
                        raise OSError("injected write failure")
                    repair_update._atomic_write(target, content, executable)

                with self.assertRaisesRegex(OSError, "injected write failure"):
                    repair_update.apply_update(archive, members, writer=injected_writer)
                repair_update.restore_backup(backup)

                self.assertEqual("old", (base / "existing.txt").read_text(encoding="utf-8"))
                self.assertFalse((base / "new.txt").exists())
                self.assertFalse((base / "failure.txt").exists())
                self.assertFalse((base / "start.sh").exists())
            finally:
                (repair_update.BASE_DIR, repair_update.DATA_DIR, repair_update.BACKUP_DIR,
                 repair_update.LOG_DIR, repair_update.LOCK_PATH) = previous

    @unittest.skipIf(os.name == "nt", "Unix executable mode assertion")
    def test_update_marks_start_script_executable(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "start.sh"
            repair_update._atomic_write(target, b"#!/bin/bash\n", executable=True)
            self.assertTrue(stat.S_IMODE(target.stat().st_mode) & stat.S_IXUSR)


if __name__ == "__main__":
    unittest.main(verbosity=2)
