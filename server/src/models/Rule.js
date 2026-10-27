import mongoose from 'mongoose'
import { DEMO_BRAND } from '../config.js'

/**
 * One collection behind GET /api/guidelines; `kind` splits it into
 * { guidelines[], terminology[] }. Shapes mirror the mock seed exactly:
 *   guideline:   { _id:'G-001', title, text }
 *   terminology: { _id:'T-004', use, avoid, note }
 */
const ruleSchema = new mongoose.Schema(
  {
    _id: String, // 'G-001' | 'T-004'
    brand: { type: String, required: true, default: DEMO_BRAND },
    kind: { type: String, enum: ['guideline', 'terminology'], required: true },
    title: String, // guideline
    text: String, // guideline
    use: String, // terminology
    avoid: String, // terminology
    note: String, // terminology
    seq: { type: Number, required: true },
  },
  { versionKey: false },
)

export const Rule = mongoose.model('Rule', ruleSchema)
