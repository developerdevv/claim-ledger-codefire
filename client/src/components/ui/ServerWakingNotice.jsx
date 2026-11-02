import { useSyncExternalStore } from 'react'
import { LoaderCircle } from 'lucide-react'
import { isServerWaking, subscribeServerWaking } from '../../lib/api'

/**
 * Polite "server is waking up" notice (Round 3, F6, item 5).
 *
 * Free-hosting cold starts can take up to a minute. While ANY API request
 * has been in flight longer than the wake threshold, this line appears
 * above the page content; it disappears as soon as the last slow request
 * settles. Mock mode never hits the network, so it never shows there.
 */
export default function ServerWakingNotice() {
  const waking = useSyncExternalStore(subscribeServerWaking, isServerWaking)
  if (!waking) return null
  return (
    <div className="border-b border-line bg-tint">
      <p
        aria-live="polite"
        role="status"
        className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 py-2 text-xs text-ink-soft sm:px-6 lg:px-8"
      >
        <LoaderCircle size={13} aria-hidden="true" className="shrink-0 animate-spin" />
        The server is waking up. This can take up to a minute on the first visit.
      </p>
    </div>
  )
}
