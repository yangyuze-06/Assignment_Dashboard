"""Filename preprocessing and lightweight text features for local classification."""

from __future__ import annotations

import re
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path


PREPROCESS_VERSION = 2
_SEPARATORS = r"\s_\-—+（）()\[\]【】.,，。;；、"
_NOISE_RE = re.compile(
    r"(?:最终版?|最新版|修订版?|修改版?|完成版|副本|copy|final|"
    r"v\d+(?:\.\d+)*|微信文件|新建文档)",
    re.I,
)


def _text(value, limit=160):
    return re.sub(r"\s+", " ", str(value or "").strip())[:limit]


def _student_parts(student):
    if not isinstance(student, dict):
        return _text(student, 80), ""
    name = _text(
        student.get("name")
        or student.get("student_name")
        or student.get("姓名"),
        80,
    )
    student_id = _text(
        student.get("student_id")
        or student.get("id")
        or student.get("学号"),
        40,
    )
    return name, student_id


def _protected_name(name, lower_text, protected_terms):
    for term in protected_terms or []:
        term_text = _text(term, 120).casefold()
        if name and name in term_text and term_text in lower_text:
            return True
    return False


def _name_pattern(name):
    escaped = re.escape(name)
    return re.compile(
        rf"(?:^[{_SEPARATORS}]*{escaped}(?=[{_SEPARATORS}])|"
        rf"(?<=[{_SEPARATORS}]){escaped}[{_SEPARATORS}]*$|"
        rf"(?<=[{_SEPARATORS}]){escaped}(?=[{_SEPARATORS}])|"
        rf"^{escaped}|{escaped}$)",
        re.I,
    )


def inspect_filename(
    filename,
    students=None,
    class_name="",
    class_aliases=None,
    protected_terms=None,
):
    """Return an explainable, privacy-aware filename normalization result."""
    raw_name = Path(str(filename or "")).name
    suffix = Path(raw_name).suffix.lower().lstrip(".")
    stem = Path(raw_name).stem
    # Normalize separators before matching context. This lets a display value
    # such as "AI Smoke Class" match common filenames like "AI_Smoke_Class".
    working = re.sub(rf"[{_SEPARATORS}]+", " ", stem.casefold()).strip()
    protected = [_text(item, 120) for item in (protected_terms or []) if _text(item, 120)]
    removed = {
        "class_names": [],
        "student_names": [],
        "student_ids": [],
        "noise": [],
    }

    class_tokens = []
    for item in [class_name, *(class_aliases or [])]:
        token = _text(item, 80).casefold()
        if len(token) >= 2 and token not in class_tokens:
            class_tokens.append(token)
    for token in sorted(class_tokens, key=len, reverse=True):
        if token in working:
            working = working.replace(token, " ")
            removed["class_names"].append(token)

    student_rows = []
    for student in students or []:
        name, student_id = _student_parts(student)
        if name or student_id:
            student_rows.append((name.casefold(), student_id.casefold()))

    # A roster ID is a strong signal. When it is present, the associated name can
    # be removed even without separators.
    id_matched_names = set()
    for name, student_id in student_rows:
        if len(student_id) >= 5 and student_id in working:
            working = working.replace(student_id, " ")
            removed["student_ids"].append(student_id)
            if len(name) >= 2 and name in working:
                working = working.replace(name, " ")
                removed["student_names"].append(name)
                id_matched_names.add(name)

    for name, _student_id in sorted(student_rows, key=lambda item: len(item[0]), reverse=True):
        if len(name) < 2 or name in id_matched_names or name not in working:
            continue
        if _protected_name(name, working, protected):
            continue
        pattern = _name_pattern(name)
        if pattern.search(working):
            working = pattern.sub(" ", working)
            removed["student_names"].append(name)

    # Unknown long numeric IDs are safe to remove when separated from course
    # terms. Short numbers are kept because they often represent experiment IDs.
    unknown_ids = re.findall(rf"(?<!\d)\d{{7,14}}(?!\d)", working)
    for token in unknown_ids:
        if token not in removed["student_ids"]:
            removed["student_ids"].append(token)
        working = working.replace(token, " ")

    noise_hits = [match.group(0) for match in _NOISE_RE.finditer(working)]
    if noise_hits:
        removed["noise"].extend(noise_hits)
        working = _NOISE_RE.sub(" ", working)

    working = re.sub(rf"[{_SEPARATORS}]+", " ", working)
    normalized = working.strip()
    for key in removed:
        removed[key] = list(dict.fromkeys(item for item in removed[key] if item))

    return {
        "raw_name": raw_name,
        "stem": stem,
        "extension": suffix,
        "normalized_text": normalized,
        "removed": removed,
        "preprocess_version": PREPROCESS_VERSION,
    }


def extract_features(text, extension="", min_n=2, max_n=4):
    """Create sparse character/word features suitable for small text models."""
    normalized = _text(text, 500).casefold()
    features = Counter()
    segments = re.findall(r"[\u4e00-\u9fffA-Za-z0-9.+#]+", normalized)
    for segment in segments:
        if not segment:
            continue
        features[f"word:{segment}"] += 1
        compact = re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "", segment.casefold())
        for n in range(min_n, max_n + 1):
            if len(compact) < n:
                continue
            for index in range(len(compact) - n + 1):
                features[f"c{n}:{compact[index:index + n]}"] += 1

    for number in re.findall(r"(?:第\s*)?([一二三四五六七八九十百\d]{1,4})(?:次|章|节|周|实验|作业)?", normalized):
        features[f"number:{number}"] += 1
    if re.search(r"(?:实验|lab)", normalized, re.I):
        features["kind:experiment"] += 1
    if re.search(r"(?:报告|report)", normalized, re.I):
        features["kind:report"] += 1
    if re.search(r"(?:作业|习题|练习|homework)", normalized, re.I):
        features["kind:homework"] += 1
    if extension:
        features[f"ext:{_text(extension, 12).casefold()}"] += 1
    return features


def feature_set(text):
    return set(extract_features(text))


def dice_similarity(left, right):
    left_set = left if isinstance(left, set) else feature_set(left)
    right_set = right if isinstance(right, set) else feature_set(right)
    if not left_set or not right_set:
        return 0.0
    return (2.0 * len(left_set & right_set)) / (len(left_set) + len(right_set))


def text_similarity(left, right):
    left_text = re.sub(r"\s+", "", _text(left, 500).casefold())
    right_text = re.sub(r"\s+", "", _text(right, 500).casefold())
    if not left_text or not right_text:
        return 0.0
    sequence_score = SequenceMatcher(None, left_text, right_text, autojunk=False).ratio()
    return max(sequence_score, dice_similarity(feature_set(left_text), feature_set(right_text)))
