"""Lightweight rule-based classification helpers for submitted assignments.

This module deliberately has no dependency on server.py.  It can be imported,
tested, and disabled independently so classifier failures never block startup.
"""

from __future__ import annotations

import copy
import json
import os
import re
import tempfile
from pathlib import Path


SCHEMA_VERSION = 1
DEFAULT_SETTINGS = {
    "mode": "rules",
    "sensitivity": 0.70,
    "sensitivity_preset": "balanced",
    "active_semester": "",
}

GENERIC_WORDS = {
    "作业", "报告", "实验", "论文", "课程", "设计", "提交", "文件",
    "最终", "最终版", "最新版", "新建", "副本", "附件", "文档", "同学",
    "doc", "docx", "pdf", "ppt", "pptx", "xls", "xlsx", "zip", "rar",
}
TYPE_WORDS = {
    "实验报告", "课后题", "课程设计", "大作业", "复习资料", "课程论文",
    "小组作业", "作业", "报告", "实验", "论文", "习题", "练习", "项目",
}


class RulePackError(ValueError):
    """Raised when an imported rule pack is invalid."""


def default_rule_pack():
    return {
        "schema_version": SCHEMA_VERSION,
        "profile": {"name": "", "major": "", "semester": "", "school": ""},
        "subjects": {},
        "types": {},
    }


def default_settings():
    return dict(DEFAULT_SETTINGS)


def _clean_text(value, max_length=120):
    text = str(value or "").strip()
    text = re.sub(r"\s+", " ", text)
    return text[:max_length]


def _clean_list(value, max_items=100, max_length=80):
    if value is None:
        return []
    if not isinstance(value, list):
        raise RulePackError("规则字段必须是数组")
    result = []
    seen = set()
    for item in value:
        text = _clean_text(item, max_length)
        key = text.casefold()
        if text and key not in seen:
            result.append(text)
            seen.add(key)
        if len(result) >= max_items:
            break
    return result


def normalize_rule_pack(payload, allowed_subjects=None):
    """Validate and normalize a rule pack without mutating the input."""
    if not isinstance(payload, dict):
        raise RulePackError("专业包必须是 JSON 对象")
    version = payload.get("schema_version")
    if version != SCHEMA_VERSION:
        raise RulePackError(f"不支持的 schema_version：{version}")

    raw_profile = payload.get("profile") or {}
    if not isinstance(raw_profile, dict):
        raise RulePackError("profile 必须是对象")
    profile = {
        key: _clean_text(raw_profile.get(key), 100)
        for key in ("name", "major", "semester", "school")
    }

    raw_subjects = payload.get("subjects") or {}
    if not isinstance(raw_subjects, dict):
        raise RulePackError("subjects 必须是对象")
    allowed = {_clean_text(item) for item in (allowed_subjects or []) if _clean_text(item)}
    subjects = {}
    alias_owners = {}
    collisions = []
    for raw_name, raw_data in list(raw_subjects.items())[:300]:
        name = _clean_text(raw_name, 80)
        if not name:
            continue
        if allowed and name not in allowed:
            raise RulePackError(f"专业包包含未提供的正式课程：{name}")
        if raw_data is None:
            raw_data = {}
        if not isinstance(raw_data, dict):
            raise RulePackError(f"课程 {name} 的配置必须是对象")
        confirmed = _clean_list(raw_data.get("confirmed_aliases", raw_data.get("aliases", [])))
        suggested = _clean_list(raw_data.get("suggested_aliases", []))
        keywords = _clean_list(raw_data.get("keywords", []), max_items=200)
        assignment_types = _clean_list(raw_data.get("assignment_types", []))
        confirmed = [item for item in confirmed if item != name]
        suggested = [item for item in suggested if item != name and item not in confirmed]
        for alias in [name] + confirmed:
            key = alias.casefold()
            owner = alias_owners.get(key)
            if owner and owner != name:
                collisions.append({"alias": alias, "subjects": [owner, name]})
            else:
                alias_owners[key] = name
        subjects[name] = {
            "active": bool(raw_data.get("active", True)),
            "confirmed_aliases": confirmed,
            "suggested_aliases": suggested,
            "keywords": keywords,
            "assignment_types": assignment_types,
            "source": _clean_text(raw_data.get("source", "imported"), 40) or "imported",
        }

    raw_types = payload.get("types") or {}
    if not isinstance(raw_types, dict):
        raise RulePackError("types 必须是对象")
    types = {}
    for raw_name, aliases in list(raw_types.items())[:100]:
        name = _clean_text(raw_name, 80)
        if name:
            types[name] = _clean_list(aliases)

    return {
        "rule_pack": {
            "schema_version": SCHEMA_VERSION,
            "profile": profile,
            "subjects": subjects,
            "types": types,
        },
        "collisions": collisions,
        "summary": {
            "subjects": len(subjects),
            "confirmed_aliases": sum(len(item["confirmed_aliases"]) for item in subjects.values()),
            "suggested_aliases": sum(len(item["suggested_aliases"]) for item in subjects.values()),
            "keywords": sum(len(item["keywords"]) for item in subjects.values()),
        },
    }


