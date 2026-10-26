/**
 * Mock adapter — DEVELOPMENT AID ONLY.
 *
 * Implements exactly the same interface as the HTTP adapter in src/lib/api.js
 * against an in-memory store seeded with fictional data. It is only ever
 * loaded when import.meta.env.DEV && VITE_USE_MOCK === "1"; production
 * builds never touch this module.
 */

import { ApiError } from '../errors'
import { createSeed } from './seed'
import { runCheck } from './engine'

const LATENCY_MIN = 160
const LATENCY_MAX = 420

const wait = () =>
  new Promise((resolve) => {
    setTimeout(resolve, LATENCY_MIN + Math.random() * (LATENCY_MAX - LATENCY_MIN))
  })

const clone = (value) => JSON.parse(JSON.stringify(value))
const nowIso = () => new Date().toISOString()

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function createMockAdapter() {
  let store = createSeed()

  /* ------------------------------ helpers ------------------------------ */

  function nextId(prefix, counterKey) {
    store.counters[counterKey] += 1
    return `${prefix}-${store.counters[counterKey]}`
  }

  function findFact(id) {
    return store.facts.find((f) => f._id === id) || null
  }

  function findDraft(id) {
    return store.drafts.find((d) => d._id === id) || null
  }

  function recordHistory(event) {
    store.history.unshift({
      _id: nextId('H', 'history'),
      at: nowIso(),
      ...event,
    })
  }

  function claimsForDraft(draftId) {
    return store.claims.filter((c) => c.draftId === draftId)
  }

  function refreshFactStatus(fact) {
    if (fact.expiresOn && new Date(fact.expiresOn) < startOfToday()) {
      fact.status = 'expired'
    } else if (fact.status === 'expired') {
      fact.status = 'active'
    }
  }

  /**
   * Flag every draft that cited a fact as "needs re-review" and record an
   * impact entry. Used when a fact is edited or expires.
   */
  function buildImpact(fact, previousText, reason) {
    const claims = store.claims.filter((c) => c.factId === fact._id)
    const draftIds = [...new Set(claims.map((c) => c.draftId))]
    const drafts = draftIds.map(findDraft).filter(Boolean)

    for (const draft of drafts) {
      if (draft.status !== 'needs_re_review') draft.status = 'needs_re_review'
    }

    const entry = {
      _id: nextId('I', 'impact'),
      factId: fact._id,
      previousText,
      reason,
      at: nowIso(),
      claimIds: claims.map((c) => c._id),
      draftIds,
    }
    store.impacts.unshift(entry)
    return entry
  }

  function impactPayload(entry) {
    return {
      claims: clone(entry.claimIds.map((id) => store.claims.find((c) => c._id === id)).filter(Boolean)),
      drafts: clone(entry.draftIds.map(findDraft).filter(Boolean)),
    }
  }

  /** Run seeded drafts through the engine so Impact/Review have data from t=0. */
  function seedClaims() {
    store.claims = []
    for (const draft of store.drafts) {
      const { claims } = runCheck(draft.text, store)
      for (const claim of claims) {
        store.claims.push({ ...claim, _id: nextId('C', 'claim'), draftId: draft._id })
      }
    }
  }

  function validateFactPayload(payload, { partial = false } = {}) {
    const errors = []
    if (!partial || payload.text !== undefined) {
      const text = String(payload.text ?? '').trim()
      if (text.length < 8) errors.push('Fact text must be at least 8 characters.')
    }
    if (!partial || payload.owner !== undefined) {
      if (!String(payload.owner ?? '').trim()) errors.push('An owner is required.')
    }
    if (errors.length) throw new ApiError(errors.join(' '), { status: 400 })
  }

  seedClaims()

  /* ------------------------------ interface ----------------------------- */

  return {
    async getHealth() {
      await wait()
      return { ok: true, mode: 'mock' }
    },

    async listFacts() {
      await wait()
      for (const fact of store.facts) refreshFactStatus(fact)
      return clone(store.facts)
    },

    async createFact(payload) {
      await wait()
      validateFactPayload(payload)
      const fact = {
        _id: nextId('F', 'fact'),
        text: String(payload.text).trim(),
        owner: String(payload.owner).trim(),
        verifiedOn: payload.verifiedOn || new Date().toISOString().slice(0, 10),
        expiresOn: payload.expiresOn || null,
        status: 'active',
      }
      refreshFactStatus(fact)
      store.facts.push(fact)
      recordHistory({
        type: 'fact_change',
        actor: payload.actor || 'You (demo)',
        factId: fact._id,
        previousText: null,
        newText: fact.text,
        comment: 'Fact added to the Brand Vault.',
      })
      return clone(fact)
    },

    async updateFact(id, payload) {
      await wait()
      const fact = findFact(id)
      if (!fact) throw new ApiError(`Fact ${id} was not found.`, { status: 404 })
      validateFactPayload(payload, { partial: true })

      const previousText = fact.text
      const previousStatus = fact.status

      if (payload.text !== undefined) fact.text = String(payload.text).trim()
      if (payload.owner !== undefined) fact.owner = String(payload.owner).trim()
      if (payload.verifiedOn !== undefined) fact.verifiedOn = payload.verifiedOn || fact.verifiedOn
      if (payload.expiresOn !== undefined) fact.expiresOn = payload.expiresOn || null

      refreshFactStatus(fact)

      const textChanged = fact.text !== previousText
      const becameExpired = previousStatus !== 'expired' && fact.status === 'expired'

      let impact = { claims: [], drafts: [] }
      if (textChanged || becameExpired) {
        const entry = buildImpact(fact, previousText, becameExpired && !textChanged ? 'expired' : 'edited')
        impact = impactPayload(entry)
        recordHistory({
          type: 'fact_change',
          actor: payload.actor || 'You (demo)',
          factId: fact._id,
          previousText,
          newText: fact.text,
          reason: entry.reason,
          affectedDraftIds: entry.draftIds,
          comment: textChanged
            ? 'Approved fact edited — citing drafts flagged for re-review.'
            : 'Approved fact expired — citing drafts flagged for re-review.',
        })
      } else {
        recordHistory({
          type: 'fact_change',
          actor: payload.actor || 'You (demo)',
          factId: fact._id,
          previousText,
          newText: fact.text,
          comment: 'Fact details updated (no text change).',
        })
      }

      return { fact: clone(fact), impact }
    },

    async getGuidelines() {
      await wait()
      return {
        guidelines: clone(store.guidelines),
        terminology: clone(store.terminology),
      }
    },

    async checkContent(payload) {
      await wait()
      const text = String(payload?.text ?? '')
      if (!text.trim()) {
        throw new ApiError('There is no content to check.', { status: 400 })
      }

      let draft
      if (payload.draftId) {
        draft = findDraft(payload.draftId)
        if (!draft) {
          throw new ApiError(`Draft ${payload.draftId} was not found.`, { status: 404 })
        }
        // Keep the stored draft in sync with what was checked.
        if (payload.title !== undefined) draft.title = String(payload.title).trim() || draft.title
        if (payload.contentType !== undefined) draft.contentType = payload.contentType
        draft.text = text
      } else {
        draft = {
          _id: nextId('D', 'draft'),
          title: String(payload?.title ?? '').trim() || 'Untitled draft',
          contentType: payload?.contentType || 'Other',
          status: 'in_review',
          text,
          decisions: [],
          createdAt: nowIso(),
        }
        store.drafts.unshift(draft)
      }
      draft.updatedAt = nowIso()

      const { claims, manualReview } = runCheck(text, store)

      store.claims = store.claims.filter((c) => c.draftId !== draft._id)
      const stored = claims.map((c) => ({
        ...c,
        _id: nextId('C', 'claim'),
        draftId: draft._id,
      }))
      store.claims.push(...stored)

      return { draftId: draft._id, claims: clone(stored), manualReview }
    },

    async listDrafts() {
      await wait()
      return clone(store.drafts)
    },

    async getDraft(id) {
      await wait()
      const draft = findDraft(id)
      if (!draft) throw new ApiError(`Draft ${id} was not found.`, { status: 404 })
      return { draft: clone(draft), claims: clone(claimsForDraft(id)) }
    },

    async createDraft(payload) {
      await wait()
      const draft = {
        _id: nextId('D', 'draft'),
        title: String(payload?.title ?? '').trim() || 'Untitled draft',
        contentType: payload?.contentType || 'Other',
        status: 'in_review',
        text: String(payload?.text ?? ''),
        decisions: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      store.drafts.unshift(draft)
      return clone(draft)
    },

    async decideDraft(id, payload) {
      await wait()
      const draft = findDraft(id)
      if (!draft) throw new ApiError(`Draft ${id} was not found.`, { status: 404 })

      const decision = String(payload?.decision ?? '')
      if (!['approved', 'rejected', 'changes'].includes(decision)) {
        throw new ApiError(`Unknown decision "${decision}".`, { status: 400 })
      }
      const comment = String(payload?.comment ?? '').trim()
      if ((decision === 'rejected' || decision === 'changes') && !comment) {
        throw new ApiError('A comment is required for this decision.', { status: 400 })
      }

      const from = draft.status
      draft.status = decision
      draft.updatedAt = nowIso()
      const record = {
        decision,
        comment: comment || null,
        actor: payload?.actor || 'Reviewer (demo)',
        at: nowIso(),
      }
      draft.decisions.push(record)

      recordHistory({
        type: 'decision',
        draftId: draft._id,
        draftTitle: draft.title,
        actor: record.actor,
        from,
        to: decision,
        comment: record.comment,
      })

      return clone(draft)
    },

    async getImpact() {
      await wait()
      // Expired-but-unrecorded facts surface here too, so the page is never
      // silently stale: if a seeded fact has passed its expiry and no impact
      // entry exists yet, create one on read.
      for (const fact of store.facts) {
        const before = fact.status
        refreshFactStatus(fact)
        if (before !== 'expired' && fact.status === 'expired') {
          const hasEntry = store.impacts.some((i) => i.factId === fact._id)
          if (!hasEntry) buildImpact(fact, fact.text, 'expired')
        }
      }

      return clone(
        store.impacts.map((entry) => ({
          _id: entry._id,
          factId: entry.factId,
          fact: findFact(entry.factId),
          previousText: entry.previousText,
          reason: entry.reason,
          at: entry.at,
          claims: entry.claimIds
            .map((cid) => {
              const claim = store.claims.find((c) => c._id === cid)
              if (!claim) return null
              const draft = findDraft(claim.draftId)
              return {
                ...claim,
                draft: draft ? { _id: draft._id, title: draft.title, status: draft.status } : null,
              }
            })
            .filter(Boolean),
          drafts: entry.draftIds.map(findDraft).filter(Boolean),
        })),
      )
    },

    async getHistory() {
      await wait()
      return clone(store.history)
    },

    async resetDemo() {
      await wait()
      // Fresh seed + regenerate the stored claims for the seeded drafts, so
      // Review/Impact have consistent data again from t=0.
      store = createSeed()
      seedClaims()
      return { ok: true }
    },
  }
}
