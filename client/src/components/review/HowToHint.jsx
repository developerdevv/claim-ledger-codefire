import { FileText, Lightbulb } from 'lucide-react'
import Button from '../ui/Button'

/**
 * First-run hint shown on the empty Review composer (Round 3, F5).
 *
 * A labelled region (section + aria-labelledby) with exactly three numbered
 * steps, a "Try a sample draft" shortcut that opens the first sample, and a
 * "Got it" button that hides the card and remembers that choice. Nothing
 * here traps focus — both buttons are ordinary tab stops, and the global
 * :focus-visible ring applies.
 */

const STEPS = [
  'Paste your draft, or import a PDF.',
  'Press Check content: every claim is matched to an approved fact.',
  'Review each flagged claim, dismiss wrong flags with a reason, and use Guideline Health to see which rules get overridden.',
]

export default function HowToHint({ onTrySample, canTrySample, onGotIt }) {
  return (
    <section
      aria-labelledby="how-to-heading"
      className="rounded-xl border border-line-strong bg-tint px-4 py-4 shadow-[0_1px_2px_rgba(27,34,54,0.05)] sm:px-5"
    >
      <h2
        id="how-to-heading"
        className="font-heading flex items-center gap-2 text-base font-semibold text-ink"
      >
        <Lightbulb size={15} aria-hidden="true" className="text-ink-soft" />
        How to use Claim Ledger
      </h2>
      <ol className="mt-2.5 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft marker:font-semibold marker:text-muted">
        {STEPS.map((step) => (
          <li key={step} className="pl-1">
            {step}
          </li>
        ))}
      </ol>
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={FileText}
          onClick={onTrySample}
          disabled={!canTrySample}
          title={canTrySample ? 'Open the first sample draft' : 'Sample drafts are still loading'}
        >
          Try a sample draft
        </Button>
        <Button size="sm" variant="ghost" onClick={onGotIt}>
          Got it
        </Button>
      </div>
    </section>
  )
}
