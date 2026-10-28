/** Shared HTTP error, async wrapper, and central handlers.
 *  Non-2xx bodies are ALWAYS { error: string } — the frontend contract. */

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

/** Wrap async route handlers so rejections reach errorHandler. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)

/** Unknown route (API or otherwise). */
export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` })
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err)

  // express.json() failures
  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return res.status(400).json({ error: 'Request body is not valid JSON.' })
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' })
  }

  const status = Number.isInteger(err?.status)
    ? err.status
    : err?.name === 'CastError'
      ? 400
      : 500

  if (status >= 500) {
    console.error('[error]', err) // server-side only — stack never leaks into responses
    return res
      .status(500)
      .json({ error: 'Something went wrong on our side. Please try again.' })
  }
  return res.status(status).json({ error: err.message })
}
