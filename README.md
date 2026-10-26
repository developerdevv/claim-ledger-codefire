# Claim Ledger

AI brand-governance tool — **Codex 48** hackathon. Fictional demo brand:
"Saanjh". A human always decides; the AI only drafts findings.

- `client/` — React + Vite + Tailwind frontend. Setup, env vars, mock mode,
  the API contract and a judge walkthrough: see [`client/README.md`](client/README.md).

Backend packages will live alongside `client/` as teammates add them. The
frontend talks to it through `client/src/lib/api.js` only.

```bash
cd client && npm install --legacy-peer-deps && cp .env.example .env.local && npm run dev
```
