"""Deterministic terminology and tone checker for Claim Ledger.

Scans marketing drafts for banned terms and tone violations defined in
the brand governance rules (from seed-data.json). This runs completely
deterministically without LLM hallucination risk.
"""

from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any


DEFAULT_SEED_PATH = Path(__file__).resolve().parents[2] / "seed-data.json"


def load_terms_from_seed(seed_path: str | Path | None = None) -> list[dict[str, Any]]:
    """Load term and tone rules from seed-data.json."""
    path = Path(seed_path) if seed_path else DEFAULT_SEED_PATH
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("terms", [])


def _build_regex(phrase: str) -> re.Pattern:
    """Build a case-insensitive regex for phrase with word boundary assertions."""
    # Escape special regex chars, but allow variable whitespace between words
    clean = phrase.strip()
    words = clean.split()
    escaped_words = [re.escape(w) for w in words]
    regex_body = r"\s+".join(escaped_words)
    # Use negative lookbehind/lookahead for word characters to handle punctuation like 24/7 safely
    pattern = rf"(?<![a-zA-Z0-9]){regex_body}(?![a-zA-Z0-9])"
    return re.compile(pattern, re.IGNORECASE)


def check_terms(
    text: str,
    terms: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Scan text against brand terminology and tone rules.

    Args:
        text: The draft marketing text to inspect.
        terms: List of term rule dicts containing ruleId, banned, preferred, reason, category.
               If None, loads rules from seed-data.json.

    Returns:
        List of dicts representing matched violations:
        [{
            "ruleId": str,
            "matchedText": str,
            "preferred": str,
            "reason": str,
            "category": str,
            "start": int,
            "end": int
        }, ...]
    """
    if not text:
        return []

    if terms is None:
        terms = load_terms_from_seed()

    violations: list[dict[str, Any]] = []

    for rule in terms:
        rule_id = rule.get("ruleId", "RULE-UNKNOWN")
        preferred = rule.get("preferred", "")
        reason = rule.get("reason", "")
        category = rule.get("category", "terminology")
        banned_list = rule.get("banned", [])

        if isinstance(banned_list, str):
            banned_list = [banned_list]

        for phrase in banned_list:
            if not phrase:
                continue
            pattern = _build_regex(phrase)
            for match in pattern.finditer(text):
                violations.append({
                    "ruleId": rule_id,
                    "matchedText": match.group(0),
                    "preferred": preferred,
                    "reason": reason,
                    "category": category,
                    "start": match.start(),
                    "end": match.end(),
                })

    # Sort violations deterministically by start offset
    violations.sort(key=lambda v: (v["start"], v["ruleId"]))
    return violations
