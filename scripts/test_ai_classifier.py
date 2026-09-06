import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "py"))

import ai_classifier


def rules():
    return {
        "schema_version": 1,
        "profile": {"name": "测试", "major": "自动化", "semester": "2026-1", "school": ""},
        "subjects": {
            "数字电子技术": {
                "active": True,
                "confirmed_aliases": ["数电", "数字电路"],
                "suggested_aliases": ["数字逻辑"],
                "keywords": ["卡诺图", "触发器", "74LS"],
                "assignment_types": ["实验报告"],
                "source": "test",
            },
            "自动控制原理": {
                "active": True,
                "confirmed_aliases": ["自控"],
                "suggested_aliases": [],
                "keywords": ["根轨迹", "传递函数"],
                "assignment_types": ["课后题"],
                "source": "test",
            },
        },
        "types": {},
    }


class AIClassifierTest(unittest.TestCase):
    def test_confirmed_alias_matches(self):
        result = ai_classifier.classify_subject("张三_数电第三次实验报告.docx", rules=rules(), students=[{"name": "张三"}])
        self.assertEqual(result["subject_group"], "数字电子技术")
        self.assertEqual(result["confidence"], 0.95)

    def test_suggested_alias_does_not_match(self):
        result = ai_classifier.classify_subject("张三_数字逻辑实验报告.docx", rules=rules(), students=[{"name": "张三"}])
        self.assertEqual(result["status"], "unknown_subject")

    def test_single_keyword_respects_sensitivity(self):
        result = ai_classifier.classify_subject("卡诺图报告.docx", rules=rules(), sensitivity=0.70)
        self.assertEqual(result["status"], "subject_suggested")
        self.assertEqual(result["subject_group"], "")

    def test_multiple_keywords_can_match(self):
        result = ai_classifier.classify_subject("卡诺图触发器实验报告.docx", rules=rules(), sensitivity=0.70)
        self.assertEqual(result["subject_group"], "数字电子技术")

    def test_exact_subject_conflict(self):
        result = ai_classifier.classify_subject("数电自控实验报告.docx", rules=rules())
        self.assertEqual(result["status"], "subject_conflict")

    def test_inactive_subject_is_ignored(self):
        payload = rules()
        payload["subjects"]["数字电子技术"]["active"] = False
        result = ai_classifier.classify_subject("数电报告.docx", rules=payload)
        self.assertEqual(result["status"], "unknown_subject")

    def test_import_rejects_unlisted_official_course(self):
        with self.assertRaises(ai_classifier.RulePackError):
            ai_classifier.normalize_rule_pack(rules(), allowed_subjects=["数字电子技术"])

    def test_keyword_extraction_removes_student_name(self):
        items = ai_classifier.extract_keyword_candidates(
            "嵌入式系统设计",
            ["张三_嵌入式_GPIO实验一.docx", "李四_嵌入式_RTOS实验二.pdf"],
            [{"name": "张三"}, {"name": "李四"}],
        )
        texts = {item["text"] for item in items}
        self.assertNotIn("张三", texts)
        self.assertNotIn("李四", texts)
        self.assertTrue(any("GPIO".casefold() == text.casefold() for text in texts))

    def test_save_and_load_round_trip(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "rules.json"
            ai_classifier.save_rule_pack(path, rules())
            loaded = ai_classifier.load_rule_pack(path)
            self.assertIn("数字电子技术", loaded["subjects"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
