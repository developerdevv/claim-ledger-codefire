import { UserRound } from 'lucide-react'
import { ROLES, ROLE_LABELS, useDemo } from '../../state/demo'

/**
 * Role switcher — clearly a DEMO switch, not security. It only changes which
 * reviewer actions the UI offers and the actor name attached to decisions.
 */
export default function RoleSwitcher() {
  const { role, setRole } = useDemo()

  return (
    <div className="flex items-center gap-2">
      <label
        id="demo-role-label"
        className="hidden items-center gap-1 text-[11px] font-medium tracking-wide text-muted uppercase md:flex"
      >
        <UserRound size={12} aria-hidden="true" />
        Demo role
      </label>
      <div
        role="group"
        aria-labelledby="demo-role-label"
        aria-describedby="demo-role-help"
        className="flex rounded-md border border-line-strong bg-surface p-0.5"
      >
        {ROLES.map((r) => {
          const active = role === r
          return (
            <button
              key={r}
              type="button"
              aria-pressed={active}
              title={`${ROLE_LABELS[r]} — demo switch, not a login`}
              onClick={() => setRole(r)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                active
                  ? 'bg-navy text-white'
                  : 'text-ink-soft hover:bg-tint hover:text-ink'
              }`}
            >
              {ROLE_LABELS[r]}
            </button>
          )
        })}
      </div>
      <span id="demo-role-help" className="sr-only">
        Switching role is a demonstration aid, not a login. Reviewers and managers can record
        decisions; creators cannot.
      </span>
    </div>
  )
}
