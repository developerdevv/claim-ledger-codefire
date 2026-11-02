import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Ban,
  ChevronRight,
  CircleSlash,
  Copy,
  Info,
  OctagonX,
  Replace,
  Undo2,
} from 'lucide-react'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import { IdChip, VERDICT_META, VerdictBadge } from '../ui/badges'
import { formatDate, formatRelative } from '../../lib/format'

const REASON_MIN = 3
const REASON_MAX = 300

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

export default function ClaimCard({
  claim,
  facts,
  terminology,
  role,
  onApply,
  onCopy,
  onDismiss,
  onUndoDismiss,
  busy = false,
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false)

  /* ------------------------------ dismiss flow ----------------------------- */
  const [dismissOpen, setDismissOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [dismissError, setDismissError] = useState(null)
  const [dismissing, setDismissing] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const reasonRef = useRef(null)
  // Ref guards: same-tick double clicks slip past the state flags before
  // React re-renders (Round 3, F6 item 1).
  const dismissingRef = useRef(false)
  const undoingRef = useRef(false)

  const meta = VERDICT_META[claim.verdict] ?? VERDICT_META.manual
  const source = useMemo(
    () => resolveSource(claim, facts, terminology),
    [claim, facts, terminology],
  )

  // Only flagged claims (Conflicts / Unsupported / Manual review) can be
  // dismissed, and only by Reviewer or Manager — Creators never see it.
  const canDismissRole = role === 'reviewer' || role === 'manager'
  const isFlagged = claim.verdict !== 'verified'
  const dismissed = Boolean(claim.dismissal)

  // Focus the reason textarea once the dialog has opened.
  useEffect(() => {
    if (!dismissOpen) return
    const timer = window.setTimeout(() => reasonRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [dismissOpen])

  function openDismiss() {
    setReason('')
    setDismissError(null)
    setDismissOpen(true)
  }

  async function submitDismiss(e) {
    e.preventDefault()
    if (dismissing || dismissingRef.current) return // a double click must send only one request
    const trimmed = reason.trim()
    if (trimmed.length < REASON_MIN) {
      setDismissError('A reason of at least 3 characters is required.')
      reasonRef.current?.focus()
      return
    }
    dismissingRef.current = true
    setDismissing(true)
    setDismissError(null)
    try {
      await onDismiss(claim, trimmed)
      setDismissOpen(false) // success: the parent toasted and updated the card
    } catch (err) {
      // Keep the modal open and show the server's message.
      setDismissError(err?.message || 'Could not dismiss this flag.')
    } finally {
      dismissingRef.current = false
      setDismissing(false)
    }
  }

  async function handleUndo() {
    if (undoing || undoingRef.current) return
    undoingRef.current = true
    setUndoing(true)
    try {
      await onUndoDismiss(claim) // no confirmation; toast handled by the page
    } finally {
      undoingRef.current = false
      setUndoing(false)
    }
  }

  const evidenceId = `claim-${claim._id}-evidence`
  const quoteId = `claim-${claim._id}-quote`
  const reasonId = `claim-${claim._id}-dismiss-reason`
  const reasonErrorId = `claim-${claim._id}-dismiss-error`
  const dismissFormId = `claim-${claim._id}-dismiss-form`
  const dismissTitleId = `claim-${claim._id}-dismiss-title`

  return (
    <>
      <article
        aria-labelledby={quoteId}
        className="overflow-hidden rounded-lg border border-line bg-surface shadow-[0_1px_2px_rgba(27,34,54,0.05)]"
      >
        {/* Header: verdict badge + dismissed badge + applied marker */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper/60 px-4 py-2.5">
          <VerdictBadge verdict={claim.verdict} />
          {dismissed && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-tint px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
              <Ban size={12} aria-hidden="true" strokeWidth={2.2} />
              Dismissed
            </span>
          )}
          {claim.appliedLocally && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-navy-soft px-2.5 py-0.5 text-xs font-semibold text-navy">
              <Replace size={12} aria-hidden="true" />
              Change applied — re-check to confirm
            </span>
          )}
        </div>

        <div className="space-y-3.5 px-4 py-4">
          {/* Dismissal record — the finding itself is never hidden */}
          {dismissed && (
            <div className="rounded-md border border-line-strong bg-tint px-3.5 py-3">
              <p className="text-xs text-muted">
                <strong className="font-semibold text-ink-soft">
                  {claim.dismissal.actor || 'Reviewer (demo)'}
                </strong>{' '}
                dismissed this flag
                {claim.dismissal.at ? ` · ${formatRelative(claim.dismissal.at)}` : ''}
              </p>
              <p className="mt-1.5 border-l-2 border-line-strong pl-2.5 text-sm leading-relaxed text-ink italic">
                “{claim.dismissal.reason}”
              </p>
              {canDismissRole && (
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={undoing || busy}
                  className="mt-2 inline-flex items-center gap-1 rounded text-xs font-semibold text-navy transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Undo2 size={13} aria-hidden="true" />
                  {undoing ? 'Undoing…' : 'Undo'}
                </button>
              )}
            </div>
          )}

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

          {/* Dismiss action — flagged claims, Reviewer/Manager only */}
          {isFlagged && !dismissed && canDismissRole && (
            <div>
              <Button
                variant="secondary"
                size="sm"
                icon={OctagonX}
                onClick={openDismiss}
                disabled={busy}
              >
                This flag is wrong
              </Button>
            </div>
          )}

          {/* Grounding label — every finding carries it */}
          <p className="flex items-center gap-1.5 border-t border-line pt-3 text-[11px] text-muted">
            <Info size={12} aria-hidden="true" className="shrink-0" />
            AI-generated, may be wrong. A human decides.
          </p>
        </div>
      </article>

      {/* Dismiss modal — reason required, server errors shown in place */}
      <Modal
        open={dismissOpen}
        onClose={dismissing ? undefined : () => setDismissOpen(false)}
        title="Dismiss this flag"
        size="sm"
        labelledBy={dismissTitleId}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDismissOpen(false)} disabled={dismissing}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={dismissFormId}
              variant="primary"
              icon={Ban}
              busy={dismissing}
              disabled={reason.trim().length < REASON_MIN}
            >
              {dismissing ? 'Dismissing…' : 'Dismiss flag'}
            </Button>
          </>
        }
      >
        <form id={dismissFormId} onSubmit={submitDismiss} className="space-y-3" noValidate>
          <p className="text-sm leading-relaxed text-ink-soft">
            Record that a human checked this finding and believes it is wrong. The claim stays
            visible with your reason — nothing is hidden.
          </p>
          <blockquote className="border-l-[3px] border-l-line-strong pl-3 text-sm leading-relaxed text-ink italic">
            “{claim.text}”
          </blockquote>
          <div>
            <label htmlFor={reasonId} className="block text-sm font-medium text-ink">
              Why is this flag wrong? <span className="font-semibold">(required)</span>
            </label>
            <textarea
              id={reasonId}
              ref={reasonRef}
              value={reason}
              maxLength={REASON_MAX}
              rows={3}
              onChange={(e) => {
                setReason(e.target.value)
                if (dismissError) setDismissError(null)
              }}
              placeholder="e.g. The threshold was updated this morning — the draft is correct."
              aria-required="true"
              aria-invalid={dismissError ? true : undefined}
              aria-describedby={dismissError ? reasonErrorId : undefined}
              className="mt-1.5 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-navy focus:outline-none"
            />
            <div className="mt-1 flex items-center justify-between gap-3">
              {dismissError ? (
                <p id={reasonErrorId} role="alert" className="text-xs font-semibold text-ink">
                  {dismissError}
                </p>
              ) : (
                <span />
              )}
              <p className="shrink-0 text-[11px] text-muted tabular-nums">
                {reason.length} / {REASON_MAX}
              </p>
            </div>
          </div>
        </form>
      </Modal>
    </>
  )
}
