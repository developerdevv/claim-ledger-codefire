import mongoose from 'mongoose'
import { DEMO_BRAND } from '../config.js'

const overrideSchema = new mongoose.Schema(
  {
    _id: String, // 'O-1'
    brand: { type: String, required: true, default: DEMO_BRAND },
    claimId: { type: String, required: true, unique: true },
    draftId: { type: String, required: true, index: true },
    claimText: { type: String, required: true },
    verdict: { type: String, required: true },
    sourceId: { type: String, default: null }, // fact id, or T-004 style rule id
    sourceType: { type: String, default: null },
    reason: { type: String, required: true },
    actor: { type: String, required: true },
    at: { type: Date, default: () => new Date() },
    seq: { type: Number, required: true },
  },
  { versionKey: false },
)

export const Override = mongoose.model('Override', overrideSchema)
