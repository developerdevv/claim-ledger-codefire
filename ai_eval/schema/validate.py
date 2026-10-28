"""Validation module for Claim Ledger extraction outputs.

Ensures untrusted LLM outputs adhere to the language-neutral JSON schema,
strictly cite existing Brand Vault fact IDs, and contain valid excerpts
found within the cited fact text.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import jsonschema


SCHEMA_PATH = Path(__file__).parent / "claims.schema.json"


def _load_schema() -> dict[str, Any]:
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _clean_json_fence(raw_str: str) -> str:
    """Strip accidental ```json ... ``` markdown code fences."""
    text = raw_str.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        # Remove opening fence line (e.g. ```json or ```)
        if len(lines) > 0 and lines[0].startswith("```"):
            lines = lines[1:]
        # Remove closing fence line
        if len(lines) > 0 and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def _normalize_facts(facts: list[dict[str, Any]] | dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Convert fact list or dictionary into a normalized lookup dict keyed by fact ID."""
    if isinstance(facts, dict):
        if "facts" in facts and isinstance(facts["facts"], list):
            fact_list = facts["facts"]
        else:
            # Already a mapping of factId -> factDict
            return {
                fid: (f if isinstance(f, dict) else {"id": fid, "text": str(f)})
                for fid, f in facts.items()
            }
    else:
        fact_list = facts

    vault: dict[str, dict[str, Any]] = {}
    for item in fact_list:
        if isinstance(item, dict):
            fid = item.get("id") or item.get("_id")
            if fid:
                vault[str(fid).strip()] = item
    return vault


def _normalize_text(text: str) -> str:
    """Normalize whitespace and lowercase for reliable excerpt matching."""
    return " ".join(text.strip().lower().split())


def validate_output(
    raw_output: str | dict[str, Any],
    facts: list[dict[str, Any]] | dict[str, Any],
) -> dict[str, Any]:
    """Validate raw LLM output against JSON schema and Brand Vault facts.

    Rejection conditions:
    - The JSON is malformed (only accidental ```json fences stripped).
    - A field is missing or has the wrong type according to claims.schema.json.
    - Verdict is 'verified' or 'conflicts' but factId is null/empty.
    - Cited factId does not exist in the Brand Vault (invented source).
    - Excerpt is not found in the cited fact's text.

    Rejected output becomes a single manual-review result with an explanatory
    error, never a fake verdict.

    Returns:
        dict: {"valid": bool, "errors": list[str], "claims": list[dict]}
    """
    errors: list[str] = []
    parsed_json: dict[str, Any] | None = None
    fallback_text = "Raw draft / model output"

    # 1. Parse JSON
    if isinstance(raw_output, dict):
        parsed_json = raw_output
    elif isinstance(raw_output, str):
        fallback_text = raw_output[:120].strip() or fallback_text
        cleaned = _clean_json_fence(raw_output)
        try:
            parsed_json = json.loads(cleaned)
        except Exception as e:
            errors.append(f"Malformed JSON: {e}")
    else:
        errors.append(f"Unsupported output type: {type(raw_output).__name__}")

    if errors or parsed_json is None:
        return _build_manual_fallback(errors, fallback_text)

    # 2. Validate against claims.schema.json
    try:
        schema = _load_schema()
        validator = jsonschema.Draft202012Validator(schema)
        schema_errors = list(validator.iter_errors(parsed_json))
        for err in schema_errors:
            path_str = " -> ".join([str(p) for p in err.path]) if err.path else "root"
            errors.append(f"Schema error at [{path_str}]: {err.message}")
    except Exception as e:
        errors.append(f"Schema validation failure: {e}")

    if errors:
        return _build_manual_fallback(errors, fallback_text)

    raw_claims = parsed_json.get("claims", [])
    vault = _normalize_facts(facts)
    valid_claims: list[dict[str, Any]] = []

    # 3. Validate individual claims against Vault facts
    for idx, claim in enumerate(raw_claims):
        claim_text = claim.get("text", f"Claim #{idx + 1}")
        verdict = claim.get("verdict")
        fact_id = claim.get("factId")
        excerpt = claim.get("excerpt")

        # Condition 3: verdict is verified/conflicts but factId is null
        if verdict in ("verified", "conflicts") and not fact_id:
            errors.append(
                f"Claim #{idx + 1} ('{claim_text[:60]}'): verdict is '{verdict}' but factId is null."
            )

        # Condition 4: factId does not exist in the vault (invented source)
        if fact_id:
            fact_id_str = str(fact_id).strip()
            if fact_id_str not in vault:
                errors.append(
                    f"Claim #{idx + 1} ('{claim_text[:60]}'): cites non-existent factId '{fact_id}' (invented source)."
                )
            else:
                cited_fact = vault[fact_id_str]
                fact_text = str(cited_fact.get("text", "")).strip()

                # Condition 5: excerpt must be provided and found in cited fact's text
                if verdict in ("verified", "conflicts") and not excerpt:
                    errors.append(
                        f"Claim #{idx + 1} ('{claim_text[:60]}'): verdict is '{verdict}' but excerpt is null or empty."
                    )
                elif excerpt:
                    norm_excerpt = _normalize_text(str(excerpt))
                    norm_fact_text = _normalize_text(fact_text)
                    if norm_excerpt not in norm_fact_text:
                        errors.append(
                            f"Claim #{idx + 1} ('{claim_text[:60]}'): excerpt '{excerpt[:60]}' not found in fact {fact_id} text: '{fact_text[:80]}'."
                        )

        valid_claims.append(claim)

    if errors:
        # Rejected output becomes a single manual-review result
        first_claim_text = raw_claims[0].get("text") if raw_claims else fallback_text
        return _build_manual_fallback(errors, first_claim_text)

    return {
        "valid": True,
        "errors": [],
        "claims": valid_claims,
    }


def _build_manual_fallback(errors: list[str], text: str) -> dict[str, Any]:
    """Construct a standardized single manual-review result upon rejection."""
    summary_error = "; ".join(errors) if errors else "Validation failed."
    fallback_claim = {
        "text": text if text else "Unparsed draft claim",
        "verdict": "manual",
        "factId": None,
        "excerpt": None,
        "explanation": f"Rejected by validator: {summary_error}",
        "suggestedFix": None,
        "confidence": "low",
    }
    return {
        "valid": False,
        "errors": errors,
        "claims": [fallback_claim],
    }
