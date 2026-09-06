import tempfile
import unittest
from pathlib import Path
import sys
import gzip
import json
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "py"))

import ai_classifier
import classifier_features
import classifier_trainer
import installer
import pack
import server


class FilenameContextTest(unittest.TestCase):
    def test_class_student_and_noise_are_removed(self):
        result = classifier_features.inspect_filename(
            "电国241_202421734301_桑田玉_数电实验三最终版.docx",
            students=[{"name": "桑田玉", "student_id": "202421734301"}],
            class_name="电国241",
        )
        self.assertEqual(result["normalized_text"], "数电实验三")
        self.assertEqual(result["extension"], "docx")
        self.assertIn("桑田玉", result["removed"]["student_names"])

    def test_student_name_does_not_damage_protected_course_term(self):
        result = classifier_features.inspect_filename(
            "电力电子技术实验报告.docx",
            students=[{"name": "电力", "student_id": "20240001"}],
            protected_terms=["电力电子技术"],
        )
        self.assertIn("电力电子技术", result["normalized_text"])

    def test_unseparated_roster_name_at_start_is_removed(self):
        result = classifier_features.inspect_filename(
            "张三数电实验二.pdf",
            students=[{"name": "张三", "student_id": "20240002"}],
        )
        self.assertEqual(result["normalized_text"], "数电实验二")

    def test_context_with_spaces_matches_underscore_separated_filename(self):
        result = classifier_features.inspect_filename(
            "AI_Smoke_Class_20240001_Test_Student_digital_lab1_final.docx",
            students=[{"name": "Test Student", "student_id": "20240001"}],
            class_name="AI Smoke Class",
        )
        self.assertEqual(result["normalized_text"], "digital lab1")
        self.assertIn("ai smoke class", result["removed"]["class_names"])
        self.assertIn("test student", result["removed"]["student_names"])


