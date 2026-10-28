import { createContext, useCallback, useContext, useMemo, useState } from 'react'

/**
 * Demo-only workspace state:
 *   • role        — Creator / Reviewer / Manager switch. Clearly a demo
 *                   switch for the hackathon judge, NOT authentication.
 *   • refreshKey  — bumped after "Reset demo data" (and after fact edits with
 *                   impact) so every page reloads from the API.
 */

const DemoContext = createContext(null)

export const ROLES = ['creator', 'reviewer', 'manager']
export const ROLE_LABELS = {
  creator: 'Creator',
  reviewer: 'Reviewer',
  manager: 'Manager',
}

const STORAGE_KEY = 'claimledger.demoRole'

export function DemoProvider({ children }) {
  const [role, setRoleState] = useState(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      return ROLES.includes(saved) ? saved : 'reviewer'
    } catch {
      return 'reviewer'
    }
  })
  const [refreshKey, setRefreshKey] = useState(0)

  const setRole = useCallback((next) => {
    if (!ROLES.includes(next)) return
    setRoleState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* private browsing — role simply won't persist */
    }
  }, [])

  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const value = useMemo(
    () => ({ role, setRole, refreshKey, bumpRefresh }),
    [role, setRole, refreshKey, bumpRefresh],
  )

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

export function useDemo() {
  const ctx = useContext(DemoContext)
  if (!ctx) throw new Error('useDemo must be used inside <DemoProvider>')
  return ctx
}

/** Actor string attached to decisions and fact changes ("Reviewer (demo)"). */
export function actorLabel(role) {
  return `${ROLE_LABELS[role] ?? 'Reviewer'} (demo)`
}
