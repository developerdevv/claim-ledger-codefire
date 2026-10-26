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
  checkContent: (payload) => request('/api/check', { method: 'POST', body: payload }),
  listDrafts: () => request('/api/drafts'),
  getDraft: (id) => request(`/api/drafts/${encodeURIComponent(id)}`),
  createDraft: (payload) => request('/api/drafts', { method: 'POST', body: payload }),
  decideDraft: (id, payload) =>
    request(`/api/drafts/${encodeURIComponent(id)}/decision`, {
      method: 'PATCH',
      body: payload,
    }),
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

/** Lock the claim shape: { _id, draftId, text, verdict, factId, excerpt, explanation, suggestion } */
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

/** POST /api/check → { claims: claim[], manualReview: boolean, draftId? } */
export async function checkContent(payload) {
  const adapter = await getAdapter()
  const res = (await adapter.checkContent(payload)) ?? {}
  const claims = asArray(res.claims, 'findings').map(normalizeClaim)
  const draftId = res.draftId ?? claims.find((c) => c.draftId)?.draftId ?? null
  // Make sure every claim carries the draft it belongs to (locked shape).
  if (draftId) for (const c of claims) if (!c.draftId) c.draftId = draftId
  return { claims, manualReview: Boolean(res.manualReview), draftId }
}

/** → draft[] */
export async function listDrafts() {
  const adapter = await getAdapter()
  return asArray(await adapter.listDrafts(), 'drafts').map((d) => pickDraft(d) ?? d)
}

/** → { draft, claims: claim[] } */
export async function getDraft(id) {
  const adapter = await getAdapter()
  const res = (await adapter.getDraft(id)) ?? {}
  const draft = pickDraft(res)
  return {
    draft,
    claims: asArray(res?.claims ?? draft?.claims).map(normalizeClaim),
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
