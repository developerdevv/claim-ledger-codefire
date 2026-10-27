import { Router } from 'express'
import { z } from 'zod'

import { DEMO_BRAND } from '../config.js'
import { Fact } from '../models/Fact.js'
import { Revision } from '../models/Revision.js'
import { validate } from '../middleware/validate.js'
import { HttpError, asyncHandler } from '../middleware/errorHandler.js'
import { nextId } from '../utils/ids.js'
import { todayYMD } from '../utils/dates.js'
import { derivedStatus } from '../services/factStatus.js'
import { buildImpact, impactPayload } from '../services/impactService.js'
import { serializeFact } from '../utils/serialize.js'

const router = Router()

/* ------------------------------- validation ------------------------------ */
/* Messages byte-matched to the mock: 'Fact text must be at least 8
 * characters.' / 'An owner is required.' (joined with a space). */

const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must use YYYY-MM-DD format.')

const createFactSchema = z.object({
  text: z.string().trim().min(8, 'Fact text must be at least 8 characters.'),
  owner: z.string().trim().min(1, 'An owner is required.'),
  verifiedOn: z.union([YMD, z.literal('')]).optional(),
  expiresOn: z.union([YMD, z.literal(''), z.null()]).optional(),
  actor: z.string().trim().min(1).optional(),
})

const updateFactSchema = z.object({
  text: z.string().trim().min(8, 'Fact text must be at least 8 characters.').optional(),
  owner: z.string().trim().min(1, 'An owner is required.').optional(),
  verifiedOn: z.union([YMD, z.literal('')]).optional(), // '' keeps the old value
  expiresOn: z.union([YMD, z.literal(''), z.null()]).optional(), // ''/null clears it
  actor: z.string().trim().min(1).optional(),
})

/* --------------------------------- helpers ------------------------------- */

async function recordFactHistory(fields) {
  const { id, seq } = await nextId('H', 'history')
  await Revision.create({
    _id: id,
    seq,
    brand: DEMO_BRAND,
    type: 'fact_change',
    at: new Date(),
    ...fields,
  })
}

/* --------------------------------- routes -------------------------------- */

// GET /api/facts — bare array, insertion order. Status derived (and persisted)
// lazily; NO impact entries are created here (mock listFacts parity).
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const facts = await Fact.find().sort({ seq: 1 }).lean()
    const stale = []
    for (const fact of facts) {
      const next = derivedStatus(fact)
      if (next !== fact.status) {
        fact.status = next
        stale.push({ updateOne: { filter: { _id: fact._id }, update: { $set: { status: next } } } })
      }
    }
    if (stale.length) await Fact.bulkWrite(stale)
    res.json(facts.map(serializeFact))
  }),
)

// POST /api/facts — server generates the next F-N id; 201 + bare fact.
router.post(
  '/',
  validate(createFactSchema),
  asyncHandler(async (req, res) => {
    const { id, seq } = await nextId('F', 'fact')
    const doc = {
      _id: id,
      seq,
      brand: DEMO_BRAND,
      text: req.body.text,
      owner: req.body.owner,
      verifiedOn: req.body.verifiedOn || todayYMD(),
      expiresOn: req.body.expiresOn || null,
      status: 'active',
      version: 1,
    }
    doc.status = derivedStatus(doc) // mock refreshes status right after create
    const created = await Fact.create(doc)

    await recordFactHistory({
      actor: req.body.actor || 'You (demo)',
      factId: id,
      previousText: null,
      newText: doc.text,
      comment: 'Fact added to the Brand Vault.',
    })

    res.status(201).json(created.toObject())
  }),
)

// GET /api/facts/:id — bare fact (brief-required; the frontend lists instead).
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const fact = await Fact.findById(req.params.id)
    if (!fact) throw new HttpError(404, `Fact ${req.params.id} was not found.`)
    const next = derivedStatus(fact)
    if (next !== fact.status) {
      fact.status = next
      await fact.save()
    }
    res.json(serializeFact(fact.toObject()))
  }),
)

// PATCH /api/facts/:id — mock updateFact semantics, exactly:
//   • ''/null expiresOn clears it; empty verifiedOn keeps the old value
//   • text change bumps version and triggers impact + history
//   • a NEW transition into expired (without a text change) does the same
//     with reason 'expired'... 'edited' whenever the text changed
//   • otherwise: empty impact + the "no text change" history line
router.patch(
  '/:id',
  validate(updateFactSchema),
  asyncHandler(async (req, res) => {
    const fact = await Fact.findById(req.params.id)
    if (!fact) throw new HttpError(404, `Fact ${req.params.id} was not found.`)

    const body = req.body
    const previousText = fact.text
    const previousStatus = fact.status
    const previousVersion = fact.version

    if (body.text !== undefined) fact.text = body.text
    if (body.owner !== undefined) fact.owner = body.owner
    if (body.verifiedOn !== undefined) fact.verifiedOn = body.verifiedOn || fact.verifiedOn
    if (body.expiresOn !== undefined) fact.expiresOn = body.expiresOn || null

    const textChanged = fact.text !== previousText
    if (textChanged) fact.version = previousVersion + 1
    fact.status = derivedStatus(fact)
    const becameExpired = previousStatus !== 'expired' && fact.status === 'expired'
    await fact.save()

    const actor = body.actor || 'You (demo)'
    let impact = { claims: [], drafts: [] }

    if (textChanged || becameExpired) {
      const reason = becameExpired && !textChanged ? 'expired' : 'edited'
      const entry = await buildImpact({ fact: fact.toObject(), previousText, reason, previousVersion })
      await recordFactHistory({
        actor,
        factId: fact._id,
        previousText,
        newText: fact.text,
        reason,
        affectedDraftIds: entry.draftIds,
        comment: textChanged
          ? 'Approved fact edited — citing drafts flagged for re-review.'
          : 'Approved fact expired — citing drafts flagged for re-review.',
      })
      impact = await impactPayload(entry)
    } else {
      await recordFactHistory({
        actor,
        factId: fact._id,
        previousText,
        newText: fact.text,
        comment: 'Fact details updated (no text change).',
      })
    }

    res.json({ fact: fact.toObject(), impact })
  }),
)

export default router
