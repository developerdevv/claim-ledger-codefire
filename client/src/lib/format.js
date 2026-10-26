/** Date / number / text helpers shared by all pages. */

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function toDate(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "15 Sep 2026" — or an em dash for missing/invalid dates. */
export function formatDate(value) {
  const d = toDate(value)
  return d ? dateFmt.format(d) : '—'
}

/** "15 Sep 2026, 4:40 pm" */
export function formatDateTime(value) {
  const d = toDate(value)
  return d ? dateTimeFmt.format(d) : '—'
}

/** "just now", "12 min ago", "3 days ago", else the formatted date. */
export function formatRelative(value) {
  const d = toDate(value)
  if (!d) return '—'
  const diffMs = Date.now() - d.getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDate(d)
}

/** Whole days from the start of today until the given date (negative = past). */
export function daysUntil(value) {
  const d = toDate(value)
  if (!d) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  return Math.round((target - today) / 86400000)
}

/** True when a fact's expiry date is in the past. */
export function isExpired(fact) {
  const days = daysUntil(fact?.expiresOn)
  return days !== null && days < 0
}

/** Word count for the editor footer. */
export function wordCount(text) {
  const trimmed = (text || '').trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

/** Today as a yyyy-mm-dd string for <input type="date">. */
export function todayInputValue() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Normalise any date-ish string to yyyy-mm-dd for date inputs. */
export function toInputDate(value) {
  const d = toDate(value)
  if (!d) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Truncate long strings for compact UI spots (titles in lists, tooltips). */
export function truncate(str, max = 90) {
  const s = String(str ?? '')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
