import { useCallback, useEffect, useState } from 'react'
import {
  ArrowRight,
  CalendarClock,
  FileText,
  Flame,
  ListChecks,
  Pencil,
  RotateCw,
  Waypoints,
} from 'lucide-react'
import * as api from '../lib/api'
import { formatDate, formatRelative, truncate } from '../lib/format'
import { navigate } from '../lib/router'
import { useDemo } from '../state/demo'
import Button from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingBlock } from '../components/ui/States'
import { DraftStatusBadge, IdChip, VerdictBadge } from '../components/ui/badges'

/**
 * IMPACT VIEW — the signature page.
 *
 * When an approved fact is edited or expires, every claim that cited it and
 * every draft containing those claims must be looked at again. This page
 * renders that chain with semantic HTML + CSS only (no graph library), and
 * every count comes from GET /api/impact — nothing is hardcoded.
 *
 * Ember orange lives here (and on "Needs re-review") and nowhere else.
 */

function StepMarker({ n, isLast }) {
  return (
    <div className="flex flex-col items-center" aria-hidden="true">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-ember bg-surface font-heading text-sm font-bold text-ember-ink">
        {n}
      </span>
      {!isLast && <span className="my-1 w-px flex-1 bg-line-strong" />}
    </div>
  )
}

export default function ImpactPage() {
  const { refreshKey } = useDemo()
  const [entries, setEntries] = useState(null) // null = loading
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [reloading, setReloading] = useState(false)

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) setReloading(true)
      else setEntries(null)
      setError(null)
      try {
        const list = await api.getImpact()
        setEntries(list)
        setSelectedId((prev) =>
          prev && list.some((e) => e._id === prev) ? prev : (list[0]?._id ?? null),
        )
      } catch (err) {
        setError(err)
        if (silent) setEntries((prev) => prev) // keep old list visible behind the error
      } finally {
        setReloading(false)
      }
    },
    [],
  )

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const selected = (entries ?? []).find((e) => e._id === selectedId) ?? null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          The Brand Vault is the source of truth. When an approved fact is{' '}
          <strong className="font-semibold text-ink">edited</strong> or{' '}
          <strong className="font-semibold text-ink">expires</strong>, every claim that cited
          it — and every draft containing those claims — needs a human to look again. That
          chain is listed here.
        </p>
        <Button
          size="sm"
          variant="secondary"
          icon={RotateCw}
          busy={reloading}
          onClick={() => load({ silent: true })}
        >
          Refresh
        </Button>
      </div>

      {error && !entries && (
        <ErrorState error={error} title="Could not load the Impact View" onRetry={() => load()} />
      )}
      {error && entries && (
        <ErrorState error={error} title="Refresh failed" onRetry={() => load({ silent: true })} />
      )}

      {!error && entries === null && <LoadingBlock label="Loading impact data…" rows={2} />}

      {entries !== null && entries.length === 0 && (
        <EmptyState
          icon={Waypoints}
          title="No facts have changed recently"
          description="This page wakes up the moment an approved fact is edited or expires. Try it: open the Brand Vault, edit F-001 (free delivery above ₹499) to ₹799, and every draft citing it appears here as “Needs re-review”."
        >
          <Button variant="ember" icon={Pencil} onClick={() => navigate('/vault')}>
            Open Brand Vault
          </Button>
        </EmptyState>
      )}

      {entries !== null && entries.length > 0 && (
        <div className="grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
          {/* --------------------- list of changed/expired facts --------------------- */}
          <nav aria-label="Changed or expired facts">
            <h2 className="sr-only">Changed or expired facts</h2>
            <ul className="space-y-2">
              {entries.map((entry) => {
                const active = entry._id === selectedId
                const ReasonIcon = entry.reason === 'expired' ? CalendarClock : Pencil
                return (
                  <li key={entry._id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(entry._id)}
                      aria-current={active ? 'true' : undefined}
                      className={`w-full rounded-lg border px-3.5 py-3 text-left transition-colors ${
                        active
                          ? 'border-ember bg-ember-soft shadow-[0_1px_2px_rgba(27,34,54,0.06)]'
                          : 'border-line bg-surface hover:border-ember/60 hover:bg-ember-soft/40'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border ${
                            active ? 'border-ember bg-surface text-ember-ink' : 'border-line-strong bg-tint text-ink-soft'
                          }`}
                        >
                          <ReasonIcon size={13} aria-hidden="true" strokeWidth={2.2} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <IdChip id={entry.factId} />
                            <span className="text-xs font-semibold text-ink">
                              {entry.reason === 'expired' ? 'Expired' : 'Edited'}{' '}
                              <span className="font-normal text-muted">
                                {formatRelative(entry.at)}
                              </span>
                            </span>
                          </span>
                          <span className="mt-1 block truncate text-xs text-muted">
                            {truncate(entry.fact?.text ?? entry.previousText ?? '', 46)}
                          </span>
                        </span>
                      </span>
                      <span className="mt-2 flex items-center gap-3 border-t border-line/70 pt-2 text-[11px] font-semibold text-ink-soft">
                        <span className="inline-flex items-center gap-1">
                          <Flame size={12} aria-hidden="true" className="text-ember" />
                          {entry.drafts.length} draft{entry.drafts.length === 1 ? '' : 's'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <ListChecks size={12} aria-hidden="true" className="text-ember-ink/70" />
                          {entry.claims.length} claim{entry.claims.length === 1 ? '' : 's'}
                        </span>
                        <span className="ml-auto font-normal text-muted">needs re-review</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* ------------------------------ the chain ------------------------------ */}
          <div aria-live="polite">
            {!selected && (
              <EmptyState
                icon={Waypoints}
                title="Select a changed fact"
                description="Pick a fact on the left to see every claim and draft it touches."
              />
            )}

            {selected && (
              <ol className="space-y-5">
                {/* Step 1 — the fact that changed */}
                <li className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3">
                  <StepMarker n={1} />
                  <section
                    aria-labelledby="impact-step-1"
                    className="rounded-lg border border-ember/60 bg-surface px-4 py-4 shadow-[0_1px_2px_rgba(27,34,54,0.05)]"
                  >
                    <h2 id="impact-step-1" className="font-heading text-[15px] font-semibold text-ink">
                      The approved fact changed
                    </h2>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <IdChip id={selected.factId} />
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-ember bg-ember-soft px-2.5 py-0.5 text-xs font-semibold text-ember-ink">
                        <Flame size={12} aria-hidden="true" />
                        {selected.reason === 'expired' ? 'Expired' : 'Edited'} {formatRelative(selected.at)}
                      </span>
                      {selected.fact?.owner && (
                        <span className="text-xs text-muted">Owner: {selected.fact.owner}</span>
                      )}
                    </div>

                    <div className="mt-3 grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-stretch">
                      <div className="rounded-md border border-line bg-paper px-3.5 py-2.5">
                        <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                          {selected.reason === 'expired' ? 'Was (now expired)' : 'Was'}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-muted line-through decoration-line-strong">
                          {selected.previousText ?? '—'}
                        </p>
                      </div>
                      <div className="grid place-items-center" aria-hidden="true">
                        <span className="grid h-7 w-7 place-items-center rounded-full border border-ember bg-ember-soft text-ember-ink sm:rotate-0 rotate-90">
                          <ArrowRight size={14} strokeWidth={2.4} />
                        </span>
                      </div>
                      <div className="rounded-md border border-ember/60 bg-ember-soft/50 px-3.5 py-2.5">
                        <p className="text-[11px] font-semibold tracking-[0.08em] text-ember-ink uppercase">
                          Now
                        </p>
                        <p className="mt-1 text-sm leading-relaxed font-medium text-ink">
                          {selected.fact?.text ?? '—'}
                        </p>
                      </div>
                    </div>

                    {selected.fact && (
                      <p className="mt-2.5 text-xs text-muted">
                        Verified on {formatDate(selected.fact.verifiedOn)} ·{' '}
                        {selected.fact.expiresOn
                          ? `expires ${formatDate(selected.fact.expiresOn)}`
                          : 'no expiry set'}{' '}
                        · status {selected.fact.status ?? 'active'}
                      </p>
                    )}
                  </section>
                </li>

                {/* Step 2 — claims that cited it */}
                <li className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3">
                  <StepMarker n={2} />
                  <section
                    aria-labelledby="impact-step-2"
                    className="rounded-lg border border-line bg-surface px-4 py-4 shadow-[0_1px_2px_rgba(27,34,54,0.05)]"
                  >
                    <h2 id="impact-step-2" className="font-heading text-[15px] font-semibold text-ink">
                      Claims that cited it{' '}
                      <span className="text-muted">({selected.claims.length})</span>
                    </h2>
                    {selected.claims.length === 0 ? (
                      <p className="mt-2 text-xs text-muted">
                        No stored claims cited this fact yet — claims appear here after drafts
                        are checked.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2.5">
                        {selected.claims.map((claim) => (
                          <li
                            key={claim._id}
                            className="rounded-md border border-line bg-paper px-3.5 py-2.5"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <VerdictBadge verdict={claim.verdict} />
                              <IdChip id={claim._id} title="Claim ID" />
                              {claim.draft && (
                                <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                                  <FileText size={12} aria-hidden="true" />
                                  in “{truncate(claim.draft.title, 40)}”{' '}
                                  <span className="font-mono text-[11px]">{claim.draft._id}</span>
                                </span>
                              )}
                            </div>
                            <p className="mt-1.5 text-sm leading-relaxed text-ink">
                              “{truncate(claim.text, 160)}”
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </li>

                {/* Step 3 — affected drafts */}
                <li className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3">
                  <StepMarker n={3} />
                  <section
                    aria-labelledby="impact-step-3"
                    className="rounded-lg border border-line bg-surface px-4 py-4 shadow-[0_1px_2px_rgba(27,34,54,0.05)]"
                  >
                    <h2 id="impact-step-3" className="font-heading text-[15px] font-semibold text-ink">
                      Affected drafts{' '}
                      <span className="text-muted">({selected.drafts.length})</span>
                    </h2>
                    {selected.drafts.length === 0 ? (
                      <p className="mt-2 text-xs text-muted">No drafts are affected.</p>
                    ) : (
                      <ul className="mt-3 space-y-2.5">
                        {selected.drafts.map((draft) => (
                          <li
                            key={draft._id}
                            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line bg-paper px-3.5 py-3"
                          >
                            <IdChip id={draft._id} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-ink">
                                {draft.title || 'Untitled draft'}
                              </span>
                              <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                                {draft.status === 'needs_re_review'
                                  ? `Needs re-review — it cited ${selected.factId} (${selected.reason === 'expired' ? 'the fact expired' : 'the fact’s text changed'}), so its findings may no longer hold.`
                                  : `Cited ${selected.factId} when this impact was recorded.`}
                              </span>
                            </span>
                            <DraftStatusBadge status={draft.status} />
                            <Button
                              size="sm"
                              variant="ember"
                              icon={ArrowRight}
                              onClick={() =>
                                navigate(`/review?draft=${encodeURIComponent(draft._id)}`)
                              }
                            >
                              Open draft
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </li>

                {/* Step 4 — what to do next */}
                <li className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3">
                  <StepMarker n={4} isLast />
                  <section
                    aria-labelledby="impact-step-4"
                    className="rounded-lg border border-dashed border-line-strong bg-tint/50 px-4 py-4"
                  >
                    <h2 id="impact-step-4" className="font-heading text-[15px] font-semibold text-ink">
                      What to do next
                    </h2>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-ink-soft">
                      <li>Open each affected draft above.</li>
                      <li>Run “Check content” again — findings are re-judged against the new fact.</li>
                      <li>Apply the suggested rewrites, then record a fresh human decision.</li>
                    </ol>
                  </section>
                </li>
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
