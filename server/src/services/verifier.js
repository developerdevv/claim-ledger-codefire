/**
 * Server-side verdict law. This is intentionally pure: it receives only model
 * proposals, the approved-fact retrieval context, and draft text. A model can
 * propose a claim; it can never grant itself a verified/conflicts verdict.
 */

export function collapseWs(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

/** Case/whitespace-insensitive key used ONLY for receipt text matching. */
export function keyFold(value) {
  return collapseWs(value).normalize('NFKC').toLocaleLowerCase()
}

function validUncertainty(value) {
  return ['low', 'medium', 'high'].includes(value) ? value : null
}

function proposalBase(proposal, overrides = {}) {
  return {
    text: String(proposal?.text ?? ''),
    verdict: proposal?.verdict ?? 'manual',
    factId: proposal?.factId ?? null,
    excerpt: proposal?.excerpt ?? '',
    explanation: proposal?.explanation ?? '',
    suggestion: proposal?.suggestion ?? null,
    sourceType: null,
    aiGenerated: true,
    ruleId: null,
    uncertainty: validUncertainty(proposal?.uncertainty),
    ...overrides,
  }
}

function manual(proposal, explanation, overrides = {}) {
  return proposalBase(proposal, {
    verdict: 'manual',
    factId: null,
    excerpt: '',
    sourceType: null,
    explanation,
    ...overrides,
  })
}

/**
 * Apply the verdict law to zod-validated model proposals.
 *
 * verified/conflicts are accepted ONLY with a valid receipt:
 *  1. the exact claim text appears in the draft,
 *  2. factId identifies an active fact,
 *  3. excerpt is a keyFold substring of that fact's stored text.
 *
 * Expired fact citations stay visible for audit (factId kept) but MUST be
 * manual. Unsupported is an epistemic "not found", never a false claim.
 */
export function applyVerdictLaw(proposals, { activeFacts = [], expiredFacts = [], draftText = '' }) {
  const activeById = new Map(activeFacts.map((fact) => [fact._id, fact]))
  const expiredById = new Map(expiredFacts.map((fact) => [fact._id, fact]))
  const draft = String(draftText ?? '')

  return proposals.map((proposal) => {
    const text = String(proposal?.text ?? '')

    // "Verbatim in draft" is deliberately stricter than the receipt match.
    // We only accept the model's actual excerpt of content — no paraphrases.
    if (!text || !draft.includes(text)) {
      return manual(
        proposal,
        'The model returned text that does not appear verbatim in the draft, so a reviewer must check it.',
      )
    }

    const rawVerdict = String(proposal?.verdict ?? '').trim()
    if (!['verified', 'conflicts', 'unsupported', 'manual'].includes(rawVerdict)) {
      return manual(
        proposal,
        `The model returned an unrecognized verdict "${rawVerdict}"; a reviewer must verify this claim.`,
      )
    }

    if (rawVerdict === 'unsupported') {
      return proposalBase(proposal, {
        verdict: 'unsupported',
        factId: null,
        excerpt: '',
        sourceType: null,
      })
    }

    // A model-manual claim may retain a REAL source id for a reviewer to open,
    // but it never carries an asserted receipt/excerpt.
    if (rawVerdict === 'manual') {
      const suppliedId = proposal?.factId ?? null
      const realFact = activeById.get(suppliedId) || expiredById.get(suppliedId)
      return proposalBase(proposal, {
        verdict: 'manual',
        factId: realFact ? realFact._id : null,
        excerpt: '',
        sourceType: realFact ? 'fact' : null,
      })
    }

    const factId = proposal?.factId ?? null
    if (!factId) {
      return manual(
        proposal,
        'The model gave a verdict but cited no source — the cited source could not be validated, so a reviewer must check it.',
      )
    }

    const expired = expiredById.get(factId)
    if (expired) {
      return manual(
        proposal,
        `Approved source ${factId} has expired and needs re-verification before this claim can be decided.`,
        { factId: expired._id, sourceType: 'fact' },
      )
    }

    const fact = activeById.get(factId)
    if (!fact) {
      return manual(
        proposal,
        `The cited source ${factId} could not be validated — it does not exist among the approved facts.`,
      )
    }

    const excerpt = proposal?.excerpt
    if (!excerpt || !keyFold(fact.text).includes(keyFold(excerpt))) {
      return manual(
        proposal,
        'The cited excerpt does not appear in the stored fact text, so a reviewer must check it.',
      )
    }

    return proposalBase(proposal, {
      verdict: rawVerdict,
      factId: fact._id,
      excerpt: String(excerpt),
      sourceType: 'fact',
    })
  })
}
