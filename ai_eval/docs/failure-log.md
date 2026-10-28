# Claim Ledger - Evaluation Failure Log

This log tracks every test failure identified by `ai_eval/eval/run.py`. Each entry records the input, expected vs. actual outputs, the classified failure type, root cause analysis, and the resolution or prompt/retrieval mitigation applied.

| Timestamp | Test ID | Input Claim / Draft | Expected Verdict (Fact ID) | Actual Verdict (Fact ID) | Failure Type | Root Cause Analysis | Mitigation / Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| *YYYY-MM-DD HH:MM* | *TC-XXX* | *Draft snippet or claim text* | *e.g. verified (F-001)* | *e.g. conflicts (F-001)* | *e.g. wrong scope, invented source, malformed JSON, false positive, overstated conclusion* | *Explanation of why the model or retrieval deviated* | *Prompt adjustment, retrieval threshold tweak, rule addition* |

## Failure Types Reference
- **invented source**: The model hallucinated a fact ID that does not exist in the Brand Vault. Catching this is guaranteed by `validate_output`.
- **wrong scope**: The model failed to enforce a condition (e.g. minimum cart threshold, geographic limitation, or business hours).
- **malformed JSON**: The raw output failed JSON parsing or schema validation and was routed to manual review.
- **overstated conclusion**: The model classified an ungrounded statement as an active contradiction instead of correctly declaring it `unsupported`.
- **false positive**: The model flagged a valid, compliant claim as `conflicts` when the vault fact actually supports it.
