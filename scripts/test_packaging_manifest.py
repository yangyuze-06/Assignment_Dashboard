"""Regression tests for files required by installers and update packages."""

import ast
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PY_DIR = ROOT / "py"
sys.path.insert(0, str(PY_DIR))

import pack
import repair_update


RUNTIME_FILES = {
    "py/launcher.py",
    "py/server.py",
    "py/ai_classifier.py",
    "py/restart_helper.py",
    "html/dashboard.html",
    "html/dashboard_modern.html",
    "html/static/classic.css",
    "html/static/classic.js",
    "html/static/modern.css",
    "html/static/modern.js",
}


def literal_assignment(path, name):
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in tree.body:
        if not isinstance(node, (ast.Assign, ast.AnnAssign)):
            continue
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        if any(isinstance(target, ast.Name) and target.id == name for target in targets):
            return ast.literal_eval(node.value)
    raise AssertionError(f"{name} not found in {path.name}")


def spec_data_files(path):
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name):
            continue
        if node.func.id != "Analysis":
            continue
        datas = next(keyword.value for keyword in node.keywords if keyword.arg == "datas")
        return {source for source, _destination in ast.literal_eval(datas)}
    raise AssertionError(f"Analysis(datas=...) not found in {path.name}")


class PackagingManifestTest(unittest.TestCase):
    def test_runtime_files_exist(self):
        self.assertEqual([], sorted(name for name in RUNTIME_FILES if not (ROOT / name).is_file()))

    def test_installer_contains_runtime_files(self):
        install_files = set(literal_assignment(PY_DIR / "installer.py", "INSTALL_FILES"))
        self.assertTrue(RUNTIME_FILES <= install_files)
        self.assertTrue(install_files <= spec_data_files(ROOT / "微信作业追踪器_安装向导.spec"))

    def test_update_package_contains_runtime_files(self):
        config = literal_assignment(PY_DIR / "pack.py", "PACK_CONFIG")
        self.assertTrue(RUNTIME_FILES <= set(config["include_files"]))

    def test_update_backup_contains_runtime_files(self):
        backup_files = set(literal_assignment(PY_DIR / "repair_update.py", "COMMON_BACKUP_FILES"))
        self.assertTrue(RUNTIME_FILES <= backup_files)
        required_files = set(literal_assignment(PY_DIR / "repair_update.py", "REQUIRED_FILES"))
        update_required = RUNTIME_FILES - {"py/ai_classifier.py", "py/restart_helper.py"}
        self.assertTrue(update_required <= required_files)

    def test_update_validators_and_bugfix_builder_use_the_same_required_files(self):
        pack_required = set(literal_assignment(PY_DIR / "pack.py", "BUGFIX_REQUIRED_FILES"))
        server_required = set(literal_assignment(PY_DIR / "server.py", "UPDATE_REQUIRED_FILES"))
        repair_required = set(literal_assignment(PY_DIR / "repair_update.py", "REQUIRED_FILES"))
        self.assertEqual(repair_required, pack_required)
        self.assertEqual(repair_required, server_required)

    def test_pack_builders_use_the_same_legacy_aliases(self):
        pack_aliases = literal_assignment(PY_DIR / "pack.py", "LEGACY_UPDATE_ALIASES")
        server_aliases = literal_assignment(PY_DIR / "server.py", "LEGACY_UPDATE_ALIASES")
        self.assertEqual(pack_aliases, server_aliases)

    def test_bugfix_package_passes_offline_validation(self):
        with tempfile.TemporaryDirectory() as tmp:
            previous_output_dir = pack.PACK_CONFIG["output_dir"]
            pack.PACK_CONFIG["output_dir"] = tmp
            try:
                archive = pack.create_bugfix_package(
                    ["py/server.py", "html/dashboard.html"], version="test"
                )
                members = set(repair_update.validate_zip(Path(archive)))
                install_dir = Path(tmp) / "install"
                with zipfile.ZipFile(archive) as zf:
                    zf.extractall(install_dir)
                launch = subprocess.run(
                    [sys.executable, "server.py", "--help"],
                    cwd=install_dir,
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
            finally:
                pack.PACK_CONFIG["output_dir"] = previous_output_dir
        required_files = set(literal_assignment(PY_DIR / "repair_update.py", "REQUIRED_FILES"))
        self.assertTrue(required_files <= members)
        legacy_files = set(literal_assignment(PY_DIR / "pack.py", "LEGACY_UPDATE_ALIASES"))
        self.assertTrue(legacy_files <= members)
        self.assertEqual(0, launch.returncode, launch.stderr)
        self.assertIn("作业提交追踪器", launch.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
