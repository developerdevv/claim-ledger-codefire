"""Unit tests for the deterministic rule checker (ai_eval/src/rule_checks.py)."""

from __future__ import annotations

import pytest
from ai_eval.src.rule_checks import check_terms


SAMPLE_RULES = [
    {
        "ruleId": "T-001",
        "banned": ["free shipping"],
        "preferred": "free delivery",
        "reason": "Standard brand terminology is 'free delivery', never 'free shipping'.",
        "category": "terminology",
    },
    {
        "ruleId": "T-002",
        "banned": ["cheapest", "lowest price in india"],
        "preferred": "affordable pricing",
        "reason": "Avoid unsubstantiated absolute price superlatives.",
        "category": "tone",
    },
    {
        "ruleId": "T-004",
        "banned": ["24/7 support", "round the clock support"],
        "preferred": "Monday-Saturday 9am-8pm support",
        "reason": "Support team is not active 24/7.",
        "category": "terminology",
    },
]


def test_clean_text_returns_no_violations():
    text = "Enjoy free delivery on all orders above ₹499 within India."
    flags = check_terms(text, terms=SAMPLE_RULES)
    assert len(flags) == 0


def test_case_insensitivity():
    variants = [
        "We offer FREE SHIPPING across India.",
        "We offer free shipping across India.",
        "We offer Free Shipping across India.",
        "We offer FrEe ShIpPiNg across India.",
    ]
    for text in variants:
        flags = check_terms(text, terms=SAMPLE_RULES)
        assert len(flags) == 1
        assert flags[0]["ruleId"] == "T-001"
        assert flags[0]["preferred"] == "free delivery"
        assert flags[0]["matchedText"].lower() == "free shipping"


def test_multiple_violations_in_single_draft():
    text = "Get free shipping and 24/7 support with the cheapest rates!"
    flags = check_terms(text, terms=SAMPLE_RULES)
    assert len(flags) == 3

    rule_ids = [f["ruleId"] for f in flags]
    assert "T-001" in rule_ids
    assert "T-004" in rule_ids
    assert "T-002" in rule_ids


def test_word_boundary_isolation():
    text = "Our shipping partner is BlueDart and we value our friendship with them."
    flags = check_terms(text, terms=SAMPLE_RULES)
    assert len(flags) == 0


def test_special_character_pattern_matching():
    text = "We take pride in our 24/7 support team."
    flags = check_terms(text, terms=SAMPLE_RULES)
    assert len(flags) == 1
    assert flags[0]["ruleId"] == "T-004"
    assert flags[0]["matchedText"] == "24/7 support"
    assert flags[0]["preferred"] == "Monday-Saturday 9am-8pm support"
