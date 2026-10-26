import { useState } from 'react'
import Modal from './Modal'
import Button from './Button'

/**
 * Confirmation for consequential actions (reset demo data, recording a
 * decision, …). Renders `body` (string or node) and manages the pending state
 * while `onConfirm()` runs, preventing duplicate submits.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  confirmIcon = null,
  onConfirm,
  onClose,
  children,
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)

  async function handleConfirm() {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await onConfirm?.()
    } catch (err) {
      setError(err?.message || 'The action could not be completed.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={pending ? undefined : onClose}
      title={title}
      size="sm"
      labelledBy="confirm-title"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            icon={confirmIcon}
            busy={pending}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {typeof body === 'string' ? (
          <p className="text-sm leading-relaxed text-ink-soft">{body}</p>
        ) : (
          body
        )}
        {children}
        {error && (
          <p role="alert" className="rounded-md border border-line-strong bg-tint px-3 py-2 text-xs font-medium text-ink">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
