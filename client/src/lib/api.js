/**
 * Claim Ledger — central API client.
 *
 * EVERY network call in the app goes through this module. Pages import the
 * named functions below; they never call fetch() themselves.
 *
 * Two adapters implement the same interface:
 *   • httpAdapter  — talks to the real backend (VITE_API_BASE_URL).
 *   • mock adapter — in-browser fictional data, DEVELOPMENT ONLY.
 *
 * Mock mode is gated behind VITE_USE_MOCK === "1" AND import.meta.env.DEV.
 * Production builds can never fall back to mock data: if the backend fails,
 * the caller receives an ApiError and the UI shows it with a Retry action.
 *
 * No secrets live in VITE_ variables; the LLM is only called by the backend.
 */

import { ApiError } from './errors'

export { ApiError }

const BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

const MOCK_ENABLED =
  import.meta.env.DEV && String(import.meta.env.VITE_USE_MOCK ?? '') === '1'

/** True when the app is running against the in-browser mock adapter. */
export function isMockMode() {
  return MOCK_ENABLED
}

/** The API base URL shown in error messages / diagnostics. */
export function apiBaseLabel() {
  return BASE || 'the same origin as this app'
}

let adapterPromise = null

function getAdapter() {
  if (!adapterPromise) {
    adapterPromise = MOCK_ENABLED
      ? import('./mock/adapter').then((m) => m.createMockAdapter())
      : Promise.resolve(httpAdapter)
  }
  return adapterPromise
}

/* -------------------------------------------------------------------------- */
/* HTTP adapter                                                                */
/* -------------------------------------------------------------------------- */

async function request(path, { method = 'GET', body, timeoutMs = 30000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (err?.name === 'AbortError') {
      throw new ApiError('The API took too long to respond. Please try again.', {
        cause: err,
      })
    }
    throw new ApiError(
      `Cannot reach the Claim Ledger API at ${apiBaseLabel()}. Is the backend running?`,
      { cause: err },
    )
  }
  clearTimeout(timer)

  if (res.status === 204) return null

  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null // non-JSON body; handled below
    }
  }

  if (!res.ok) {
    const message =
      (data && (data.error || data.message)) ||
      `The API request failed (HTTP ${res.status}).`
    throw new ApiError(message, { status: res.status })
  }

  return data
}

