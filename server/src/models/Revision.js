import mongoose from 'mongoose'
import { DEMO_BRAND } from '../config.js'

/**
 * History events (GET /api/history, newest first). Type-discriminated union,
 * field names byte-compatible with the mock (the frontend reads events raw):
 *   fact_change: factId, previousText, newText, reason?, affectedDraftIds?, comment
 *   decision:    draftId, draftTitle, from, to, comment
 * Only these two types exist — do NOT add new ones.
 */
const revisionSchema = new mongoose.Schema(
  {
    _id: String, // 'H-1'
    brand: { type: String, required: true, default: DEMO_BRAND },
    type: { type: String, enum: ['fact_change', 'decision'], required: true },
    at: { type: Date, required: true, default: () => new Date() },
    actor: { type: String, required: true },
    comment: { type: String, default: null },
    // fact_change
    factId: String,
    previousText: { type: String, default: null },
    newText: String,
    reason: { type: String, enum: ['edited', 'expired'], required: false },
    affectedDraftIds: { type: [String], default: undefined }, // key absent when n/a (mock parity)
    // decision
    draftId: String,
    draftTitle: String,
    from: String,
    to: String,
    seq: { type: Number, required: true },
  },
  { versionKey: false },
)

export const Revision = mongoose.model('Revision', revisionSchema)
