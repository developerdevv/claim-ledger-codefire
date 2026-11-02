import { useCallback, useEffect, useState } from 'react'
import {
  ArrowRight,
  Ban,
  ClipboardCheck,
  HeartPulse,
  Info,
  Layers,
  RotateCw,
} from 'lucide-react'
import * as api from '../lib/api'
import { formatRelative, truncate } from '../lib/format'
import { Link, navigate } from '../lib/router'
import { useDemo } from '../state/demo'
import Button from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingBlock } from '../components/ui/States'
import { IdChip, VerdictBadge } from '../components/ui/badges'

/**
 * Guideline Health — where reviewers keep disagreeing with a rule or fact.
 * Everything comes from GET /api/guideline-health (never hardcoded); in mock
 * mode the adapter computes it from the dismissals reviewers recorded.
 */
export default function GuidelineHealthPage() {
  const { refreshKey } = useDemo()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const load = useCallback(() => {
    let alive = true
    setLoading(true)
    setError(null)
    api
      .getGuidelineHealth()
      .then((res) => {
        if (!alive) return
        setData(res)
        setLoading(false)
      })
      .catch((err) => {
        if (!alive) return
        setError(err)
        setData(null)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  // Reload when the page opens and after “Reset demo data” (refreshKey).
  useEffect(() => load(), [load, refreshKey])

  const items = data?.items ?? []
  const total = data?.totalOverrides ?? 0
  const topCount = items.length > 0 ? Math.max(1, ...items.map((it) => it.count)) : 1

  return (
    <div className="space-y-5">
      {/* --------------------------- intro + summary --------------------------- */}
      <section
        aria-labelledby="health-overview-heading"
        className="rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(27,34,54,0.05)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <h2
            id="health-overview-heading"
            className="font-heading flex items-center gap-2 text-base font-semibold text-ink"
          >
            <HeartPulse size={15} aria-hidden="true" className="text-ink-soft" />
            Overrides at a glance
          </h2>
          <Button
            size="sm"
            variant="secondary"
            icon={RotateCw}
            onClick={() => load()}
            disabled={loading}
            title="Reload guideline health from the API"
          >
            Refresh
          </Button>
        </div>
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <p className="max-w-3xl text-sm leading-relaxed text-ink-soft">
            Where reviewers keep disagreeing with a rule or fact. Frequent overrides usually
            mean the guideline is unclear or out of date.
          </p>
          {!loading && !error && (
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-3 rounded-lg border border-line bg-paper px-4 py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-strong bg-tint text-ink-soft">
                  <Ban size={15} aria-hidden="true" strokeWidth={2.1} />
                </span>
                <span>
                  <span className="block text-xl font-semibold text-ink tabular-nums">
                    {total}
                  </span>
                  <span className="block text-xs text-muted">
                    total override{total === 1 ? '' : 's'}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-line bg-paper px-4 py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-strong bg-tint text-ink-soft">
                  <Layers size={15} aria-hidden="true" strokeWidth={2.1} />
                </span>
                <span>
                  <span className="block text-xl font-semibold text-ink tabular-nums">
                    {items.length}
                  </span>
                  <span className="block text-xs text-muted">
                    source{items.length === 1 ? '' : 's'} affected
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ----------------------------- ranked list ----------------------------- */}
      <section
        aria-labelledby="health-ranked-heading"
        className="rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(27,34,54,0.05)]"
      >
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 id="health-ranked-heading" className="font-heading text-base font-semibold text-ink">
            Most overridden sources
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Ranked by override count — computed from reviewer dismissals, never hardcoded.
          </p>
        </div>

        <div className="px-4 py-4 sm:px-5">
          {loading && <LoadingBlock label="Loading guideline health…" rows={3} />}

          {!loading && error && (
            <ErrorState
              error={error}
              title="Could not load guideline health"
              onRetry={() => load()}
            />
          )}

          {!loading && !error && total === 0 && (
            <EmptyState
              icon={Ban}
              title="No overrides yet"
              description="No flags have been dismissed yet. When reviewers dismiss a wrong flag, the most-overridden rules appear here."
            >
              <Button variant="primary" icon={ClipboardCheck} onClick={() => navigate('/review')}>
                Go to Review
              </Button>
            </EmptyState>
          )}

          {!loading && !error && total > 0 && (
            <ol className="space-y-3">
              {items.map((item, i) => {
                const pct = Math.round((item.count / topCount) * 100)
                return (
                  <li
                    key={`${item.sourceId ?? 'no-source'}-${item.verdict}`}
                    className="rounded-lg border border-line bg-surface px-4 py-4 shadow-[0_1px_2px_rgba(27,34,54,0.05)] sm:px-5"
                  >
                    <div className="flex gap-3.5">
                      {/* Rank number */}
                      <span
                        aria-hidden="true"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-strong bg-tint font-mono text-sm font-bold text-ink-soft"
                      >
                        {i + 1}
                      </span>

                      <div className="min-w-0 flex-1 space-y-2.5">
                        {/* Label as the row heading */}
                        <h3 className="font-heading text-[15px] leading-snug font-semibold text-ink">
                          <span className="sr-only">Rank {i + 1}. </span>
                          {item.label || 'Unknown source'}
                        </h3>

                        {/* Verdict badge (icon + text) + source id chip */}
                        <div className="flex flex-wrap items-center gap-2">
                          <VerdictBadge verdict={item.verdict} />
                          {item.sourceId && <IdChip id={item.sourceId} title="Source ID" />}
                          {item.sourceType && (
                            <span className="text-xs font-semibold tracking-wide text-muted uppercase">
                              {item.sourceType === 'terminology' ? 'Terminology' : 'Approved fact'}
                            </span>
                          )}
                        </div>

                        {/* Counts + last override */}
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                          <span className="font-semibold text-ink-soft">
                            {item.count} override{item.count === 1 ? '' : 's'} across{' '}
                            {item.draftCount} draft{item.draftCount === 1 ? '' : 's'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Last override{' '}
                            <time dateTime={item.lastAt ?? undefined}>
                              {formatRelative(item.lastAt)}
                            </time>
                          </span>
                        </p>

                        {/* Inline bar — the number printed beside it carries the
                            meaning, so nothing depends on the bar alone */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="h-2 w-full max-w-xs overflow-hidden rounded-full border border-line bg-tint"
                          >
                            <span
                              className="block h-full rounded-full bg-navy"
                              style={{ width: `${Math.max(4, pct)}%` }}
                            />
                          </span>
                          <span className="text-xs font-semibold text-ink tabular-nums">
                            {item.count}
                          </span>
                        </div>

                        {/* Top-ranked callout */}
                        {i === 0 && (
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-navy/25 bg-navy-soft px-3.5 py-2.5 text-xs leading-relaxed text-navy">
                            <Info size={13} aria-hidden="true" className="shrink-0" />
                            Reviewers disagreed with this {item.count} times. Consider clarifying
                            it in the Brand Vault.
                            <Link
                              to="/vault"
                              className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                            >
                              Open Brand Vault
                              <ArrowRight size={12} aria-hidden="true" />
                            </Link>
                          </p>
                        )}

                        {/* One example claim */}
                        {item.example && (
                          <p className="text-xs leading-relaxed text-muted">
                            <span className="font-semibold tracking-wide uppercase">
                              Example claim
                            </span>{' '}
                            <span className="text-ink italic">“{truncate(item.example, 160)}”</span>
                          </p>
                        )}

                        {/* Reviewer reasons (up to 3, newest first) */}
                        {item.reasons.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                              Reviewer reasons
                            </p>
                            <ul className="mt-1 space-y-1">
                              {item.reasons.map((reason, ri) => (
                                <li
                                  key={ri}
                                  className="border-l-2 border-line-strong pl-2.5 text-xs leading-relaxed text-ink-soft italic"
                                >
                                  “{truncate(reason, 140)}”
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </section>
    </div>
  )
}
