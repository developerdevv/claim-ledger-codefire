import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck, Pencil, RotateCw, ScrollText } from 'lucide-react'
import * as api from '../lib/api'
import { formatDateTime, formatRelative } from '../lib/format'
import { navigate } from '../lib/router'
import { useDemo } from '../state/demo'
import Button from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingBlock } from '../components/ui/States'
import { DraftStatusBadge, IdChip } from '../components/ui/badges'

/**
 * HISTORY (P1) — a simple timeline of saved human decisions and fact changes,
 * straight from GET /api/history. Nothing is tracked client-side.
 */

const DECISION_PHRASE = {
  approved: 'approved',
  rejected: 'rejected',
  changes: 'requested changes on',
}

function TimelineDot({ Icon, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line-strong bg-surface ${className}`}
    >
      <Icon size={15} strokeWidth={2.1} />
    </span>
  )
}

function HistoryEvent({ event, isLast }) {
  const isDecision = event.type === 'decision'
  const Icon = isDecision ? ClipboardCheck : Pencil

  let phrase
  if (isDecision) {
    const verb = DECISION_PHRASE[event.to] ?? `recorded “${event.to}” on`
    phrase = (
      <>
        {verb}{' '}
        <button
          type="button"
          onClick={() => navigate(`/review?draft=${encodeURIComponent(event.draftId)}`)}
          className="font-semibold text-navy underline decoration-line-strong underline-offset-2 hover:decoration-navy"
          title="Open this draft in Review"
        >
          “{event.draftTitle ?? event.draftId}”
        </button>
      </>
    )
  } else if (!event.previousText) {
    phrase = (
      <>
        added fact <IdChip id={event.factId} className="mx-0.5" /> to the Brand Vault
      </>
    )
  } else if (event.reason === 'expired') {
    phrase = (
      <>
        let fact <IdChip id={event.factId} className="mx-0.5" /> expire — citing drafts were
        flagged for re-review
      </>
    )
  } else {
    phrase = (
      <>
        edited fact <IdChip id={event.factId} className="mx-0.5" />
        {Array.isArray(event.affectedDraftIds) && event.affectedDraftIds.length > 0 && (
          <> — {event.affectedDraftIds.length} draft{event.affectedDraftIds.length === 1 ? '' : 's'} flagged for re-review</>
        )}
      </>
    )
  }

  return (
    <li className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3">
      <div className="flex flex-col items-center" aria-hidden="true">
        <TimelineDot Icon={Icon} className={isDecision ? 'text-navy' : 'text-ink-soft'} />
        {!isLast && <span className="my-1 w-px flex-1 bg-line-strong" />}
      </div>

      <article className="mb-4 rounded-lg border border-line bg-surface px-4 py-3.5 shadow-[0_1px_2px_rgba(27,34,54,0.05)]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm leading-snug text-ink-soft">
            <span className="font-semibold text-ink">{event.actor ?? 'Someone (demo)'}</span>{' '}
            {phrase}
          </p>
          <time
            dateTime={event.at ?? undefined}
            title={formatDateTime(event.at)}
            className="shrink-0 text-xs text-muted"
          >
            {formatRelative(event.at)}
          </time>
        </div>

        {isDecision && (event.from || event.to) && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            {event.from && (
              <>
                <DraftStatusBadge status={event.from} />
                <span aria-hidden="true">→</span>
              </>
            )}
            {event.to && <DraftStatusBadge status={event.to} />}
          </p>
        )}

        {!isDecision && event.previousText && event.newText && event.previousText !== event.newText && (
          <div className="mt-2 space-y-1 rounded-md border border-line bg-paper px-3 py-2 text-xs leading-relaxed">
            <p className="text-muted">
              <span className="font-semibold text-ink-soft">Was:</span>{' '}
              <span className="line-through decoration-line-strong">{event.previousText}</span>
            </p>
            <p className="text-ink">
              <span className="font-semibold text-ink-soft">Now:</span> {event.newText}
            </p>
          </div>
        )}
        {!isDecision && !event.previousText && event.newText && (
          <p className="mt-2 rounded-md border border-line bg-paper px-3 py-2 text-xs leading-relaxed text-ink">
            {event.newText}
          </p>
        )}

        {event.comment && (
          <p className="mt-2 border-l-2 border-line-strong pl-2.5 text-xs leading-relaxed text-ink-soft italic">
            “{event.comment}”
          </p>
        )}
      </article>
    </li>
  )
}

export default function HistoryPage() {
  const { refreshKey } = useDemo()
  const [events, setEvents] = useState(null) // null = loading
  const [error, setError] = useState(null)
  const [reloading, setReloading] = useState(false)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) setReloading(true)
    else setEvents(null)
    setError(null)
    try {
      const list = await api.getHistory()
      const sorted = [...list].sort((a, b) => new Date(b.at ?? 0) - new Date(a.at ?? 0))
      setEvents(sorted)
    } catch (err) {
      setError(err)
    } finally {
      setReloading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm leading-relaxed text-ink-soft">
          Every human decision and every change to an approved fact, newest first — the audit
          trail behind the ledger.
        </p>
        <Button size="sm" variant="secondary" icon={RotateCw} busy={reloading} onClick={() => load({ silent: true })}>
          Refresh
        </Button>
      </div>

      {error && <ErrorState error={error} title="Could not load history" onRetry={() => load()} />}

      {!error && events === null && <LoadingBlock label="Loading history…" rows={3} />}

      {!error && events !== null && events.length === 0 && (
        <EmptyState
          icon={ScrollText}
          title="No decisions or fact changes yet"
          description="Record a decision on the Review page, or edit a fact in the Brand Vault — both show up here."
        />
      )}

      {!error && events !== null && events.length > 0 && (
        <div>
          <h2 className="sr-only">Timeline of decisions and fact changes</h2>
          <ol>
            {events.map((event, i) => (
              <HistoryEvent key={event._id ?? `${event.at}-${i}`} event={event} isLast={i === events.length - 1} />
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
