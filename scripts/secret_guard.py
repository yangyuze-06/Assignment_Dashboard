#!/usr/bin/env python3
"""Block accidental commits of API tokens and private credentials.

Default mode scans staged files, which is what the pre-commit hook needs.
Use --all to scan the current working tree manually.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

BINARY_SUFFIXES = {
    ".7z",
    ".bmp",
    ".dll",
    ".doc",
    ".docx",
    ".exe",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".pdf",
    ".png",
    ".pyc",
    ".rar",
    ".webp",
    ".xls",
    ".xlsx",
    ".zip",
}

SKIP_DIRS = {
    ".git",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "organized_files",
    "homework",
}

PATTERNS = [
    ("GitHub personal access token", re.compile(r"\b(?:ghp|github_pat|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b")),
    ("OpenAI API key", re.compile(r"\bsk-[A-Za-z0-9_-]{32,}\b")),
    ("generic bearer token", re.compile(r"Authorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]{24,}", re.I)),
    ("hardcoded token assignment", re.compile(r"\b(?:api[_-]?key|access[_-]?token|secret|password|passwd)\b\s*[:=]\s*['\"][^'\"\s]{16,}['\"]", re.I)),
]


def run_git(args: list[str]) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True, encoding="utf-8", errors="replace")


def run_git_paths(args: list[str]) -> list[str]:
    output = subprocess.check_output(["git", *args, "-z"], cwd=ROOT)
    return [item.decode("utf-8", errors="replace") for item in output.split(b"\0") if item]


def is_scannable(path: str) -> bool:
    parts = Path(path).parts
    if any(part in SKIP_DIRS for part in parts):
        return False
    return Path(path).suffix.lower() not in BINARY_SUFFIXES


def staged_files() -> list[str]:
    paths = run_git_paths(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
    return [path for path in paths if is_scannable(path)]


def all_files() -> list[str]:
    paths = run_git_paths(["ls-files", "-co", "--exclude-standard"])
    return [path for path in paths if is_scannable(path)]


def read_staged(path: str) -> str:
    try:
        return run_git(["show", f":{path}"])
    except subprocess.CalledProcessError:
        return ""


def read_worktree(path: str) -> str:
    full = ROOT / path
    try:
        return full.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def line_number(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


def scan(paths: list[str], staged: bool) -> list[tuple[str, int, str]]:
    findings: list[tuple[str, int, str]] = []
    reader = read_staged if staged else read_worktree
    for path in paths:
        text = reader(path)
        if not text:
            continue
        for label, pattern in PATTERNS:
            for match in pattern.finditer(text):
                findings.append((path, line_number(text, match.start()), label))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan repository files for committed secrets.")
    parser.add_argument("--all", action="store_true", help="scan all tracked/untracked text files instead of staged files")
    args = parser.parse_args()

    try:
      paths = all_files() if args.all else staged_files()
    except subprocess.CalledProcessError as exc:
      print(f"[secret-guard] git failed: {exc}", file=sys.stderr)
      return 2

    findings = scan(paths, staged=not args.all)
    if not findings:
        print(f"[secret-guard] OK: scanned {len(paths)} file(s).")
        return 0

    print("[secret-guard] BLOCKED: possible secret(s) detected:", file=sys.stderr)
    for path, line, label in findings[:50]:
        print(f"  - {path}:{line}  {label}", file=sys.stderr)
    if len(findings) > 50:
        print(f"  ... and {len(findings) - 50} more", file=sys.stderr)
    print("\nRemove the secret, rotate it if it was real, then commit again.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
