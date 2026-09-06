"""Regression tests for safe preview conversion and startup warmup."""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "py"))
import server


class PreviewWarmupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.original_submissions_path = server.SUBMISSIONS_PATH
        self.original_cache_dir = server.PREVIEW_CACHE_DIR
        server.SUBMISSIONS_PATH = self.root / "submissions.json"
        server.PREVIEW_CACHE_DIR = self.root / "cache"

    def tearDown(self):
        server.SUBMISSIONS_PATH = self.original_submissions_path
        server.PREVIEW_CACHE_DIR = self.original_cache_dir
        self.tmp.cleanup()

    def make_file(self, relative):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"test")
        return path

    def test_warmup_is_disabled_by_default(self):
        self.assertFalse(server.default_config()["preview_warmup_enabled"])
        self.assertEqual(server.default_config()["preview_conversion_timeout"], 45)
        self.assertEqual(server.default_config()["preview_warmup_limit"], 20)

    def test_collection_uses_dashboard_files_not_wechat_history(self):
        organized = self.make_file("organized/a.docx")
        public = self.make_file("public/b.doc")
        submission = self.make_file("incoming/c.docx")
        self.make_file("wechat-history/old.docx")
        server.save_json(server.SUBMISSIONS_PATH, {
            "a1": [{"organized_to": str(organized), "file": {"path": str(submission)}}]
        })
        cfg = server.default_config()
        cfg.update({
            "organized_dir": str(organized.parent),
            "experiment_enabled": True,
            "experiment_dir": str(public.parent),
            "scan_dirs": [str(self.root / "wechat-history")],
        })

        result = server._collect_preview_warmup_files(cfg)

        self.assertEqual(set(result), {organized.resolve(), public.resolve(), submission.resolve()})

    def test_warmup_reuses_normal_preview_queue(self):
        source = self.make_file("organized/a.docx")
        server._preview_jobs.clear()
        server._warmup_state.update({"ready": 0, "failed": 0})
        def queue_ready(src):
            server._preview_jobs["job-1"] = {
                "job_id": "job-1", "path": str(src), "status": "ready"
            }
            return "job-1", {"job_id": "job-1", "path": str(src), "status": "queued"}
        with mock.patch.object(server, "_collect_preview_warmup_files", return_value=[source]), \
             mock.patch.object(server, "_preview_cache_path", return_value=self.root / "missing.pdf"), \
             mock.patch.object(server, "_queue_preview_job") as queue_job:
            queue_job.side_effect = queue_ready
            server._warm_preview_cache_worker()

        self.assertEqual(queue_job.call_count, 1)
        self.assertEqual(server._warmup_state["status"], "complete")
        self.assertEqual(server._warmup_state["ready"], 1)
        self.assertEqual(server._warmup_state["failed"], 0)

    def test_isolated_conversion_timeout_terminates_process(self):
        source = self.make_file("source.docx")
        target = self.root / "target.pdf"
        process = mock.Mock(pid=4321, returncode=None)
        process.communicate.side_effect = [subprocess.TimeoutExpired("preview", 1), ("", "")]
        process.poll.return_value = None
        with mock.patch.object(server.subprocess, "Popen", return_value=process), \
             mock.patch.object(server, "_terminate_process_tree") as terminate:
            ok, error = server._convert_word_isolated(source, target, timeout=15)

        self.assertFalse(ok)
        self.assertIn("已终止", error)
        terminate.assert_called_once_with(process)

    def test_converter_command_uses_hidden_child_entrypoint(self):
        command = server._preview_converter_command("a.docx", "a.pdf")
        self.assertIn("--preview-convert", command)
        self.assertEqual(command[-2:], ["a.docx", "a.pdf"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
