import { DEMO_BRAND } from '../config.js'
import { Fact } from '../models/Fact.js'
import { Rule } from '../models/Rule.js'
import { Draft } from '../models/Draft.js'
import { Claim } from '../models/Claim.js'
import { Revision } from '../models/Revision.js'
import { Impact } from '../models/Impact.js'
import { Counter } from '../models/Counter.js'
import { nextId } from '../utils/ids.js'
import { derivedStatus } from '../services/factStatus.js'
import { runCheck } from '../services/rulesEngine.js'
import {
  seedFacts,
  seedGuidelines,
  seedTerminology,
  seedDrafts,
  seedHistory,
  seedCounters,
} from './data.js'

/** True when any demo-brand fact exists (seed marker). */
export async function isSeeded() {
  return (await Fact.countDocuments({ brand: DEMO_BRAND })) > 0
}

/**
 * Insert the full demo dataset. Mirrors the mock adapter exactly:
 *   createSeed() → facts/rules/drafts/history/counters, then seedClaims()
 *   runs the deterministic engine over each seeded draft (claims C-101…).
 */
export async function seedDemoBrand() {
  // --- facts (version 1; status derived so nothing seeds stale) ---
  await Fact.insertMany(
    seedFacts.map((f, i) => {
      const doc = {
        ...f,
        brand: DEMO_BRAND,
        version: 1,
        seq: i + 1,
        status: derivedStatus(f),
      }
      return doc
    }),
  )

  // --- rules: one collection, kind discriminator (guidelines first) ---
  const guidelineDocs = seedGuidelines.map((g, i) => ({
    ...g,
    brand: DEMO_BRAND,
    kind: 'guideline',
    seq: i + 1,
  }))
  const terminologyDocs = seedTerminology.map((t, i) => ({
    ...t,
    brand: DEMO_BRAND,
    kind: 'terminology',
    seq: guidelineDocs.length + i + 1,
  }))
  await Rule.insertMany([...guidelineDocs, ...terminologyDocs])

  // --- drafts (with their recorded decisions; no revisions yet) ---
  await Draft.insertMany(
    seedDrafts.map((d, i) => ({
      ...d,
      brand: DEMO_BRAND,
      decisions: d.decisions.map((dec) => ({ ...dec, at: new Date(dec.at) })),
      revisions: [],
      createdAt: new Date(d.createdAt),
      updatedAt: new Date(d.updatedAt),
      seq: i + 1,
    })),
  )

  // --- counters above the highest seeded id (mock baselines) ---
  await Counter.insertMany(
    Object.entries(seedCounters).map(([key, seq]) => ({ _id: key, brand: DEMO_BRAND, seq })),
  )

  // --- claims: run the engine over each seeded draft, in seed order ---
  for (const draft of seedDrafts) {
    const { claims } = runCheck(draft.text, { facts: seedFacts, terminology: seedTerminology })
    for (const claim of claims) {
      const { id, seq } = await nextId('C', 'claim')
      await Claim.create({
        ...claim,
        _id: id,
        seq,
        brand: DEMO_BRAND,
        draftId: draft._id,
        aiGenerated: false,
        checkMode: 'fallback',
        uncertainty: null,
        ruleId: null,
      })
    }
  }

  // --- history (H-1, H-2); impacts start empty ---
  await Revision.insertMany(
    seedHistory.map((h, i) => ({ ...h, brand: DEMO_BRAND, at: new Date(h.at), seq: i + 1 })),
  )

  return { seeded: true }
}

/** Idempotent boot seed: no-op when the demo brand already has data. */
export async function runSeed() {
  if (await isSeeded()) return { seeded: false }
  return seedDemoBrand()
}

/**
 * POST /api/demo/reset implementation (gated by DEMO_MODE in the route).
 * Wipes ONLY demo-brand documents — counters included — then re-seeds.
 */
export async function resetDemoData() {
  await Promise.all([
    Fact.deleteMany({ brand: DEMO_BRAND }),
    Rule.deleteMany({ brand: DEMO_BRAND }),
    Draft.deleteMany({ brand: DEMO_BRAND }),
    Claim.deleteMany({ brand: DEMO_BRAND }),
    Revision.deleteMany({ brand: DEMO_BRAND }),
    Impact.deleteMany({ brand: DEMO_BRAND }),
    Counter.deleteMany({ brand: DEMO_BRAND }),
  ])
  return seedDemoBrand()
}
