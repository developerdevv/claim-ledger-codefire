import { Router } from 'express'

import { DEMO_BRAND } from '../config.js'
import { Override } from '../models/Override.js'
import { Fact } from '../models/Fact.js'
import { Rule } from '../models/Rule.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = Router()

// GET /api/guideline-health: which rules and facts do reviewers override most?
// Built only from the permanent Override log, so re-checking a draft never erases it.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const groups = await Override.aggregate([
      { $match: { brand: DEMO_BRAND } },
      { $sort: { at: -1 } },
      {
        $group: {
          _id: { sourceId: '$sourceId', verdict: '$verdict' },
          count: { $sum: 1 },
          drafts: { $addToSet: '$draftId' },
          lastAt: { $max: '$at' },
          reasons: { $push: '$reason' },
          example: { $first: '$claimText' },
          sourceType: { $first: '$sourceType' },
        },
      },
      { $sort: { count: -1, lastAt: -1 } },
      { $limit: 20 },
    ])

    const ids = [...new Set(groups.map((g) => g._id.sourceId).filter(Boolean))]
    const [facts, rules] = await Promise.all([
      Fact.find({ _id: { $in: ids } }).lean(),
      Rule.find({ _id: { $in: ids } }).lean(),
    ])
    const labels = new Map()
    for (const f of facts) labels.set(f._id, f.text)
    for (const r of rules) {
      labels.set(r._id, r.kind === 'terminology' ? `Say "${r.use}", not "${r.avoid}"` : r.title)
    }

    const items = groups.map((g) => ({
      sourceId: g._id.sourceId,
      sourceType: g.sourceType,
      verdict: g._id.verdict,
      label: g._id.sourceId
        ? labels.get(g._id.sourceId) ?? g._id.sourceId
        : 'No approved source (for example unverified superlatives)',
      count: g.count,
      draftCount: g.drafts.length,
      lastAt: g.lastAt,
      example: g.example,
      reasons: g.reasons.slice(0, 3),
    }))

    const totalOverrides = await Override.countDocuments({ brand: DEMO_BRAND })
    res.json({ totalOverrides, items })
  }),
)

export default router
