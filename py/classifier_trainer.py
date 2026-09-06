"""Pure-standard-library sample storage and local text model training."""

from __future__ import annotations

import gzip
import hashlib
import json
import math
import os
import shutil
import tempfile
import threading
import uuid
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from classifier_features import PREPROCESS_VERSION, extract_features, feature_set, text_similarity


MODEL_SCHEMA_VERSION = 1
EXAMPLES_SCHEMA_VERSION = 2
FEATURE_VERSION = 2
COURSE_MIN_PER_LABEL = 5
ASSIGNMENT_MIN_PER_LABEL = 3
AUTO_TRAIN_DELTA = 5
_storage_lock = threading.RLock()


def _now():
    return datetime.now().isoformat(timespec="seconds")


def _atomic_json(path, payload):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temp_name, path)
    except Exception:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise


def _atomic_gzip_json(path, payload):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    os.close(fd)
    try:
        with gzip.open(temp_name, "wt", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        os.replace(temp_name, path)
    except Exception:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise


def load_examples(path):
    path = Path(path)
    with _storage_lock:
        if not path.exists():
            return {"schema_version": EXAMPLES_SCHEMA_VERSION, "data_version": 0, "items": [], "migrations": {}}
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return {"schema_version": EXAMPLES_SCHEMA_VERSION, "data_version": 0, "items": [], "migrations": {}}
    if isinstance(payload, list):
        payload = {"schema_version": EXAMPLES_SCHEMA_VERSION, "data_version": 0, "items": payload, "migrations": {}}
    if not isinstance(payload, dict):
        payload = {}
    items = payload.get("items")
    try:
        data_version = max(0, int(payload.get("data_version", 0)))
    except (TypeError, ValueError):
        data_version = 0
    return {
        "schema_version": EXAMPLES_SCHEMA_VERSION,
        "data_version": data_version,
        "items": items if isinstance(items, list) else [],
        "migrations": payload.get("migrations") if isinstance(payload.get("migrations"), dict) else {},
    }


def save_examples(path, payload, bump_version=False):
    try:
        data_version = max(0, int(payload.get("data_version", 0)))
    except (TypeError, ValueError):
        data_version = 0
    clean = {
        "schema_version": EXAMPLES_SCHEMA_VERSION,
        "data_version": data_version + (1 if bump_version else 0),
        "items": list(payload.get("items") or [])[-20000:],
        "migrations": dict(payload.get("migrations") or {}),
    }
    with _storage_lock:
        _atomic_json(path, clean)
    return clean


def _sample_key(item):
    return (
        str(item.get("raw_name") or "").casefold(),
        str(item.get("subject_group") or "").casefold(),
        str(item.get("assignment_id") or "").casefold(),
    )


def _normalize_example(example):
    item = dict(example or {})
    raw_name = Path(str(item.get("raw_name") or "")).name[:260]
    normalized = str(item.get("normalized_text") or "").strip()[:500]
    subject = str(item.get("subject_group") or "").strip()[:100]
    if not raw_name or not normalized or not subject:
        raise ValueError("训练样本缺少文件名、有效文本或课程")
    item.update({
        "id": str(item.get("id") or uuid.uuid4().hex),
        "raw_name": raw_name,
        "normalized_text": normalized,
        "subject_group": subject,
        "assignment_id": str(item.get("assignment_id") or "")[:100],
        "assignment_type": str(item.get("assignment_type") or "")[:100],
        "experiment": str(item.get("experiment") or "")[:100],
        "source": str(item.get("source") or "manual_confirmation")[:60],
        "weight": max(0.1, min(2.0, float(item.get("weight", 1.0)))),
        "confirmed_at": str(item.get("confirmed_at") or _now()),
        "preprocess_version": int(item.get("preprocess_version") or PREPROCESS_VERSION),
        "count": max(1, int(item.get("count", 1))),
        "normalized_source": (
            "manual"
            if str(item.get("normalized_source") or "").strip() == "manual"
            else "parser"
        ),
    })
    item["removed"] = item.get("removed") if isinstance(item.get("removed"), dict) else {}
    return item


def _upsert_payload_item(payload, example):
    item = _normalize_example(example)
    raw_name = item["raw_name"]
    subject = item["subject_group"]
    key = _sample_key(item)
    existing_index = next((index for index, current in enumerate(payload["items"]) if _sample_key(current) == key), None)
    if existing_index is None:
        existing_index = next((
            index for index, current in enumerate(payload["items"])
            if str(current.get("raw_name") or "").casefold() == raw_name.casefold()
            and str(current.get("subject_group") or "").casefold() == subject.casefold()
            and (
                not str(current.get("assignment_id") or "")
                or not item["assignment_id"]
            )
        ), None)
    if existing_index is None:
        # A later correction for the same file supersedes conflicting labels.
        before = len(payload["items"])
        payload["items"] = [
            current for current in payload["items"]
            if str(current.get("raw_name") or "").casefold() != raw_name.casefold()
            or (
                str(current.get("subject_group") or "").casefold() == subject.casefold()
                and str(current.get("assignment_id") or "").casefold() == item["assignment_id"].casefold()
            )
        ]
        payload["items"].append(item)
        action = "replaced" if len(payload["items"]) <= before else "added"
    else:
        current = dict(payload["items"][existing_index])
        item["id"] = current.get("id") or item["id"]
        item["count"] = int(current.get("count", 1)) + 1
        if not item["assignment_id"] and current.get("assignment_id"):
            item["assignment_id"] = current.get("assignment_id", "")
            item["assignment_type"] = current.get("assignment_type", "")
            item["experiment"] = current.get("experiment", "")
        payload["items"][existing_index] = item
        action = "merged"
    return item, action


def upsert_example(path, example):
    payload = load_examples(path)
    item, _action = _upsert_payload_item(payload, example)
    save_examples(path, payload, bump_version=True)
    return item


def upsert_examples_batch(path, examples):
    payload = load_examples(path)
    results = []
    actions = Counter()
    for example in examples or []:
        item, action = _upsert_payload_item(payload, example)
        results.append(item)
        actions[action] += 1
    if results:
        payload = save_examples(path, payload, bump_version=True)
    return {
        "items": results,
        "actions": dict(actions),
        "data_version": payload.get("data_version", 0),
    }


def delete_examples(path, ids):
    payload = load_examples(path)
    targets = {str(item) for item in ids or [] if str(item)}
    before = len(payload["items"])
    payload["items"] = [item for item in payload["items"] if str(item.get("id")) not in targets]
    deleted = before - len(payload["items"])
    if deleted:
        save_examples(path, payload, bump_version=True)
    return deleted


def update_example(path, example_id, updates):
    payload = load_examples(path)
    index = next(
        (index for index, item in enumerate(payload["items"]) if str(item.get("id")) == str(example_id)),
        None,
    )
    if index is None:
        raise KeyError("训练样本不存在")
    current = dict(payload["items"][index])
    merged = _normalize_example({
        **current,
        **dict(updates or {}),
        "id": current.get("id"),
        "count": current.get("count", 1),
        "confirmed_at": _now(),
    })
    next_items = []
    for position, item in enumerate(payload["items"]):
        if position == index:
            next_items.append(merged)
        elif str(item.get("raw_name") or "").casefold() != merged["raw_name"].casefold():
            next_items.append(item)
    payload["items"] = next_items
    save_examples(path, payload, bump_version=True)
    return merged


def replace_examples(path, items, migrations=None, bump_version=True):
    current = load_examples(path)
    return save_examples(path, {
        "data_version": current.get("data_version", 0),
        "items": list(items or []),
        "migrations": migrations or current.get("migrations", {}),
    }, bump_version=bump_version)


def migrate_subject_corrections(path, corrections, normalize_callback):
    payload = load_examples(path)
    if payload["migrations"].get("match_feedback_subject_corrections_v1"):
        return 0
    imported = 0
    for correction in corrections or []:
        raw_name = str(correction.get("token") or "").strip()
        subject = str(correction.get("to_subject") or "").strip()
        if not raw_name or not subject:
            continue
        parsed = normalize_callback(raw_name)
        if not parsed.get("normalized_text"):
            continue
        upsert_example(path, {
            **parsed,
            "subject_group": subject,
            "source": "migrated_subject_correction",
            "weight": 1.2,
            "confirmed_at": correction.get("updated_at") or _now(),
            "count": correction.get("count", 1),
        })
        imported += 1
    payload = load_examples(path)
    payload["migrations"]["match_feedback_subject_corrections_v1"] = {
        "completed_at": _now(),
        "imported": imported,
    }
    save_examples(path, payload)
    return imported


def similarity_predictions(text, examples, label_field="subject_group", subject_group="", limit=5):
    if not feature_set(text):
        return []
    best_by_label = {}
    for item in examples or []:
        if subject_group and item.get("subject_group") != subject_group:
            continue
        label = str(item.get(label_field) or "").strip()
        sample_text = str(item.get("normalized_text") or "").strip()
        if not label or not sample_text:
            continue
        score = text_similarity(text, sample_text)
        current = best_by_label.get(label)
        if current is None or score > current["confidence"]:
            best_by_label[label] = {
                "label": label,
                "confidence": round(score, 4),
                "example_id": item.get("id", ""),
                "raw_name": item.get("raw_name", ""),
            }
    return sorted(best_by_label.values(), key=lambda item: (-item["confidence"], item["label"]))[:limit]


def _softmax(values):
    if not values:
        return {}
    peak = max(values.values())
    exps = {key: math.exp(max(-60.0, min(60.0, (value - peak) / 0.18))) for key, value in values.items()}
    total = sum(exps.values()) or 1.0
    return {key: value / total for key, value in exps.items()}


def train_complement_nb(examples, label_field, eligible_labels=None, cancel_event=None):
    eligible = set(eligible_labels or [])
    rows = []
    label_docs = Counter()
    label_feature_counts = defaultdict(Counter)
    label_totals = Counter()
    global_counts = Counter()
    for item in examples or []:
        if cancel_event and cancel_event.is_set():
            raise InterruptedError("训练已取消")
        label = str(item.get(label_field) or "").strip()
        if not label or (eligible and label not in eligible):
            continue
        features = extract_features(item.get("normalized_text", ""), Path(str(item.get("raw_name") or "")).suffix.lstrip("."))
        if not features:
            continue
        weight = max(0.1, min(2.0, float(item.get("weight", 1.0))))
        rows.append((label, features, weight))
        label_docs[label] += weight
        for token, count in features.items():
            value = count * weight
            label_feature_counts[label][token] += value
            label_totals[label] += value
            global_counts[token] += value
    labels = sorted(label_docs)
    if len(labels) < 2:
        return None

    vocabulary = {
        token for token, _count in global_counts.most_common(12000)
    }
    alpha = 1.0
    weights = {}
    defaults = {}
    total_docs = sum(label_docs.values()) or 1.0
    for label in labels:
        complement_total = sum(global_counts[token] - label_feature_counts[label].get(token, 0.0) for token in vocabulary)
        denominator = complement_total + alpha * max(1, len(vocabulary))
        defaults[label] = -math.log(alpha / denominator)
        class_weights = {}
        for token in vocabulary:
            complement = global_counts[token] - label_feature_counts[label].get(token, 0.0)
            class_weights[token] = -math.log((complement + alpha) / denominator)
        norm = sum(abs(value) for value in class_weights.values()) or 1.0
        weights[label] = {
            token: round(value / norm, 10)
            for token, value in class_weights.items()
        }
        defaults[label] = round(defaults[label] / norm, 10)

    return {
        "schema_version": MODEL_SCHEMA_VERSION,
        "feature_version": FEATURE_VERSION,
        "kind": "complement_naive_bayes",
        "labels": labels,
        "weights": weights,
        "defaults": defaults,
        "priors": {label: label_docs[label] / total_docs for label in labels},
        "document_counts": {label: round(label_docs[label], 3) for label in labels},
        "trained_at": _now(),
    }


def predict_model(model, text, extension=""):
    if not isinstance(model, dict) or not model.get("labels"):
        return []
    features = extract_features(text, extension)
    if not features:
        return []
    total_features = sum(features.values()) or 1
    raw_scores = {}
    for label in model.get("labels", []):
        label_weights = model.get("weights", {}).get(label, {})
        default = float(model.get("defaults", {}).get(label, 0.0))
        score = 0.0
        for token, count in features.items():
            score += count * float(label_weights.get(token, default))
        score /= total_features
        score += 0.02 * math.log(max(1e-9, float(model.get("priors", {}).get(label, 1e-9))))
        raw_scores[label] = score
    probabilities = _softmax(raw_scores)
    return [
        {"label": label, "confidence": round(probabilities[label], 4)}
        for label in sorted(probabilities, key=lambda key: (-probabilities[key], key))
    ]


def _label_counts(examples, label_field, subject_group=""):
    counts = Counter()
    for item in examples or []:
        if subject_group and item.get("subject_group") != subject_group:
            continue
        label = str(item.get(label_field) or "").strip()
        if label:
            counts[label] += 1
    return counts


def _validation_result(examples, label_field, eligible_labels, subject_group="", cancel_event=None):
    grouped = defaultdict(list)
    for item in examples:
        if subject_group and item.get("subject_group") != subject_group:
            continue
        label = str(item.get(label_field) or "").strip()
        if label in eligible_labels:
            grouped[label].append(item)
    if not grouped or any(len(items) < 8 for items in grouped.values()):
        return {"status": "insufficient", "samples": 0}

    train_rows = []
    test_rows = []
    for label, items in grouped.items():
        ordered = sorted(
            items,
            key=lambda item: hashlib.sha1(
                str(item.get("normalized_text") or "").encode("utf-8")
            ).hexdigest(),
        )
        for index, item in enumerate(ordered):
            (test_rows if index % 5 == 0 else train_rows).append(item)
    model = train_complement_nb(train_rows, label_field, eligible_labels, cancel_event)
    if not model or not test_rows:
        return {"status": "insufficient", "samples": 0}
    correct = 0
    for item in test_rows:
        prediction = predict_model(model, item.get("normalized_text", ""), Path(str(item.get("raw_name") or "")).suffix.lstrip("."))
        if prediction and prediction[0]["label"] == item.get(label_field):
            correct += 1
    return {
        "status": "ready",
        "samples": len(test_rows),
        "accuracy": round(correct / len(test_rows), 4),
    }


def build_model_bundle(examples, assignments, active_subjects, cancel_event=None, progress=None,
                       data_version=0):
    examples = list(examples or [])
    active_subjects = set(active_subjects or [])
    if progress:
        progress("course_model", 15)
    course_counts = _label_counts(examples, "subject_group")
    course_labels = sorted(
        label for label, count in course_counts.items()
        if count >= COURSE_MIN_PER_LABEL and (not active_subjects or label in active_subjects)
    )
    course_model = train_complement_nb(examples, "subject_group", course_labels, cancel_event) if len(course_labels) >= 2 else None
    course_validation = _validation_result(examples, "subject_group", set(course_labels), cancel_event=cancel_event) if course_model else {"status": "insufficient", "samples": 0}

    if progress:
        progress("assignment_models", 45)
    active_assignments = {
        str(item.get("id")): item for item in assignments or []
        if item.get("id") and item.get("active", True)
    }
    assignment_models = {}
    assignment_meta = {}
    subjects = sorted({
        item.get("subject_group")
        for item in examples
        if item.get("subject_group")
        and (not active_subjects or item.get("subject_group") in active_subjects)
    })
    for index, subject in enumerate(subjects):
        if cancel_event and cancel_event.is_set():
            raise InterruptedError("训练已取消")
        subject_rows = [
            item for item in examples
            if item.get("subject_group") == subject
            and item.get("assignment_id") in active_assignments
            and active_assignments[item.get("assignment_id")].get("subject_group") == subject
        ]
        counts = _label_counts(subject_rows, "assignment_id", subject)
        labels = sorted(label for label, count in counts.items() if count >= ASSIGNMENT_MIN_PER_LABEL)
        model = train_complement_nb(subject_rows, "assignment_id", labels, cancel_event) if len(labels) >= 2 else None
        if model:
            assignment_models[subject] = model
        assignment_meta[subject] = {
            "labels": labels,
            "sample_counts": dict(counts),
            "validation": _validation_result(
                subject_rows, "assignment_id", set(labels), subject, cancel_event
            ) if model else {"status": "insufficient", "samples": 0},
        }
        if progress and subjects:
            progress("assignment_models", 45 + int(40 * (index + 1) / len(subjects)))

    if progress:
        progress("finalizing", 90)
    return {
        "schema_version": MODEL_SCHEMA_VERSION,
        "feature_version": FEATURE_VERSION,
        "trained_at": _now(),
        "sample_count": len(examples),
        "data_version": max(0, int(data_version or 0)),
        "course_model": course_model,
        "assignment_models": assignment_models,
        "meta": {
            "course_labels": course_labels,
            "course_sample_counts": dict(course_counts),
            "course_validation": course_validation,
            "assignment": assignment_meta,
        },
    }


def _valid_trained_model(model):
    if model is None:
        return True
    if not isinstance(model, dict):
        return False
    labels = model.get("labels")
    if (
        model.get("schema_version") != MODEL_SCHEMA_VERSION
        or model.get("feature_version") != FEATURE_VERSION
        or model.get("kind") != "complement_naive_bayes"
        or not isinstance(labels, list)
        or len(labels) < 2
    ):
        return False
    weights = model.get("weights")
    defaults = model.get("defaults")
    priors = model.get("priors")
    if not all(isinstance(item, dict) for item in (weights, defaults, priors)):
        return False
    return all(
        isinstance(label, str)
        and label
        and isinstance(weights.get(label), dict)
        and label in defaults
        and label in priors
        for label in labels
    )


def _valid_model_bundle(bundle):
    if not isinstance(bundle, dict):
        return False
    if (
        bundle.get("schema_version") != MODEL_SCHEMA_VERSION
        or bundle.get("feature_version") != FEATURE_VERSION
        or not isinstance(bundle.get("meta"), dict)
        or not isinstance(bundle.get("assignment_models"), dict)
    ):
        return False
    try:
        if int(bundle.get("sample_count", -1)) < 0:
            return False
        if int(bundle.get("data_version", 0)) < 0:
            return False
    except (TypeError, ValueError):
        return False
    if not _valid_trained_model(bundle.get("course_model")):
        return False
    return all(
        isinstance(subject, str)
        and subject
        and _valid_trained_model(model)
        for subject, model in bundle["assignment_models"].items()
    )


def _read_model_bundle(path):
    try:
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            bundle = json.load(handle)
        return bundle if _valid_model_bundle(bundle) else {}
    except Exception:
        return {}


def save_model_bundle(model_dir, bundle):
    if not _valid_model_bundle(bundle):
        raise ValueError("模型完整性检查失败")
    model_dir = Path(model_dir)
    model_dir.mkdir(parents=True, exist_ok=True)
    bundle_path = model_dir / "model_bundle.json.gz"
    backup_path = model_dir / "model_bundle.json.gz.bak"
    if bundle_path.exists() and _read_model_bundle(bundle_path):
        shutil.copy2(bundle_path, backup_path)
    _atomic_gzip_json(bundle_path, bundle)
    if not _read_model_bundle(bundle_path):
        if backup_path.exists() and _read_model_bundle(backup_path):
            shutil.copy2(backup_path, bundle_path)
        raise OSError("模型写入后的完整性检查失败")
    _atomic_json(model_dir / "model_meta.json", {
        "schema_version": bundle.get("schema_version"),
        "feature_version": bundle.get("feature_version"),
        "trained_at": bundle.get("trained_at"),
        "sample_count": bundle.get("sample_count", 0),
        "data_version": bundle.get("data_version", 0),
        **(bundle.get("meta") or {}),
    })
    return bundle_path


def load_model_bundle(model_dir):
    path = Path(model_dir) / "model_bundle.json.gz"
    if not path.exists():
        return {}
    bundle = _read_model_bundle(path)
    if bundle:
        return bundle
    backup = Path(str(path) + ".bak")
    return _read_model_bundle(backup) if backup.exists() else {}


def reset_models(model_dir):
    model_dir = Path(model_dir)
    removed = 0
    if not model_dir.exists():
        return removed
    for path in model_dir.iterdir():
        if path.is_file() and path.name.startswith(("model_bundle", "model_meta")):
            path.unlink(missing_ok=True)
            removed += 1
    return removed
