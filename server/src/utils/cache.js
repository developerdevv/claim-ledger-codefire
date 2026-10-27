import crypto from 'node:crypto'

const TTL_MS = 10 * 60 * 1000
const MAX_ENTRIES = 200
const entries = new Map()

/**
 * Hash only what changes the answer: draft text plus all active-fact versions
 * and retrieval-relevant status/expiry metadata. IDs are sorted, so Mongo
 * return order cannot cause duplicate cache entries.
 */
export function makeCacheKey(text, activeFacts) {
  const versionVector = [...activeFacts]
    .sort((a, b) => String(a._id).localeCompare(String(b._id)))
    .map((fact) => `${fact._id}:v${fact.version ?? 1}:${fact.status}:${fact.expiresOn ?? ''}`)
    .join('|')
  return crypto
    .createHash('sha256')
    .update(`${String(text)}\n---active-facts---\n${versionVector}`)
    .digest('hex')
}

/** Return null rather than stale data; expired entries are removed eagerly. */
export function cacheGet(key) {
  const entry = entries.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    entries.delete(key)
    return null
  }
  return entry.value
}

/**
 * Small in-process bounded cache. Map insertion order lets us discard the
 * oldest entry without a dependency; a restart merely loses cache warmth.
 */
export function cacheSet(key, value) {
  if (entries.has(key)) entries.delete(key) // refresh moves it to the end
  entries.set(key, { value, expiresAt: Date.now() + TTL_MS })
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value)
}

// Exported only for deterministic future unit tests; never exposed by HTTP.
export function clearCheckCache() {
  entries.clear()
}
