import { useMemo, useState } from 'react'
import {
  ChevronRight,
  CircleSlash,
  Copy,
  Info,
  Replace,
} from 'lucide-react'
import Button from '../ui/Button'
import { IdChip, VERDICT_META, VerdictBadge } from '../ui/badges'
import { formatDate } from '../../lib/format'

/**
 * Resolve the source a claim cites: an approved fact from the Brand Vault, or
 * a terminology rule (T-004). Falls back to whatever the claim itself carries
 * so a card still renders if lookup lists are unavailable.
 */
export function resolveSource(claim, facts, terminology) {
  if (claim.fact && typeof claim.fact === 'object' && claim.fact.text) {
    return { kind: 'fact', _id: claim.fact._id ?? claim.factId, ...claim.fact }
  }
  const id = claim.factId
  if (!id) return null
  const fact = (facts ?? []).find((f) => f._id === id)
  if (fact) return { kind: 'fact', ...fact }
  const term = (terminology ?? []).find((t) => t._id === id)
  if (term) {
    return {
      kind: 'terminology',
      _id: term._id,
      text: `Use “${term.use}”, never “${term.avoid}”.`,
      note: term.note,
      owner: null,
      verifiedOn: null,
      expiresOn: null,
      status: null,
    }
  }
  return null
}

export default function ClaimCard({ claim, facts, terminology, onApply, onCopy, busy = false }) {
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const meta = VERDICT_META[claim.verdict] ?? VERDICT_META.manual
  const source = useMemo(
    () => resolveSource(claim, facts, terminology),
    [claim, facts, terminology],
  )

  const evidenceId = `claim-${claim._id}-evidence`
  const quoteId = `claim-${claim._id}-quote`

  return (
    <article
      aria-labelledby={quoteId}
      className="overflow-hidden rounded-lg border border-line bg-surface shadow-[0_1px_2px_rgba(27,34,54,0.05)]"
    >
      {/* Header: verdict badge + applied marker */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper/60 px-4 py-2.5">
        <VerdictBadge verdict={claim.verdict} />
        {claim.appliedLocally && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-navy-soft px-2.5 py-0.5 text-xs font-semibold text-navy">
            <Replace size={12} aria-hidden="true" />
            Change applied — re-check to confirm
          </span>
        )}
      </div>

      <div className="space-y-3.5 px-4 py-4">
        {/* The exact claim quote */}
        <blockquote
          id={quoteId}
          className={`border-l-[3px] ${meta.quoteBorder} pl-3 text-[15px] leading-relaxed text-ink`}
        >
          “{claim.text}”
        </blockquote>

        {/* Plain-language explanation */}
        {claim.explanation && (
          <p className="text-sm leading-relaxed text-ink-soft">{claim.explanation}</p>
        )}

        {/* Cited source */}
        <div className="rounded-md border border-line bg-paper px-3.5 py-3">
          {source ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <IdChip id={source._id} />
                <span className="text-xs font-semibold tracking-wide text-muted uppercase">
                  Approved {source.kind === 'terminology' ? 'terminology' : 'fact'}
                </span>
                {source.kind === 'fact' && source.status === 'expired' && (
                  <span className="text-xs font-semibold text-ink-soft">· expired</span>
                )}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">{source.text}</p>
            </>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <CircleSlash size={15} aria-hidden="true" className="text-ink-soft" />
                No approved source found
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                “Unsupported” does not mean the claim is false — the Brand Vault simply has no
                approved fact covering it. Add a source, soften the claim, or decide manually.
              </p>
            </>
          )}
        </div>

        {/* Expandable evidence */}
        <div>
          <button
            type="button"
            onClick={() => setEvidenceOpen((v) => !v)}
            aria-expanded={evidenceOpen}
            aria-controls={evidenceId}
            className="inline-flex items-center gap-1 rounded text-xs font-semibold text-navy transition-colors hover:underline"
          >
            <ChevronRight
              size={13}
              aria-hidden="true"
              className={`transition-transform duration-150 ${evidenceOpen ? 'rotate-90' : ''}`}
            />
            {evidenceOpen ? 'Hide evidence & details' : 'Show evidence & details'}
          </button>
          {evidenceOpen && (
            <div
              id={evidenceId}
              className="mt-2 space-y-2.5 rounded-md border border-line bg-tint/60 px-3.5 py-3 text-xs leading-relaxed"
            >
              <div>
                <p className="font-semibold text-ink-soft">Excerpt from the cited source</p>
                <p className="mt-0.5 text-ink italic">
                  “{claim.excerpt || source?.text || 'No excerpt returned by the check.'}”
                </p>
              </div>
              {source?.kind === 'fact' && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                  <div>
                    <dt className="font-semibold text-muted">Owner</dt>
                    <dd className="text-ink">{source.owner || '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-muted">Verified on</dt>
                    <dd className="text-ink">{formatDate(source.verifiedOn)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-muted">Expires on</dt>
                    <dd className="text-ink">{formatDate(source.expiresOn)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-muted">Status</dt>
                    <dd className="text-ink capitalize">{source.status || '—'}</dd>
                  </div>
                </dl>
              )}
              {source?.kind === 'terminology' && source.note && (
                <p className="text-ink-soft">
                  <span className="font-semibold">Note:</span> {source.note}
                </p>
              )}
              <p className="font-mono text-[11px] text-muted">
                claim {claim._id} · draft {claim.draftId ?? '—'} · verdict {claim.verdict}
              </p>
            </div>
          )}
        </div>

        {/* Suggested rewrite */}
        {claim.suggestion ? (
          <div className="rounded-md border border-line-strong bg-paper px-3.5 py-3">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
              Suggested rewrite
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink">{claim.suggestion}</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                icon={Replace}
                disabled={claim.appliedLocally || busy}
                onClick={() => onApply(claim)}
                title="Replaces only this claim in the draft text"
              >
                {claim.appliedLocally ? 'Applied' : 'Apply to this claim'}
              </Button>
              <Button size="sm" variant="secondary" icon={Copy} onClick={() => onCopy(claim)}>
                Copy
              </Button>
            </div>
          </div>
        ) : claim.verdict === 'verified' ? (
          <p className="text-xs text-muted">
            No rewrite needed — this claim matches the approved source.
          </p>
        ) : (
          <p className="text-xs text-muted italic">
            No automatic rewrite for this finding — a human should decide the wording.
          </p>
        )}

        {/* Grounding label — every finding carries it */}
        <p className="flex items-center gap-1.5 border-t border-line pt-3 text-[11px] text-muted">
          <Info size={12} aria-hidden="true" className="shrink-0" />
          AI-generated, may be wrong. A human decides.
        </p>
      </div>
    </article>
  )
}
