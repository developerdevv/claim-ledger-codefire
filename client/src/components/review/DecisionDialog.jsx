import { useEffect, useState } from 'react'
import { Ban, MessageSquare, ShieldCheck } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'

export const DECISION_META = {
  approved: {
    label: 'Approve',
    verb: 'approved',
    Icon: ShieldCheck,
    title: 'Approve this draft?',
    note: 'Records that a human reviewed the findings and approved the draft. A comment is optional.',
    commentRequired: false,
    confirmVariant: 'primary',
  },
  rejected: {
    label: 'Reject',
    verb: 'rejected',
    Icon: Ban,
    title: 'Reject this draft?',
    note: 'A comment is required so the creator understands why.',
    commentRequired: true,
    confirmVariant: 'dark',
  },
  changes: {
    label: 'Request changes',
    verb: 'requested changes on',
    Icon: MessageSquare,
    title: 'Request changes on this draft?',
    note: 'A comment is required — list what the creator should fix.',
    commentRequired: true,
    confirmVariant: 'primary',
  },
}

/**
 * Records a human decision. The draft's status is updated by the parent ONLY
 * after PATCH /api/drafts/:id/decision confirms.
 */
export default function DecisionDialog({ open, action, draftTitle, busy, onClose, onSubmit }) {
  const meta = DECISION_META[action] ?? DECISION_META.approved
  const [comment, setComment] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) {
      setComment('')
      setError(null)
    }
  }, [open, action])

  function handleSubmit(e) {
    e.preventDefault()
    if (busy) return
    const trimmed = comment.trim()
    if (meta.commentRequired && !trimmed) {
      setError('A comment is required for this decision.')
      document.getElementById('decision-comment')?.focus()
      return
    }
    setError(null)
    onSubmit(trimmed)
  }

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={meta.title}
      subtitle={draftTitle ? `“${draftTitle}”` : undefined}
      labelledBy="decision-title"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="decision-form"
            variant={meta.confirmVariant}
            icon={meta.Icon}
            busy={busy}
          >
            {meta.label}
          </Button>
        </>
      }
    >
      <form id="decision-form" onSubmit={handleSubmit} className="space-y-3" noValidate>
        <p className="text-sm leading-relaxed text-ink-soft">{meta.note}</p>
        <div>
          <label htmlFor="decision-comment" className="block text-sm font-medium text-ink">
            Comment
            {meta.commentRequired ? (
              <span className="font-semibold text-ink"> (required)</span>
            ) : (
              <span className="text-muted"> (optional)</span>
            )}
          </label>
          <textarea
            id="decision-comment"
            value={comment}
            maxLength={600}
            onChange={(e) => {
              setComment(e.target.value)
              if (error) setError(null)
            }}
            rows={4}
            placeholder={
              meta.commentRequired
                ? 'Explain the decision for the creator…'
                : 'Add context for the history log (optional)…'
            }
            aria-required={meta.commentRequired}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'decision-comment-error' : undefined}
            className="mt-1.5 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-navy focus:outline-none"
          />
          <div className="mt-1 flex items-center justify-between gap-3">
            {error ? (
              <p id="decision-comment-error" role="alert" className="text-xs font-semibold text-ink">
                {error}
              </p>
            ) : (
              <span />
            )}
            <p className="shrink-0 text-[11px] text-muted">{comment.length}/600</p>
          </div>
        </div>
      </form>
    </Modal>
  )
}
