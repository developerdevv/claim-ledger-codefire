# Claim Ledger — AI brand governance

**Every claim gets a verdict and a receipt. A human keeps the final decision.**

Claim Ledger checks marketing content before it goes public. It splits a draft into claims, matches each claim against the brand's approved facts, and shows a verdict with the exact source behind it. When an approved fact changes or expires, it lists every draft that relied on it.

Built by team **CodeFire** for the Codex 48 hackathon (problem set by Inkloom AI).

![Claim ledger: verdicts, an AI-assisted badge and source receipts](docs/screenshots/claim-ledger.png)

---

## Try it now (no login, no setup)

| | |
|---|---|
| **Live app** | https://claim-ledger-codefire.vercel.app |
| **API health** | https://claim-ledger-codefire.onrender.com/api/health |

- **No account, password or registration.** Open the link and use the **Demo role** switch at the top right (Creator, Reviewer, Manager). It is a demo aid, not security.
- **All data is fictional** (demo brand "Saanjh"). Nothing real is stored or sent anywhere.
- The first request after a quiet period can take up to a minute because the free server has to wake up. The app says so while it waits.

### A 3-minute walkthrough

1. Open **Review**. Load the sample *Monsoon Handloom Edit — launch email* and press **Check content**. You can also paste your own text or use **Import from PDF**.
2. Read the **Claim ledger**. Each claim shows a verdict, the approved fact behind it, the exact quote and a suggested rewrite. A badge says whether an AI model or the built-in rule engine did the check.
3. On a flag that is wrong, press **This flag is wrong**, give a reason, then try **Undo**.
4. Open **Guideline Health** to see which rules and facts reviewers override most.
5. Open **Brand Vault**, edit fact **F-001** (free delivery above ₹499), then open **Impact View**: every claim and draft that cited it is listed and marked *Needs re-review*.
6. Switch to **Reviewer** and approve, reject or request changes on a draft. **History** keeps the record.

**Reset demo data** in the top bar restores the sample data at any time.

---

## What it does

![A conflict with its receipt and a suggested rewrite](docs/screenshots/conflict-card.png)

### Core product
- **Claim-by-claim checking** with four verdicts: **Verified**, **Conflicts**, **Unsupported** (never presented as "false") and **Manual review**.
- **Source receipts:** fact ID, approved text, exact quote, owner, verified and expiry dates.
- **Server verdict law:** a model can only propose. A verdict of Verified or Conflicts is accepted only if the cited fact exists, is active and unexpired, and the quote appears literally in that fact's text. Otherwise the claim goes to a human.
- **Deterministic terminology rules,** for example "free delivery", never "free shipping".
- **Suggested rewrites** that keep the creator's intent, with Apply and Copy.
- **Brand Vault:** approved facts with owner, verification date and expiry; create and edit.
- **Impact View:** change or expire a fact and see every dependent claim and draft.
- **Human decisions:** approve, reject or request changes with comments. History and revision records. The AI never approves.

### Added in Round 3
- **Live AI check** on a real model (Gemini), with an honest "AI-assisted check" or "Rule-based check" badge on every result, and an automatic rule-engine fallback.
- **Guideline Health:** reviewers dismiss wrong flags with a reason (with Undo); the app ranks the rules and facts overridden most.
- **Document import:** text PDFs up to 5 MB and 30 pages, with a clear message for every failure.
- **Wording and readability checks:** vague link text, runs of capitals, long lowercase hashtags, strings of emoji, very long sentences.
- **Reliability and usability:** input limit with live counter, double-click safety, empty, error and "server waking up" states, the open draft is remembered, "Page not found", keyboard focus and screen-reader labels, mobile layout.

---

## How it works

```
React app (Vercel)  →  Express API (Render)  →  MongoDB Atlas
                              │
                              ├─ Gemini via OpenAI-compatible API (draft text + active facts only)
                              └─ Deterministic rule engine (fallback and terminology)
```

1. The text is validated (1 to 12,000 characters) and checked for wording issues.
2. The server loads only **active, unexpired** facts and the terminology rules.
3. The model proposes claims, verdicts, a cited fact and a quote (20-second timeout).
4. The **verdict law** checks every proposal against the database. Anything unbacked becomes Manual review.
5. Results are merged with the rule engine and saved. Each claim records `checkMode` (`llm` or `fallback`), so a rule-based result is never shown as an AI result.

Full diagrams, data model and API table: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Run it yourself

Requirements: Node.js 20 or newer. For the full stack you also need a MongoDB database (a free MongoDB Atlas cluster or a local MongoDB).

### Option A: frontend only, no database (about 2 minutes)

```bash
cd client
npm install --legacy-peer-deps
cp .env.example .env.local      # ships with VITE_USE_MOCK=1
npm run dev                     # http://localhost:5173
```

This runs the interface against an in-browser mock of the API with the same sample data and shows a visible **MOCK MODE** banner. Mock mode is a development aid and is ignored in production builds.

### Option B: full stack (real server and database)

```bash
# 1. Server
cd server
npm install
cp .env.example .env            # then set MONGODB_URI in .env
npm run seed                    # loads the fictional sample data
npm run dev                     # http://localhost:4000

# 2. Client (new terminal)
cd client
npm install --legacy-peer-deps
cp .env.example .env.local
# in .env.local: keep VITE_API_BASE_URL=http://localhost:4000 and delete the VITE_USE_MOCK line
npm run dev                     # http://localhost:5173
```

