import mongoose from 'mongoose'
import { DEMO_BRAND } from '../config.js'

const factSchema = new mongoose.Schema(
  {
    _id: String, // 'F-001'
    brand: { type: String, required: true, default: DEMO_BRAND },
    text: { type: String, required: true, trim: true, minlength: 8 },
    owner: { type: String, required: true, trim: true },
    verifiedOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    expiresOn: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    status: { type: String, enum: ['active', 'expired'], default: 'active' },
    version: { type: Number, required: true, default: 1, min: 1 }, // +1 on every text edit
    seq: { type: Number, required: true }, // insertion order (mock: array order)
  },
  { versionKey: false },
)

export const Fact = mongoose.model('Fact', factSchema)
