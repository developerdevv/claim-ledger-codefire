import mongoose from 'mongoose'

const counterSchema = new mongoose.Schema(
  {
    _id: String, // 'fact' | 'draft' | 'claim' | 'impact' | 'history'
    brand: { type: String, required: true }, // scoped so demo reset can clear them
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
)

export const Counter = mongoose.model('Counter', counterSchema)
