# Claim Ledger server

A Node 20 / Express / MongoDB backend for the fictional **Saanjh** Claim Ledger demo. It stores approved brand facts, checks text against those facts and terminology, records reviewer decisions, and shows the downstream impact of fact changes.

All seed people, brands, copy and data are fictional demo content. This server is not an approval or publishing system: only a reviewer decision endpoint can set a draft to `approved`, `rejected`, or `changes`.

## Contents

- [Requirements and quick start](#requirements-and-quick-start)
- [Environment variables](#environment-variables)
- [Seed, reset and health](#seed-reset-and-health)
- [API contract](#api-contract)
- [Checking pipeline and server verdict law](#checking-pipeline-and-server-verdict-law)
- [Fallback mode and status reset](#fallback-mode-and-status-reset)
- [Testing and smoke checks](#testing-and-smoke-checks)
- [Render deployment](#render-deployment)
- [Troubleshooting](#troubleshooting)
- [AI and external-service disclosure](#ai-and-external-service-disclosure)
- [Limitations](#limitations)

## Requirements and quick start

- Node.js **20 or newer** (`package.json` declares `engines.node: >=20`)
- A reachable MongoDB deployment, such as MongoDB Atlas
- npm

```bash
cd server
npm install
cp .env.example .env
# Edit .env with placeholders replaced by your real MongoDB URI and frontend origin(s).
npm run seed
npm run dev
```

The API then listens on `http://localhost:4000` by default. The frontend normally uses `http://localhost:5173` during development.

Production uses the ordinary start command:

```bash
npm start
```

`npm start` does not use a file watcher. The process handles `SIGTERM` and `SIGINT` by closing its HTTP listener and then disconnecting from MongoDB.

## Environment variables

Create a local `.env` from `.env.example`. Do not commit it: `.gitignore` excludes `.env` and `.env.*`, while retaining the safe `.env.example` template.

| Variable | Required | Example / purpose |
|---|---:|---|
| `PORT` | no | `4000`; Render normally supplies its own port. |
| `MONGODB_URI` | yes | `mongodb+srv://<username>:<password>@<cluster-host>/claim-ledger` |
| `FRONTEND_URL` | yes | One or more comma-separated explicit origins, e.g. `http://localhost:5173,https://your-app.vercel.app` |
| `DEMO_MODE` | yes in practice | `true` enables `POST /api/demo/reset`; `false` safely returns 403. |
| `SEED_ON_START` | no | `true` seeds only when the demo facts collection is empty; it never wipes existing data. |
| `LLM_BASE_URL` | no | OpenAI-compatible base URL, e.g. `https://api.openai.com/v1`. |
| `LLM_API_KEY` | no | Provider key. Leave blank to use deterministic fallback mode. |
| `LLM_MODEL` | no | Provider model identifier, e.g. `gpt-4o-mini`. |
| `NODE_ENV` | no | Standard Node environment label; defaults to `development`. |

### CORS policy

`FRONTEND_URL` is an allow-list, not a wildcard. Browser requests are accepted only when their `Origin` exactly matches one listed `http` or `https` origin. Comma-separated values are supported. Origins with paths, credentials or `*` are rejected at startup.

Requests with no `Origin` header, such as curl, Render health checks and server-to-server monitors, are allowed because they are not browser CORS requests.

## Seed, reset and health

### Initial seed

```bash
npm run seed
```

The seed command is idempotent. It inserts the fictional demo dataset only when no demo-brand facts exist. It does not erase an existing database.

With `SEED_ON_START=true`, the production process calls that same idempotent seed function at startup. When data is inserted, it logs one seed line. Existing data is left untouched.

### Demo reset

```bash
curl -X POST http://localhost:4000/api/demo/reset
```

Reset is intentionally restricted to `DEMO_MODE=true`. It deletes and recreates **only** documents for `Northstar Demo Brand`; it does not touch another brand/tenant's documents.

### Health / keep-alive target

```bash
curl http://localhost:4000/api/health
```

`GET /api/health` is intentionally inexpensive: it only returns process-visible database connection state and does not query or seed data. It is suitable for a keep-alive monitor.

## API contract

Base URL: `http://localhost:4000/api`

All errors use this safe shape:

```json
{ "error": "Human-readable safe message." }
```

Dates used by facts are `YYYY-MM-DD` strings. Timestamps on drafts, decisions, impact and history events serialize as ISO timestamps. `revisions` is an internal draft field and is never returned by HTTP endpoints.

### 1. Health

`GET /health`

Request: no body.

```json
{
  "ok": true,
  "mode": "live",
  "db": "connected"
}
```

### 2. List facts

`GET /facts`

Request: no body.

```json
[
  {
    "_id": "F-001",
    "text": "Free delivery on all orders above ₹499 within India.",
    "owner": "Priya Nair (Operations)",
    "verifiedOn": "2026-09-15",
    "expiresOn": "2026-12-31",
    "status": "active"
  }
]
```

Fact status is derived at read time: a fact is expired when `expiresOn < today`.

### 3. Create a fact

`POST /facts`

```json
{
  "text": "Orders placed before 1 PM IST ship the same working day.",
  "owner": "Operations Desk",
  "verifiedOn": "2026-10-27",
  "expiresOn": "2027-01-31",
  "actor": "You (demo)"
}
```

Example `201` response:

```json
{
  "_id": "F-5",
  "text": "Orders placed before 1 PM IST ship the same working day.",
  "owner": "Operations Desk",
  "verifiedOn": "2026-10-27",
  "expiresOn": "2027-01-31",
  "status": "active",
  "version": 1
}
```

### 4. Get one fact

`GET /facts/:id`

Request: no body. Example: `GET /facts/F-001`.

```json
{
  "_id": "F-001",
  "text": "Free delivery on all orders above ₹499 within India.",
  "owner": "Priya Nair (Operations)",
  "verifiedOn": "2026-09-15",
  "expiresOn": "2026-12-31",
  "status": "active"
}
```

### 5. Update a fact and view immediate impact

`PATCH /facts/:id`

```json
{
  "text": "Free delivery on all orders above ₹799 within India.",
  "actor": "You (demo)"
}
```

Example response:

```json
{
  "fact": {
    "_id": "F-001",
    "text": "Free delivery on all orders above ₹799 within India.",
    "version": 2,
    "status": "active"
  },
  "impact": {
    "claims": [
      { "_id": "C-102", "draftId": "D-1", "factId": "F-001", "verdict": "verified" }
    ],
    "drafts": [
      { "_id": "D-1", "status": "needs_re_review" }
    ]
  }
}
```

A text edit increments `version`, creates an impact record, creates `fact_change` history, and flags citing drafts for re-review. Clearing `expiresOn` uses `null` or `""`; an empty `verifiedOn` retains the existing verification date.

### 6. Get guidelines and terminology

`GET /guidelines`

Request: no body.

```json
{
  "guidelines": [
    {
      "_id": "G-001",
      "title": "No unverified superlatives",
      "text": "Never use superlatives unless an approved fact supports them."
    }
  ],
  "terminology": [
    {
      "_id": "T-004",
      "use": "free delivery",
      "avoid": "free shipping",
      "note": "All customer-facing copy says “free delivery”, never “free shipping”."
    }
  ]
}
```

### 7. Check content (create or update a checked draft)

`POST /check`

Create a new checked draft:

```json
{
  "title": "Homepage offer",
  "contentType": "Website copy",
  "text": "Get free delivery on all orders above ₹499."
}
```

Update/recheck a specific draft:

```json
{
  "draftId": "D-5",
  "title": "Homepage offer — revised",
  "contentType": "Website copy",
  "text": "Get free delivery on all orders above ₹499."
}
```

Example response:

```json
{
  "draftId": "D-5",
  "manualReview": false,
  "claims": [
    {
      "_id": "C-113",
      "draftId": "D-5",
      "text": "Get free delivery on all orders above ₹499.",
      "verdict": "verified",
      "factId": "F-001",
      "excerpt": "Free delivery on all orders above ₹499 within India.",
      "explanation": "Matches approved fact F-001: the benefit and the ₹499 threshold are stated correctly.",
      "suggestion": null,
      "sourceType": "fact",
      "aiGenerated": false,
      "checkMode": "fallback",
      "uncertainty": null,
      "ruleId": null
    }
  ]
}
```

`text` cannot be blank or exceed 5,000 characters. Checks are limited to 20 requests per minute per client IP. With `draftId`, claims are replaced. The prior text is saved internally in `revisions[]` only when it actually changes.

### 8. List drafts

`GET /drafts`

Request: no body.

```json
[
  {
    "_id": "D-4",
    "title": "Brand Story Post",
    "contentType": "Social post",
    "status": "in_review",
    "text": "The story of Saanjh begins at the loom.",
    "decisions": [],
    "createdAt": "2026-10-25T12:50:00.000Z",
    "updatedAt": "2026-10-25T12:50:00.000Z"
  }
]
```

Drafts are newest first. Internal `revisions` is not exposed.

### 9. Create a bare draft

`POST /drafts`

```json
{
  "title": "Unreviewed social copy",
  "contentType": "Social post",
  "text": "A bare draft can be saved before checking."
}
```

Example `201` response:

```json
{
  "_id": "D-5",
  "title": "Unreviewed social copy",
  "contentType": "Social post",
  "status": "in_review",
  "text": "A bare draft can be saved before checking.",
  "decisions": []
}
```

This endpoint deliberately does not create claims.

### 10. Get one draft and its claims

`GET /drafts/:id`

Request: no body. Example: `GET /drafts/D-1`.

```json
{
  "draft": {
    "_id": "D-1",
    "title": "Festive Sale — Instagram caption",
    "status": "in_review",
    "decisions": []
  },
  "claims": [
    {
      "_id": "C-101",
      "draftId": "D-1",
      "verdict": "conflicts",
      "factId": "F-002"
    }
  ]
}
```

### 11. Recheck the stored text

`POST /drafts/:id/recheck`

Request: no body. Example: `POST /drafts/D-1/recheck`.

```json
{
  "draftId": "D-1",
  "manualReview": false,
  "claims": [
    {
      "_id": "C-113",
      "draftId": "D-1",
      "verdict": "conflicts"
    }
  ]
}
```

The alias checks the stored text. Since stored text is unchanged, it does not add a text revision or change the draft's status.

### 12. Record a reviewer decision

`PATCH /drafts/:id/decision`

```json
{
  "decision": "changes",
  "comment": "Please update the delivery wording.",
  "actor": "Reviewer (demo)"
}
```

Allowed decisions: `approved`, `rejected`, `changes`. `comment` is required for `rejected` and `changes`; `actor` defaults to `Reviewer (demo)`.

Example response:

```json
{
  "_id": "D-1",
  "status": "changes",
  "decisions": [
    {
      "decision": "changes",
      "comment": "Please update the delivery wording.",
      "actor": "Reviewer (demo)",
      "at": "2026-10-27T09:15:00.000Z"
    }
  ]
}
```

The endpoint also appends a `decision` item to `GET /history`.

### 13. List impact records

`GET /impact`

Request: no body.

```json
[
  {
    "_id": "I-1",
    "factId": "F-001",
    "previousText": "Free delivery on all orders above ₹499 within India.",
    "reason": "edited",
    "at": "2026-10-27T09:20:00.000Z",
    "claims": [
      { "_id": "C-102", "draftId": "D-1", "factId": "F-001" }
    ],
    "drafts": [
      { "_id": "D-1", "status": "needs_re_review" }
    ]
  }
]
```

Impact records are newest first. This read also performs the lazy expiry sweep: a fact newly found expired produces one `expired` impact entry when applicable.

### 14. List history

`GET /history`

Request: no body.

```json
[
  {
    "_id": "H-3",
    "type": "decision",
    "at": "2026-10-27T09:15:00.000Z",
    "actor": "Reviewer (demo)",
    "draftId": "D-1",
    "draftTitle": "Festive Sale — Instagram caption",
    "from": "in_review",
    "to": "changes",
    "comment": "Please update the delivery wording."
  }
]
```

History is newest first. Its only event types are `fact_change` and `decision`.

### 15. Reset fictional demo data

`POST /demo/reset`

Request: no body.

```json
{ "ok": true }
```

If `DEMO_MODE=false`, the safe response is:

```json
{
  "error": "Demo mode is disabled. Set DEMO_MODE=true on the server to allow demo resets."
}
```

## Checking pipeline and server verdict law

The API treats a draft as untrusted input. Text embedded in it cannot change server rules, grant approval, alter retrieval, or override the response contract.

### Pipeline

1. **Retrieve** — loads all facts for deterministic mock-compatible rules, but sends only **active, unexpired facts** and terminology to an optional LLM.
2. **Extract** — when `LLM_API_KEY` is configured, calls an OpenAI-compatible `/chat/completions` API with a 20-second timeout. It expects a bounded JSON array and retries exactly once only for malformed model output.
3. **Apply server verdict law** — the model's labels are proposals, never authority.
4. **Merge** — terminology claims always come from the deterministic engine. Engine `verified`/`conflicts` findings win for overlapping sentence text. Valid receipt-backed model findings can replace an engine `unsupported` result.
5. **Persist** — replacement claim documents receive string `C-*` IDs and are tied to a string `D-*` draft ID.
6. **Cache / rate-limit** — check results are held in a bounded in-memory cache for 10 minutes, keyed by draft text plus active-fact versions. `/check` and `/drafts/:id/recheck` are limited to 20 requests/minute/client IP.

### Server verdict law

For a model proposal to remain `verified` or `conflicts`, all of the following must be true:

- its exact claim text appears in the draft;
- it cites a real active, unexpired approved fact;
- its cited excerpt is present in the stored fact text after case/whitespace normalization.

Otherwise the server returns `manual`, rather than trusting the model. In particular:

- fabricated or unknown `factId` → `manual`, with no receipt;
- expired cited fact → `manual`, retaining the real fact ID for audit/re-verification;
- nonexistent excerpt → `manual`, with no receipt;
- unrecognized model verdict → `manual`;
- model text not present in the draft → `manual`;
- `unsupported` means the approved source set does not support the statement. It **does not mean false**.

Only the reviewer decision route can set a draft to `approved`, `rejected`, or `changes`.

## Fallback mode and status reset

### Fallback mode

`LLM_API_KEY` is optional. Without it, or if the provider times out, fails, rate-limits, returns bad output twice, or cannot be reached, the request still succeeds via the deterministic engine.

Fallback results are labeled honestly:

```json
{
  "aiGenerated": false,
  "checkMode": "fallback"
}
```

When an LLM participated successfully, all claims from that run use `checkMode: "llm"`; `aiGenerated` still identifies the origin of each individual claim.

### Edited-draft status reset

When `POST /check` receives a `draftId` and the supplied text is **actually different** from stored text:

1. the previous text is saved to the internal-only `revisions[]` list;
2. claims are replaced;
3. the draft status is set to **`in_review`**;
4. existing `decisions[]` stays intact.

If text is exactly unchanged—including the stored-text recheck alias—the status is untouched. This prevents an edited draft from remaining approved or rejected while preserving review history.

## Testing and smoke checks

### Automated tests

```bash
npm test
```

Vitest uses `mongodb-memory-server` and `supertest`. The route-level test suite mocks `llmClient`, so it never sends a real provider request and needs no LLM key.

Coverage includes:

- seeded end-to-end journey through check, bare draft creation, decision, fact edit, impact and history;
- fabricated source IDs, expired citations, and prompt-injection-shaped draft text;
- required comments for `changes` / `rejected`;
- invalid identifiers and safe JSON error responses without client stack traces;
- CORS allow/reject behavior;
- the 21st request hitting the 20/minute checking limit;
- demo reset gating and isolation from another brand's data.

On a new machine, `mongodb-memory-server` may download a MongoDB test binary during its first invocation.

### Smoke script for local or deployed servers

```bash
npm run smoke -- http://localhost:4000
# or
npm run smoke -- https://your-service.onrender.com
```

The script uses Node 20's built-in `fetch`, prints `PASS` or `FAIL` for each step, then prints a summary and exits non-zero on any failure.

It verifies health, seed availability, guidelines, create-check, draft read, reviewer decision, edited-draft status reset, stored-text recheck, bare draft creation, impact and history. It does **not** reset demo data or edit approved facts. It does create two normal smoke-labelled drafts and one reviewer decision.

## Render deployment

### 1. Prepare MongoDB Atlas

1. Create a database user with a strong generated password and only the database permissions this service needs.
2. Copy an Atlas application connection string.
3. Allow network access from your Render service. Render outbound IPs can vary by plan and region; for a demo, Atlas `0.0.0.0/0` plus strong credentials is common. For a stricter production posture, use the current static-egress/private-network option appropriate to your Render plan instead.
4. Put the URI only in Render's encrypted environment settings, never in source code.

### 2. Create the Render web service

For a repository containing this `server/` directory:

| Render setting | Value |
|---|---|
| Environment | Node |
| Root Directory | `server` |
| Build Command | `npm install` |
| Start Command | `npm start` |

The start command binds to `PORT`, so Render can inject its own port. Do not hard-code a Render port.

### 3. Set Render environment variables

Use placeholders/real secrets only in Render's dashboard:

```text
NODE_ENV=production
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>/claim-ledger
FRONTEND_URL=https://your-app.vercel.app
DEMO_MODE=false
SEED_ON_START=true
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=<provider-api-key-or-empty-for-fallback>
LLM_MODEL=gpt-4o-mini
```

For local and deployed frontends at the same time:

```text
FRONTEND_URL=http://localhost:5173,https://your-app.vercel.app
```

No wildcard CORS origin is accepted. If `LLM_API_KEY` is absent or empty, the service runs in deterministic fallback mode.

### 4. Verify deployment

```bash
curl https://your-service.onrender.com/api/health
npm run smoke -- https://your-service.onrender.com
```

Configure any external keep-alive monitor to request:

```text
GET https://your-service.onrender.com/api/health
```

The health route is cheap and does not seed, read facts, invoke an LLM, or mutate data.

## Troubleshooting

| Symptom | Check |
|---|---|
| Startup says `MONGODB_URI is required` | Set the full Atlas URI in `.env` or Render environment settings. |
| Startup cannot connect to MongoDB | Check Atlas network access, credentials, database user privileges and copied URI escaping. |
| Browser request fails CORS | Ensure the browser's exact scheme + host + port appears in `FRONTEND_URL`; do not include a path and do not use `*`. |
| `POST /demo/reset` returns 403 | Set `DEMO_MODE=true` only in an intentionally resettable demo environment. |
| Checks say `fallback` | This is expected with no key or a provider failure. Confirm `LLM_API_KEY`, base URL and model only if LLM extraction is desired. |
| Checks return 429 | Wait one minute or reduce calls from the same client IP. The checking quota is 20/minute/IP. |
| First `npm test` is slow | `mongodb-memory-server` may be downloading its test binary. Subsequent runs typically reuse it. |
| Smoke script cannot find F-001 | Use `SEED_ON_START=true`, restart, or run `npm run seed` against an empty intended demo database. |
| Render deploy stops during shutdown | Render sends `SIGTERM` on replacement; the process closes HTTP and MongoDB cleanly before exiting. |

## AI and external-service disclosure

### Optional LLM provider

The checking pipeline can use any provider exposing an OpenAI-compatible chat-completions API. The provider, base URL, model and API key are configurable through `LLM_BASE_URL`, `LLM_MODEL` and `LLM_API_KEY`.

When enabled, the request contains only:

- the draft text being checked;
- active, unexpired approved fact IDs and fact text;
- terminology entries.

It does not send inactive/expired facts, decisions, history, other drafts, database connection strings or API keys. The code does not log full drafts or provider keys. Provider failures fall back to local deterministic checking. The server's verdict law remains authoritative regardless of provider output.

### Libraries

Runtime libraries:

- `express` — HTTP API
- `mongoose` — MongoDB models and persistence
- `zod` — request/environment validation
- `cors` — explicit origin handling
- `helmet` — baseline HTTP response security headers
- `express-rate-limit` — API and checking rate limits
- `dotenv` — local environment loading

Development/test libraries:

- `vitest` — test runner
- `supertest` — HTTP endpoint tests
- `mongodb-memory-server` — isolated in-memory MongoDB test instance

## Limitations

This is a hackathon/demo backend, not a complete multi-user production system.

- There is **no real authentication or authorization**.
- Any role switcher in the associated frontend is a **demo feature**, not an identity system.
- Retrieval/checking is intentionally **keyword-based and deterministic** for known fact categories; it is not semantic enterprise search.
- Checks are **text only**. Images, PDFs, audio, linked sources and rich document files are not inspected.
- Rate limiting and the check cache are process-local in-memory stores; multiple replicas do not share them.
- The optional LLM layer is an extraction aid, not a truth source. Its outputs can require manual review and never approve a draft.
- Demo reset is intentionally limited to the demo brand but should remain disabled in a non-demo deployment (`DEMO_MODE=false`).
