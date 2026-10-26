import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

/**
 * Accessible dialog built on the native <dialog> element:
 * focus handling, Escape-to-close and backdrop come for free.
 */

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  labelledBy = 'modal-title',
}) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself) closes.
        if (e.target === ref.current) onClose?.()
      }}
      className={`toast-enter m-auto w-[calc(100%-2rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl ${SIZES[size] ?? SIZES.md}`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id={labelledBy} className="font-heading text-lg leading-snug text-ink">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-muted">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="-mr-1 rounded-md p-1.5 text-muted transition-colors hover:bg-tint hover:text-ink"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-line bg-paper px-5 py-3.5">
          {footer}
        </div>
      )}
    </dialog>
  )
}
