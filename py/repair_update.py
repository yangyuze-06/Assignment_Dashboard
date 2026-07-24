#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
离线更新修复工具。

用于 server.py 无法启动、浏览器系统更新入口打不开时，直接在安装目录
应用管理员生成的更新包。只依赖 Python 标准库，不导入项目内其他模块。
"""

import datetime
import json
import os
import shutil
import subprocess
import sys
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


def log(message):
    print(message)
    LOG_DIR.mkdir(exist_ok=True)
    log_path = LOG_DIR / "repair_update.log"
    with log_path.open("a", encoding="utf-8") as f:
        f.write(f"[{datetime.datetime.now().isoformat(timespec='seconds')}] {message}\n")


def normalize_member(name):
    name = str(name).replace("\\", "/").lstrip("/")
    parts = [p for p in name.split("/") if p not in ("", ".")]
    if not parts or any(p == ".." for p in parts):
        return None
    if Path(name).is_absolute() or (len(name) >= 2 and name[1] == ":"):
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
        return True
    except OSError:
        return False


def stop_running_server():
    if not LOCK_PATH.exists():
        return
    try:
        data = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
        pid = int(data.get("pid") or 0)
    except Exception:
        pid = 0

    if pid and process_is_running(pid):
        log(f"[INFO] 检测到旧服务进程 PID {pid}，准备停止。")
        try:
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], timeout=15)
            else:
                os.kill(pid, 15)
            log("[INFO] 旧服务进程已停止。")
        except Exception as e:
            log(f"[WARN] 停止旧服务失败，可手动关闭启动窗口后重试: {e}")
    try:
        LOCK_PATH.unlink(missing_ok=True)
    except Exception:
        pass


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

    with zipfile.ZipFile(backup_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in sorted(backup_names):
            safe = is_safe_member(name)
            if not safe:
                continue
            fp = BASE_DIR / safe
            if fp.exists() and fp.is_file():
                zf.write(fp, safe)
        if DATA_DIR.exists():
            for fp in DATA_DIR.rglob("*"):
                if fp.is_file():
                    zf.write(fp, str(fp.relative_to(BASE_DIR)).replace("\\", "/"))

    log(f"[INFO] 已创建离线更新备份: {backup_path}")
    return backup_path


def apply_update(zip_path, members):
    updated = []
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
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(zf.read(names_by_safe[member]))
            updated.append(member)
            log(f"[OK] 已更新: {member}")
    return updated


def restore_backup(backup_path):
    if not backup_path or not backup_path.exists():
        return
    log("[WARN] 更新失败，开始从备份恢复。")
    with zipfile.ZipFile(backup_path, "r") as zf:
        for raw in zf.namelist():
            safe = normalize_member(raw)
            if not safe:
                continue
            target = (BASE_DIR / safe).resolve()
            try:
                target.relative_to(BASE_DIR.resolve())
            except ValueError:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(zf.read(raw))
    log("[INFO] 已恢复备份。")


def ask_zip_path():
    if len(sys.argv) >= 2:
        return Path(" ".join(sys.argv[1:]).strip().strip('"'))
    print("")
    print("请把更新包 .zip 拖到这个窗口，然后按 Enter。")
    print("也可以直接输入更新包完整路径。")
    raw = input("更新包路径: ").strip().strip('"')
    return Path(raw)


def main():
    print("=" * 58)
    print("  微信作业追踪器 - 离线更新修复工具")
    print("=" * 58)
    print(f"安装目录: {BASE_DIR}")

    zip_path = ask_zip_path()
    backup_path = None
    try:
        log(f"[INFO] 准备应用更新包: {zip_path}")
        members = validate_zip(zip_path)
        log(f"[INFO] 更新包校验通过，可更新文件 {len(members)} 个。")
        stop_running_server()
        backup_path = create_backup(members)
        updated = apply_update(zip_path, members)
        log(f"[SUCCESS] 离线更新完成，共更新 {len(updated)} 个文件。")
        log("[INFO] 用户数据 data/ 已保留。请重新运行「启动作业追踪器.bat」。")
        return 0
    except Exception as e:
        log(f"[ERROR] 离线更新失败: {e}")
        try:
            restore_backup(backup_path)
        except Exception as restore_error:
            log(f"[ERROR] 自动恢复备份失败: {restore_error}")
        return 1
    finally:
        print("")
        try:
            input("按 Enter 关闭窗口...")
        except EOFError:
            pass


if __name__ == "__main__":
    sys.exit(main())
