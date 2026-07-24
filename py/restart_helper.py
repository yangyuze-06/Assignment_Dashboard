#!/usr/bin/env python3
"""Launch a fresh dashboard process after the previous HTTP listener is gone."""

import socket
import subprocess
import sys
import time


def port_is_listening(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.25)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def main():
    if "--" not in sys.argv:
        raise SystemExit("restart helper requires a server command")
    split_at = sys.argv.index("--")
    try:
        port = int(sys.argv[sys.argv.index("--port") + 1])
    except (ValueError, IndexError):
        raise SystemExit("restart helper requires --port")

    command = sys.argv[split_at + 1:]
    if not command:
        raise SystemExit("restart helper received an empty server command")

    deadline = time.monotonic() + 35
    attempts = 0
    while time.monotonic() < deadline:
        if port_is_listening(port):
            time.sleep(0.35)
            continue

        attempts += 1
        kwargs = {}
        if sys.platform == "win32":
            kwargs["creationflags"] = subprocess.CREATE_NEW_CONSOLE
        proc = subprocess.Popen(command, **kwargs)

        # server.py binds its HTTP port before starting file scans. A living
        # child after this grace period is a successful hand-off.
        for _ in range(8):
            time.sleep(0.25)
            if proc.poll() is not None:
                break
            if port_is_listening(port):
                return
        if proc.poll() is None:
            return
        time.sleep(min(0.5 * attempts, 2.0))

    raise SystemExit("dashboard restart timed out before a new server could start")


if __name__ == "__main__":
    main()
