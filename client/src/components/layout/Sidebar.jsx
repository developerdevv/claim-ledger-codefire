import { ClipboardCheck, Flame, History, Vault, Waypoints } from 'lucide-react'
import { isMockMode } from '../../lib/api'
import { Link } from '../../lib/router'

export const NAV = [
  { to: '/review', label: 'Review', Icon: ClipboardCheck },
  { to: '/vault', label: 'Brand Vault', Icon: Vault },
  { to: '/impact', label: 'Impact View', Icon: Waypoints },
  { to: '/history', label: 'History', Icon: History },
]

export function Wordmark({ compact = false }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-navy-soft border border-line-strong">
        <Flame size={16} className="text-navy" aria-hidden="true" strokeWidth={2.1} />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="font-heading block text-[17px] font-semibold text-ink">
            Claim Ledger
          </span>
          <span className="block text-[10px] font-medium tracking-[0.14em] text-muted uppercase">
            AI brand governance
          </span>
        </span>
      )}
    </span>
  )
}

/**
 * Sidebar navigation. `impactCount` is fetched from GET /api/impact by the
 * Shell (never hardcoded) and shown as an ember chip — ember is reserved for
 * Impact View / needs-re-review.
 */
export default function Sidebar({ currentPath, impactCount = 0, onNavigate }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-5 pb-4">
        <Link to="/review" onClick={onNavigate} aria-label="Claim Ledger — go to Review page">
          <Wordmark />
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 px-3">
        <ul className="space-y-1">
          {NAV.map(({ to, label, Icon }) => {
            const active = currentPath === to
            return (
              <li key={to}>
                <Link
                  to={to}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-navy text-white'
                      : 'text-ink-soft hover:bg-tint hover:text-ink'
                  }`}
                >
                  <Icon size={16} aria-hidden="true" strokeWidth={2} />
                  <span className="flex-1">{label}</span>
                  {to === '/impact' && impactCount > 0 && (
                    <span
                      title={`${impactCount} changed or expired fact${impactCount === 1 ? '' : 's'} with impact`}
                      className={`grid h-5 min-w-5 place-items-center rounded-full border px-1 text-[10px] font-bold ${
                        active
                          ? 'border-white/60 bg-white/15 text-white'
                          : 'border-ember bg-ember-soft text-ember-ink'
                      }`}
                    >
                      {impactCount}
                      <span className="sr-only"> facts with impact</span>
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="space-y-1.5 border-t border-line px-5 py-4 text-[10.5px] leading-relaxed text-muted">
        <p className="font-medium tracking-wide uppercase">Codex 48 · demo build</p>
        <p>
          All data is fictional{isMockMode() ? ' (mock mode)' : ''}. AI findings are drafts —
          a human decides.
        </p>
      </div>
    </div>
  )
}
