import {
  Ban,
  BadgeCheck,
  CalendarClock,
  CircleHelp,
  Clock,
  Eye,
  Flame,
  Info,
  MessageSquare,
  OctagonAlert,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { daysUntil, formatDate, isExpired } from '../../lib/format'

/**
 * Badges. Every verdict and status always carries an icon AND a text label —
 * colour is never the only signal.
 *
 * Palette discipline:
 *   green / red / amber  → claim verdicts ONLY
 *   ember                → Impact View + "Needs re-review" ONLY
 *   navy / ink / neutral → everything else
 */

export const VERDICT_META = {
  verified: {
    label: 'Verified',
    Icon: BadgeCheck,
    chip: 'bg-verified-soft text-verified border-verified-line',
    quoteBorder: 'border-l-verified',
  },
  conflicts: {
    label: 'Conflicts',
    Icon: OctagonAlert,
    chip: 'bg-conflict-soft text-conflict border-conflict-line',
    quoteBorder: 'border-l-conflict',
  },
  unsupported: {
    label: 'Unsupported',
    Icon: TriangleAlert,
    chip: 'bg-unsupported-soft text-unsupported border-unsupported-line',
    quoteBorder: 'border-l-unsupported',
  },
  manual: {
    label: 'Manual review',
    Icon: CircleHelp,
    chip: 'bg-tint text-ink-soft border-line-strong',
    quoteBorder: 'border-l-line-strong',
  },
}

export const VERDICT_ORDER = ['verified', 'conflicts', 'unsupported', 'manual']

export function countVerdicts(claims) {
  const counts = { verified: 0, conflicts: 0, unsupported: 0, manual: 0 }
  for (const claim of claims ?? []) {
    const key = VERDICT_META[claim.verdict] ? claim.verdict : 'manual'
    counts[key] += 1
  }
  return counts
}

export const DRAFT_STATUS_META = {
  in_review: { label: 'In review', Icon: Eye, chip: 'bg-tint text-ink-soft border-line-strong' },
  approved: { label: 'Approved', Icon: ShieldCheck, chip: 'bg-navy text-white border-navy' },
  rejected: { label: 'Rejected', Icon: Ban, chip: 'bg-ink text-white border-ink' },
  changes: {
    label: 'Changes requested',
    Icon: MessageSquare,
    chip: 'bg-surface text-navy border-navy',
  },
  needs_re_review: {
    label: 'Needs re-review',
    Icon: Flame,
    chip: 'bg-ember-soft text-ember-ink border-ember',
  },
}

export function draftStatusLabel(status) {
  return DRAFT_STATUS_META[status]?.label ?? String(status ?? '—')
}

function BadgeShell({ Icon, label, chip, title, className = '' }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${chip} ${className}`}
    >
      <Icon size={13} aria-hidden="true" strokeWidth={2.2} />
      {label}
    </span>
  )
}

export function VerdictBadge({ verdict, className = '' }) {
  const meta = VERDICT_META[verdict] ?? VERDICT_META.manual
  return <BadgeShell Icon={meta.Icon} label={meta.label} chip={meta.chip} className={className} />
}

export function DraftStatusBadge({ status, className = '' }) {
  const meta = DRAFT_STATUS_META[status] ?? {
    label: String(status ?? 'Unknown'),
    Icon: Info,
    chip: 'bg-tint text-ink-soft border-line-strong',
  }
  return <BadgeShell Icon={meta.Icon} label={meta.label} chip={meta.chip} className={className} />
}

/** Monospace ID chip: F-001, T-004, D-2, C-107 … */
export function IdChip({ id, title, className = '' }) {
  if (!id) return null
  return (
    <span className={`id-chip ${className}`} title={title}>
      {id}
    </span>
  )
}

/** Fact lifecycle status (neutral palette — verdict colours stay reserved). */
export function FactStatusChip({ fact, className = '' }) {
  const expired = fact?.status === 'expired' || isExpired(fact)
  if (expired) {
    return (
      <BadgeShell
        Icon={Clock}
        label="Expired"
        chip="bg-line-strong/50 text-ink border-line-strong"
        className={className}
      />
    )
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-tint px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-ink-soft ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-ink-soft" aria-hidden="true" />
      Active
    </span>
  )
}

/** Expiry warning beside a date: "Expires in 12 days" / "Expired on …". */
export function ExpiryChip({ fact }) {
  if (!fact?.expiresOn) return null
  const days = daysUntil(fact.expiresOn)
  if (days === null) return null
  if (days < 0) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 rounded border border-line-strong bg-tint px-1.5 py-0.5 text-[11px] font-semibold text-ink-soft">
        <Clock size={11} aria-hidden="true" />
        Expired {formatDate(fact.expiresOn)}
      </span>
    )
  }
  if (days <= 21) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 rounded border border-line-strong bg-tint px-1.5 py-0.5 text-[11px] font-semibold text-ink-soft">
        <CalendarClock size={11} aria-hidden="true" />
        Expires in {days} day{days === 1 ? '' : 's'}
      </span>
    )
  }
  return null
}

/** Small uppercase meta chip ("DEMO WORKSPACE · FICTIONAL DATA", counts …). */
export function MetaChip({ icon: Icon, children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-tint px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] text-muted uppercase ${className}`}
    >
      {Icon && <Icon size={11} aria-hidden="true" strokeWidth={2.4} />}
      {children}
    </span>
  )
}
