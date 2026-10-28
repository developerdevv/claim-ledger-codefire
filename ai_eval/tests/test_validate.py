"""Unit tests for the Claim Ledger output validator (ai_eval/schema/validate.py)."""

from __future__ import annotations

import pytest
from ai_eval.schema.validate import validate_output


SAMPLE_FACTS = [
    {
        "id": "F-001",
        "text": "Free delivery applies to all orders above ₹499 within India.",
        "conditions": "Order value >= ₹499",
    },
    {
        "id": "F-002",
        "text": "Orders placed before 2:00 PM IST Monday to Friday are dispatched on the same business day.",
        "conditions": "Weekdays before 14:00 IST",
    },
]


def test_valid_output_passes():
    raw = {
        "claims": [
            {
                "text": "Free delivery applies to all orders above ₹499 within India.",
                "verdict": "verified",
                "factId": "F-001",
                "excerpt": "Free delivery applies to all orders above ₹499 within India.",
                "explanation": "Direct match with approved shipping policy.",
                "suggestedFix": None,
                "confidence": "high",
            }
        ]
    }
    result = validate_output(raw, SAMPLE_FACTS)
    assert result["valid"] is True
    assert len(result["errors"]) == 0
    assert len(result["claims"]) == 1
    assert result["claims"][0]["verdict"] == "verified"
    assert result["claims"][0]["factId"] == "F-001"


def test_markdown_fence_stripped():
    raw_str = """```json
    {
      "claims": [
        {
          "text": "Free delivery applies to all orders above ₹499 within India.",
          "verdict": "verified",
          "factId": "F-001",
          "excerpt": "orders above ₹499",
          "explanation": "Matches threshold.",
          "suggestedFix": null,
          "confidence": "high"
        }
      ]
    }
    ```"""
    result = validate_output(raw_str, SAMPLE_FACTS)
    assert result["valid"] is True
    assert len(result["errors"]) == 0
    assert len(result["claims"]) == 1


def test_malformed_json_rejected():
    raw_str = '{"claims": [ { "text": "Incomplete json'
    result = validate_output(raw_str, SAMPLE_FACTS)
    assert result["valid"] is False
    assert any("Malformed JSON" in e for e in result["errors"])
    assert len(result["claims"]) == 1
    assert result["claims"][0]["verdict"] == "manual"
    assert "Rejected by validator" in result["claims"][0]["explanation"]


def test_missing_field_rejected():
    raw = {
        "claims": [
            {
                "text": "Free delivery on orders above ₹499.",
                "verdict": "verified",
                "factId": "F-001",
                "excerpt": "orders above ₹499",
                "suggestedFix": None,
            }
        ]
    }
    result = validate_output(raw, SAMPLE_FACTS)
    assert result["valid"] is False
    assert any("Schema error" in e for e in result["errors"])
    assert result["claims"][0]["verdict"] == "manual"


def test_invalid_verdict_enum_rejected():
    raw = {
        "claims": [
            {
                "text": "Free delivery on orders above ₹499.",
                "verdict": "true",
                "factId": "F-001",
                "excerpt": "orders above ₹499",
                "explanation": "Test",
                "suggestedFix": None,
                "confidence": "high",
            }
        ]
    }
    result = validate_output(raw, SAMPLE_FACTS)
    assert result["valid"] is False
    assert any("Schema error" in e for e in result["errors"])
    assert result["claims"][0]["verdict"] == "manual"


def test_verified_with_null_fact_id_rejected():
    raw = {
        "claims": [
            {
                "text": "Free delivery applies to all orders above ₹499 within India.",
                "verdict": "verified",
                "factId": None,
                "excerpt": None,
                "explanation": "Supposedly verified but no fact ID cited",
                "suggestedFix": None,
                "confidence": "high",
            }
        ]
    }
    result = validate_output(raw, SAMPLE_FACTS)
    assert result["valid"] is False
    assert any("factId is null" in e for e in result["errors"])
    assert result["claims"][0]["verdict"] == "manual"


def test_invented_fact_id_rejected():
    raw = {
        "claims": [
            {
                "text": "We offer 50-year warranty on all products.",
                "verdict": "verified",
                "factId": "F-999",
                "excerpt": "50-year warranty",
                "explanation": "Invented source test",
                "suggestedFix": None,
                "confidence": "high",
            }
        ]
    }
    result = validate_output(raw, SAMPLE_FACTS)
    assert result["valid"] is False
    assert any("invented source" in e for e in result["errors"])
    assert result["claims"][0]["verdict"] == "manual"


def test_excerpt_not_in_fact_text_rejected():
    raw = {
        "claims": [
            {
                "text": "Free delivery applies to all orders above ₹499 within India.",
                "verdict": "verified",
                "factId": "F-001",
                "excerpt": "Completely fabricated excerpt text that is not in the fact",
                "explanation": "Excerpt mismatch test",
                "suggestedFix": None,
                "confidence": "high",
            }
        ]
    }
    result = validate_output(raw, SAMPLE_FACTS)
    assert result["valid"] is False
    assert any("not found in fact" in e for e in result["errors"])
    assert result["claims"][0]["verdict"] == "manual"


def test_unsupported_claim_with_null_fact_id_passes():
    raw = {
        "claims": [
            {
                "text": "Voted #1 beauty brand in universe.",
                "verdict": "unsupported",
                "factId": None,
                "excerpt": None,
                "explanation": "No approved source found in brand vault.",
                "suggestedFix": None,
                "confidence": "high",
            }
        ]
    }
    result = validate_output(raw, SAMPLE_FACTS)
    assert result["valid"] is True
    assert len(result["errors"]) == 0
    assert result["claims"][0]["verdict"] == "unsupported"
    assert result["claims"][0]["factId"] is None
