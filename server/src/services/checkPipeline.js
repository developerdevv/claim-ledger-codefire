import { DEMO_BRAND } from '../config.js'
import { Fact } from '../models/Fact.js'
import { Rule } from '../models/Rule.js'
import { Draft } from '../models/Draft.js'
import { Claim } from '../models/Claim.js'
import { HttpError } from '../middleware/errorHandler.js'
import { nextId } from '../utils/ids.js'
import { derivedStatus } from './factStatus.js'
import { runCheck } from './rulesEngine.js'
import { applyVerdictLaw, keyFold } from './verifier.js'
import { createLlmClient } from './llmClient.js'
import { makeCacheKey, cacheGet, cacheSet } from '../utils/cache.js'

/**
 * The checking pipeline:
 *   retrieval (active facts + terminology) → LLM proposals (if key) →
 *   SERVER VERDICT LAW → merge with deterministic engine → persist.
 *
 * Labeling semantics (never present fallback results as AI results):
 *   - checkMode  = the RUN's pipeline mode: "llm" when the model participated
 *                  successfully, "fallback" when the engine ran alone
 *   - aiGenerated = per-claim origin: true only for model-proposed claims
 *   Engine claims are therefore always aiGenerated:false, even in "llm" runs.
 */

/** Load everything a check needs. Status is DERIVED at read time. */
export async function loadCheckContext() {
  const facts = (await Fact.find().sort({ seq: 1 }).lean()).map((f) => ({
    ...f,
    status: derivedStatus(f),
  }))
  const terminology = await Rule.find({ kind: 'terminology' }).sort({ seq: 1 }).lean()
  return {
    facts, // ALL facts (engine cites regardless of status — mock parity)
    activeFacts: facts.filter((f) => f.status === 'active'), // the only valid receipts
    expiredFacts: facts.filter((f) => f.status === 'expired'),
    terminology,
  }
}

/** Two claims overlap when their (normalized) texts match or contain each other. */
function overlap(a, b) {
  const x = keyFold(a)
  const y = keyFold(b)
  return x === y || x.includes(y) || y.includes(x)
}

/**
 * Merge engine + model claims (spec D):
 *   - terminology claims ALWAYS come from the engine
 *   - where the engine gives a definite verified/conflicts verdict on a
 *     sentence the model also covered, the ENGINE wins
 *   - an unsupported engine claim yields to a receipt-validated model verdict
 *   - overlapping duplicates are dropped; output ordered by sentence position
 */
