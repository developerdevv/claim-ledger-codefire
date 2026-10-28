import mongoose from 'mongoose'
import { DEMO_BRAND } from '../config.js'

/**
 * Internal impact records ("fact changed/expired → who cited it?").
 * claimIds/draftIds remember WHAT was hit; the API payload re-resolves them
 * LIVE at request time (current draft status shown; deleted claims drop out) —
 * counts are never stored.
 */
const impactSchema = new mongoose.Schema(
  {
    _id: String, // 'I-1'
    brand: { type: String, required: true, default: DEMO_BRAND },
    factId: { type: String, required: true, index: true },
    previousText: { type: String, required: true },
    newText: { type: String, required: true },
    previousVersion: { type: Number, required: true },
    newVersion: { type: Number, required: true },
    reason: { type: String, enum: ['edited', 'expired'], required: true },
    at: { type: Date, required: true, default: () => new Date() },
    claimIds: { type: [String], default: [] },
    draftIds: { type: [String], default: [] },
    seq: { type: Number, required: true },
  },
  { versionKey: false },
)

export const Impact = mongoose.model('Impact', impactSchema)
