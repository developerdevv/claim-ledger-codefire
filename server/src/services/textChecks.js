/**
 * Deterministic readability and accessibility checks on the wording itself.
 * Pure function: no database, no network, same input gives the same output.
 * These are guidance for a human reviewer, never verdicts and never approvals.
 */

const MAX_FINDINGS = 20
const LONG_SENTENCE_WORDS = 30

const clip = (value, max = 80) => {
  const s = String(value).replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

export function runTextChecks(text) {
  const source = String(text ?? '')
  const findings = []
  const add = (ruleId, kind, excerpt, message, suggestion) =>
    findings.push({ ruleId, kind, excerpt: clip(excerpt), message, suggestion })

  // A-1: vague link wording. Screen-reader users often hear links out of context.
  for (const m of source.matchAll(/\b(click here|tap here|read more|learn more|this link)\b/gi)) {
    add(
      'A-1',
      'accessibility',
      m[0],
      `"${m[0]}" tells screen-reader users nothing about where the link goes.`,
      'Name the destination instead, for example "See the delivery policy".',
    )
  }

  // A-2: long runs of capitals are hard to read and some screen readers spell them out.
  for (const m of source.matchAll(/\b(?:[A-Z]{2,}[\s,]+){2,}[A-Z]{2,}\b/g)) {
    add(
      'A-2',
      'accessibility',
      m[0],
      'A run of capital letters is harder to read and may be read out letter by letter.',
      'Use normal sentence case and let formatting carry the emphasis.',
    )
  }

  // A-3: long lowercase hashtags cannot be read as separate words.
  for (const m of source.matchAll(/#[a-z0-9]{12,}\b/g)) {
    add(
      'A-3',
      'accessibility',
      m[0],
      'A long all-lowercase hashtag is hard to read and is mispronounced by screen readers.',
      'Capitalise each word, for example #FreeDeliveryIndia.',
    )
  }

  // A-4: strings of emoji are read out one by one.
  for (const m of source.matchAll(/(?:\p{Extended_Pictographic}\uFE0F?\s*){4,}/gu)) {
    add(
      'A-4',
      'accessibility',
      m[0],
      'Four or more emoji in a row are read out one by one by screen readers.',
      'Keep to one or two emoji and put the message in words.',
    )
  }

  // R-1: very long sentences are hard to follow, especially on a phone.
  const sentences = source.split(/(?<=[.!?])\s+|\n+/)
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).filter(Boolean)
    if (words.length > LONG_SENTENCE_WORDS) {
      add(
        'R-1',
        'readability',
        sentence,
        `This sentence has ${words.length} words. Sentences over ${LONG_SENTENCE_WORDS} words are hard to follow.`,
        'Split it into two shorter sentences.',
      )
    }
  }

  return findings.slice(0, MAX_FINDINGS)
}