const httpAdapter = {
  getHealth: () => request('/api/health'),
  listFacts: () => request('/api/facts'),
  createFact: (payload) => request('/api/facts', { method: 'POST', body: payload }),
  updateFact: (id, payload) =>
    request(`/api/facts/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload }),
  getGuidelines: () => request('/api/guidelines'),
  getGuidelineHealth: () => request('/api/guideline-health'),
  checkContent: (payload) => request('/api/check', { method: 'POST', body: payload }),
  listDrafts: () => request('/api/drafts'),
  getDraft: (id) => request(`/api/drafts/${encodeURIComponent(id)}`),
  createDraft: (payload) => request('/api/drafts', { method: 'POST', body: payload }),
  decideDraft: (id, payload) =>
    request(`/api/drafts/${encodeURIComponent(id)}/decision`, {
      method: 'PATCH',
      body: payload,
    }),
  dismissClaim: (draftId, claimId, payload) =>
    request(
      `/api/drafts/${encodeURIComponent(draftId)}/claims/${encodeURIComponent(claimId)}/dismiss`,
      { method: 'PATCH', body: payload },
    ),
  undoDismiss: (draftId, claimId) =>
    request(
      `/api/drafts/${encodeURIComponent(draftId)}/claims/${encodeURIComponent(claimId)}/dismiss`,
      { method: 'DELETE' },
    ),
  getImpact: () => request('/api/impact'),
  getHistory: () => request('/api/history'),
  resetDemo: () => request('/api/demo/reset', { method: 'POST' }),
}

/* -------------------------------------------------------------------------- */
/* Response normalisation — tolerant to small backend shape differences        */
/* -------------------------------------------------------------------------- */

const VERDICTS = ['verified', 'conflicts', 'unsupported', 'manual']

function asArray(value, ...keys) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    for (const key of keys) {
      if (Array.isArray(value[key])) return value[key]
    }
  }
  return []
}

function pickDraft(value) {
  if (!value || typeof value !== 'object') return null
  return value.draft && typeof value.draft === 'object' ? value.draft : value
}

function pickFact(value) {
  if (!value || typeof value !== 'object') return null
  return value.fact && typeof value.fact === 'object' ? value.fact : value
}

/** A claim's dismissal record: { reason, actor, at } — null when not dismissed. */
function normDismissal(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    reason: String(raw.reason ?? ''),
    actor: String(raw.actor ?? ''),
    at: raw.at ?? null,
  }
}

/**
 * One wording/readability finding: { ruleId, kind, excerpt, message, suggestion }.
 * These are NOT claims — they never mix with verdicts or claim totals.
 */
export function normalizeTextCheck(raw, index = 0) {
  const t = raw && typeof raw === 'object' ? raw : {}
  const ruleId = String(t.ruleId ?? t.rule ?? `rule-${index + 1}`)
  const kindRaw = String(t.kind ?? '').toLowerCase()
  return {
    ruleId,
    kind:
      kindRaw === 'readability' || kindRaw === 'accessibility'
        ? kindRaw
        : ruleId.toUpperCase().startsWith('R')
          ? 'readability'
          : 'accessibility',
    excerpt: String(t.excerpt ?? t.quote ?? ''),
    message: String(t.message ?? t.text ?? ''),
    suggestion: String(t.suggestion ?? t.fix ?? ''),
  }
}

/** Defensive list parse: a missing field is an empty list; capped at the contract's 20. */
function normalizeTextChecks(raw) {
  return asArray(raw).map(normalizeTextCheck).slice(0, 20)
}

/** Lock the claim shape: { _id, draftId, text, verdict, factId, excerpt, explanation, suggestion, dismissal } */
export function normalizeClaim(raw, index = 0) {
  const c = raw && typeof raw === 'object' ? raw : {}
  const verdictRaw = String(c.verdict ?? '').toLowerCase().trim()
  const source = c.fact || c.source || null
  return {
    _id: c._id ?? c.id ?? `local-claim-${index}`,
    draftId: c.draftId ?? source?.draftId ?? null,
    text: c.text ?? c.quote ?? c.claim ?? '',
    verdict: VERDICTS.includes(verdictRaw) ? verdictRaw : 'manual',
    factId: c.factId ?? source?._id ?? c.sourceId ?? null,
    excerpt: c.excerpt ?? source?.text ?? '',
    explanation: c.explanation ?? c.reason ?? '',
    suggestion: c.suggestion ?? c.rewrite ?? null,
    sourceType: c.sourceType ?? null,
    // Reviewer dismissal: { reason, actor, at } — null when not dismissed.
    dismissal: normDismissal(c.dismissal),
    // Locally-applied rewrite marker (never sent to the backend).
    appliedLocally: false,
  }
}

function normalizeImpactEntry(raw, index) {
  const e = raw && typeof raw === 'object' ? raw : {}
  const fact = pickFact(e.fact ?? e) ?? null
  return {
    _id: e._id ?? e.id ?? `impact-${index}`,
    factId: e.factId ?? fact?._id ?? null,
    fact,
    previousText: e.previousText ?? e.oldText ?? e.from ?? null,
    reason: e.reason === 'expired' ? 'expired' : 'edited',
    at: e.at ?? e.updatedAt ?? null,
    claims: asArray(e.claims, 'items').map(normalizeClaim),
    drafts: asArray(e.drafts).map((d) => pickDraft(d) ?? d),
  }
}

const HEALTH_VERDICTS = ['conflicts', 'unsupported', 'manual']

/** One row of GET /api/guideline-health — normalised defensively. */
function normalizeHealthItem(raw) {
  const it = raw && typeof raw === 'object' ? raw : {}
  const verdictRaw = String(it.verdict ?? '').toLowerCase().trim()
  const sourceId = it.sourceId ?? null
  const sourceType =
    it.sourceType === 'fact' || it.sourceType === 'terminology' ? it.sourceType : null
  const count = Number(it.count)
  const draftCount = Number(it.draftCount)
  return {
    sourceId,
    sourceType: sourceId ? sourceType : null,
    verdict: HEALTH_VERDICTS.includes(verdictRaw) ? verdictRaw : 'manual',
    label: String(it.label ?? ''),
    count: Number.isFinite(count) && count > 0 ? Math.round(count) : 0,
    draftCount: Number.isFinite(draftCount) && draftCount > 0 ? Math.round(draftCount) : 0,
    lastAt: it.lastAt ?? null,
    example: String(it.example ?? ''),
    reasons: Array.isArray(it.reasons) ? it.reasons.map((r) => String(r)).slice(0, 3) : [],
  }
}

/* -------------------------------------------------------------------------- */
/* Public API — used by pages and components                                   */
/* -------------------------------------------------------------------------- */

export async function getHealth() {
  const adapter = await getAdapter()
  return adapter.getHealth()
}

/** → fact[] */
export async function listFacts() {
  const adapter = await getAdapter()
  return asArray(await adapter.listFacts(), 'facts').map((f) => pickFact(f) ?? f)
}

/** → fact */
export async function createFact(payload) {
  const adapter = await getAdapter()
  return pickFact(await adapter.createFact(payload))
}

/** → { fact, impact: { claims: [], drafts: [] } } */
export async function updateFact(id, payload) {
  const adapter = await getAdapter()
  const res = (await adapter.updateFact(id, payload)) ?? {}
  const impact = res.impact ?? {}
  return {
    fact: pickFact(res) ?? null,
    impact: {
      claims: asArray(impact.claims).map(normalizeClaim),
      drafts: asArray(impact.drafts).map((d) => pickDraft(d) ?? d),
    },
  }
}

/** → { guidelines: [], terminology: [] } */
export async function getGuidelines() {
  const adapter = await getAdapter()
  const res = await adapter.getGuidelines()
  if (Array.isArray(res)) return { guidelines: res, terminology: [] }
  return {
    guidelines: asArray(res?.guidelines ?? res, 'items'),
    terminology: asArray(res?.terminology, 'items'),
  }
}

/**
 * GET /api/guideline-health → { totalOverrides, items[] } (items already
 * sorted, most overridden first). Defensive: missing items → [], missing
 * numbers → 0, unknown verdict → "manual".
 */
export async function getGuidelineHealth() {
  const adapter = await getAdapter()
  const res = (await adapter.getGuidelineHealth()) ?? {}
  const items = asArray(res, 'items', 'entries').map(normalizeHealthItem)
  const total = Number(res.totalOverrides)
  return {
    totalOverrides:
      Number.isFinite(total) && total > 0
        ? Math.round(total)
        : items.reduce((sum, it) => sum + it.count, 0),
    items,
  }
}

/**
 * POST /api/check → { claims: claim[], manualReview: boolean, draftId?,
 * textChecks: textCheck[] }. A missing textChecks field (older responses) is
 * treated as an empty list.
 */
export async function checkContent(payload) {
  const adapter = await getAdapter()
  const res = (await adapter.checkContent(payload)) ?? {}
  const claims = asArray(res.claims, 'findings').map(normalizeClaim)
  const draftId = res.draftId ?? claims.find((c) => c.draftId)?.draftId ?? null
  // Make sure every claim carries the draft it belongs to (locked shape).
  if (draftId) for (const c of claims) if (!c.draftId) c.draftId = draftId
  return {
    claims,
    manualReview: Boolean(res.manualReview),
    draftId,
    textChecks: normalizeTextChecks(res.textChecks),
  }
}

/** → draft[] */
export async function listDrafts() {
  const adapter = await getAdapter()
  return asArray(await adapter.listDrafts(), 'drafts').map((d) => pickDraft(d) ?? d)
}

/** → { draft, claims: claim[], textChecks: textCheck[] } (missing field → []) */
export async function getDraft(id) {
  const adapter = await getAdapter()
  const res = (await adapter.getDraft(id)) ?? {}
  const draft = pickDraft(res)
  return {
    draft,
    claims: asArray(res?.claims ?? draft?.claims).map(normalizeClaim),
    textChecks: normalizeTextChecks(res?.textChecks ?? draft?.textChecks),
  }
}

/** → draft */
export async function createDraft(payload) {
  const adapter = await getAdapter()
  return pickDraft(await adapter.createDraft(payload))
}

/** PATCH /api/drafts/:id/decision → draft (with updated status + decisions) */
export async function decideDraft(id, payload) {
  const adapter = await getAdapter()
  const res = await adapter.decideDraft(id, payload)
  return pickDraft(res) ?? null
}

/**
 * PATCH /api/drafts/:draftId/claims/:claimId/dismiss
 * Body: { reason: 3–300 chars, actor } → the claim with dismissal { reason, actor, at }.
 * Only flagged (non-verified) claims can be dismissed; repeating a dismiss is
 * safe and changes nothing. The actor is the current demo role name, like the
 * other mutating calls.
 */
export async function dismissClaim(draftId, claimId, reason, actor) {
  const adapter = await getAdapter()
  const res = await adapter.dismissClaim(draftId, claimId, {
    reason: String(reason ?? ''),
    actor: actor || 'Reviewer (demo)',
  })
  return normalizeClaim(res)
}

/** DELETE /api/drafts/:draftId/claims/:claimId/dismiss → the claim, dismissal: null */
export async function undoDismiss(draftId, claimId) {
  const adapter = await getAdapter()
  return normalizeClaim(await adapter.undoDismiss(draftId, claimId))
}

/** GET /api/impact → impact entry[] (newest first) */
export async function getImpact() {
  const adapter = await getAdapter()
  const res = await adapter.getImpact()
  return asArray(res, 'impacts', 'entries', 'facts').map(normalizeImpactEntry)
}

/** GET /api/history → event[] */
export async function getHistory() {
  const adapter = await getAdapter()
  return asArray(await adapter.getHistory(), 'history', 'events')
}

/** POST /api/demo/reset */
export async function resetDemo() {
  const adapter = await getAdapter()
  return adapter.resetDemo()
}
