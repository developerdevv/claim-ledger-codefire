import mongoose from 'mongoose'
import { DEMO_BRAND } from '../config.js'

const decisionSchema = new mongoose.Schema(
  {
    decision: { type: String, enum: ['approved', 'rejected', 'changes'], required: true },
    comment: { type: String, default: null },
    actor: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
)

/** Internal text snapshots taken before any overwrite (Stage 2 writes them).
 *  NEVER serialized in API responses — see serializeDraft. */
const revisionSchema = new mongoose.Schema(
  {
    revision: { type: Number, required: true },
    text: { type: String, required: true },
    at: { type: Date, required: true },
    action: { type: String, required: true },
  },
  { _id: false },
)

const draftSchema = new mongoose.Schema(
  {
    _id: String, // 'D-1'
    brand: { type: String, required: true, default: DEMO_BRAND },
    title: { type: String, trim: true, default: 'Untitled draft' },
    contentType: { type: String, default: 'Other' },
    text: { type: String, default: '' },
    status: {
      type: String,
      enum: ['in_review', 'needs_re_review', 'approved', 'rejected', 'changes'],
      default: 'in_review',
    },
    decisions: { type: [decisionSchema], default: [] },
    revisions: { type: [revisionSchema], default: [] },
    createdAt: Date,
    updatedAt: Date,
    seq: { type: Number, required: true },
  },
  { versionKey: false },
)

export const Draft = mongoose.model('Draft', draftSchema)
