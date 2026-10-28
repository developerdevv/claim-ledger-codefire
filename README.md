# Claim Ledger — AI Brand Governance

AI brand-governance tool for the **Codex 48** Hackathon (demo brand: *"Saanjh"*). A human always decides; the AI only drafts findings and receipts.

---

## Architecture & Monorepo Structure

```
claim-ledger-codefire/
├── client/              # React 19 + Vite 8 + Tailwind CSS v4 Frontend (Vercel)
├── server/              # Node 20 + Express + Mongoose Backend (Render)
├── ai_eval/             # Python AI Evaluation & QA Benchmarking Pipeline
│   ├── prompts/         # Claim extraction & rewrite prompt templates
│   ├── schema/          # JSON Schema & grounding validator
│   ├── src/             # Core LLM client, retrieval, rules engine, and pipeline
│   ├── eval/            # Precision / Recall / F1 benchmark runner
│   ├── testset/         # 41 labelled test cases
│   └── tests/           # Pytest unit tests
├── docs/                # Benchmark reports and evaluation failure tracking
├── seed-data.json       # Ground truth Brand Vault facts, rules, and drafts
├── requirements.txt     # Python AI evaluation dependencies
└── pytest.ini           # Pytest configuration
```

---

## 1. Frontend (`client/`)

The web UI provides the Review Composer, Brand Vault, Impact View (tracking downstream impact of fact revisions), and Audit Trail.

```bash
cd client
npm install --legacy-peer-deps
cp .env.example .env.local
npm run dev
```

- **Stack**: React 19, Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), `lucide-react`.
- **Details**: See [`client/README.md`](client/README.md).

---

## 2. Backend (`server/`)

The REST API manages facts, executes the deterministic rule engine, coordinates LLM checks, applies the server verdict law, and records reviewer decisions.

```bash
cd server
npm install
cp .env.example .env
npm run seed
npm run dev
```

- **Stack**: Node 20 ESM, Express 4, Mongoose 8, MongoDB.
- **Tests**: `npm test` (16 Vitest unit and integration tests using `mongodb-memory-server`).
- **Smoke Tests**: `npm run smoke -- http://localhost:4000`.
- **Details**: See [`server/README.md`](server/README.md).

---

## 3. AI Evaluation & QA Pipeline (`ai_eval/`)

The standalone Python module evaluates model grounding, claim extraction, and deterministic terminology rules against approved vault facts with strict JSON schema validation.

```bash
# Install dependencies
pip install -r requirements.txt

# Run benchmark evaluation suite (Mock Mode - no API keys required)
python -m ai_eval.eval.run --mock

# Run unit tests
pytest
```

- **Validation**: Enforces strict schema conformance and verifies cited fact IDs and quote excerpts against the vault.
- **Benchmark Metrics**: Hand-calculated Precision, Recall, and F1 across `verified`, `conflicts`, `unsupported`, and `manual` verdicts.
- **Details**: See [`ai_eval/README.md`](ai_eval/README.md).

---

## Disclosures & Project Integrity

- **Fictional Scenario**: All seed data, brands, personas, and copy are fictional scenarios designed for hackathon demonstration.
- **Human-in-the-Loop**: AI output is treated as untrusted proposals; AI never approves or publishes content directly.
- **Deterministic Rules**: Terminology restrictions (e.g. banning "free shipping" in favor of "free delivery") are enforced via deterministic rules rather than model discretion.
