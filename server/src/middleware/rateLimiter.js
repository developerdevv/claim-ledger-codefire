import rateLimit from 'express-rate-limit'

/** Global /api limiter. The 429 body uses the contract error shape. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' })
  },
})

/**
 * Separate, tighter quota for extraction requests. It is intentionally
 * in-memory (hackathon-simple) and uses Express's trusted request IP.
 */
export const checkLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json({ error: 'Checking is limited to 20 requests per minute. Please wait and try again.' })
  },
})
