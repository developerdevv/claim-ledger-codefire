import { Database } from 'lucide-react'
import { isMockMode } from '../../lib/api'

/**
 * Visible MOCK MODE banner — only ever rendered in development when
 * VITE_USE_MOCK=1. Production builds never show this and never use mock data.
 */
export default function MockBanner() {
  if (!isMockMode()) return null
  return (
    <div className="bg-navy px-4 py-1.5 text-center text-white sm:px-6 lg:px-8">
      <p className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] leading-snug sm:text-xs">
        <Database size={13} aria-hidden="true" className="shrink-0" />
        <span>
          <strong className="font-bold tracking-[0.12em] uppercase">Mock mode</strong>{' '}
          <span className="opacity-90">
            — in-browser fictional data for the “Saanjh” demo brand. No backend connected.
            Production builds always use the real API.
          </span>
        </span>
      </p>
    </div>
  )
}
