/**
 * Deterministic claim-check rules — a byte-faithful port of the frontend's
 * mock engine (client/src/.../mock/engine.js), which is the contract for:
 *   • generated claim texts/verdicts/explanations/suggestions,
 *   • how the T-004 terminology flag attaches (factId = term id,
 *     sourceType = 'terminology', excerpt = terminologyText(term)),
 *   • the { claims, manualReview } shape (claims: [] + manualReview: true for
 *     malformed / too-short input).
 *
 * Used in Stage 1 to generate the seeded drafts' claims exactly as the mock
 * does, and reused in Stage 2 as the deterministic fallback engine
 * (checkMode: 'fallback') when the LLM is unavailable or ungrounded.
 *
 * APPROVED DIVERGENCE FROM THE MOCK (Codex 48, requested by backend lead):
 *   In deliveryRule's "threshold matches, wrong word" branch the mock prints
 *   "The ₹null threshold matches…" when the sentence has no ₹ amount
 *   (rupees(null)). The live engine is amount-aware instead and never prints
 *   "null". The amount-present string is UNCHANGED, so mock parity holds
 *   whenever a threshold is actually stated. See DIVERGENCE note below.
 */

/* eslint-disable no-unused-vars */

const RUPEE = /₹\s*(\d[\d,]*)/

