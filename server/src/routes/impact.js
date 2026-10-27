import { Router } from 'express'
import { Fact } from '../models/Fact.js'
import { Claim } from '../models/Claim.js'
import { Draft } from '../models/Draft.js'
import { Impact } from '../models/Impact.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { sweepExpiredFacts } from '../services/impactService.js'
import { serializeDraft, serializeClaim } from '../utils/serialize.js'

const router = Router()

/**
 * GET /api/impact — impact entries, newest first. Mock-parity shape:
 *   { _id, factId, fact, previousText, reason, at, claims[], drafts[] }
 * Claims and drafts are resolved LIVE from the stored ID lists at request
 * time (counts are never stored): deleted claims drop out, drafts carry
 * their CURRENT status, and each claim embeds draft { _id, title, status }.
 * Runs the lazy expiry sweep first so expired-but-unrecorded facts appear.
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    await sweepExpiredFacts()

    const entries = await Impact.find().sort({ seq: -1 }).lean()

    const factIds = [...new Set(entries.map((e) => e.factId))]
    const claimIds = [...new Set(entries.flatMap((e) => e.claimIds))]
    const draftIds = [...new Set(entries.flatMap((e) => e.draftIds))]

    const [facts, claims, drafts] = await Promise.all([
      Fact.find({ _id: { $in: factIds } }).lean(),
      Claim.find({ _id: { $in: claimIds } }).lean(),
      Draft.find({ _id: { $in: draftIds } }).lean(),
    ])
    const factById = new Map(facts.map((f) => [f._id, f]))
    const claimById = new Map(claims.map((c) => [c._id, c]))
    const draftById = new Map(drafts.map((d) => [d._id, d]))

    const view = entries.map((entry) => ({
      _id: entry._id,
      factId: entry.factId,
      fact: factById.get(entry.factId) ?? null,
      previousText: entry.previousText,
      reason: entry.reason,
      at: entry.at,
      claims: entry.claimIds
        .map((id) => {
          const claim = claimById.get(id)
          if (!claim) return null
          const draft = draftById.get(claim.draftId)
          return {
            ...serializeClaim(claim),
            draft: draft ? { _id: draft._id, title: draft.title, status: draft.status } : null,
          }
        })
        .filter(Boolean),
      drafts: entry.draftIds
        .map((id) => draftById.get(id))
        .filter(Boolean)
        .map(serializeDraft),
    }))

    res.json(view)
  }),
)

export default router
