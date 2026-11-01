/**
 * Mock adapter — DEVELOPMENT AID ONLY.
 *
 * Implements exactly the same interface as the HTTP adapter in src/lib/api.js
 * against an in-memory store seeded with fictional data. It is only ever
 * loaded when import.meta.env.DEV && VITE_USE_MOCK === "1"; production
 * builds never touch this module.
 */

import { ApiError } from '../errors'
import { createSeed, terminologyText } from './seed'
import { runCheck, runTextChecks } from './engine'

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

/**
 * Curated wording/readability samples for the seeded drafts, so the demo
 * shows real findings from t=0 (D-2 carries two; D-1 and D-3 have none).
 * An item is only returned while its exact excerpt is still present in the
 * draft text — editing that sentence away removes the finding, exactly like
 * the real backend recomputing on recheck. Shape matches the contract:
 * { ruleId, kind, excerpt, message, suggestion }.
 */
const TEXT_CHECK_SAMPLES = {
  'D-2': [
    {
      ruleId: 'R-1',
      kind: 'readability',
      excerpt: 'Enjoy free shipping on all orders above ₹299 this month only.',
      message:
        'The offer, the threshold and the deadline sit in one line — the “this month only” condition is easy to miss.',
      suggestion: 'Split it: “Free shipping on orders above ₹299. This month only.”',
    },
    {
      ruleId: 'A-3',
      kind: 'accessibility',
      excerpt: 'Every kurta in this collection is woven from 100% organic cotton.',
      message:
        '“Kurta” may be unfamiliar to readers outside South Asia; plain-language guidance says to gloss unfamiliar terms on first use.',
      suggestion: 'Add a short gloss: “kurta (a long, loose collarless shirt)”.',
    },
  ],
}

/** Curated samples (while their excerpt still matches) + computed rule hits, capped at 20. */
function textChecksFor(draftId, text) {
  const body = String(text ?? '')
  const curated = (TEXT_CHECK_SAMPLES[draftId] ?? []).filter((c) => body.includes(c.excerpt))
  return [...curated, ...runTextChecks(body)].slice(0, 20)
}

/**
 * Sample text returned by the mock document extractor — about 600 characters
 * of fictional brochure copy, served as "2 pages". Mentions the demo world's
 * material/shipping promises so pressing "Check content" afterwards produces
 * real findings.
 */
