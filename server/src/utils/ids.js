import { Counter } from '../models/Counter.js'
import { DEMO_BRAND } from '../config.js'

/**
 * Counter-backed human IDs, exactly like the mock's nextId():
 * `${prefix}-${seq}` with NO zero-padding (seeded F-001..F-004 are literals;
 * new docs are F-5, D-4, C-112, I-1, H-3 …).
 *
 * Returns { id, seq } — persist `seq` on the doc for deterministic ordering.
 * Counters are seeded ABOVE the highest seeded ID (see src/seed/runSeed.js).
 */
export async function nextId(prefix, key) {
  const counter = await Counter.findOneAndUpdate(
    { _id: key, brand: DEMO_BRAND },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  )
  return { id: `${prefix}-${counter.seq}`, seq: counter.seq }
}
