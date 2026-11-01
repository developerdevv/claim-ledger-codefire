import { CircleCheck, SpellCheck2 } from 'lucide-react'
import { IdChip } from '../ui/badges'

/**
 * Wording & readability findings (rules A-1…A-4, R-1) returned alongside the
 * claim check. These are NOT claim verdicts: they are listed separately,
 * never counted in the claim totals, and styled in the calm neutral palette
 * so the verdict colours (green/red/amber) stay reserved for claims.
 *
 * `checks` is always an array by the time it gets here (the API layer turns a
 * missing textChecks field into []). Colour is never the only signal — every
 * item carries its rule id, kind and text.
 */
export default function TextChecksSection({ checks }) {
  const items = Array.isArray(checks) ? checks : []

  return (
    <section
      aria-labelledby="text-checks-heading"
      className="rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(27,34,54,0.05)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <h2
          id="text-checks-heading"
          className="font-heading flex items-center gap-2 text-base font-semibold text-ink"
        >
          <SpellCheck2 size={15} aria-hidden="true" className="text-ink-soft" />
          Wording and readability checks
        </h2>
        {items.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-tint px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
            {items.length} finding{items.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="px-4 py-4 sm:px-5">
        {items.length === 0 ? (
          <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-soft">
            <CircleCheck size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            No wording or readability issues found.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((tc, i) => (
              <li
                key={`${tc.ruleId}-${i}`}
                className="rounded-md border border-line bg-paper px-3.5 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <IdChip id={tc.ruleId} title="Rule ID" />
                  <span className="text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
                    {tc.kind === 'readability' ? 'Readability' : 'Accessibility'}
                  </span>
                </div>
                {tc.message && (
                  <p className="mt-1.5 text-sm leading-relaxed text-ink">{tc.message}</p>
                )}
                {tc.excerpt && (
                  <blockquote className="mt-2 border-l-2 border-line-strong pl-2.5 text-xs leading-relaxed text-ink-soft italic [overflow-wrap:anywhere]">
                    “{tc.excerpt}”
                  </blockquote>
                )}
                {tc.suggestion && (
                  <p className="mt-2 text-xs leading-relaxed">
                    <span className="mr-1.5 text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
                      Suggested fix
                    </span>
                    <span className="text-ink-soft [overflow-wrap:anywhere]">{tc.suggestion}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
