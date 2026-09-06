#!/usr/bin/env python3
"""Launch a fresh dashboard process after the previous HTTP listener is gone."""

import os
import socket
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
import zipfile
from pathlib import Path


def port_is_listening(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.25)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def health_is_ready(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=0.75) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


def _option_value(args, name):
    try:
        return args[args.index(name) + 1]
    except (ValueError, IndexError):
        return None


def _option_values(args, name):
    return [args[index + 1] for index, value in enumerate(args[:-1]) if value == name]


def _normalize_member(name):
    name = str(name or "").replace("\\", "/")
    if name.startswith("/") or (len(name) >= 2 and name[1] == ":"):
        return ""
    parts = [part for part in name.split("/") if part not in ("", ".")]
    if not parts or any(part == ".." for part in parts):
        return ""
    return "/".join(parts)


def _atomic_write(target, content):
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    old_mode = stat.S_IMODE(target.stat().st_mode) if target.exists() else None
    temp_target = target.with_name(f".{target.name}.{uuid.uuid4().hex}.rollback-tmp")
    try:
        temp_target.write_bytes(content)
        if old_mode is not None:
            temp_target.chmod(old_mode)
        os.replace(temp_target, target)
    finally:
        try:
            temp_target.unlink()
        except OSError:
            pass


def restore_backup(base_dir, backup_path, created_files):
    base_dir = Path(base_dir).resolve()
    backup_path = Path(backup_path).resolve()
    backup_path.relative_to(base_dir)
    if not backup_path.is_file():
        raise RuntimeError(f"update backup is missing: {backup_path}")

    for name in created_files:
        member = _normalize_member(name)
        if not member:
            continue
        target = (base_dir / member).resolve()
        try:
            target.relative_to(base_dir)
            if target.is_file() or target.is_symlink():
                target.unlink()
        except (OSError, ValueError):
            pass

    with zipfile.ZipFile(backup_path, "r") as archive:
        for raw_name in archive.namelist():
            if raw_name.endswith("/"):
                continue
            member = _normalize_member(raw_name)
            if not member or member == "data/server.lock":
                continue
            target = (base_dir / member).resolve()
            target.relative_to(base_dir)
            _atomic_write(target, archive.read(raw_name))

    try:
        (base_dir / "data" / "server.lock").unlink()
    except OSError:
        pass


def _terminate_process(proc):
    if not proc or proc.poll() is not None:
        return
    try:
        proc.terminate()
        proc.wait(timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        try:
            proc.kill()
        except OSError:
            pass


def launch_until_ready(command, port, deadline):
    attempts = 0
    last_proc = None
    child_env = os.environ.copy()
    child_env["PYTHONUTF8"] = "1"
    child_env["PYTHONIOENCODING"] = "utf-8"

    while time.monotonic() < deadline:
        if port_is_listening(port):
            time.sleep(0.35)
            continue

        attempts += 1
        kwargs = {"env": child_env}
        if sys.platform == "win32":
            kwargs["creationflags"] = subprocess.CREATE_NEW_CONSOLE
        else:
            kwargs["start_new_session"] = True
        last_proc = subprocess.Popen(command, **kwargs)

        ready_deadline = min(deadline, time.monotonic() + 15)
        while time.monotonic() < ready_deadline:
            time.sleep(0.25)
            if health_is_ready(port):
                return last_proc
            if last_proc.poll() is not None:
                break
        _terminate_process(last_proc)
        time.sleep(min(0.5 * attempts, 2.0))

    return None


def main():
    if "--" not in sys.argv:
        raise SystemExit("restart helper requires a server command")
    split_at = sys.argv.index("--")
    options = sys.argv[1:split_at]
    try:
        port = int(_option_value(options, "--port"))
    except (TypeError, ValueError):
        raise SystemExit("restart helper requires --port")

    command = sys.argv[split_at + 1:]
    if not command:
        raise SystemExit("restart helper received an empty server command")

    backup_path = _option_value(options, "--backup")
    base_dir = _option_value(options, "--base-dir")
    created_files = _option_values(options, "--created")

    try:
        proc = launch_until_ready(command, port, time.monotonic() + 35)
        if proc:
            return

        if not backup_path or not base_dir:
            raise SystemExit("dashboard restart timed out before a new server could start")

        restore_backup(base_dir, backup_path, created_files)
        proc = launch_until_ready(command, port, time.monotonic() + 25)
        if not proc:
            raise SystemExit("dashboard rollback completed, but the previous version did not restart")
    finally:
        if backup_path:
            try:
                Path(__file__).unlink()
            except OSError:
                pass


if __name__ == "__main__":
    main()
