import mongoose from 'mongoose'
import { DEMO_BRAND } from '../config.js'

const claimSchema = new mongoose.Schema(
  {
    _id: String, // 'C-101'
    brand: { type: String, required: true, default: DEMO_BRAND },
    draftId: { type: String, required: true, index: true },
    text: { type: String, required: true },
    verdict: {
      type: String,
      enum: ['verified', 'conflicts', 'unsupported', 'manual'],
      required: true,
    },
    // Fact id ('F-001') OR terminology rule id ('T-004') when sourceType is
    // 'terminology' — the mock engine's convention (T-004 flags live in factId).
    factId: { type: String, default: null, index: true },
    excerpt: { type: String, default: '' },
    explanation: { type: String, default: '' },
    suggestion: { type: String, default: null },
    sourceType: { type: String, enum: ['fact', 'terminology', null], default: null },
    ruleId: { type: String, default: null }, // allowed extra; engine attaches T-004 via factId
    aiGenerated: { type: Boolean, default: false },
    checkMode: { type: String, enum: ['llm', 'fallback', null], default: null },
    uncertainty: { type: String, enum: ['low', 'medium', 'high', null], default: null }, // label, never %
    createdAt: { type: Date, default: () => new Date() },
    seq: { type: Number, required: true },
  },
  { versionKey: false },
)

export const Claim = mongoose.model('Claim', claimSchema)
