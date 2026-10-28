"""Keyword-based retrieval engine for Claim Ledger.

Retrieves relevant Brand Vault facts given a draft or claim, utilizing
currency/number normalization, token weighting, and condition matching.
"""

from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any


DEFAULT_SEED_PATH = Path(__file__).resolve().parents[2] / "seed-data.json"

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "then", "of", "at", "by", "for",
    "with", "about", "against", "between", "into", "through", "during", "before",
    "after", "above", "below", "to", "from", "up", "down", "in", "out", "on",
    "off", "over", "under", "again", "further", "then", "once", "here", "there",
    "when", "where", "why", "how", "all", "any", "both", "each", "few", "more",
    "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same",
    "so", "than", "too", "very", "s", "t", "can", "will", "just", "don", "should",
    "now", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
    "we", "our", "you", "your", "they", "them", "their", "it", "its"
}


def load_facts_from_seed(seed_path: str | Path | None = None) -> list[dict[str, Any]]:
    """Load approved Brand Vault facts from seed-data.json."""
    path = Path(seed_path) if seed_path else DEFAULT_SEED_PATH
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("facts", [])


def normalize_query_text(text: str) -> str:
    """Normalize text with currency, punctuation, and number handling."""
    t = text.lower()
    # Normalize Indian Rupee representations
    t = t.replace("₹", " inr ").replace("rs.", " inr ").replace("rs ", " inr ")
    # Replace hyphens with spaces to match compound words like 'next-day' or 'first-time'
    t = re.sub(r"[-/]", " ", t)
    # Remove non-alphanumeric except spaces
    t = re.sub(r"[^a-z0-9\s]", " ", t)
    return " ".join(t.split())


def _extract_tokens_and_numbers(text: str) -> tuple[set[str], set[str]]:
    """Split text into normalized keyword tokens and numeric tokens."""
    normalized = normalize_query_text(text)
    raw_tokens = set(normalized.split())
    tokens = {t for t in raw_tokens if t not in STOPWORDS and len(t) > 1}
    numbers = {t for t in raw_tokens if t.isdigit()}
    return tokens, numbers


def retrieve_facts(
    query: str,
    vault_facts: list[dict[str, Any]] | None = None,
    top_k: int = 5,
    min_score: float = 0.05,
) -> list[dict[str, Any]]:
    """Retrieve relevant facts from the Brand Vault for a given draft or claim.

    Args:
        query: Draft marketing text or individual claim.
        vault_facts: List of fact dicts from the vault. If None, loads from seed-data.json.
        top_k: Maximum number of relevant facts to return.
        min_score: Minimum relevance threshold to include a fact.

    Returns:
        List of relevant fact dicts ordered by relevance score descending.
    """
    if not query or not query.strip():
        return []

    if vault_facts is None:
        vault_facts = load_facts_from_seed()

    if not vault_facts:
        return []

    q_tokens, q_numbers = _extract_tokens_and_numbers(query)
    if not q_tokens and not q_numbers:
        return []

    scored_facts: list[tuple[float, dict[str, Any]]] = []

    for fact in vault_facts:
        fact_text = str(fact.get("text", ""))
        conditions = str(fact.get("conditions", ""))
        full_content = f"{fact_text} {conditions}"

        f_tokens, f_numbers = _extract_tokens_and_numbers(full_content)

        common_tokens = q_tokens.intersection(f_tokens)
        common_numbers = q_numbers.intersection(f_numbers)

        # Heavily weight matching numbers (e.g. 499, 1499, 30, 15, 99) and distinct domain terms
        token_overlap_score = len(common_tokens) * 1.5
        number_overlap_score = len(common_numbers) * 3.5

        # Check for specific phrase synonyms / keywords
        norm_q = normalize_query_text(query)
        norm_f = normalize_query_text(full_content)

        bonus = 0.0
        # Delivery & shipping overlap
        if ("delivery" in norm_q or "shipping" in norm_q) and ("delivery" in norm_f or "shipping" in norm_f):
            bonus += 1.0
        # Return policy overlap
        if ("return" in norm_q or "refund" in norm_q) and ("return" in norm_f or "refund" in norm_f):
            bonus += 1.5
        # Support overlap
        if ("support" in norm_q or "customer care" in norm_q) and "support" in norm_f:
            bonus += 1.5
        # Membership / loyalty overlap
        if ("gold" in norm_q or "membership" in norm_q or "cashback" in norm_q) and ("gold" in norm_f or "cashback" in norm_f):
            bonus += 1.5

        total_score = (token_overlap_score + number_overlap_score + bonus) / (len(q_tokens) + 1.0)

        if total_score >= min_score:
            scored_facts.append((total_score, fact))

    # Sort descending by score
    scored_facts.sort(key=lambda x: x[0], reverse=True)
    return [fact for _, fact in scored_facts[:top_k]]
