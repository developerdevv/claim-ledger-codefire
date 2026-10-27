import { Router } from 'express'
import { config } from '../config.js'
import { HttpError, asyncHandler } from '../middleware/errorHandler.js'
import { resetDemoData } from '../seed/runSeed.js'

const router = Router()

// POST /api/demo/reset — restores the fictional demo dataset (only the demo
// brand's documents). Hard-gated: 403 { error } unless DEMO_MODE=true.
router.post(
  '/reset',
  asyncHandler(async (_req, res) => {
    if (!config.demoMode) {
      throw new HttpError(
        403,
        'Demo mode is disabled. Set DEMO_MODE=true on the server to allow demo resets.',
      )
    }
    await resetDemoData()
    res.json({ ok: true })
  }),
)

export default router
