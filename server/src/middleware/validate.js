import { HttpError } from './errorHandler.js'

/**
 * zod body validator. On failure: 400 { error } with messages joined by a
 * space — the exact format the mock adapter uses ('Fact text must be at
 * least 8 characters. An owner is required.').
 */
export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body ?? {})
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join(' ')
    return next(new HttpError(400, message || 'Invalid request body.'))
  }
  req.body = result.data
  next()
}
