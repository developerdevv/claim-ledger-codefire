import { Router } from 'express'
import { Rule } from '../models/Rule.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = Router()

// GET /api/guidelines → { guidelines[], terminology[] } from the single
// Rule collection (kind discriminator). Extra doc fields (brand, kind, seq)
// are harmless — the frontend reads the item fields it knows.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rules = await Rule.find().sort({ seq: 1 }).lean()
    res.json({
      guidelines: rules.filter((r) => r.kind === 'guideline'),
      terminology: rules.filter((r) => r.kind === 'terminology'),
    })
  }),
)

export default router
