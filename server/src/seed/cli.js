import { connectDb, disconnectDb } from '../db.js'
import { runSeed } from './runSeed.js'

/** `npm run seed` — idempotent manual seed (boot also seeds automatically). */
try {
  await connectDb()
  const result = await runSeed()
  console.log(
    result.seeded
      ? '[seed] Demo data seeded.'
      : '[seed] Demo data already present — nothing to do (idempotent).',
  )
  await disconnectDb()
  process.exit(0)
} catch (err) {
  console.error(`[seed] Failed: ${err.message}`)
  process.exit(1)
}
