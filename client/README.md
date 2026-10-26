# Claim Ledger — frontend (`client/`)

AI brand-governance tool for the **Codex 48** hackathon. Creators submit draft
content; the backend extracts factual claims and judges each one against the
approved facts in the **Brand Vault**:

- **Verified** — an approved fact supports the claim.
- **Conflicts** — an approved fact contradicts the claim.
- **Unsupported** — no approved source found. *Never* presented as "false".
- **Manual review** — the check output was malformed or ungrounded; a human looks.

Every finding shows the exact claim quote, a plain-language explanation, the
cited source (fact/terminology ID + approved text + excerpt), and a suggested
rewrite. A human approves, rejects or requests changes. The signature
**Impact View** shows, for any edited or expired fact, every claim and draft
that cited it — those drafts become **Needs re-review**.

The demo workspace is fully fictional (brand: *Saanjh*). There is **no login**;
the role switcher is a demo aid, not security.

---

## Stack

React 19 + Vite 8 + Tailwind CSS v4 (`@tailwindcss/vite`), `lucide-react` icons,
plain JavaScript. No router/state library — a ~40-line hash router and React
context are all we use. All fetching happens in **one central client**:
`src/lib/api.js`. No secrets in `VITE_` variables; the LLM is only called by
the backend.

## Quick start

```bash
cd client
npm install --legacy-peer-deps   # see note below
cp .env.example .env.local       # then set VITE_USE_MOCK=1 to run without backend
npm run dev                      # http://localhost:5173
```

> **npm note:** npm 10.8.x crashes with `Cannot read properties of null
> (reading 'edgesOut')` while resolving this tree (arborist peer-dep bug).
> `--legacy-peer-deps` works around it; npm ≥ 11 installs cleanly without the
> flag.

Scripts: `npm run dev` · `npm run build` · `npm run preview` · `npm run lint`
(oxlint).

## Environment variables

| Variable            | Purpose                                                        | Example                   |
| ------------------- | -------------------------------------------------------------- | ------------------------- |
| `VITE_API_BASE_URL` | Base URL of the backend API (no trailing slash).               | `http://localhost:4000`   |
| `VITE_USE_MOCK`     | `"1"` = in-browser mock adapter. **Dev only, never in prod.**  | `1`                       |

`.env.example` ships with placeholders; `.env.local` is git-ignored. No secret
ever belongs in a `VITE_` variable (they are public by design).

### Mock mode (development aid)

`VITE_USE_MOCK=1` (and `import.meta.env.DEV`) swaps the HTTP adapter for an
in-memory one with the same interface, seeded with fictional data:

- **F-001** free delivery above **₹499** — edit it to ₹799 in the Brand Vault
  and watch all 3 drafts citing it flip to *Needs re-review* in Impact View;
  re-checking any of them re-judges the old claim as **Conflicts** and
  suggests ₹799.
- **T-004** terminology rule: "free delivery", never "free shipping".
- **D-1…D-3** three sample drafts citing F-001 (plus F-002…F-004, guidelines
  G-001…G-004, terminology T-001…T-004).

A visible **MOCK MODE** banner is shown. Production builds can never use mock
data: the flag is gated behind `import.meta.env.DEV`, the mock module is not
even present in production bundles (verified), and a failing backend in prod
renders an error state with **Retry** — never a silent fallback. Mock state
lives in page memory: a browser reload re-seeds it; **Reset demo data**
(`POST /api/demo/reset`) restores the starting state in place.

## API contract (what `src/lib/api.js` calls)

| Method & path                        | Request body                                        | Response (assumed shape) |
| ------------------------------------ | --------------------------------------------------- | ------------------------ |
| `GET /api/health`                    | —                                                   | `{ ok }`                 |
| `GET /api/facts`                     | —                                                   | `fact[]` or `{ facts }`  |
| `POST /api/facts`                    | `{ text, owner, verifiedOn, expiresOn, actor? }`    | `fact`                   |
| `PATCH /api/facts/:id`               | same, partial + `actor?`                            | `{ fact, impact: { claims[], drafts[] } }` |
| `GET /api/guidelines`                | —                                                   | `{ guidelines[], terminology[] }` |
| `POST /api/check`                    | `{ draftId?, title, text, contentType }`            | `{ claims[], manualReview, draftId? }` |
| `POST /api/drafts`                   | `{ title, text, contentType }`                      | `draft`                  |
| `GET /api/drafts`                    | —                                                   | `draft[]`                |
| `GET /api/drafts/:id`                | —                                                   | `{ draft, claims[] }`    |
| `PATCH /api/drafts/:id/decision`     | `{ decision: approved\|rejected\|changes, comment?, actor? }` | `draft`        |
| `GET /api/impact`                    | —                                                   | impact entries (below)   |
| `GET /api/history`                   | —                                                   | event[] (below)          |
| `POST /api/demo/reset`               | —                                                   | `{ ok }`                 |

