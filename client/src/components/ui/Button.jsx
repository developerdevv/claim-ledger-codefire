import { LoaderCircle } from 'lucide-react'

/**
 * One button component so focus/disabled/loading states stay consistent.
 * Variants:
 *   primary   — deep navy, the main action on a page
 *   secondary — white surface with a warm border
 *   ghost     — quiet, borderless
 *   dark      — ink-filled (used for "Reject", confirmations)
 *   ember     — RESERVED for Impact View / needs-re-review actions
 */

const VARIANTS = {
  primary:
    'bg-navy text-white border border-navy hover:bg-navy/90 active:bg-navy disabled:hover:bg-navy',
  secondary:
    'bg-surface text-ink border border-line-strong hover:bg-tint active:bg-line/60',
  ghost: 'bg-transparent text-ink-soft border border-transparent hover:bg-tint hover:text-ink',
  dark: 'bg-ink text-white border border-ink hover:bg-ink/90 active:bg-ink',
  ember:
    'bg-ember-soft text-ember-ink border border-ember hover:bg-ember hover:text-white active:bg-ember',
}

const SIZES = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5 rounded-md',
  md: 'text-sm px-3.5 py-2 gap-2 rounded-md',
  lg: 'text-sm px-4 py-2.5 gap-2 rounded-md',
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon = null,
  busy = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  const isDisabled = disabled || busy
  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-busy={busy || undefined}
      className={`inline-flex select-none items-center justify-center font-medium transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant] ?? VARIANTS.secondary} ${SIZES[size] ?? SIZES.md} ${className}`}
      {...rest}
    >
      {busy ? (
        <LoaderCircle size={size === 'sm' ? 13 : 15} className="animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon size={size === 'sm' ? 13 : 15} aria-hidden="true" strokeWidth={2.1} />
      )}
      {children}
    </button>
  )
}