def merge_rule_packs(current, incoming):
    current_norm = normalize_rule_pack(current)["rule_pack"]
    incoming_norm = normalize_rule_pack(incoming)["rule_pack"]
    merged = copy.deepcopy(current_norm)
    merged["profile"].update({k: v for k, v in incoming_norm["profile"].items() if v})
    for name, data in incoming_norm["subjects"].items():
        if name not in merged["subjects"]:
            merged["subjects"][name] = copy.deepcopy(data)
            continue
        target = merged["subjects"][name]
        target["active"] = data["active"]
        target["source"] = data.get("source") or target.get("source", "imported")
        for key in ("confirmed_aliases", "suggested_aliases", "keywords", "assignment_types"):
            target[key] = _clean_list((target.get(key) or []) + (data.get(key) or []), max_items=200)
        target["suggested_aliases"] = [
            item for item in target["suggested_aliases"] if item not in target["confirmed_aliases"]
        ]
    for name, aliases in incoming_norm["types"].items():
        merged["types"][name] = _clean_list((merged["types"].get(name) or []) + aliases)
    return normalize_rule_pack(merged)["rule_pack"]


def load_rule_pack(path):
    path = Path(path)
    if not path.exists():
        return default_rule_pack()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return normalize_rule_pack(payload)["rule_pack"]
    except Exception:
        return default_rule_pack()


def save_rule_pack(path, payload):
    normalized = normalize_rule_pack(payload)["rule_pack"]
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(normalized, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temp_name, path)
    except Exception:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise
    return normalized


def normalize_filename(filename, students=None):
    text = Path(str(filename or "")).stem.casefold()
    for student in students or []:
        values = student.values() if isinstance(student, dict) else [student]
        for value in values:
            token = _clean_text(value, 80).casefold()
            if len(token) >= 2:
                text = text.replace(token, " ")
    text = re.sub(r"\b20\d{6,12}\b", " ", text)
    text = re.sub(r"\b\d{7,14}\b", " ", text)
    text = re.sub(r"(?:最终版?|最新版|修订版?|副本|copy|final|v\d+(?:\.\d+)*)", " ", text, flags=re.I)
    text = re.sub(r"[\s_\-—+（）()\[\]【】.,，。]+", " ", text)
    return text.strip()