class ExampleStoreTest(unittest.TestCase):
    def test_subject_confirmation_is_upgraded_by_assignment_confirmation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "examples.json"
            base = {
                "raw_name": "数电实验一.docx",
                "normalized_text": "数电实验一",
                "subject_group": "数字电子技术",
                "removed": {},
                "preprocess_version": 1,
            }
            classifier_trainer.upsert_example(path, base)
            classifier_trainer.upsert_example(path, {
                **base,
                "assignment_id": "a1",
                "experiment": "第一次实验",
            })
            items = classifier_trainer.load_examples(path)["items"]
            self.assertEqual(len(items), 1)
            self.assertEqual(items[0]["assignment_id"], "a1")
            self.assertEqual(items[0]["count"], 2)

    def test_similarity_works_before_training(self):
        rows = [{
            "id": "one",
            "raw_name": "数电第三次实验报告.docx",
            "normalized_text": "数电第三次实验报告",
            "subject_group": "数字电子技术",
        }]
        result = classifier_trainer.similarity_predictions(
            "数电实验三报告",
            rows,
        )
        self.assertEqual(result[0]["label"], "数字电子技术")
        self.assertGreater(result[0]["confidence"], 0.5)

    def test_batch_import_writes_one_data_version_and_merges_duplicates(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "examples.json"
            base = {
                "raw_name": "数电实验一.docx",
                "normalized_text": "数电实验一",
                "subject_group": "数字电子技术",
                "removed": {},
                "preprocess_version": 1,
            }
            result = classifier_trainer.upsert_examples_batch(path, [base, base])
            payload = classifier_trainer.load_examples(path)
            self.assertEqual(payload["data_version"], 1)
            self.assertEqual(len(payload["items"]), 1)
            self.assertEqual(payload["items"][0]["count"], 2)
            self.assertEqual(result["actions"]["added"], 1)
            self.assertEqual(result["actions"]["merged"], 1)

    def test_manual_update_replaces_conflicting_label(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "examples.json"
            item = classifier_trainer.upsert_example(path, {
                "raw_name": "实验报告.docx",
                "normalized_text": "实验报告",
                "subject_group": "数字电子技术",
            })
            updated = classifier_trainer.update_example(path, item["id"], {
                "normalized_text": "自控实验报告",
                "normalized_source": "manual",
                "subject_group": "自动控制原理",
                "source": "manual_correction",
                "weight": 1.2,
            })
            payload = classifier_trainer.load_examples(path)
            self.assertEqual(len(payload["items"]), 1)
            self.assertEqual(updated["subject_group"], "自动控制原理")
            self.assertEqual(updated["normalized_source"], "manual")
            self.assertEqual(updated["weight"], 1.2)


def training_examples():
    rows = []
    for index in range(1, 9):
        rows.append({
            "id": f"d{index}",
            "raw_name": f"数电触发器实验{index}.docx",
            "normalized_text": f"数电 触发器 实验 {index}",
            "subject_group": "数字电子技术",
            "assignment_id": "d1" if index <= 4 else "d2",
            "weight": 1.0,
        })
        rows.append({
            "id": f"c{index}",
            "raw_name": f"自控根轨迹作业{index}.pdf",
            "normalized_text": f"自控 根轨迹 作业 {index}",
            "subject_group": "自动控制原理",
            "assignment_id": "c1" if index <= 4 else "c2",
            "weight": 1.0,
        })
    return rows


def training_assignments():
    return [
        {"id": "d1", "subject_group": "数字电子技术", "active": True},
        {"id": "d2", "subject_group": "数字电子技术", "active": True},
        {"id": "c1", "subject_group": "自动控制原理", "active": True},
        {"id": "c2", "subject_group": "自动控制原理", "active": True},
    ]


def workbench_rules():
    return {
        "schema_version": 1,
        "profile": {},
        "subjects": {
            "数字电子技术": {
                "active": True,
                "confirmed_aliases": ["数电"],
                "suggested_aliases": [],
                "keywords": ["触发器"],
                "assignment_types": [],
                "source": "test",
            },
            "自动控制原理": {
                "active": True,
                "confirmed_aliases": ["自控"],
                "suggested_aliases": [],
                "keywords": ["根轨迹"],
                "assignment_types": [],
                "source": "test",
            },
        },
        "types": {},
    }


def training_bundle():
    return classifier_trainer.build_model_bundle(
        training_examples(),
        training_assignments(),
        {"数字电子技术", "自动控制原理"},
    )


class LocalModelTest(unittest.TestCase):
    def test_course_and_assignment_models_train_and_reload(self):
        rows = training_examples()
        assignments = training_assignments()
        bundle = classifier_trainer.build_model_bundle(
            rows,
            assignments,
            {"数字电子技术", "自动控制原理"},
        )
        course = classifier_trainer.predict_model(
            bundle["course_model"],
            "数电触发器实验报告",
            "docx",
        )
        self.assertEqual(course[0]["label"], "数字电子技术")
        self.assertIn("数字电子技术", bundle["assignment_models"])

        with tempfile.TemporaryDirectory() as temp_dir:
            classifier_trainer.save_model_bundle(temp_dir, bundle)
            loaded = classifier_trainer.load_model_bundle(temp_dir)
            self.assertEqual(loaded["course_model"]["labels"], bundle["course_model"]["labels"])

    def test_corrupt_primary_model_falls_back_to_valid_previous_version(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            model_dir = Path(temp_dir) / "models"
            first = training_bundle()
            classifier_trainer.save_model_bundle(model_dir, first)
            second = {**first, "trained_at": "2099-01-01T00:00:00"}
            classifier_trainer.save_model_bundle(model_dir, second)
            (model_dir / "model_bundle.json.gz").write_bytes(b"not a gzip model")
            loaded = classifier_trainer.load_model_bundle(model_dir)
            self.assertEqual(loaded["trained_at"], first["trained_at"])

    def test_invalid_backup_schema_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            model_dir = Path(temp_dir) / "models"
            model_dir.mkdir()
            (model_dir / "model_bundle.json.gz").write_bytes(b"broken")
            invalid = {**training_bundle(), "schema_version": 999}
            with gzip.open(
                model_dir / "model_bundle.json.gz.bak", "wt", encoding="utf-8"
            ) as handle:
                json.dump(invalid, handle)
            self.assertEqual(classifier_trainer.load_model_bundle(model_dir), {})

    def test_classifier_keeps_exact_rule_above_model(self):
        rules = {
            "schema_version": 1,
            "profile": {},
            "subjects": {
                "数字电子技术": {
                    "active": True,
                    "confirmed_aliases": ["数电"],
                    "suggested_aliases": [],
                    "keywords": ["触发器"],
                    "assignment_types": [],
                    "source": "test",
                },
                "自动控制原理": {
                    "active": True,
                    "confirmed_aliases": ["自控"],
                    "suggested_aliases": [],
                    "keywords": ["根轨迹"],
                    "assignment_types": [],
                    "source": "test",
                },
            },
            "types": {},
        }
        bundle = classifier_trainer.build_model_bundle(
            training_examples(),
            [],
            {"数字电子技术", "自动控制原理"},
        )
        result = ai_classifier.classify_subject(
            "数电报告.docx",
            rules=rules,
            model_bundle=bundle,
            priority="model_first",
        )
        self.assertEqual(result["subject_group"], "数字电子技术")
        self.assertEqual(result["source"], "rules")


class ServerTrainingIntegrationTest(unittest.TestCase):
    def test_feedback_samples_train_in_background(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            original_paths = (
                server.CONFIG_PATH,
                server.STUDENTS_PATH,
                server.AI_RULES_PATH,
                server.AI_EXAMPLES_PATH,
                server.AI_MODELS_DIR,
            )
            original_cache = dict(server._ai_model_cache)
            try:
                server.CONFIG_PATH = root / "config.json"
                server.STUDENTS_PATH = root / "students.json"
                server.AI_RULES_PATH = root / "ai_rules.json"
                server.AI_EXAMPLES_PATH = root / "ai_examples.json"
                server.AI_MODELS_DIR = root / "models"
                server._ai_model_cache.update({"mtime": None, "bundle": {}})
                config = server.default_config()
                config["class_name"] = "测试班"
                config["assignments"] = [
                    {"id": "d1", "name": "数电实验", "subject_group": "数字电子技术", "active": True},
                    {"id": "c1", "name": "自控作业", "subject_group": "自动控制原理", "active": True},
                ]
                config["ai_classifier"]["mode"] = "rules"
                server.save_config(config)
                server.save_students([])
                server.save_ai_rules({
                    "schema_version": 1,
                    "profile": {},
                    "subjects": {
                        "数字电子技术": {
                            "active": True, "confirmed_aliases": ["数电"],
                            "suggested_aliases": [], "keywords": ["触发器"],
                            "assignment_types": [], "source": "test",
                        },
                        "自动控制原理": {
                            "active": True, "confirmed_aliases": ["自控"],
                            "suggested_aliases": [], "keywords": ["根轨迹"],
                            "assignment_types": [], "source": "test",
                        },
                    },
                    "types": {},
                })
                for index in range(5):
                    server.record_ai_example(
                        f"数电触发器实验{index}.docx",
                        "数字电子技术",
                        source="manual_import",
                        cfg=config,
                    )
                    server.record_ai_example(
                        f"自控根轨迹作业{index}.pdf",
                        "自动控制原理",
                        source="manual_import",
                        cfg=config,
                    )
                self.assertTrue(server.ai_model_status(config)["trainable"])
                started, _message = server.start_ai_training()
                self.assertTrue(started)
                server._ai_training_thread.join(timeout=5)
                status = server.ai_model_status(config)
                self.assertEqual(status["state"], "ready")
                self.assertTrue((server.AI_MODELS_DIR / "model_bundle.json.gz").exists())
            finally:
                server.cancel_ai_training()
                (
                    server.CONFIG_PATH,
                    server.STUDENTS_PATH,
                    server.AI_RULES_PATH,
                    server.AI_EXAMPLES_PATH,
                    server.AI_MODELS_DIR,
                ) = original_paths
                server._ai_model_cache.clear()
                server._ai_model_cache.update(original_cache)

    def test_history_preview_only_uses_current_assignments_and_hides_paths(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            original_paths = (
                server.CONFIG_PATH,
                server.STUDENTS_PATH,
                server.SUBMISSIONS_PATH,
                server.AI_RULES_PATH,
                server.AI_EXAMPLES_PATH,
            )
            try:
                server.CONFIG_PATH = root / "config.json"
                server.STUDENTS_PATH = root / "students.json"
                server.SUBMISSIONS_PATH = root / "submissions.json"
                server.AI_RULES_PATH = root / "ai_rules.json"
                server.AI_EXAMPLES_PATH = root / "ai_examples.json"
                config = server.default_config()
                config["assignments"] = [{
                    "id": "d1",
                    "name": "数字电路实验一",
                    "subject_group": "数字电子技术",
                    "active": True,
                }]
                server.save_config(config)
                server.save_students([])
                server.save_ai_rules({
                    "schema_version": 1,
                    "profile": {},
                    "subjects": {
                        "数字电子技术": {
                            "active": True,
                            "confirmed_aliases": ["数电"],
                            "suggested_aliases": [],
                            "keywords": ["触发器"],
                            "assignment_types": [],
                            "source": "test",
                        },
                    },
                    "types": {},
                })
                server.save_submissions({
                    "student": [
                        {
                            "assignment_id": "d1",
                            "file": {"name": "D:/private/student/数电实验一.docx"},
                        },
                        {
                            "assignment_id": "deleted",
                            "file": {"name": "D:/private/student/旧作业.docx"},
                        },
                    ]
                })
                preview = server.preview_ai_examples("history", {}, config)
                self.assertEqual(preview["input_total"], 1)
                self.assertEqual(preview["rows"][0]["raw_name"], "数电实验一.docx")
                self.assertNotIn("private", json.dumps(preview, ensure_ascii=False))
            finally:
                (
                    server.CONFIG_PATH,
                    server.STUDENTS_PATH,
                    server.SUBMISSIONS_PATH,
                    server.AI_RULES_PATH,
                    server.AI_EXAMPLES_PATH,
                ) = original_paths

    def test_changed_dataset_disables_stale_model_bundle(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            original_paths = server.AI_EXAMPLES_PATH, server.AI_MODELS_DIR
            original_cache = dict(server._ai_model_cache)
            try:
                server.AI_EXAMPLES_PATH = root / "ai_examples.json"
                server.AI_MODELS_DIR = root / "models"
                bundle = classifier_trainer.build_model_bundle(
                    training_examples(),
                    training_assignments(),
                    {"数字电子技术", "自动控制原理"},
                    data_version=0,
                )
                classifier_trainer.save_model_bundle(server.AI_MODELS_DIR, bundle)
                server._ai_model_cache.update({"mtime": None, "bundle": {}})
                self.assertTrue(server.usable_ai_model_bundle())
                classifier_trainer.upsert_examples_batch(server.AI_EXAMPLES_PATH, [{
                    "raw_name": "新样本.docx",
                    "normalized_text": "新样本",
                    "subject_group": "数字电子技术",
                }])
                self.assertEqual(server.usable_ai_model_bundle(), {})
            finally:
                server.AI_EXAMPLES_PATH, server.AI_MODELS_DIR = original_paths
                server._ai_model_cache.clear()
                server._ai_model_cache.update(original_cache)


class SampleWorkbenchServiceTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.original_paths = (
            server.CONFIG_PATH,
            server.STUDENTS_PATH,
            server.SUBMISSIONS_PATH,
            server.AI_RULES_PATH,
            server.AI_EXAMPLES_PATH,
            server.AI_MODELS_DIR,
        )
        server.CONFIG_PATH = root / "config.json"
        server.STUDENTS_PATH = root / "students.json"
        server.SUBMISSIONS_PATH = root / "submissions.json"
        server.AI_RULES_PATH = root / "ai_rules.json"
        server.AI_EXAMPLES_PATH = root / "ai_examples.json"
        server.AI_MODELS_DIR = root / "models"
        self.config = server.default_config()
        self.config["class_name"] = "测试班"
        self.config["assignments"] = [
            {
                "id": "d1",
                "name": "数字电路实验一",
                "subject_group": "数字电子技术",
                "active": True,
            },
            {
                "id": "c1",
                "name": "根轨迹作业",
                "subject_group": "自动控制原理",
                "active": True,
            },
        ]
        self.config["ai_classifier"]["auto_train"] = False
        server.save_config(self.config)
        server.save_students([{"name": "张三", "student_id": "20240001"}])
        server.save_submissions({})
        server.save_ai_rules(workbench_rules())

    def tearDown(self):
        (
            server.CONFIG_PATH,
            server.STUDENTS_PATH,
            server.SUBMISSIONS_PATH,
            server.AI_RULES_PATH,
            server.AI_EXAMPLES_PATH,
            server.AI_MODELS_DIR,
        ) = self.original_paths
        self.temp_dir.cleanup()

    @staticmethod
    def sample(name, subject="数字电子技术", assignment_id="d1", **extra):
        return {
            "raw_name": name,
            "normalized_text": Path(name).stem,
            "subject_group": subject,
            "assignment_id": assignment_id,
            "source": "manual_import",
            **extra,
        }

    def test_preview_reports_client_side_truncation(self):
        preview = server.preview_ai_examples("filenames", {
            "entries": [{
                "file_name": "数电实验一.docx",
                "relative_path": "数字电子技术/数字电路实验一/数电实验一.docx",
            }],
            "input_total": 2005,
            "subject_group": "数字电子技术",
            "assignment_id": "d1",
        }, self.config)
        self.assertTrue(preview["truncated"])
        self.assertEqual(preview["input_total"], 2005)
        self.assertEqual(len(preview["rows"]), 1)

    def test_list_filters_searches_and_paginates(self):
        classifier_trainer.upsert_examples_batch(server.AI_EXAMPLES_PATH, [
            self.sample("数电实验一.docx", preprocess_version=2),
            self.sample("数电实验二.docx", assignment_id="", preprocess_version=2),
            self.sample(
                "自控根轨迹.pdf",
                subject="自动控制原理",
                assignment_id="c1",
                source="history_confirmed",
                preprocess_version=3,
            ),
        ])
        result = server.list_ai_examples({
            "subject": ["数字电子技术"],
            "query": ["实验"],
            "preprocess_version": ["2"],
            "offset": ["1"],
            "limit": ["1"],
        })
        self.assertEqual(result["total"], 2)
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(result["summary"]["all"], 3)
        self.assertEqual(result["summary"]["source_counts"]["history_confirmed"], 1)
        self.assertEqual(result["summary"]["course_counts"]["数字电子技术"], 2)

    def test_batch_import_schedules_once_and_conflicts_are_skipped(self):
        with (
            patch.object(server, "schedule_ai_auto_train") as schedule,
            patch.object(server, "ai_model_status", return_value={"state": "collecting"}),
        ):
            result = server.import_ai_examples({
                "items": [
                    self.sample("数电实验一.docx"),
                    self.sample(
                        "自控根轨迹.pdf",
                        subject="自动控制原理",
                        assignment_id="c1",
                    ),
                ]
            }, self.config)
            schedule.assert_called_once()
        self.assertEqual(result["imported"], 2)
        self.assertEqual(result["skipped"], 0)
        self.assertEqual(
            classifier_trainer.load_examples(server.AI_EXAMPLES_PATH)["data_version"],
            1,
        )

        with (
            patch.object(server, "schedule_ai_auto_train") as schedule,
            patch.object(server, "ai_model_status", return_value={"state": "collecting"}),
        ):
            conflict = server.import_ai_examples({
                "items": [
                    self.sample("同名报告.docx"),
                    self.sample(
                        "同名报告.docx",
                        subject="自动控制原理",
                        assignment_id="c1",
                    ),
                ]
            }, self.config)
            schedule.assert_not_called()
        self.assertEqual(conflict["imported"], 0)
        self.assertEqual(conflict["skipped"], 2)
        self.assertTrue(all("冲突" in item["error"] for item in conflict["errors"]))

        with (
            patch.object(server, "schedule_ai_auto_train") as schedule,
            patch.object(server, "ai_model_status", return_value={"state": "collecting"}),
        ):
            existing_conflict = server.import_ai_examples({
                "items": [self.sample(
                    "数电实验一.docx",
                    subject="自动控制原理",
                    assignment_id="c1",
                )]
            }, self.config)
            schedule.assert_not_called()
        self.assertEqual(existing_conflict["imported"], 0)
        self.assertIn("样本库中已有不同标签", existing_conflict["errors"][0]["error"])

    def test_update_reprocess_and_delete_keep_sample_semantics(self):
        item = classifier_trainer.upsert_example(
            server.AI_EXAMPLES_PATH,
            self.sample(
                "测试班_20240001_张三_数电实验一最终版.docx",
                normalized_text="人工保留文本",
                normalized_source="manual",
            ),
        )
        with (
            patch.object(server, "schedule_ai_auto_train"),
            patch.object(server, "ai_model_status", return_value={"state": "collecting"}),
        ):
            preserved = server.reprocess_ai_examples({
                "ids": [item["id"]],
                "preserve_manual": True,
            }, self.config)
        self.assertEqual(preserved["reprocessed"], 1)
        loaded = classifier_trainer.load_examples(server.AI_EXAMPLES_PATH)["items"][0]
        self.assertEqual(loaded["normalized_text"], "人工保留文本")
        self.assertEqual(loaded["normalized_source"], "manual")

        with (
            patch.object(server, "schedule_ai_auto_train"),
            patch.object(server, "ai_model_status", return_value={"state": "collecting"}),
        ):
            overwritten = server.reprocess_ai_examples({
                "ids": [item["id"]],
                "preserve_manual": False,
            }, self.config)
        self.assertEqual(overwritten["changed"], 1)
        loaded = classifier_trainer.load_examples(server.AI_EXAMPLES_PATH)["items"][0]
        self.assertEqual(loaded["normalized_text"], "数电实验一")
        self.assertEqual(loaded["normalized_source"], "parser")

        with (
            patch.object(server, "schedule_ai_auto_train"),
            patch.object(server, "ai_model_status", return_value={"state": "collecting"}),
        ):
            updated = server.update_ai_example({
                "id": item["id"],
                "normalized_text": "修正后的根轨迹作业",
                "subject_group": "自动控制原理",
                "assignment_id": "c1",
            }, self.config)
        self.assertEqual(updated["item"]["weight"], 1.2)
        self.assertEqual(updated["item"]["source"], "manual_correction")

        with (
            patch.object(server, "schedule_ai_auto_train") as schedule,
            patch.object(server, "ai_model_status", return_value={"state": "collecting"}),
        ):
            deleted = server.delete_ai_examples({"ids": [item["id"]]})
            schedule.assert_called_once()
        self.assertEqual(deleted["deleted"], 1)
        self.assertEqual(
            classifier_trainer.load_examples(server.AI_EXAMPLES_PATH)["items"],
            [],
        )


class DistributionManifestTest(unittest.TestCase):
    def test_training_modules_are_shipped_without_runtime_data(self):
        expected = {"py/classifier_features.py", "py/classifier_trainer.py"}
        self.assertTrue(expected.issubset(set(installer.INSTALL_FILES)))
        self.assertTrue(expected.issubset(set(pack.PACK_CONFIG["include_files"])))
        self.assertIn("data", pack.PACK_CONFIG["exclude_patterns"])
        self.assertNotIn("data", installer.INSTALL_FILES)

        root = Path(__file__).resolve().parents[1]
        spec_text = (root / "微信作业追踪器_安装向导.spec").read_text(encoding="utf-8")
        server_text = (root / "py" / "server.py").read_text(encoding="utf-8")
        for filename in expected:
            self.assertIn(filename, spec_text)
            self.assertGreaterEqual(server_text.count(f'"{filename}"'), 2)
        self.assertNotIn('"data/ai_examples.json"', spec_text)
        self.assertNotIn('"data/ai_examples.json"', server_text)


if __name__ == "__main__":
    unittest.main()
