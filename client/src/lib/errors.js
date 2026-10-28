/**
 * Single error type for every API failure, thrown by both the HTTP adapter
 * and the mock adapter so pages can handle them identically.
 */
export class ApiError extends Error {
  constructor(message, { status = 0, cause = null } = {}) {
    super(message)
    this.name = 'ApiError'
    /** HTTP status, or 0 for network/timeout failures. */
    this.status = status
    if (cause) this.cause = cause
  }
}
