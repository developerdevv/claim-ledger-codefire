import { Fact } from '../models/Fact.js'
import { Claim } from '../models/Claim.js'
import { Draft } from '../models/Draft.js'
import { Impact } from '../models/Impact.js'
import { nextId } from '../utils/ids.js'
import { derivedStatus } from './factStatus.js'
import { serializeDraft, serializeClaim } from '../utils/serialize.js'

/**
 * Mock-parity buildImpact(): find claims citing the fact (indexed by factId),
 * take distinct draftIds, flag those drafts needs_re_review WITHOUT touching
 * their decisions, and store one Impact entry.
 *
 * @param {object} args
 * @param {{_id:string, brand:string, text:string, version:number}} args.fact  current fact snapshot
 * @param {string} args.previousText
 * @param {'edited'|'expired'} args.reason
 * @param {number} args.previousVersion
 * @returns {Promise<object>} the created Impact entry (plain object)
 */
export async function buildImpact({ fact, previousText, reason, previousVersion }) {
  const claims = await Claim.find({ factId: fact._id }).sort({ seq: 1 }).lean()
  const claimIds = claims.map((c) => c._id)
  const draftIds = [...new Set(claims.map((c) => c.draftId))]

  if (draftIds.length > 0) {
    await Draft.updateMany(
      { _id: { $in: draftIds }, status: { $ne: 'needs_re_review' } },
      { $set: { status: 'needs_re_review' } }, // decisions[] intentionally untouched
    )
  }

  const { id, seq } = await nextId('I', 'impact')
  const entry = await Impact.create({
    _id: id,
    seq,
    brand: fact.brand,
    factId: fact._id,
    previousText,
    newText: fact.text,
    previousVersion,
    newVersion: fact.version,
    reason,
    at: new Date(),
    claimIds,
    draftIds,
  })
  return entry.toObject()
}

/**
 * Resolve an entry's claims/drafts LIVE from the database, in stored-ID
 * order (mock parity). Deleted docs drop out; drafts show CURRENT status.
 * Used by PATCH /api/facts/:id → impact: { claims, drafts }.
 */
export async function impactPayload(entry) {
  const [claims, drafts] = await Promise.all([
    Claim.find({ _id: { $in: entry.claimIds } }).lean(),
    Draft.find({ _id: { $in: entry.draftIds } }).lean(),
  ])
  const claimById = new Map(claims.map((c) => [c._id, c]))
  const draftById = new Map(drafts.map((d) => [d._id, d]))
  return {
    claims: entry.claimIds
      .map((id) => claimById.get(id))
      .filter(Boolean)
      .map(serializeClaim),
    drafts: entry.draftIds
      .map((id) => draftById.get(id))
      .filter(Boolean)
      .map(serializeDraft),
  }
}

/**
 * Mock-parity lazy expiry sweep (runs on GET /api/impact): any fact whose
 * derived status is newly 'expired' is persisted, and gets ONE impact entry
 * with reason 'expired' — only if no impact entry exists for that fact yet
 * (the mock checks for ANY entry, edited or expired).
 */
export async function sweepExpiredFacts() {
  const facts = await Fact.find().lean()
  for (const fact of facts) {
    const next = derivedStatus(fact)
    if (next === fact.status) continue

    await Fact.updateOne({ _id: fact._id }, { $set: { status: next } })

    if (next === 'expired') {
      const hasEntry = await Impact.exists({ factId: fact._id })
      if (!hasEntry) {
        await buildImpact({
          fact,
          previousText: fact.text, // mock: expiry entries carry the current text
          reason: 'expired',
          previousVersion: fact.version,
        })
      }
    }
  }
}
