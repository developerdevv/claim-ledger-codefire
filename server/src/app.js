import express from 'express'
import helmet from 'helmet'
import cors from 'cors'

import { config } from './config.js'
import { apiLimiter } from './middleware/rateLimiter.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'

import healthRouter from './routes/health.js'
import factsRouter from './routes/facts.js'
import guidelinesRouter from './routes/guidelines.js'
import checkRouter from './routes/check.js'
import draftsRouter from './routes/drafts.js'
import impactRouter from './routes/impact.js'
import historyRouter from './routes/history.js'
import demoRouter from './routes/demo.js'

const app = express()

// Render sits behind one reverse-proxy hop. This lets express-rate-limit use
// the actual client IP from X-Forwarded-For instead of one shared proxy IP.
app.set('trust proxy', 1)

const allowedOrigins = new Set(config.frontendUrls)

function corsOrigin(origin, callback) {
  // Requests without Origin include server-to-server uptime probes and curl.
  // They are not browser cross-origin requests, so allowing them does not
  // create a wildcard browser CORS policy.
  if (!origin) return callback(null, true)

  if (allowedOrigins.has(origin)) return callback(null, true)

  const error = new Error('CORS origin denied.')
  error.status = 403
  return callback(error)
}

app.use(helmet())
app.use(
  cors({
    origin: corsOrigin,
  }),
)
app.use(express.json({ limit: '256kb' }))

app.use('/api', apiLimiter)

app.use('/api/health', healthRouter)
app.use('/api/facts', factsRouter)
app.use('/api/guidelines', guidelinesRouter)
app.use('/api/check', checkRouter)
app.use('/api/drafts', draftsRouter)
app.use('/api/impact', impactRouter)
app.use('/api/history', historyRouter)
app.use('/api/demo', demoRouter)

app.use(notFoundHandler)
app.use(errorHandler)

export default app