Without an AI key the server uses its deterministic rule engine and labels results **Rule-based check**. To use a real model, uncomment the three `LLM_*` lines in `server/.env` (a Gemini example is included). Never commit real keys.

Full API reference: [`server/README.md`](server/README.md). Frontend notes: [`client/README.md`](client/README.md).

---

## Tests

| What | Command | Notes |
|---|---|---|
| Server, 35 tests | `cd server && npm test` | Vitest, Supertest and an in-memory MongoDB. The first run downloads a MongoDB test binary. |
| Evaluation module, 14 tests | `pip install -r requirements.txt && pytest` | Python 3.10 or newer. |
| Frontend build and lint | `cd client && npm run build && npm run lint` | |
| Live smoke test | `cd server && npm run smoke -- <server URL>` | A short journey against a running server. |

The 35 server tests are in five files: journey (9), verifier (7), LLM parser (5), Guideline Health (7) and wording checks (7). There are no automated UI tests; the interface was tested by hand and by outside testers.

**Peer testing (5 outside participants on the live app, Android, iPhone and Windows):** unassisted completion of tasks 1, 3 and 5 by 5 of 5; average time 4.4 minutes; clarity 4.2/5; usefulness 4.8/5. **12 break checks** on the live app were all recorded as Pass with no blocking bug. Testers found Guideline Health unclear and mixed up Unsupported with Conflicts; those wording issues are the first items on the polish list.

---

## How the AI is measured

Two harnesses measure the checking pipeline:

- **28-item live runner** against the deployed API: `node server/eval/run-eval.js <server URL>`. It prints an **Execution Mode** line, and a result only counts as a model result when it says `LLM`.
- **41 labelled cases** in `ai_eval/`, run with `python -m ai_eval.eval.run`. For a real model, set `LLM_PROVIDER=gemini`, `LLM_MODEL=gemini-3.5-flash` and `LLM_API_KEY` in the root `.env`, then confirm the run header says `Provider: gemini` before reading the numbers. `--mock` runs a deterministic pipeline test.

| Run | Mode | Result |
|---|---|---|
| 28-item live runner, 28 Oct | Rule engine | 23/28 (82.1%) |
| 28-item live runner, 3 Nov | Rule engine (server in fallback) | 24/28 (85.7%); wrongly "Verified": 0; source validity 16/16; prompt-injection attempts blocked 4/4 |
| 41-case harness | Mock provider | Pipeline test only. Its 100% is **not** a model-accuracy figure. |

**Open item, stated plainly:** we do not yet have a clean accuracy figure for the live model. The app ran in AI mode on 3 Nov, but our scored runs hit the rule-based fallback. The four misses of the rule engine (terminology variants, a "1:59 PM" cutoff, an injection case) were all left Unsupported for a human, never wrongly Verified. Reports and the failure log: [`docs/baseline-report.md`](docs/baseline-report.md), [`docs/failure-log.md`](docs/failure-log.md).

---

## Known limits

- **A real model can misread a real fact.** The verdict law proves a cited fact and quote exist; it cannot judge meaning. In one live check, "Our GOTS certification covers every step" was marked Verified against a fact that says only that every piece is GOTS-certified. This is why a human decides every draft.
- No real accounts or separate workspaces; the role switch is a demo aid.
- Text PDFs only. Scanned PDFs and images are not read.
- Matching is keyword-based for the known fact categories, not semantic.
- Comments belong to the review decision, not to single claims.
- One shared demo workspace. Rate limits and the check cache live in one server process.

The plan for each is in [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): components, data flow, verdict law, data model, API
- [`docs/ROADMAP.md`](docs/ROADMAP.md): what is next and how we will know it works
- [`server/README.md`](server/README.md): API reference and server configuration
- [`client/README.md`](client/README.md): frontend notes
- [`ai_eval/README.md`](ai_eval/README.md): evaluation harness

## Disclosures

- **AI assistance:** the code, tests and documents were written with AI assistance (Claude, models used through arena.ai, and Antigravity) and reviewed, run and tested by the team.
- **Round 2 base:** the Round 2 prototype is the starting point of this repository. Round 3 work is the commit history after 31 October 2026, 23:59 IST.
- **Data:** every brand, person, fact and draft is fictional. The evaluation set uses a separate fictional brand ("Lumina Skincare") from the app's demo brand ("Saanjh").
- **External service:** a model API (Gemini) is called only from the server, with only the draft text and approved facts. Keys live in server environment variables, never in the repository or the client.

## Repository layout

```
client/          React 19 + Vite 8 + Tailwind CSS v4 frontend (Vercel)
server/          Node 20 + Express + Mongoose API (Render), MongoDB Atlas
ai_eval/         Python evaluation harness: 41 labelled cases, validator, tests
docs/            Architecture, roadmap, evaluation reports, screenshots
seed-data.json   Fictional vault used by the Python evaluation
```

## Team CodeFire

| Member | Role |
|---|---|
| Devdutt Sharma (team leader) | Backend, AI integration, deployment, documentation |
| Ishika Agrawal | Frontend |
| Rupesh Parchani | QA and user feedback |
| Bherusingh Dangi | AI evaluation |
