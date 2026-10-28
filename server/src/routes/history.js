import { Router } from 'express'
import { Revision } from '../models/Revision.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = Router()

// GET /api/history — bare array of events, newest first.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const events = await Revision.find().sort({ seq: -1 }).lean()
    res.json(events)
  }),
)

export default router
