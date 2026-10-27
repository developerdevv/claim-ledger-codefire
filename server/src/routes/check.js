import { Router } from 'express'
import { z } from 'zod'

import { validate } from '../middleware/validate.js'
import { HttpError, asyncHandler } from '../middleware/errorHandler.js'
import { checkLimiter } from '../middleware/rateLimiter.js'
import { performCheck } from '../services/checkPipeline.js'

const router = Router()

export const MAX_CHECK_TEXT = 5000

/** text required (mock message byte-parity), title/contentType/draftId optional. */
const checkSchema = z.object({
  text: z.string({ required_error: 'There is no content to check.' }),
  title: z.string().optional(),
  contentType: z.string().optional(),
  draftId: z.string().optional(),
})

/**
 * POST /api/check — mock checkContent parity.
 * Body:  { text, title?, contentType?, draftId? }
 * Reply: { draftId, claims[], manualReview }   (claims in the locked shape)
 *   - with draftId: updates the draft (snapshotting previous text into
 *     revisions[]) and REPLACES its claims
 *   - without draftId: creates a new draft (next D-N, in_review)
 *   - manualReview is true when any claim has verdict "manual" (or the input
 *     was malformed/too short — engine parity)
 */
router.post(
  '/',
  checkLimiter, // 20/min/IP — LLM quota protection (429 { error })
  validate(checkSchema),
  asyncHandler(async (req, res) => {
    const { text, contentType, draftId } = req.body

    if (!text.trim()) throw new HttpError(400, 'There is no content to check.')
    if (text.length > MAX_CHECK_TEXT) {
      throw new HttpError(400, `Text is too long to check (maximum ${MAX_CHECK_TEXT} characters).`)
    }

    const { draft, claims, manualReview } = await performCheck({
      text,
      draftId,
      title: req.body.title,
      contentType,
    })
    res.json({ draftId: draft._id, claims, manualReview })
  }),
)

export default router
