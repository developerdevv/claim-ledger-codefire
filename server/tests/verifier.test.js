import { describe, it, expect } from 'vitest'

import { applyVerdictLaw } from '../src/services/verifier.js'
import { runCheck } from '../src/services/rulesEngine.js'
import { buildClaimSet } from '../src/services/checkPipeline.js'
import { createLlmClient } from '../src/services/llmClient.js'

/**
 * Seven pure unit cases for the SERVER VERDICT LAW and fallback behavior.
 * This file never calls an LLM: vitest.config.js supplies an empty LLM_API_KEY.
 */

const ACTIVE_FACTS = [
  {
    _id: 'F-001',
    text: 'Free delivery on all orders above ₹499 within India.',
    owner: 'Priya Nair (Operations)',
    verifiedOn: '2026-09-15',
    expiresOn: '2026-12-31',
    status: 'active',
    version: 1,
  },
]

const EXPIRED_FACTS = [
  {
    _id: 'F-050',
    text: 'Monsoon Sale 2025 offered 30% off all saris.',
    owner: 'Aarav Mehta (Marketing)',
    verifiedOn: '2025-10-01',
    expiresOn: '2025-11-15',
    status: 'expired',
    version: 2,
  },
]

const TERMINOLOGY = [
  {
    _id: 'T-004',
    use: 'free delivery',
    avoid: 'free shipping',
    note: 'All customer-facing copy says “free delivery”, never “free shipping”.',
  },
]

const DRAFT_TEXT = [
  'Get free delivery on all orders above ₹499.',
  'The monsoon sale gave everyone 30% off last year.',
  'Free shipping on every order today.',
].join('\n')

const CTX = { activeFacts: ACTIVE_FACTS, expiredFacts: EXPIRED_FACTS, draftText: DRAFT_TEXT }

describe('server verdict law', () => {
  it('1. accepts a verified claim when the receipt is valid (fact exists, active, excerpt contained)', () => {
    const [claim] = applyVerdictLaw(
      [
        {
          text: 'Get free delivery on all orders above ₹499.',
          verdict: 'verified',
          factId: 'F-001',
          excerpt: 'orders above ₹499',
          explanation: 'Matches the approved fact.',
          suggestion: null,
          uncertainty: 'low',
        },
      ],
      CTX,
    )
    expect(claim.verdict).toBe('verified')
    expect(claim.factId).toBe('F-001')
    expect(claim.excerpt).toBe('orders above ₹499')
    expect(claim.sourceType).toBe('fact')
    expect(claim.aiGenerated).toBe(true)
  })

  it('2. turns a fabricated/unknown factId into manual (factId null, no receipt)', () => {
    const [claim] = applyVerdictLaw(
      [
        {
          text: 'Get free delivery on all orders above ₹499.',
          verdict: 'verified',
          factId: 'F-999',
          excerpt: 'orders above ₹499',
          explanation: 'Model insists F-999 covers this.',
        },
      ],
      CTX,
    )
    expect(claim.verdict).toBe('manual')
    expect(claim.factId).toBeNull()
    expect(claim.excerpt).toBe('')
    expect(claim.explanation).toMatch(/could not be validated/)
  })

  it('3. turns a citation of an EXPIRED fact into manual with an honest expiry explanation', () => {
    const [claim] = applyVerdictLaw(
      [
        {
          text: 'The monsoon sale gave everyone 30% off last year.',
          verdict: 'conflicts',
          factId: 'F-050',
          excerpt: '30% off all saris',
          explanation: 'Contradicted by F-050.',
        },
      ],
      CTX,
    )
    expect(claim.verdict).toBe('manual')
    expect(claim.factId).toBe('F-050') // kept for audit/re-review
    expect(claim.excerpt).toBe('')
    expect(claim.explanation).toMatch(/expired/)
    expect(claim.explanation).toMatch(/re-verification/)
  })

  it('4. turns an excerpt that is NOT in the stored fact text into manual (no receipt)', () => {
    const [claim] = applyVerdictLaw(
      [
        {
          text: 'Get free delivery on all orders above ₹499.',
          verdict: 'verified',
          factId: 'F-001',
          excerpt: 'free gift wrapping is included', // not present in F-001
          explanation: 'Cites F-001.',
        },
      ],
      CTX,
    )
    expect(claim.verdict).toBe('manual')
    expect(claim.factId).toBeNull()
    expect(claim.excerpt).toBe('')
    expect(claim.explanation).toMatch(/excerpt/)
  })

  it('5. leaves unsupported-without-factId untouched (unsupported never means false)', () => {
    const [claim] = applyVerdictLaw(
      [
        {
          text: 'The monsoon sale gave everyone 30% off last year.',
          verdict: 'unsupported',
          factId: null,
          excerpt: null,
          explanation: 'No approved source covers it.',
        },
      ],
      CTX,
    )
    expect(claim.verdict).toBe('unsupported')
    expect(claim.factId).toBeNull()
    expect(claim.excerpt).toBe('')
  })

  it('6. makes text outside the draft and unrecognized model verdicts manual', () => {
    const [offDraft, unknownVerdict] = applyVerdictLaw(
      [
        {
          text: 'Every order ships with a free gold necklace.', // not in DRAFT_TEXT
          verdict: 'verified',
          factId: 'F-001',
          excerpt: 'orders above ₹499',
          explanation: 'Not actually a draft sentence.',
        },
        {
          text: 'Get free delivery on all orders above ₹499.',
          verdict: 'approved-by-ai',
          factId: 'F-001',
          excerpt: 'orders above ₹499',
          explanation: 'An unrecognized verdict.',
        },
      ],
      CTX,
    )
    expect(offDraft.verdict).toBe('manual')
    expect(offDraft.factId).toBeNull()
    expect(unknownVerdict.verdict).toBe('manual')
    expect(unknownVerdict.explanation).toMatch(/approved-by-ai/)
  })
})

describe('deterministic fallback (no LLM calls)', () => {
  it('7. runs engine-only with no key; engine owns terminology and all claims are honest fallback results', async () => {
    const llm = createLlmClient()
    expect(llm.isEnabled()).toBe(false)

    const engine = runCheck(DRAFT_TEXT, { facts: ACTIVE_FACTS, terminology: TERMINOLOGY })
    const term = engine.claims.find((claim) => claim.factId === 'T-004')
    expect(term).toBeDefined()
    expect(term.sourceType).toBe('terminology')
    expect(term.verdict).toBe('conflicts')
    expect(term.explanation).not.toMatch(/null/i)
    expect(term.suggestion).toBe('Free delivery on every order today.')

    const result = await buildClaimSet({
      text: DRAFT_TEXT,
      facts: ACTIVE_FACTS,
      activeFacts: ACTIVE_FACTS,
      expiredFacts: EXPIRED_FACTS,
      terminology: TERMINOLOGY,
      llmClient: llm,
    })
    expect(result.mode).toBe('fallback')
    expect(result.claims.length).toBeGreaterThan(0)
    expect(result.manualReview).toBe(false)
    for (const claim of result.claims) {
      expect(claim.checkMode).toBe('fallback')
      expect(claim.aiGenerated).toBe(false)
    }
  })
})
