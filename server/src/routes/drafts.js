import { Router } from 'express'
import { z } from 'zod'

import { DEMO_BRAND } from '../config.js'
import { Draft } from '../models/Draft.js'
import { Claim } from '../models/Claim.js'
import { Revision } from '../models/Revision.js'
import { HttpError, asyncHandler } from '../middleware/errorHandler.js'
import { validate } from '../middleware/validate.js'
import { checkLimiter } from '../middleware/rateLimiter.js'
import { nextId } from '../utils/ids.js'
import { serializeDraft, serializeClaim } from '../utils/serialize.js'
import { performCheck } from '../services/checkPipeline.js'

const router = Router()

const createDraftSchema = z.object({
  title: z.string().optional(),
  contentType: z.string().optional(),
  text: z.string().optional(),
})

// GET /api/drafts — bare array, newest first. `revisions` never leave the server.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const drafts = await Draft.find().sort({ seq: -1 }).lean()
    res.json(drafts.map(serializeDraft))
  }),
)

// POST /api/drafts — mock createDraft parity: bare draft, NO claims generated.
router.post(
  '/',
  validate(createDraftSchema),
  asyncHandler(async (req, res) => {
    const { id, seq } = await nextId('D', 'draft')
    const now = new Date()
    const draft = await Draft.create({
      _id: id,
      seq,
      brand: DEMO_BRAND,
      title: String(req.body.title ?? '').trim() || 'Untitled draft',
      contentType: req.body.contentType || 'Other',
      status: 'in_review',
      text: String(req.body.text ?? ''),
      decisions: [],
      revisions: [],
      createdAt: now,
      updatedAt: now,
    })
    res.status(201).json(serializeDraft(draft.toObject()))
  }),
)

// GET /api/drafts/:id → { draft, claims[] } (claims in generation order).
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const draft = await Draft.findById(req.params.id).lean()
    if (!draft) throw new HttpError(404, `Draft ${req.params.id} was not found.`)
    const claims = await Claim.find({ draftId: draft._id }).sort({ seq: 1 }).lean()
    res.json({ draft: serializeDraft(draft), claims: claims.map(serializeClaim) })
  }),
)

// POST /api/drafts/:id/recheck — thin alias for the frontend's recheck path
// (which lives inside POST /api/check): re-checks the STORED text.
// Unchanged text ⇒ no revision snapshot and status untouched; claims replaced.
router.post(
  '/:id/recheck',
  checkLimiter,
  asyncHandler(async (req, res) => {
    const draft = await Draft.findById(req.params.id).lean()
    if (!draft) throw new HttpError(404, `Draft ${req.params.id} was not found.`)
    const { draft: updated, claims, manualReview } = await performCheck({
      text: draft.text,
      draftId: draft._id,
    })
    res.json({ draftId: updated._id, claims, manualReview })
  }),
)

// PATCH /api/drafts/:id/decision — mock decideDraft parity, byte-exact errors.
// The ONLY route that can set approved/rejected/changes — never AI output.
// A draft in needs_re_review can receive a new decision (from/to recorded).
router.patch(
  '/:id/decision',
  asyncHandler(async (req, res) => {
    const draft = await Draft.findById(req.params.id)
    if (!draft) throw new HttpError(404, `Draft ${req.params.id} was not found.`)

    const decision = String(req.body?.decision ?? '')
    if (!['approved', 'rejected', 'changes'].includes(decision)) {
      throw new HttpError(400, `Unknown decision "${decision}".`)
    }
    const comment = String(req.body?.comment ?? '').trim()
    if ((decision === 'rejected' || decision === 'changes') && !comment) {
      throw new HttpError(400, 'A comment is required for this decision.')
    }

    const from = draft.status
    draft.status = decision
    draft.updatedAt = new Date()
    const record = {
      decision,
      comment: comment || null,
      actor:
        typeof req.body?.actor === 'string' && req.body.actor.trim()
          ? req.body.actor.trim()
          : 'Reviewer (demo)',
      at: new Date(),
    }
    draft.decisions.push(record)
    await draft.save()

    const { id, seq } = await nextId('H', 'history')
    await Revision.create({
      _id: id,
      seq,
      brand: DEMO_BRAND,
      type: 'decision',
      at: record.at,
      actor: record.actor,
      draftId: draft._id,
      draftTitle: draft.title,
      from,
      to: decision,
      comment: record.comment,
    })

    res.json(serializeDraft(draft.toObject()))
  }),
)

export default router
