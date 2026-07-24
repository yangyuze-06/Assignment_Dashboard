"""Regression tests for local-only and authenticated LAN access."""

import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "py"))
import server


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class RemoteHandler(server.APIHandler):
    def _request_is_local(self):
        return False

    def log_message(self, _format, *_args):
        pass


class LocalHandler(RemoteHandler):
    def _request_is_local(self):
        return True


class NetworkAccessTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.original_config_path = server.CONFIG_PATH
        server.CONFIG_PATH = Path(self.tmp.name) / "config.json"
        cfg = server.default_config()
        cfg.update({"lan_access_enabled": True, "lan_access_token": "test-access-code"})
        server.save_json(server.CONFIG_PATH, cfg)
        self.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), RemoteHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=2)
        server.CONFIG_PATH = self.original_config_path
        self.tmp.cleanup()

    def request(self, path, method="GET", data=None, headers=None, opener=None):
        body = json.dumps(data).encode("utf-8") if data is not None else None
        req_headers = {"Content-Type": "application/json", **(headers or {})}
        req = urllib.request.Request(self.base + path, data=body, method=method, headers=req_headers)
        if opener:
            return opener.open(req, timeout=5)
        return urllib.request.urlopen(req, timeout=5)

    def test_defaults_to_local_only(self):
        self.assertFalse(server.default_config()["lan_access_enabled"])

    def test_loopback_detection(self):
        self.assertTrue(server._is_loopback_ip("127.0.0.1"))
        self.assertTrue(server._is_loopback_ip("::1"))
        self.assertFalse(server._is_loopback_ip("192.168.1.20"))

    def test_remote_api_requires_authentication(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request("/api/network-access")
        self.assertEqual(ctx.exception.code, 401)
        self.assertIsNone(ctx.exception.headers.get("Access-Control-Allow-Origin"))

    def test_remote_page_redirects_to_login(self):
        opener = urllib.request.build_opener(NoRedirect())
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request("/", opener=opener)
        self.assertEqual(ctx.exception.code, 302)
        self.assertEqual(ctx.exception.headers.get("Location"), "/lan-login")

    def test_correct_token_creates_session_but_hides_token(self):
        response = self.request("/api/lan-auth", method="POST", data={"token": "test-access-code"})
        cookie = response.headers.get("Set-Cookie")
        self.assertIn(server.LAN_SESSION_COOKIE, cookie)
        response = self.request("/api/network-access", headers={"Cookie": cookie.split(";", 1)[0]})
        payload = json.loads(response.read().decode("utf-8"))
        self.assertTrue(payload["enabled"])
        self.assertFalse(payload["is_local_request"])
        self.assertNotIn("access_token", payload)

    def test_wrong_token_is_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request("/api/lan-auth", method="POST", data={"token": "wrong"})
        self.assertEqual(ctx.exception.code, 401)

    def test_authenticated_remote_cannot_change_mode(self):
        response = self.request("/api/lan-auth", method="POST", data={"token": "test-access-code"})
        cookie = response.headers.get("Set-Cookie").split(";", 1)[0]
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request("/api/network-access/configure", method="POST", data={"enabled": False},
                         headers={"Cookie": cookie})
        self.assertEqual(ctx.exception.code, 403)

    def test_local_user_can_change_mode_and_receive_token(self):
        local_httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), LocalHandler)
        thread = threading.Thread(target=local_httpd.serve_forever, daemon=True)
        original_restart = server._restart_after_delay
        server._restart_after_delay = lambda: None
        thread.start()
        try:
            url = f"http://127.0.0.1:{local_httpd.server_address[1]}/api/network-access/configure"
            body = json.dumps({"enabled": True, "regenerate_token": True}).encode("utf-8")
            request = urllib.request.Request(url, data=body, method="POST",
                                             headers={"Content-Type": "application/json"})
            response = urllib.request.urlopen(request, timeout=5)
            payload = json.loads(response.read().decode("utf-8"))
            self.assertTrue(payload["enabled"])
            self.assertTrue(payload["is_local_request"])
            self.assertTrue(payload["access_token"])
        finally:
            local_httpd.shutdown()
            local_httpd.server_close()
            thread.join(timeout=2)
            server._restart_after_delay = original_restart

    def test_cross_origin_post_is_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request("/api/lan-auth", method="POST", data={"token": "test-access-code"},
                         headers={"Origin": "http://evil.example"})
        self.assertEqual(ctx.exception.code, 403)


if __name__ == "__main__":
    unittest.main(verbosity=2)
