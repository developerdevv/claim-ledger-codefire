import { Ruler, Sparkles } from 'lucide-react'

/**
 * Check-mode badge for the claim ledger summary row (Round 3, F5).
 *
 * The check response carries checkMode:
 *   • "llm"      — an AI model proposed the verdicts
 *   • "fallback" — the built-in rule engine ran because the AI was unavailable
 *   • missing    — older drafts / unknown: render nothing, never crash
 *
 * Colour is never the only signal: every badge has an icon and text. The
 * one-line explanation lives in a role="tooltip" element that is ALWAYS in
 * the DOM (opacity-0 keeps it in the accessibility tree, so
 * aria-describedby works) and becomes visible on hover or keyboard focus of
 * the chip. The neutral palette keeps verdict colours reserved for verdicts.
 */

const MODES = {
  llm: {
    label: 'AI-assisted check',
    Icon: Sparkles,
    explanation:
      'An AI model proposed these verdicts. The server only accepts verified or conflict verdicts when the cited fact exists, is active, and its quote appears in the fact text. Everything else goes to a human.',
  },
  fallback: {
    label: 'Rule-based check (AI unavailable)',
    Icon: Ruler,
    explanation:
      'The AI model was unavailable, so the built-in rule engine checked this text. Results are more conservative; more claims may need manual review.',
  },
}

export default function CheckModeBadge({ mode }) {
  const meta = MODES[mode]
  if (!meta) return null // missing / unknown → show nothing
  const { label, Icon, explanation } = meta
  const descId = `check-mode-desc-${mode}`

  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={0}
        title={explanation}
        aria-describedby={descId}
        className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-tint px-3 py-1 text-xs font-semibold text-ink-soft"
      >
        <Icon size={13} aria-hidden="true" strokeWidth={2.2} />
        {label}
      </span>
      <span
        id={descId}
        role="tooltip"
        className="pointer-events-none absolute top-full left-0 z-30 mt-1.5 w-max max-w-[min(18rem,calc(100vw-2rem))] rounded-md border border-line-strong bg-surface px-3 py-2 text-xs leading-relaxed text-ink-soft opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 lg:left-auto lg:right-0"
      >
        {explanation}
      </span>
    </span>
  )
}
