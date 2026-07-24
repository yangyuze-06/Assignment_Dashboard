#!/usr/bin/env python3
"""Compatibility launcher used by update packages created for older installs."""

import runpy
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE if (HERE / "py" / "server.py").is_file() else HERE.parent
PY_DIR = PROJECT_ROOT / "py"


if __name__ == "__main__":
    sys.path.insert(0, str(PY_DIR))
    runpy.run_path(str(PY_DIR / "server.py"), run_name="__main__")
