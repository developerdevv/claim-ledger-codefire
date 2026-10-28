import Button from './Button'
import { RotateCw, TriangleAlert } from 'lucide-react'

/* ------------------------------ Loading ------------------------------ */

export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-tint ${className}`} />
}

export function LoadingBlock({ label = 'Loading…', rows = 3 }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-4/5" />
        </div>
      ))}
    </div>
  )
}

export function Spinner({ label }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-navy" aria-hidden="true" />
      {label && <span className="sr-only">{label}</span>}
    </span>
  )
}

/* ------------------------------- Error ------------------------------- */

/**
 * Error state shown when the API fails. Never falls back to mock data —
 * it explains what happened and offers a Retry.
 */
export function ErrorState({ error, onRetry, title = 'Something went wrong', className = '' }) {
  const message =
    error?.message || (typeof error === 'string' ? error : 'An unexpected error occurred.')
  return (
    <div
      role="alert"
      className={`rounded-lg border border-line-strong bg-surface px-4 py-4 text-left ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-white">
          <TriangleAlert size={14} aria-hidden="true" strokeWidth={2.3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{message}</p>
          {onRetry && (
            <Button size="sm" variant="secondary" icon={RotateCw} className="mt-3" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------- Empty ------------------------------- */

export function EmptyState({ icon: Icon, title, description, children, className = '' }) {
  return (
    <div
      className={`flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-10 text-center ${className}`}
    >
      {Icon && (
        <span className="grid h-11 w-11 place-items-center rounded-full border border-line-strong bg-tint text-ink-soft">
          <Icon size={19} aria-hidden="true" strokeWidth={1.9} />
        </span>
      )}
      <p className="mt-3.5 font-heading text-base text-ink">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted">{description}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
