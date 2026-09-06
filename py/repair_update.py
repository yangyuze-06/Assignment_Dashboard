#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
离线更新修复工具。

用于 server.py 无法启动、浏览器系统更新入口打不开时，直接在安装目录
应用管理员生成的更新包。只依赖 Python 标准库，不导入项目内其他模块。
"""

import datetime
import argparse
import json
import os
import shutil
import socket
import stat
import subprocess
import sys
import time
import zipfile
from pathlib import Path


PY_DIR = Path(__file__).resolve().parent
BASE_DIR = PY_DIR.parent
DATA_DIR = BASE_DIR / "data"
LOCK_PATH = DATA_DIR / "server.lock"
BACKUP_DIR = BASE_DIR / "backups"
LOG_DIR = BASE_DIR / "logs"

REQUIRED_FILES = (
    "py/launcher.py",
    "py/server.py",
    "html/dashboard.html",
    "html/dashboard_modern.html",
    "html/static/classic.css",
    "html/static/classic.js",
    "html/static/modern.css",
    "html/static/modern.js",
)
COMMON_BACKUP_FILES = (
    "py/launcher.py",
    "py/server.py",
    "py/ai_classifier.py",
    "py/classifier_features.py",
    "py/classifier_trainer.py",
    "py/restart_helper.py",
    "html/dashboard.html",
    "html/dashboard_modern.html",
    "html/static/classic.css",
    "html/static/classic.js",
    "html/static/modern.css",
    "html/static/modern.js",
    "py/pack.py",
    "py/repair_update.py",
    "requirements.txt",
    "启动作业追踪器.bat",
    "更新修复工具.bat",
    "start.sh",
    "CHANGELOG.md",
    "announcement.json",
    "manifest.json",
)
SKIP_PREFIXES = ("data/", "backups/", "releases/", "output/", ".git/", "__pycache__/")
JOURNAL_MEMBER = ".assignment_dashboard_update_journal.json"


def log(message):
    print(message)
    LOG_DIR.mkdir(exist_ok=True)
    log_path = LOG_DIR / "repair_update.log"
    with log_path.open("a", encoding="utf-8") as f:
        f.write(f"[{datetime.datetime.now().isoformat(timespec='seconds')}] {message}\n")


def normalize_member(name):
    name = str(name).replace("\\", "/")
    if name.startswith("/") or (len(name) >= 2 and name[1] == ":"):
        return None
    parts = [p for p in name.split("/") if p not in ("", ".")]
    if not parts or any(p == ".." for p in parts):
        return None
    return "/".join(parts)


def is_safe_member(name):
    member = normalize_member(name)
    if not member:
        return None
    lower = member.lower()
    if any(lower.startswith(prefix) for prefix in SKIP_PREFIXES):
        return None
    return member


def platform_matches(target, current=None):
    target = str(target or "").lower()
    current = str(current or sys.platform).lower()
    if not target or target in ("all", "universal"):
        return True
    if target in ("windows", "win32"):
        return current.startswith("win")
    if target in ("macos", "darwin"):
        return current == "darwin"
    if target.startswith("linux"):
        return current.startswith("linux")
    return target == current


def process_is_running(pid):
    if not pid:
        return False
    if sys.platform == "win32":
        try:
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            return str(pid) in result.stdout
        except Exception:
            return False
    try:
        os.kill(pid, 0)
        try:
            state = subprocess.run(
                ["ps", "-o", "stat=", "-p", str(pid)], capture_output=True, text=True, timeout=2
            ).stdout.strip()
            if state.startswith("Z"):
                return False
        except Exception:
            pass
        return True
    except OSError:
        return False


def wait_for_process_exit(pid, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not process_is_running(pid):
            return True
        time.sleep(0.1)
    return not process_is_running(pid)


def stop_running_server():
    if not LOCK_PATH.exists():
        return None, False
    try:
        data = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
        pid = int(data.get("pid") or 0)
        port = int(data.get("port") or 0) or None
    except Exception:
        pid = 0
        port = None

    was_running = bool(pid and process_is_running(pid))
    if was_running:
        log(f"[INFO] 检测到旧服务进程 PID {pid}，准备停止。")
        try:
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], timeout=15)
            else:
                os.kill(pid, 15)
            if not wait_for_process_exit(pid, timeout=10):
                if sys.platform == "win32":
                    subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], timeout=15)
                else:
                    os.kill(pid, 9)
                if not wait_for_process_exit(pid, timeout=5):
                    raise RuntimeError(f"旧服务进程 PID {pid} 未能退出")
            log("[INFO] 旧服务进程已停止，端口可以安全交接。")
        except Exception as e:
            raise RuntimeError(f"停止旧服务失败，请手动关闭后重试: {e}") from e
    try:
        LOCK_PATH.unlink(missing_ok=True)
    except Exception:
        pass
    return port, was_running


def validate_zip(zip_path):
    if not zip_path.exists() or not zip_path.is_file():
        raise ValueError(f"更新包不存在: {zip_path}")
    if zip_path.suffix.lower() != ".zip":
        raise ValueError("请选择 .zip 更新包")

    with zipfile.ZipFile(zip_path, "r") as zf:
        bad = zf.testzip()
        if bad:
            raise ValueError(f"更新包损坏: {bad}")
        raw_names = zf.namelist()
        if "manifest.json" in raw_names:
            try:
                manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
            except (ValueError, UnicodeDecodeError) as exc:
                raise ValueError(f"manifest.json 无效: {exc}") from exc
            if not platform_matches(manifest.get("platform")):
                raise ValueError(f"更新包目标平台不匹配: {manifest.get('platform')}")

    members = []
    for name in raw_names:
        if name.endswith("/"):
            continue
        safe = is_safe_member(name)
        if safe:
            members.append(safe)

    missing = [f for f in REQUIRED_FILES if f not in members]
    if missing:
        raise ValueError(f"更新包缺少关键文件: {', '.join(missing)}")

    return members


def create_backup(update_members):
    BACKUP_DIR.mkdir(exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = BACKUP_DIR / f"offline_repair_backup_{timestamp}.zip"

    backup_names = set(COMMON_BACKUP_FILES)
    backup_names.update(update_members)
    existing_members = []

    with zipfile.ZipFile(backup_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in sorted(backup_names):
            safe = is_safe_member(name)
            if not safe:
                continue
            fp = BASE_DIR / safe
            if fp.exists() and fp.is_file():
                zf.write(fp, safe)
                if safe in update_members:
                    existing_members.append(safe)
        if DATA_DIR.exists():
            for fp in DATA_DIR.rglob("*"):
                if fp.is_file():
                    zf.write(fp, str(fp.relative_to(BASE_DIR)).replace("\\", "/"))
        journal = {"update_members": list(update_members), "existing_members": existing_members}
        zf.writestr(JOURNAL_MEMBER, json.dumps(journal, ensure_ascii=False, indent=2))

    log(f"[INFO] 已创建离线更新备份: {backup_path}")
    return backup_path


def _atomic_write(target, content, executable=False):
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    old_mode = stat.S_IMODE(target.stat().st_mode) if target.exists() else None
    temp_target = target.with_name(f".{target.name}.{os.getpid()}.update-tmp")
    try:
        temp_target.write_bytes(content)
        if executable:
            temp_target.chmod((old_mode or 0o644) | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        elif old_mode is not None:
            temp_target.chmod(old_mode)
        os.replace(temp_target, target)
    finally:
        try:
            temp_target.unlink()
        except OSError:
            pass


def apply_update(zip_path, members, writer=None):
    updated = []
    writer = writer or _atomic_write
    with zipfile.ZipFile(zip_path, "r") as zf:
        names_by_safe = {}
        for raw in zf.namelist():
            safe = is_safe_member(raw)
            if safe:
                names_by_safe[safe] = raw

        for member in members:
            target = (BASE_DIR / member).resolve()
            try:
                target.relative_to(BASE_DIR.resolve())
            except ValueError:
                log(f"[WARN] 跳过越界路径: {member}")
                continue
            writer(target, zf.read(names_by_safe[member]), member.endswith(".sh"))
            updated.append(member)
            log(f"[OK] 已更新: {member}")
    return updated


def restore_backup(backup_path):
    if not backup_path or not backup_path.exists():
        return
    log("[WARN] 更新失败，开始从备份恢复。")
    with zipfile.ZipFile(backup_path, "r") as zf:
        try:
            journal = json.loads(zf.read(JOURNAL_MEMBER).decode("utf-8"))
        except (KeyError, ValueError, UnicodeDecodeError):
            journal = {}
        existing = set(journal.get("existing_members", []))
        for name in journal.get("update_members", []):
            safe = is_safe_member(name)
            if not safe or safe in existing:
                continue
            target = (BASE_DIR / safe).resolve()
            try:
                target.relative_to(BASE_DIR.resolve())
                if target.is_file() or target.is_symlink():
                    target.unlink()
            except (OSError, ValueError):
                pass
        for raw in zf.namelist():
            if raw == JOURNAL_MEMBER:
                continue
            safe = normalize_member(raw)
            if not safe:
                continue
            target = (BASE_DIR / safe).resolve()
            try:
                target.relative_to(BASE_DIR.resolve())
            except ValueError:
                continue
            _atomic_write(target, zf.read(raw), safe.endswith(".sh"))
    log("[INFO] 已恢复备份。")


def ask_zip_path():
    print("")
    print("请把更新包 .zip 拖到这个窗口，然后按 Enter。")
    print("也可以直接输入更新包完整路径。")
    raw = input("更新包路径: ").strip().strip('"')
    return Path(raw)


def port_is_listening(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.25)
        return sock.connect_ex(("127.0.0.1", int(port))) == 0


def launch_dashboard(port=18765, timeout=20):
    server_path = BASE_DIR / "py" / "server.py"
    if not server_path.is_file():
        raise RuntimeError("更新后缺少 py/server.py")
    LOG_DIR.mkdir(exist_ok=True)
    log_path = LOG_DIR / "dashboard.log"
    command = [sys.executable, "-B", "-u", str(server_path), "--port", str(port)]
    kwargs = {"cwd": str(BASE_DIR)}
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
    else:
        kwargs["start_new_session"] = True
    with log_path.open("ab") as output:
        proc = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT,
                                **kwargs)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if port_is_listening(port):
            log(f"[INFO] 新服务已启动，PID {proc.pid}，端口 {port}。")
            return proc.pid
        code = proc.poll()
        if code is not None:
            raise RuntimeError(f"新服务启动失败，退出码 {code}，请查看 {log_path}")
        time.sleep(0.2)
    try:
        proc.terminate()
    except OSError:
        pass
    raise RuntimeError(f"新服务启动超时，端口 {port} 未就绪，请查看 {log_path}")


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="作业追踪器离线更新修复工具")
    parser.add_argument("zip_path", nargs="?", help="更新包 ZIP 路径")
    parser.add_argument("--port", type=int, help="重启服务使用的端口（默认沿用旧服务或 18765）")
    parser.add_argument("--no-restart", action="store_true", help="更新后不自动重启服务")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    print("=" * 58)
    print("  微信作业追踪器 - 离线更新修复工具")
    print("=" * 58)
    print(f"安装目录: {BASE_DIR}")

    zip_path = Path(args.zip_path.strip().strip('"')) if args.zip_path else ask_zip_path()
    backup_path = None
    restart_port = args.port or 18765
    server_was_running = False
    try:
        log(f"[INFO] 准备应用更新包: {zip_path}")
        members = validate_zip(zip_path)
        log(f"[INFO] 更新包校验通过，可更新文件 {len(members)} 个。")
        detected_port, server_was_running = stop_running_server()
        restart_port = args.port or detected_port or 18765
        backup_path = create_backup(members)
        updated = apply_update(zip_path, members)
        log(f"[SUCCESS] 离线更新完成，共更新 {len(updated)} 个文件。")
        if args.no_restart:
            launcher = "启动作业追踪器.bat" if sys.platform == "win32" else "./start.sh"
            log(f"[INFO] 用户数据 data/ 已保留。请运行 {launcher} 启动服务。")
        else:
            launch_dashboard(restart_port)
        return 0
    except Exception as e:
        log(f"[ERROR] 离线更新失败: {e}")
        try:
            restore_backup(backup_path)
        except Exception as restore_error:
            log(f"[ERROR] 自动恢复备份失败: {restore_error}")
        if server_was_running and not args.no_restart:
            try:
                launch_dashboard(restart_port)
                log("[INFO] 已使用恢复后的旧版本重新启动服务。")
            except Exception as restart_error:
                log(f"[ERROR] 恢复后服务仍无法启动: {restart_error}")
        return 1
    finally:
        if sys.platform == "win32" and sys.stdin.isatty():
            print("")
            try:
                input("按 Enter 关闭窗口...")
            except EOFError:
                pass


if __name__ == "__main__":
    sys.exit(main())
