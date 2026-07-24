"""Regression coverage for the two-stage subject/assignment classifier.

The fixture files live in a temporary directory. File organization is stubbed,
so this test never writes to a user's class, public, or WeChat folders.
"""

import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "py"))
import server


SUBJECT_DIGITAL = "\u6570\u5b57\u7535\u5b50\u6280\u672f"
SUBJECT_CONTROL = "\u81ea\u52a8\u63a7\u5236\u539f\u7406"
STUDENT = "\u5f20\u4e09"


def assignments():
    return [
        {
            "id": "digital-1",
            "name": "\u7b2c\u4e00\u6b21\u5b9e\u9a8c",
            "subject_group": SUBJECT_DIGITAL,
            "experiment": "\u7b2c\u4e00\u6b21",
            "keywords": ["\u6570\u7535", "\u7b2c\u4e00\u6b21", "\u5b9e\u9a8c"],
            "active": True,
        },
        {
            "id": "control-1",
            "name": "\u7b2c\u4e00\u6b21\u5b9e\u9a8c",
            "subject_group": SUBJECT_CONTROL,
            "experiment": "\u7b2c\u4e00\u6b21",
            "keywords": ["\u81ea\u63a7", "\u7b2c\u4e00\u6b21", "\u5b9e\u9a8c"],
            "active": True,
        },
    ]


class TwoStageClassificationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.calls = []
        self.original_organize = server.organize_file
        server.organize_file = self._record_organize
        self.original_experiment_base = server.EXPERIMENT_BASE

    def tearDown(self):
        server.organize_file = self.original_organize
        server.EXPERIMENT_BASE = self.original_experiment_base
        self.tmp.cleanup()

    def _record_organize(self, file_info, student_name, assignment_id, **_kwargs):
        self.calls.append((file_info["path"], student_name, assignment_id))
        return str(self.root / "organized" / Path(file_info["name"]).name)

    def _file_info(self, name, parent=None):
        parent = parent or self.root
        parent.mkdir(parents=True, exist_ok=True)
        path = parent / name
        path.write_bytes(b"fixture")
        return {
            "path": str(path), "name": name, "size": path.stat().st_size,
            "suffix": path.suffix.lower(), "dir": str(path.parent),
        }

    def test_complete_match_archives_once(self):
        info = self._file_info("\u5f20\u4e09_\u6570\u7535\u7b2c\u4e00\u6b21\u5b9e\u9a8c\u62a5\u544a.docx")
        submissions = {}
        record = server.process_new_file(info, [{"name": STUDENT}], assignments(), submissions)
        self.assertEqual(record["status"], "matched")
        self.assertEqual(record["assignment_id"], "digital-1")
        self.assertIn("organized_to", record)
        self.assertEqual(self.calls, [(info["path"], STUDENT, "digital-1")])

    def test_subject_only_stays_pending_and_never_archives(self):
        info = self._file_info("\u5f20\u4e09_\u6570\u7535\u5b9e\u9a8c\u62a5\u544a.docx")
        submissions = {}
        record = server.process_new_file(info, [{"name": STUDENT}], assignments(), submissions)
        self.assertEqual(record["status"], "assignment_pending")
        self.assertNotIn("organized_to", record)
        self.assertIn(server.PENDING_ARCHIVE_BUCKET, submissions)
        self.assertEqual(self.calls, [])

    def test_generic_report_is_not_a_subject(self):
        info = self._file_info("\u5f20\u4e09_\u5b9e\u9a8c\u62a5\u544a.docx")
        result = server.classify_file_subject(info, assignments(), {"match_feedback": {}}, "wechat")
        self.assertEqual(result["status"], "unmatched")
        self.assertEqual(result["subject_group"], "")

    def test_wechat_directory_never_supplies_subject_evidence(self):
        info = self._file_info("\u5f20\u4e09_\u5b9e\u9a8c\u62a5\u544a.docx", self.root / "\u6570\u7535")
        result = server.classify_file_subject(info, assignments(), {"match_feedback": {}}, "wechat")
        self.assertEqual(result["status"], "unmatched")

    def test_public_directory_can_supply_subject_for_backfill(self):
        public_root = self.root / "public"
        server.EXPERIMENT_BASE = public_root
        info = self._file_info("\u5f20\u4e09_\u5b9e\u9a8c\u62a5\u544a.docx", public_root / SUBJECT_DIGITAL / "\u672a\u77e5")
        result = server.classify_file_subject(info, assignments(), {"match_feedback": {}}, "public_backfill")
        self.assertEqual(result["status"], "subject_matched")
        self.assertEqual(result["subject_group"], SUBJECT_DIGITAL)

    def test_multiple_specific_subjects_are_a_conflict(self):
        info = self._file_info("\u5f20\u4e09_\u6570\u7535_\u81ea\u63a7_\u7b2c\u4e00\u6b21\u5b9e\u9a8c.docx")
        result = server.classify_file_subject(info, assignments(), {"match_feedback": {}}, "wechat")
        self.assertEqual(result["status"], "subject_conflict")

    def test_manual_feedback_is_reused_without_directory_rules(self):
        info = self._file_info("\u5f20\u4e09_\u4fee\u6b63\u6837\u672c.docx")
        cfg = {"match_feedback": {"subject_corrections": [{
            "token": "\u4fee\u6b63\u6837\u672c", "to_subject": SUBJECT_DIGITAL,
        }]}}
        result = server.classify_file_subject(info, assignments(), cfg, "wechat")
        self.assertEqual(result["subject_group"], SUBJECT_DIGITAL)
        self.assertEqual(result["score"], 70)


if __name__ == "__main__":
    unittest.main(verbosity=2)
