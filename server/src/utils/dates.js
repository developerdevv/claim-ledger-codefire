/**
 * Date helpers. Contract: verifiedOn/expiresOn are 'YYYY-MM-DD' STRINGS;
 * a fact is expired when expiresOn < today (lexicographic == chronological
 * for ISO dates). "Today" is the server's local date (the mock uses the
 * browser's local date — same rule, different runtime).
 */

export function todayYMD(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** True when the given 'YYYY-MM-DD' string (or null) is strictly before today. */
export function isExpired(expiresOn, now = new Date()) {
  if (!expiresOn) return false
  return String(expiresOn) < todayYMD(now)
}

export function nowIso() {
  return new Date().toISOString()
}
