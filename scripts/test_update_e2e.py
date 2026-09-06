"""Isolated end-to-end tests for update restart, port hand-off, and rollback."""

import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
import uuid
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_FILES = (
    "py/launcher.py", "py/server.py", "html/dashboard.html", "html/dashboard_modern.html",
    "html/static/classic.css", "html/static/classic.js", "html/static/modern.css",
    "html/static/modern.js",
)


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_json(url, timeout=30):
    deadline = time.monotonic() + timeout
    last_error = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last_error = exc
            time.sleep(0.15)
    raise AssertionError(f"endpoint did not become ready: {url}: {last_error}")


def wait_port_closed(port, timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with socket.socket() as sock:
            sock.settimeout(0.2)
            if sock.connect_ex(("127.0.0.1", port)) != 0:
                return
        time.sleep(0.1)
    raise AssertionError(f"port {port} remained open")


def multipart_update(url, archive):
    boundary = "----AssignmentDashboard" + uuid.uuid4().hex
    payload = archive.read_bytes()
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="update_zip"; filename="update.zip"\r\n'
        "Content-Type: application/zip\r\n\r\n"
    ).encode() + payload + f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        url, data=body, method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def json_post(url, payload):
    request = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


class UpdateE2ETest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name) / "install"
        shutil.copytree(
            ROOT, self.base,
            ignore=shutil.ignore_patterns(".git", "data", "backups", "logs", "releases", "__pycache__", "*.pyc"),
        )
        self.home = Path(self.temp.name) / "home"
        (self.home / "Desktop").mkdir(parents=True)
        self.port = free_port()
        self.env = os.environ.copy()
        self.env["HOME"] = str(self.home)
        self.processes = set()

    def tearDown(self):
        lock = self.base / "data" / "server.lock"
        if lock.exists():
            try:
                self.processes.add(int(json.loads(lock.read_text(encoding="utf-8")).get("pid", 0)))
            except Exception:
                pass
        for pid in self.processes:
            if not pid:
                continue
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        self.temp.cleanup()

    def start_server(self):
        log = (Path(self.temp.name) / "server.log").open("wb")
        proc = subprocess.Popen(
            [sys.executable, "-B", "-u", str(self.base / "py" / "server.py"),
             "--port", str(self.port), "--no-watch"],
            cwd=self.base, env=self.env, stdout=log, stderr=subprocess.STDOUT,
        )
        log.close()
        self.processes.add(proc.pid)
        wait_json(f"http://127.0.0.1:{self.port}/api/health")
        return proc

    def lock_pid(self):
        return int(json.loads((self.base / "data" / "server.lock").read_text(encoding="utf-8"))["pid"])

    def build_update(self, name, extra_entries):
        archive = Path(self.temp.name) / name
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
            for member in REQUIRED_FILES:
                zf.write(self.base / member, member)
            for member, content in extra_entries:
                zf.writestr(member, content)
            zf.writestr("manifest.json", json.dumps({
                "app": "Assignment_Dashboard", "version": "e2e", "platform": sys.platform,
            }))
        return archive

    def wait_for_new_pid(self, old_pid, timeout=35):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                pid = self.lock_pid()
                if pid != old_pid:
                    wait_json(f"http://127.0.0.1:{self.port}/api/health", timeout=5)
                    self.processes.add(pid)
                    return pid
            except Exception:
                pass
            time.sleep(0.15)
        raise AssertionError("server PID did not change after update")

    def test_online_update_restarts_and_failure_rolls_back(self):
        first = self.start_server()
        old_pid = self.lock_pid()
        archive = self.build_update("success.zip", [("e2e_marker.txt", "updated")])
        result = multipart_update(f"http://127.0.0.1:{self.port}/api/update", archive)
        self.assertTrue(result["ok"], result)
        new_pid = self.wait_for_new_pid(old_pid)
        self.assertNotEqual(old_pid, new_pid)
        self.assertEqual("updated", (self.base / "e2e_marker.txt").read_text(encoding="utf-8"))
        first.wait(timeout=10)

        (self.base / "blocked").write_text("keep", encoding="utf-8")
        failed = self.build_update(
            "failure.zip", [("rollback_new.txt", "must-be-removed"), ("blocked/child.txt", "trigger")],
        )
        failed_result = multipart_update(f"http://127.0.0.1:{self.port}/api/update", failed)
        self.assertFalse(failed_result["ok"], failed_result)
        self.assertFalse((self.base / "rollback_new.txt").exists())
        self.assertEqual("keep", (self.base / "blocked").read_text(encoding="utf-8"))
        self.assertEqual(new_pid, self.lock_pid())
        wait_json(f"http://127.0.0.1:{self.port}/api/health")

    def test_scan_directory_validation_and_capability_status(self):
        self.start_server()
        status = wait_json(f"http://127.0.0.1:{self.port}/api/status")
        self.assertIn("capabilities", status)
        self.assertIn("wechat_discovery", status)

        missing = json_post(
            f"http://127.0.0.1:{self.port}/api/scan-dirs/add",
            {"path": str(self.home / "does-not-exist")},
        )
        self.assertFalse(missing["ok"])
        self.assertIn("目录不存在", missing["msg"])

        valid = self.home / "manual-watch"
        valid.mkdir()
        added = json_post(
            f"http://127.0.0.1:{self.port}/api/scan-dirs/add", {"path": str(valid)},
        )
        self.assertTrue(added["ok"], added)

    def test_offline_update_stops_old_process_and_restarts(self):
        first = self.start_server()
        old_pid = self.lock_pid()
        archive = self.build_update("offline.zip", [("offline_marker.txt", "updated")])
        result = subprocess.run(
            [sys.executable, str(self.base / "py" / "repair_update.py"), str(archive),
             "--port", str(self.port)],
            cwd=self.base, env=self.env, capture_output=True, text=True, timeout=45,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        new_pid = self.wait_for_new_pid(old_pid)
        self.assertNotEqual(old_pid, new_pid)
        self.assertEqual("updated", (self.base / "offline_marker.txt").read_text(encoding="utf-8"))
        first.wait(timeout=10)

    @unittest.skipIf(os.name == "nt", "start.sh is for macOS/Linux")
    def test_start_script_ctrl_c_and_background_mode(self):
        foreground_log = (Path(self.temp.name) / "start-foreground.log").open("wb")
        foreground = subprocess.Popen(
            ["bash", str(self.base / "start.sh"), "--port", str(self.port), "--no-watch"],
            cwd=self.base, env=self.env, stdout=foreground_log, stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        foreground_log.close()
        self.processes.add(foreground.pid)
        wait_json(f"http://127.0.0.1:{self.port}/api/health")
        os.killpg(foreground.pid, signal.SIGINT)
        self.assertEqual(0, foreground.wait(timeout=15))
        wait_port_closed(self.port)

        self.port = free_port()
        launcher = subprocess.run(
            ["bash", str(self.base / "start.sh"), "--background", "--port", str(self.port), "--no-watch"],
            cwd=self.base, env=self.env, capture_output=True, text=True, timeout=15,
        )
        self.assertEqual(0, launcher.returncode, launcher.stdout + launcher.stderr)
        wait_json(f"http://127.0.0.1:{self.port}/api/health")
        worker_pid = int((self.base / "data" / "start-worker.pid").read_text(encoding="utf-8"))
        server_pid = self.lock_pid()
        self.processes.update((worker_pid, server_pid))
        self.assertNotEqual(worker_pid, server_pid)
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/api/server/shutdown", data=b"{}", method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            self.assertTrue(json.loads(response.read().decode("utf-8"))["ok"])
        wait_port_closed(self.port)


if __name__ == "__main__":
    unittest.main(verbosity=2)
