import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import * as api from '../../lib/api'
import { useDemo } from '../../state/demo'
import MockBanner from '../ui/MockBanner'
import Sidebar, { NAV } from './Sidebar'
import TopBar from './TopBar'

/**
 * App shell: sidebar (static on desktop, drawer on mobile), top bar, mock
 * banner and the page content. No login — a judge can use it immediately.
 */
export default function Shell({ path, children }) {
  const { refreshKey } = useDemo()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [impactCount, setImpactCount] = useState(0)
  const closeButtonRef = useRef(null)

  const navItem = NAV.find((item) => item.to === path) ?? NAV[0]

  // Badge count for Impact View — always from the API, never hardcoded.
  useEffect(() => {
    let alive = true
    api
      .getImpact()
      .then((entries) => {
        if (alive) setImpactCount(entries.length)
      })
      .catch(() => {
        /* a failing badge must never break the shell */
      })
    return () => {
      alive = false
    }
  }, [refreshKey, path])

  // Close the drawer with Escape; focus the close button when it opens.
  useEffect(() => {
    if (!drawerOpen) return
    closeButtonRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only rounded-md bg-navy px-3 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100"
      >
        Skip to main content
      </a>

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen border-r border-line bg-surface lg:block">
          <Sidebar currentPath={path} impactCount={impactCount} />
        </aside>

        <div className="flex min-w-0 flex-col">
          <TopBar title={navItem.label} onOpenDrawer={() => setDrawerOpen(true)} />
          <MockBanner />
          <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-xs font-semibold tracking-[0.1em] text-muted uppercase">
                Menu
              </span>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation menu"
                className="rounded-md p-1.5 text-muted transition-colors hover:bg-tint hover:text-ink"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Sidebar
                currentPath={path}
                impactCount={impactCount}
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