function amountIn(str) {
  const m = String(str || '').match(RUPEE)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

function rupees(n) {
  return `₹${n}`
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function findFact(facts, test) {
  return facts.find((f) => test(f.text)) || null
}

/** Display text for a terminology entry when it is cited as a source. */
export function terminologyText(term) {
  if (!term) return ''
  return `Use “${term.use}”, never “${term.avoid}”.`
}

/* -------------------------------------------------------------------------- */
/* Per-topic rules. Each returns null (no claim) or a partial claim object.    */
/* -------------------------------------------------------------------------- */

function deliveryRule(sentence, { facts, terminology }) {
  const mentions =
    /free\s+(delivery|shipping)|complimentary\s+(delivery|shipping)|free\s+ship\b/i.test(
      sentence,
    ) || (/delivery/i.test(sentence) && RUPEE.test(sentence))
  if (!mentions) return null

  const fact = findFact(facts, (t) => /delivery/i.test(t) && RUPEE.test(t))
  const term = terminology.find(
    (t) => /delivery/i.test(t.use) && /shipping/i.test(t.avoid),
  )

  const saysShipping = /shipping/i.test(sentence)
  const amount = amountIn(sentence)
  const factAmount = fact ? amountIn(fact.text) : null

  // No approved delivery fact at all → unsupported (never "false").
  if (!fact) {
    if (saysShipping && term) {
      return {
        text: sentence,
        verdict: 'conflicts',
        factId: term._id,
        sourceType: 'terminology',
        excerpt: terminologyText(term),
        explanation: `Brand terminology ${term._id} requires “${term.use}” — “${term.avoid}” is never used in customer-facing copy. No approved delivery fact was found either.`,
        suggestion: sentence.replace(/shipping/i, 'delivery'),
      }
    }
    return {
      text: sentence,
      verdict: 'unsupported',
      factId: null,
      excerpt: '',
      explanation:
        'No approved source found for this delivery promise. This does not mean it is false — the Brand Vault simply has no active fact covering it.',
      suggestion: null,
    }
  }

  const factExcerpt = fact.text

  // Threshold mismatch → conflicts with the fact.
  if (amount !== null && factAmount !== null && amount !== factAmount) {
    const termNote = saysShipping
      ? ` It also says “shipping”; terminology ${term?._id ?? 'T-004'} requires “free delivery”.`
      : ''
    return {
      text: sentence,
      verdict: 'conflicts',
      factId: fact._id,
      sourceType: 'fact',
      excerpt: factExcerpt,
      explanation: `The draft promises free delivery above ${rupees(amount)}, but approved fact ${fact._id} sets the threshold at ${rupees(factAmount)}.${termNote}`,
      suggestion: sentence
        .replace(RUPEE, rupees(factAmount))
        .replace(/shipping/i, 'delivery'),
    }
  }

  // Wrong word ("shipping") → terminology conflict.
  // DIVERGENCE (approved fix): the mock rendered `rupees(null)` → "₹null" here
  // when the sentence states no amount. The live engine is amount-aware:
  //   • amount present (and equal, or fact unknown) → the mock's exact string
  //   • no amount stated → a clean terminology-only sentence
  // Verdict, factId, sourceType, excerpt and suggestion are identical to the mock.
  if (saysShipping && term) {
    return {
      text: sentence,
      verdict: 'conflicts',
      factId: term._id,
      sourceType: 'terminology',
      excerpt: terminologyText(term),
      explanation:
        amount === null
          ? `Brand terminology ${term._id} requires “${term.use}” — never “${term.avoid}”.`
          : `The ${rupees(amount)} threshold matches approved fact ${fact._id}, but brand terminology ${term._id} requires “${term.use}” — never “${term.avoid}”.`,
      suggestion: sentence.replace(/shipping/i, 'delivery'),
    }
  }

  // "Free shipping" with no threshold at all.
  // (Unreachable — the branch above catches it first. Kept so the rule order
  // stays visually identical to the mock for future diffs.)
  if (amount === null && saysShipping && term) {
    return {
      text: sentence,
      verdict: 'conflicts',
      factId: term._id,
      sourceType: 'terminology',
      excerpt: terminologyText(term),
      explanation: `Brand terminology ${term._id} requires “${term.use}” — “${term.avoid}” is never used in customer-facing copy.`,
      suggestion: sentence.replace(/shipping/i, 'delivery'),
    }
  }

  // Unconditional "free delivery" (no threshold) → conflicts with the fact.
  if (amount === null) {
    return {
      text: sentence,
      verdict: 'conflicts',
      factId: fact._id,
      sourceType: 'fact',
      excerpt: factExcerpt,
      explanation: `Approved fact ${fact._id} conditions free delivery on orders above ${rupees(factAmount)}; this sentence promises it unconditionally.`,
      suggestion: sentence.replace(
        /free delivery/i,
        `free delivery on orders above ${rupees(factAmount)}`,
      ),
    }
  }

  // Everything matches.
  return {
    text: sentence,
    verdict: 'verified',
    factId: fact._id,
    sourceType: 'fact',
    excerpt: factExcerpt,
    explanation: `Matches approved fact ${fact._id}: the benefit and the ${rupees(amount)} threshold are stated correctly.`,
    suggestion: null,
  }
}

function saleRule(sentence, { facts }) {
  if (!/(\d+)\s*%\s*off|festive sale|sale is live/i.test(sentence)) return null

  const fact = findFact(facts, (t) => /sale|% off/i.test(t))
  if (!fact) {
    return {
      text: sentence,
      verdict: 'unsupported',
      factId: null,
      excerpt: '',
      explanation:
        'No approved source found for this sale claim. This does not mean it is false — no active fact in the Brand Vault covers it.',
      suggestion: null,
    }
  }

  const sentencePct = sentence.match(/(\d+)\s*%/)
  const factPct = fact.text.match(/(\d+)\s*%/)
  const overstatesScope = /sitewide|site-wide|across the site|entire store|everything|all styles/i.test(
    sentence,
  )

  if (sentencePct && factPct && sentencePct[1] !== factPct[1]) {
    return {
      text: sentence,
      verdict: 'conflicts',
      factId: fact._id,
      sourceType: 'fact',
      excerpt: fact.text,
      explanation: `The draft advertises ${sentencePct[1]}% off, but approved fact ${fact._id} allows up to ${factPct[1]}% off.`,
      suggestion: sentence.replace(/(\d+)\s*%/, `${factPct[1]}%`),
    }
  }

  if (overstatesScope) {
    return {
      text: sentence,
      verdict: 'conflicts',
      factId: fact._id,
      sourceType: 'fact',
      excerpt: fact.text,
      explanation: `Approved fact ${fact._id} limits the Festive Sale discount to selected styles and fixed dates; “sitewide” overstates the offer.`,
      suggestion: sentence.replace(/sitewide|site-wide/i, 'on selected styles'),
    }
  }

  return {
    text: sentence,
    verdict: 'verified',
    factId: fact._id,
    sourceType: 'fact',
    excerpt: fact.text,
    explanation: `Matches approved fact ${fact._id}: the sale scope and discount are stated correctly.`,
    suggestion: null,
  }
}

function cottonRule(sentence, { facts }) {
  if (!/organic cotton|100% cotton|gots/i.test(sentence)) return null
  const fact = findFact(facts, (t) => /organic cotton|gots/i.test(t))
  if (!fact) {
    return {
      text: sentence,
      verdict: 'unsupported',
      factId: null,
      excerpt: '',
      explanation:
        'No approved source found for this material claim. This does not mean it is false — no active fact in the Brand Vault covers it.',
      suggestion: null,
    }
  }
  return {
    text: sentence,
    verdict: 'verified',
    factId: fact._id,
    sourceType: 'fact',
    excerpt: fact.text,
    explanation: `Matches approved fact ${fact._id}: the material and certification claims are covered.`,
    suggestion: null,
  }
}

function dispatchRule(sentence, { facts }) {
  const mentionsDispatch = /same[\s-]*day|dispatch/i.test(sentence)
  const mentionsCutoff = /before\s*\d{1,2}\s*(am|pm)/i.test(sentence)
  if (!mentionsDispatch && !(mentionsCutoff && /ship/i.test(sentence))) return null

  const fact = findFact(facts, (t) => /before\s*\d{1,2}\s*(am|pm)/i.test(t) && /ship|dispatch/i.test(t))
  if (!fact) {
    return {
      text: sentence,
      verdict: 'unsupported',
      factId: null,
      excerpt: '',
      explanation:
        'No approved source found for this dispatch promise. This does not mean it is false — no active fact in the Brand Vault covers it.',
      suggestion: null,
    }
  }

  const sentenceTime = sentence.match(/before\s*(\d{1,2})\s*(am|pm)/i)
  const factTime = fact.text.match(/before\s*(\d{1,2})\s*(am|pm)/i)

  if (sentenceTime && factTime) {
    const same =
      sentenceTime[1] === factTime[1] &&
      sentenceTime[2].toLowerCase() === factTime[2].toLowerCase()
    if (!same) {
      return {
        text: sentence,
        verdict: 'conflicts',
        factId: fact._id,
        sourceType: 'fact',
        excerpt: fact.text,
        explanation: `The draft promises same-day dispatch for orders before ${sentenceTime[1]} ${sentenceTime[2].toUpperCase()}, but approved fact ${fact._id} sets the cutoff at ${factTime[1]} ${factTime[2].toUpperCase()} IST.`,
        suggestion: sentence.replace(
          /before\s*\d{1,2}\s*(am|pm)/i,
          `before ${factTime[1]} ${factTime[2].toUpperCase()}`,
        ),
      }
    }
  }

  return {
    text: sentence,
    verdict: 'verified',
    factId: fact._id,
    sourceType: 'fact',
    excerpt: fact.text,
    explanation: `Matches approved fact ${fact._id}: the dispatch cutoff is stated correctly.`,
    suggestion: null,
  }
}

const SUPERLATIVE_RE =
  /\b(best|biggest|lowest|most[- ]loved|most loved|#1|number one|guaranteed|world[- ]class|unbeatable|perfect)\b/i

function superlativeRule(sentence) {
  const m = sentence.match(SUPERLATIVE_RE)
  if (!m) return null

  let suggestion = null
  if (/lowest prices/i.test(sentence)) {
    suggestion = 'Great festive prices across the collection.'
  } else if (/most[- ]loved/i.test(sentence)) {
    suggestion = 'Handloom comfort, made for everyday India.'
  }

  return {
    text: sentence,
    verdict: 'unsupported',
    factId: null,
    excerpt: '',
    explanation: `No approved source found for “${m[1]}”. This does not mean the claim is false — but nothing in the Brand Vault supports it, and brand guidelines bar unverified superlatives.`,
    suggestion,
  }
}

function statisticRule(sentence) {
  const m = sentence.match(/(\d[\d,]*)\s*\+?\s*(years|customers|clients|stores|cities)/i)
  if (!m) return null

  let suggestion = null
  if (/years of experience/i.test(sentence)) {
    suggestion = 'Our artisans carry generations of handloom expertise.'
  }

  return {
    text: sentence,
    verdict: 'unsupported',
    factId: null,
    excerpt: '',
    explanation: `No approved source found for the statistic “${m[1]} ${m[2]}”. This does not mean it is false — an approved, dated source would need to be added to the Brand Vault first.`,
    suggestion,
  }
}

/* -------------------------------------------------------------------------- */

const RULES = [deliveryRule, saleRule, cottonRule, dispatchRule, superlativeRule, statisticRule]

/**
 * Run the deterministic check over a draft's text against the given store.
 * @param {string} text
 * @param {{ facts: object[], terminology: object[] }} store
 * @returns {{ claims: object[], manualReview: boolean }}
 */
export function runCheck(text, store) {
  const trimmed = String(text || '').trim()

  // Malformed / too-short input → flag for a human instead of inventing claims.
  if (trimmed.length < 30) {
    return { claims: [], manualReview: true }
  }

  const sentences = splitSentences(trimmed)
  if (sentences.length === 0) return { claims: [], manualReview: true }

  const claims = []
  for (const sentence of sentences) {
    for (const rule of RULES) {
      const hit = rule(sentence, store)
      if (hit) {
        claims.push(hit)
        break // one finding per sentence keeps "Apply" unambiguous
      }
    }
  }

  return { claims, manualReview: false }
}
