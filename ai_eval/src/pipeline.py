"""Claim Ledger End-to-End Evaluation Pipeline.

Orchestrates:
  draft text -> keyword retrieval -> LLM extract -> validate_output -> verdicts + deterministic term flags.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ai_eval.schema.validate import validate_output
from ai_eval.src.llm_client import LLMClient
from ai_eval.src.retrieval import load_facts_from_seed, retrieve_facts
from ai_eval.src.rule_checks import check_terms, load_terms_from_seed


PROMPT_PATH = Path(__file__).resolve().parents[1] / "prompts" / "extract_v1.txt"


def format_facts_for_prompt(facts: list[dict[str, Any]]) -> str:
    """Format facts into clean, prompt-ready bullet points with conditions."""
    if not facts:
        return "(No matching Brand Vault facts found)"
    lines = []
    for f in facts:
        fid = f.get("id", "F-UNKNOWN")
        text = f.get("text", "")
        conds = f.get("conditions")
        cond_str = f" [Conditions: {conds}]" if conds else ""
        lines.append(f"- {fid}: {text}{cond_str}")
    return "\n".join(lines)


def run_pipeline(
    draft_text: str,
    vault_facts: list[dict[str, Any]] | None = None,
    terms: list[dict[str, Any]] | None = None,
    llm_client: LLMClient | None = None,
    prompt_path: str | Path | None = None,
    retrieve_all_if_empty: bool = True,
) -> dict[str, Any]:
    """Execute the full Claim Ledger verification pipeline on a marketing draft.

    Steps:
    1. Retrieve relevant facts from the vault using keyword & entity matching.
    2. Run deterministic terminology and tone rule checks.
    3. Render the extraction and verification prompt.
    4. Call the LLM (or deterministic mock).
    5. Pass untrusted model output through validate_output against the vault.
    6. Return unified findings with receipts and term flags.

    Args:
        draft_text: Raw marketing text or draft.
        vault_facts: Full list of approved vault facts. Defaults to seed-data.json.
        terms: List of term/tone rules. Defaults to seed-data.json.
        llm_client: LLMClient instance. Defaults to LLMClient().
        prompt_path: Path to extract_v1.txt prompt template.
        retrieve_all_if_empty: If true and retrieval finds 0 facts, supply all vault facts to prompt.

    Returns:
        Dict containing draft, validity, validationErrors, claims, termFlags, retrievedFactIds, rawModelOutput.
    """
    if vault_facts is None:
        vault_facts = load_facts_from_seed()
    if terms is None:
        terms = load_terms_from_seed()
    if llm_client is None:
        llm_client = LLMClient()

    # Step 1: Retrieval
    retrieved_facts = retrieve_facts(draft_text, vault_facts=vault_facts, top_k=6)
    if not retrieved_facts and retrieve_all_if_empty:
        # For small vaults in demo/testing, fall back to supplying full vault if query is broad
        retrieved_facts = vault_facts

    # Step 2: Deterministic Rule Checks
    term_flags = check_terms(draft_text, terms=terms)

    # Step 3: Render Prompt
    p_path = Path(prompt_path) if prompt_path else PROMPT_PATH
    with open(p_path, "r", encoding="utf-8") as f:
        template = f.read()

    facts_formatted = format_facts_for_prompt(retrieved_facts)
    prompt = template.replace("{{vault_facts}}", facts_formatted)
    prompt = prompt.replace("{{draft_text}}", draft_text)

    # Step 4: LLM Generation
    raw_llm_output = llm_client.generate(prompt)

    # Step 5: Untrusted Output Validation
    # Validate against all approved vault facts to catch invented fact IDs
    validation_res = validate_output(raw_llm_output, facts=vault_facts)

    return {
        "draft": draft_text,
        "valid": validation_res["valid"],
        "validationErrors": validation_res["errors"],
        "claims": validation_res["claims"],
        "termFlags": term_flags,
        "retrievedFactIds": [f.get("id") for f in retrieved_facts if f.get("id")],
        "rawModelOutput": raw_llm_output,
    }