def _subject_registry(assignments, rules, subject_synonyms=None):
    registry = {}
    for assignment in assignments or []:
        name = _clean_text(assignment.get("subject_group") or assignment.get("subject"), 80)
        if name:
            registry.setdefault(name, {"active": True, "aliases": set(), "keywords": set()})
    for name, aliases in (subject_synonyms or {}).items():
        name = _clean_text(name, 80)
        if not name:
            continue
        registry.setdefault(name, {"active": True, "aliases": set(), "keywords": set()})
        registry[name]["aliases"].update(_clean_list(list(aliases or [])))
    for name, data in (rules or {}).get("subjects", {}).items():
        registry.setdefault(name, {"active": True, "aliases": set(), "keywords": set()})
        registry[name]["active"] = bool(data.get("active", True))
        registry[name]["aliases"].update(_clean_list(data.get("confirmed_aliases", [])))
        registry[name]["keywords"].update(_clean_list(data.get("keywords", []), max_items=200))
    return registry


def classify_subject(filename, assignments=None, rules=None, feedback=None,
                     subject_synonyms=None, students=None, sensitivity=0.70):
    clean = normalize_filename(filename, students)
    registry = _subject_registry(assignments or [], rules or default_rule_pack(), subject_synonyms)

    feedback_hits = []
    for item in reversed((feedback or {}).get("subject_corrections", [])):
        token = normalize_filename(item.get("token", ""), students)
        subject = _clean_text(item.get("to_subject"), 80)
        if len(token) >= 2 and subject and token in clean:
            feedback_hits.append(subject)
    if feedback_hits:
        subject = feedback_hits[0]
        return {
            "status": "subject_matched", "stage": "subject_candidate",
            "subject_group": subject, "confidence": 0.90, "score": 70,
            "source": "feedback", "evidence": [f"人工修正记忆：{subject}"],
            "subject_candidates": [{"subject_group": subject, "confidence": 0.90, "source": "feedback"}],
        }

    exact = []
    for subject, data in registry.items():
        if not data.get("active", True):
            continue
        tokens = [subject] + sorted(data["aliases"], key=len, reverse=True)
        matched = next((token for token in tokens if len(token) >= 2 and token.casefold() in clean), "")
        if matched:
            exact.append((subject, matched))
    exact_subjects = list(dict.fromkeys(item[0] for item in exact))
    if len(exact_subjects) > 1:
        return {
            "status": "subject_conflict", "stage": "pending_archive", "subject_group": "",
            "confidence": 0.0, "score": 0, "source": "rules",
            "evidence": ["文件名同时命中多个科目：" + "、".join(exact_subjects)],
            "subject_candidates": [
                {"subject_group": subject, "confidence": 0.95, "source": "rules"}
                for subject in exact_subjects
            ],
        }
    if len(exact_subjects) == 1:
        subject = exact_subjects[0]
        matched = next(item[1] for item in exact if item[0] == subject)
        return {
            "status": "subject_matched", "stage": "subject_candidate",
            "subject_group": subject, "confidence": 0.95, "score": 95,
            "source": "rules", "evidence": [f"命中课程名称或确认别名：{matched}"],
            "subject_candidates": [{"subject_group": subject, "confidence": 0.95, "source": "rules"}],
        }

    candidates = []
    for subject, data in registry.items():
        if not data.get("active", True):
            continue
        hits = [kw for kw in data["keywords"] if len(kw) >= 2 and kw.casefold() in clean]
        if not hits:
            continue
        confidence = 0.65 if len(hits) == 1 else min(0.85, 0.70 + 0.05 * len(hits))
        candidates.append({
            "subject_group": subject, "confidence": round(confidence, 2),
            "source": "rules", "hits": hits[:6],
        })
    candidates.sort(key=lambda item: (-item["confidence"], item["subject_group"]))
    if len(candidates) > 1 and candidates[0]["confidence"] == candidates[1]["confidence"]:
        return {
            "status": "subject_conflict", "stage": "pending_archive", "subject_group": "",
            "confidence": candidates[0]["confidence"], "score": int(candidates[0]["confidence"] * 100),
            "source": "rules", "evidence": ["多个科目关键词得分相同"],
            "subject_candidates": candidates[:5],
        }
    if candidates:
        best = candidates[0]
        matched = best["confidence"] >= float(sensitivity)
        return {
            "status": "subject_matched" if matched else "subject_suggested",
            "stage": "subject_candidate" if matched else "pending_archive",
            "subject_group": best["subject_group"] if matched else "",
            "confidence": best["confidence"], "score": int(best["confidence"] * 100),
            "source": "rules", "evidence": ["命中课程关键词：" + "、".join(best["hits"])],
            "subject_candidates": candidates[:5],
        }
    return {
        "status": "unknown_subject", "stage": "pending_archive", "subject_group": "",
        "confidence": 0.0, "score": 0, "source": "rules",
        "evidence": ["未识别到可靠科目"], "subject_candidates": [],
    }