Locked shapes:

```js
fact  { _id, text, owner, verifiedOn, expiresOn, status }
claim { _id, draftId, text, verdict: "verified"|"conflicts"|"unsupported"|"manual",
        factId, excerpt, explanation, suggestion }
draft { _id, title, text, status: "in_review"|"approved"|"rejected"|"changes"|"needs_re_review" }
```

Impact entry (assumed): `{ _id, factId, fact, previousText, reason: "edited"|"expired",
at, claims: claim[], drafts: draft[] }`.
History event (assumed): `{ _id, type: "decision"|"fact_change", at, actor,
draftId?, draftTitle?, from?, to?, comment?, factId?, previousText?, newText?,
affectedDraftIds? }`.

The client normalises defensively (arrays or `{ facts }`/`{ draft }` wrappers,
unknown verdicts → `manual`), so small backend differences won't break pages.

### Assumptions / differences to agree with the backend

1. `POST /api/check` accepts an optional `draftId`; when present the backend
   should update that draft's title/text/contentType before checking, and the
   returned claims should carry `draftId` (locked claim shape). If claims come
   back without `draftId`, the client attaches the one it sent/created.
2. `GET /api/drafts/:id` should return stored claims alongside the draft
   (`{ draft, claims }`, or `claims` on the draft) so re-review shows the last
   findings; `draft.decisions[]` and `draft.contentType` are extra fields the
   UI uses when present (decision history otherwise comes from
   `GET /api/history`).
3. `actor` is sent on decisions and fact mutations for the audit trail
   (demo role name, e.g. `Reviewer (demo)`); a real backend may ignore it and
   use its session instead.
4. `PATCH /api/facts/:id` must return the impact object even when empty
   (`{ claims: [], drafts: [] }`).

## Project map

```
src/lib/api.js            central client: HTTP adapter, normalisers, mock gate
src/lib/mock/             mock adapter + seed + deterministic check engine (dev only)
src/lib/router.jsx        hash router (useRoute / navigate / Link)
src/lib/format.js         dates, relative time, word count, expiry helpers
src/state/demo.jsx        demo role + global refresh key (reset demo data)
src/components/layout/    Shell, Sidebar (nav), TopBar (badge, role, reset), drawer
src/components/ui/        Button, Modal, ConfirmDialog, Toasts, badges, states
src/components/review/    ClaimCard, DecisionDialog
src/components/vault/     FactDialog (add/edit with validation)
src/pages/                ReviewPage, ImpactPage, VaultPage, HistoryPage
```

Routing is hash-based (`#/review`, `#/review?draft=D-2`, `#/vault`,
`#/impact`, `#/history`) so the built app runs on any static host with no
server config; unknown hashes fall back to Review.

## Design system (enforced in `src/index.css` + `badges.jsx`)

- Warm paper `#F7F6F2`, white surfaces, ink `#1B2236`, fine warm-grey lines.
- Brand accent deep navy `#14213D`; signature ember `#E8590C` **only** in
  Impact View and on *Needs re-review*. Green/red/amber **only** for verdicts.
- Every verdict/status = icon **and** text label; colour is never the signal.
- Sans UI type, one restrained serif for page/section headings, mono for IDs.
- No gradients, glassmorphism, emoji icons, fake analytics or dead buttons.
- AA contrast throughout (checked numerically); visible focus rings; labelled
  inputs; toasts instead of `alert()`; confirms for consequential actions;
  tables collapse to cards on mobile; no `dangerouslySetInnerHTML` anywhere.

## Judge walkthrough (≈2 min, no help needed)

1. **Review** → load *Festive Sale — Instagram caption* → **Check content** →
   read verdicts, open *Show evidence & details*, **Apply to this claim** on a
   rewrite, then **Approve** (or Reject/Request changes — comment required).
2. **Brand Vault** → edit **F-001** (₹499 → ₹799) → save → notice
   *"3 drafts need re-review"* → **Open Impact View**.
3. **Impact View** → follow the chain: fact (was → now) → claims that cited it
   → affected drafts → **Open draft** → **Re-check content** → the old claim
   now *Conflicts* with a ₹799 suggestion.
4. **History** shows the decision + the fact edit. **Reset demo data** restores
   everything.

## Known limitations

- Mock check engine is deterministic rules (not an LLM): it recognises
  delivery/offer/material/dispatch/superlative/statistic patterns; anything
  else yields no claim, and very short input yields `manualReview: true`.
- Mock data is per-page-load memory; opening the app in a new tab starts fresh.
- Decisions/fact edits in mock mode are not shared across browser tabs.
- `npm run lint` reports advisory warnings (React-compiler style
  `set-state-in-effect` for data-fetch effects, fast-refresh export mixing);
  zero errors.
- The review composer keeps UI filters (e.g. Vault search) across a demo
  reset — reset restores data, not UI state.
