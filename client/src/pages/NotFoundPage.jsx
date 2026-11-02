import { Compass } from 'lucide-react'
import { EmptyState } from '../components/ui/States'
import { Link } from '../lib/router'

/**
 * Unknown hash route (Round 3, F6, item 7): a small, calm "Page not found"
 * with one way out — a real link back to Review. Hash routing means refresh
 * and direct links keep working on every known page.
 */
export default function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="This address does not match any page in Claim Ledger."
    >
      <Link
        to="/review"
        className="inline-flex items-center gap-2 rounded-md border border-navy bg-navy px-3.5 py-2 text-sm font-medium text-white transition-colors duration-100 hover:bg-navy/90"
      >
        Back to Review
      </Link>
    </EmptyState>
  )
}