def extract_keyword_candidates(subject, filenames, students=None):
    subject = _clean_text(subject, 80)
    counts = {}
    examples = {}
    for filename in filenames or []:
        clean = normalize_filename(filename, students)
        parts = re.findall(r"[\u4e00-\u9fff]{2,12}|[a-zA-Z][a-zA-Z0-9.+#-]{1,20}|\d{1,3}", clean)
        for part in parts:
            token = part.strip()
            if not token or token == subject or token.casefold() in GENERIC_WORDS:
                continue
            counts[token] = counts.get(token, 0) + 1
            examples.setdefault(token, Path(str(filename)).name)
    result = []
    total = max(1, len(filenames or []))
    for token, count in sorted(counts.items(), key=lambda item: (-item[1], -len(item[0]), item[0])):
        if token in TYPE_WORDS or any(word in token for word in TYPE_WORDS):
            category = "assignment_type"
        elif re.search(r"(?:第?[一二三四五六七八九十\d]+次|实验[一二三四五六七八九十\d]+|lab\s*\d+)", token, re.I):
            category = "experiment"
        else:
            category = "keyword"
        result.append({
            "text": token, "category": category, "count": count,
            "confidence": round(min(0.95, 0.45 + 0.5 * count / total), 2),
            "example": examples[token], "selected": category in ("keyword", "assignment_type"),
        })
    return result[:80]


def build_professional_pack_prompt(profile, courses, known_aliases=None):
    profile = profile or {}
    courses = [_clean_text(item, 80) for item in courses or [] if _clean_text(item, 80)]
    aliases = known_aliases or {}
    course_lines = "\n".join(f"- {item}" for item in courses) or "- （请填写课程）"
    alias_lines = "\n".join(f"- {key}: {', '.join(value if isinstance(value, list) else [str(value)])}" for key, value in aliases.items()) or "- 无"
    return f"""你是大学课程规则包生成助手。请只围绕用户提供的正式课程生成分类数据。
只输出 JSON，不要输出 Markdown 代码围栏、解释或额外文字。

学校：{_clean_text(profile.get('school'), 100) or '未提供'}
专业：{_clean_text(profile.get('major'), 100) or '未提供'}
学期：{_clean_text(profile.get('semester'), 100) or '未提供'}
规则包名称：{_clean_text(profile.get('name'), 100) or '本学期课程包'}

正式课程名称：
{course_lines}

用户已知简称：
{alias_lines}

要求：
1. subjects 的 key 必须严格来自上面的正式课程名称，不得新增课程。
2. confirmed_aliases 只放可靠简称；不确定联想放 suggested_aliases。
3. keywords 放课程知识点，不要把知识点当课程别名。
4. assignment_types 放常见作业类型。
5. 不确定时返回空数组，不得编造。
6. 不得包含学生信息、文件路径或 API Key。

输出 schema：
{{
  "schema_version": 1,
  "profile": {{"name": "", "major": "", "semester": "", "school": ""}},
  "subjects": {{
    "正式课程名称": {{
      "active": true,
      "confirmed_aliases": [],
      "suggested_aliases": [],
      "keywords": [],
      "assignment_types": [],
      "source": "ai_generated"
    }}
  }},
  "types": {{}}
}}"""
