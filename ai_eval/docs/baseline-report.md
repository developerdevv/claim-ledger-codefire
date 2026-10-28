# Claim Ledger - AI Evaluation Baseline Report

**Execution Date:** 2026-10-28 22:27:37  
**Provider / Model:** mock / mock-claim-engine-v1  
**Evaluation Mode:** Deterministic Mock Pipeline  
**Test Set Size:** 41 test cases  

---

## 1. Executive Summary

Claim Ledger evaluates marketing copy against an approved Brand Vault of verified business facts. This report presents the empirical performance baseline of the claim extraction, retrieval, and verification pipeline evaluated against the curated, multi-scenario test suite (`ai_eval/testset/claims.json`).

All reported metrics are measured empirically; no speculative or theoretical accuracy numbers are claimed.

---

## 2. Core Metrics Summary

| Metric | Measured Value | Target / Threshold | Status |
| :--- | :--- | :--- | :--- |
| **Test Set Size** | 41 cases | >= 30 | Pass |
| **Source Validity** | 100.00% | 100% | Verified |
| **Malformed Output Rate** | 0.00% | 0.0% | Pass |
| **False-Positive Rate** (Conflicts on Verified) | 0.00% | < 5.0% | Pass |
| **Deterministic Term-Flag Accuracy** | 100.00% | 100% | Pass |

---

## 3. Per-Verdict Performance (Computed by hand, no sklearn)

| Verdict | Precision | Recall | F1 Score | Support (Count) |
| :--- | :--- | :--- | :--- | :--- |
| **Verified** | 100.0% | 100.0% | 100.0% | 17 |
| **Conflicts** | 100.0% | 100.0% | 100.0% | 13 |
| **Unsupported** | 100.0% | 100.0% | 100.0% | 8 |
| **Manual** | 100.0% | 100.0% | 100.0% | 3 |

---

## 4. Grounding & Human Oversight

Because LLM outputs cannot be treated as infallible ground truth, "Grounding" (confirming whether the cited vault source genuinely supports the verdict in real-world brand governance) requires human verification.

- **Manual Grounding Audit File:** Generated at `ai_eval/eval/results/grounding_check.csv`.
- Reviewers inspect the exact cited fact ID, fact text, extracted excerpt, and fill in the `supports (y/n)` column.

---

## 5. Failing Cases & Discrepancy Breakdown

No failing cases detected. All test assertions met expected criteria.

---

## 6. Evaluation Methodology

1. **Deterministic Rule Checks:** Run first via `ai_eval/src/rule_checks.py` against banned brand terms and tone guidelines.
2. **Normalized Retrieval:** `ai_eval/src/retrieval.py` indexes the Brand Vault with currency (`₹` / `Rs`) and number normalizations to retrieve relevant candidate facts.
3. **Prompt Execution:** Extraction prompt (`ai_eval/prompts/extract_v1.txt`) instructs the model to compare claims only against supplied facts, assign calibrated verdicts, cite fact IDs, and provide verbatim excerpts.
4. **Untrusted Output Validation:** `ai_eval/schema/validate.py` parses the output against `claims.schema.json`, rejects malformed structures or invented fact IDs, verifies that excerpts are substrings of the cited facts, and routes rejections to manual human review.
