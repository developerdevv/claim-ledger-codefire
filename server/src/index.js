import app from './app.js'
import { config } from './config.js'
import { connectDb, disconnectDb } from './db.js'
import { runSeed } from './seed/runSeed.js'

let server = null
let shuttingDown = false

async function startServer() {
  await connectDb()

  // This is idempotent and only inserts when the demo facts collection is
  // empty. It never deletes, resets or otherwise mutates existing data.
  if (config.seedOnStart) {
    const { seeded } = await runSeed()
    if (seeded) console.log('[seed] Facts collection was empty; demo data seeded once.')
  }

  server = app.listen(config.port, () => {
    console.log(
      `[server] Claim Ledger API on :${config.port} ` +
        `(CORS: ${config.frontendUrls.join(', ')}, demo mode ${config.demoMode ? 'ON' : 'off'})`,
    )
  })
}

async function gracefulShutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true

  console.log(`[server] ${signal} received; closing HTTP server and database connection.`)

  // A bounded shutdown prevents a deployment process from hanging forever on
  // a stuck keep-alive connection. No request bodies, secrets or stacks log.
  const forceExit = setTimeout(() => {
    console.error('[server] Graceful shutdown timed out.')
    process.exit(1)
  }, 10_000)
  forceExit.unref()

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      })
    }
    await disconnectDb()
    console.log('[server] Shutdown complete.')
    process.exit(0)
  } catch (err) {
    console.error(`[server] Shutdown failed: ${err.message}`)
    process.exit(1)
  }
}

process.once('SIGTERM', () => {
  gracefulShutdown('SIGTERM')
})
process.once('SIGINT', () => {
  gracefulShutdown('SIGINT')
})

startServer().catch((err) => {
  console.error(`[startup] ${err.message}`)
  process.exit(1)
})