const PDF_SAMPLE_TEXT = `Weave & Loom — Monsoon Handloom Collection

Every piece in this collection is woven on pit looms by partner artisans in Assam and West Bengal, using cotton spun at our certified facility in Coimbatore. The dyes are low-impact and azo-free, and each finished garment is checked by hand before it is packed.

Care and delivery: machine wash cold on a gentle cycle, or hand wash for extra softness. Line dry in shade so the natural dyes hold their colour. Iron on medium heat. Orders placed before 2 PM IST ship the same working day, and every parcel includes a cloth bag made from loom waste.`

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
        store.claims.push({
          ...claim,
          _id: nextId('C', 'claim'),
          draftId: draft._id,
          dismissal: null,
        })
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
        dismissal: null,
      }))
      store.claims.push(...stored)

      return {
        draftId: draft._id,
        claims: clone(stored),
        manualReview,
        textChecks: manualReview ? [] : clone(textChecksFor(draft._id, text)),
      }
    },

    /**
     * Mock document extraction — same contract as POST /api/documents/extract.
     * Accepts any .pdf and returns ~600 characters of sample text as 2 pages;
     * a file named "scanned.pdf" fails with 422 so the error state is
     * testable. Errors carry the friendly server messages the UI shows.
     */
    async extractDocument(file) {
      await wait()
      if (!file) throw new ApiError('No file was sent.', { status: 400 })
      const name = String(file.name ?? '')
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(name)
      if (!isPdf) throw new ApiError('Only PDF files can be imported.', { status: 415 })
      if (Number(file.size ?? 0) > 5 * 1024 * 1024) {
        throw new ApiError('That PDF is too large or has too many pages (limit: 5 MB, 30 pages).', {
          status: 413,
        })
      }
      if (/^scanned\.pdf$/i.test(name.trim())) {
        throw new ApiError(
          'We could not read text from this PDF. Scanned image PDFs are not supported. Paste the text instead.',
          { status: 422 },
        )
      }
      return {
        filename: name,
        pages: 2,
        characters: PDF_SAMPLE_TEXT.length,
        truncated: false,
        text: PDF_SAMPLE_TEXT,
      }
    },

    async listDrafts() {
      await wait()
      return clone(store.drafts)
    },

    async getDraft(id) {
      await wait()
      const draft = findDraft(id)
      if (!draft) throw new ApiError(`Draft ${id} was not found.`, { status: 404 })
      return {
        draft: clone(draft),
        claims: clone(claimsForDraft(id)),
        textChecks: clone(textChecksFor(id, draft.text)),
      }
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

    /**
     * PATCH …/claims/:claimId/dismiss — same rules and exact error messages as
     * the real backend: reason 3–300 chars, only flagged (non-verified) claims,
     * 404 when the claim is not on that draft. Dismissing an already-dismissed
     * claim is safe and changes nothing.
     */
    async dismissClaim(draftId, claimId, payload) {
      await wait()
      const reason = String(payload?.reason ?? '').trim()
      if (reason.length < 3) {
        throw new ApiError('A reason of at least 3 characters is required.', { status: 400 })
      }
      if (reason.length > 300) {
        throw new ApiError('The reason must be 300 characters or fewer.', { status: 400 })
      }
      const claim = store.claims.find((c) => c._id === claimId && c.draftId === draftId)
      if (!claim) {
        throw new ApiError(`Claim ${claimId} was not found on draft ${draftId}.`, {
          status: 404,
        })
      }
      if (claim.verdict === 'verified') {
        throw new ApiError('Only flagged claims can be dismissed.', { status: 400 })
      }
      if (!claim.dismissal) {
        claim.dismissal = {
          reason,
          actor: payload?.actor || 'Reviewer (demo)',
          at: nowIso(),
        }
      }
      return clone(claim)
    },

    /** DELETE …/claims/:claimId/dismiss — clears the dismissal; undo asks no confirmation. */
    async undoDismiss(draftId, claimId) {
      await wait()
      const claim = store.claims.find((c) => c._id === claimId && c.draftId === draftId)
      if (!claim) {
        throw new ApiError(`Claim ${claimId} was not found on draft ${draftId}.`, {
          status: 404,
        })
      }
      claim.dismissal = null
      return clone(claim)
    },

    /**
     * GET /api/guideline-health — computed from the mock's dismissals: group
     * dismissed claims by source id + verdict, most overridden first (ties
     * broken by newest). Reset demo data clears it because every claim is
     * re-seeded with dismissal: null.
     */
    async getGuidelineHealth() {
      await wait()
      const dismissed = store.claims.filter((c) => c.dismissal)
      const HEALTH_VERDICTS = ['conflicts', 'unsupported', 'manual']

      const groups = new Map()
      for (const claim of dismissed) {
        const verdict = HEALTH_VERDICTS.includes(claim.verdict) ? claim.verdict : 'manual'
        const key = `${claim.factId ?? 'none'}|${verdict}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(claim)
      }

      const items = []
      for (const claims of groups.values()) {
        const sample = claims[0]
        const sourceId = sample.factId ?? null
        const term = sourceId ? store.terminology.find((t) => t._id === sourceId) : null
        const fact = sourceId && !term ? findFact(sourceId) : null
        const newestFirst = [...claims].sort(
          (a, b) => new Date(b.dismissal.at) - new Date(a.dismissal.at),
        )
        items.push({
          sourceId,
          sourceType: term ? 'terminology' : fact ? 'fact' : null,
          verdict: HEALTH_VERDICTS.includes(sample.verdict) ? sample.verdict : 'manual',
          label: term ? terminologyText(term) : fact ? fact.text : 'No approved source',
          count: claims.length,
          draftCount: new Set(claims.map((c) => c.draftId)).size,
          lastAt: newestFirst[0].dismissal.at,
          example: newestFirst[0].text,
          reasons: newestFirst.slice(0, 3).map((c) => c.dismissal.reason),
        })
      }

      items.sort((a, b) => b.count - a.count || new Date(b.lastAt) - new Date(a.lastAt))
      return { totalOverrides: dismissed.length, items }
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
