import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Info, TriangleAlert, X } from 'lucide-react'

/**
 * Toasts — used everywhere instead of alert().
 * Accents stay neutral (navy/ink): green/red/amber are reserved for verdicts.
 */

const ToastContext = createContext(null)
let idCounter = 0

const KIND_META = {
  success: { Icon: Check, accent: 'border-l-navy', iconWrap: 'bg-navy text-white' },
  error: { Icon: TriangleAlert, accent: 'border-l-ink', iconWrap: 'bg-ink text-white' },
  info: { Icon: Info, accent: 'border-l-line-strong', iconWrap: 'bg-tint text-ink-soft' },
}

function ToastCard({ toast, onDismiss }) {
  const meta = KIND_META[toast.kind] ?? KIND_META.info
  const { Icon } = meta
  return (
    <div
      className={`toast-enter pointer-events-none flex w-full max-w-sm items-start gap-3 rounded-lg border border-line ${meta.accent} border-l-4 bg-surface px-3.5 py-3 shadow-lg`}
    >
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${meta.iconWrap}`}>
        <Icon size={12} aria-hidden="true" strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{toast.title}</p>
        {toast.message && <p className="mt-0.5 text-xs leading-relaxed text-muted">{toast.message}</p>}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="pointer-events-auto -mr-1 rounded p-1 text-muted transition-colors hover:bg-tint hover:text-ink"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback(
    ({ kind = 'info', title, message, duration }) => {
      idCounter += 1
      const id = idCounter
      setToasts((list) => [...list.slice(-2), { id, kind, title, message }])
      const ms = duration ?? (kind === 'error' ? 7000 : 4500)
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ms),
      )
      return id
    },
    [dismiss],
  )

  useEffect(() => {
    const map = timers.current
    return () => {
      for (const timer of map.values()) clearTimeout(timer)
      map.clear()
    }
  }, [])

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Bottom-right so notifications never cover the top bar controls. */}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-3 z-90 flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end sm:px-0"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx.toast
}