export function mergeClaims(engineClaims, modelClaims, draftText) {
  const merged = [...engineClaims]
  for (const m of modelClaims) {
    const idx = merged.findIndex((e) => overlap(e.text, m.text))
    if (idx === -1) {
      merged.push(m)
      continue
    }
    const e = merged[idx]
    const engineDefinite =
      e.sourceType === 'terminology' || e.verdict === 'verified' || e.verdict === 'conflicts'
    if (!engineDefinite && (m.verdict === 'verified' || m.verdict === 'conflicts')) {
      merged[idx] = m // engine was unsure; receipt-backed model verdict wins
    } // else: engine wins — drop the model copy
  }

  const textKey = keyFold(draftText)
  const pos = (c) => {
    const i = textKey.indexOf(keyFold(c.text))
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return merged
    .map((c, i) => ({ c, i }))
    .sort((a, b) => pos(a.c) - pos(b.c) || a.i - b.i)
    .map((w) => w.c)
}

/**
 * Core check — dependency-injected and DB-free (unit-testable):
 * run the engine, try the LLM when enabled, judge proposals, merge, label.
 */
export async function buildClaimSet({ text, facts, activeFacts, expiredFacts, terminology, llmClient }) {
  const engine = runCheck(text, { facts, terminology })
  const engineClaims = engine.claims.map((c) => ({
    ...c,
    aiGenerated: false,
    uncertainty: c.uncertainty ?? null,
  }))

  let mode = 'fallback'
  let modelClaims = []

  if (llmClient?.isEnabled?.()) {
    try {
      // Retrieval: ONLY the draft text + active fact ids/texts + terminology
      // rules are sent to the LLM. Nothing else ever leaves this process.
      const proposals = await llmClient.extractClaims({ text, facts: activeFacts, terminology })
      modelClaims = applyVerdictLaw(proposals, { activeFacts, expiredFacts, draftText: text })
      mode = 'llm'
    } catch (err) {
      // Metadata only — never the draft text nor any key.
      console.warn(`[check] LLM unavailable (${err.code ?? err.message}) — deterministic engine only`)
      mode = 'fallback'
    }
  }

  const merged = mergeClaims(engineClaims, modelClaims, text)
  for (const c of merged) c.checkMode = mode

  return {
    claims: merged,
    manualReview: engine.manualReview || merged.some((c) => c.verdict === 'manual'),
    mode,
  }
}

/** Full text check with retrieval + 10-minute result cache. */
export async function runTextCheck(text) {
  const ctx = await loadCheckContext()
  const key = makeCacheKey(text, ctx.activeFacts)
  const cached = cacheGet(key)
  if (cached) return { ...cached, fromCache: true }

  const result = await buildClaimSet({ text, ...ctx, llmClient: createLlmClient() })
  cacheSet(key, { claims: result.claims, manualReview: result.manualReview, mode: result.mode })
  return { ...result, fromCache: false }
}

/**
 * Mock checkContent parity + persisted revisions + ONE deliberate change
 * (approved by backend lead, Stage 2 Part B):
 *
 *   STATUS RESET ON TEXT CHANGE — when called with a draftId and the text
 *   ACTUALLY changes, draft.status is set to "in_review", so an edited draft
 *   can never remain "approved"/"rejected". Unchanged text leaves status
 *   untouched. The decisions[] array is never modified here.
 *
 *   - draftId: 404 if missing; sync title/contentType when provided; snapshot
 *     the previous text into revisions[] BEFORE overwriting (never returned);
 *     the draft's claims are REPLACED wholesale (mock parity).
 *   - no draftId: create a draft (next D-N, in_review).
 * Returns { draft, claims, manualReview }.
 */
export async function performCheck({ text, draftId, title, contentType }) {
  let draft
  if (draftId !== undefined) {
    draft = await Draft.findById(draftId)
    if (!draft) throw new HttpError(404, `Draft ${draftId} was not found.`)

    if (title !== undefined) {
      const t = String(title).trim()
      if (t) draft.title = t
    }
    if (contentType !== undefined) draft.contentType = contentType

    if (draft.text !== text) {
      draft.revisions.push({
        revision: draft.revisions.length + 1,
        text: draft.text, // the PREVIOUS text, snapshotted before overwrite
        at: new Date(),
        action: 'overwrite',
      })
      draft.text = text
      draft.status = 'in_review' // ← deliberate change: edited drafts re-enter review
      // decisions[] intentionally untouched
    }
  } else {
    const { id, seq } = await nextId('D', 'draft')
    draft = new Draft({
      _id: id,
      seq,
      brand: DEMO_BRAND,
      title: String(title ?? '').trim() || 'Untitled draft',
      contentType: contentType || 'Other',
      status: 'in_review',
      text,
      decisions: [],
      revisions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  const { claims, manualReview } = await runTextCheck(draft.text)

  await Claim.deleteMany({ draftId: draft._id })
  const stored = []
  for (const c of claims) {
    const { id, seq } = await nextId('C', 'claim')
    const doc = await Claim.create({
      ...c,
      _id: id,
      seq,
      brand: DEMO_BRAND,
      draftId: draft._id,
      createdAt: new Date(),
    })
    stored.push(doc.toObject())
  }

  draft.updatedAt = new Date()
  await draft.save()

  return { draft, claims: stored, manualReview }
}
