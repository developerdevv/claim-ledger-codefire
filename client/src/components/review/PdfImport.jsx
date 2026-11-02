import { useEffect, useRef, useState } from 'react'
import { CircleCheck, FileUp, Plus, Replace, X } from 'lucide-react'
import Button from '../ui/Button'
import { ErrorState } from '../ui/States'
import { extractDocument } from '../../lib/api'
import { CHECK_CHAR_LIMIT } from '../../lib/constants'

/**
 * PDF import for the Review composer (Round 3, F4).
 *
 * POST /api/documents/extract takes one multipart file ("file", PDF only,
 * 5 MB / 30 pages). The extracted text is NEVER checked automatically — it
 * lands in the composer like typed text and the reviewer presses "Check
 * content" themselves. Because it flows through the page's normal setText /
 * setTitle, the unsent-composer buffer in reviewStore.js persists it too.
 *
 * Split into a hook (state + guards) and two presentational pieces so the
 * button can sit in the content-box label row while the status lines render
 * under the textarea.
 */

const MAX_BYTES = 5 * 1024 * 1024

/** Fallbacks used when the server response carries no usable message. */
const SERVER_FALLBACKS = {
  413: 'That PDF is too large or has too many pages (limit: 5 MB, 30 pages).',
  415: 'Only PDF files can be imported.',
  422: 'We could not read text from this PDF. Scanned image PDFs are not supported. Paste the text instead.',
  429: 'Too many requests. Wait a minute and try again.',
}

/** User-facing copy for an upload failure. Never leaks stack traces or JSON. */
function messageForError(err) {
  const status = Number(err?.status ?? 0)
  if (status > 0) {
    const server = typeof err?.message === 'string' ? err.message.trim() : ''
    return (
      server ||
      SERVER_FALLBACKS[status] ||
      `The import failed (HTTP ${status}). Try another file.`
    )
  }
  return 'Cannot reach the server. Check your connection and try again.'
}

function looksLikePdf(file) {
  if (!file) return false
  return file.type === 'application/pdf' || /\.pdf$/i.test(String(file.name ?? ''))
}

/**
 * @param getHasText  () => boolean — does the content box already have text?
 * @param applyImport (result, 'replace'|'append') => void — page applies it.
 */
export function usePdfImport({ getHasText, applyImport }) {
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState(null) // string | null
  const [notice, setNotice] = useState(null) // last successful result | null
  const [pending, setPending] = useState(null) // result awaiting replace/add/cancel
  const inputRef = useRef(null)
  const busyRef = useRef(false) // synchronous guard: no double upload

  // The async continuation must see the latest callbacks, not the render it
  // was created in (the reviewer may type while the upload is in flight).
  const latest = useRef({ getHasText, applyImport })
  useEffect(() => {
    latest.current = { getHasText, applyImport }
  })

  // Escape dismisses the inline choice wherever focus happens to be — the
  // standard dismiss pattern, and robust for keyboard users who tabbed away.
  useEffect(() => {
    if (!pending) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setPending(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pending])

  function finish(res, mode) {
    latest.current.applyImport(res, mode)
    setPending(null)
    setNotice(res)
  }

  async function handleFile(file) {
    if (!file || busyRef.current) return // ignore repeated clicks / drops
    busyRef.current = true
    setError(null)
    setNotice(null)
    setPending(null)

    // Client-side checks first — the server is never called for these.
    if (!looksLikePdf(file)) {
      busyRef.current = false
      setError('Only PDF files can be imported.')
      return
    }
    if (file.size > MAX_BYTES) {
      busyRef.current = false
      setError('That file is over 5 MB. Try a smaller PDF.')
      return
    }

    setImporting(true)
    try {
      const res = await extractDocument(file)
      if (latest.current.getHasText()) setPending(res)
      else finish(res, 'replace')
    } catch (err) {
      setError(messageForError(err))
    } finally {
      setImporting(false)
      busyRef.current = false
      if (inputRef.current) inputRef.current.value = '' // allow re-picking the same file
    }
  }

  function openPicker() {
    if (!busyRef.current) inputRef.current?.click()
  }

  function onInputChange(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file even after a client-side rejection
    if (file) handleFile(file)
  }

  const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

  // Spread onto the content-box wrapper to make it a PDF drop zone. Plain
  // text drags (e.g. a selection dragged into the textarea) are left alone.
  const dropProps = {
    onDragEnter: (e) => {
      if (!hasFiles(e) || busyRef.current) return
      e.preventDefault()
      setDragOver(true)
    },
    onDragOver: (e) => {
      if (!hasFiles(e) || busyRef.current) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDragOver(true)
    },
    onDragLeave: (e) => {
      if (e.currentTarget.contains(e.relatedTarget)) return
      setDragOver(false)
    },
    onDrop: (e) => {
      const file = e.dataTransfer?.files?.[0]
      if (!file) return // native text drop — not ours to intercept
      e.preventDefault()
      setDragOver(false)
      handleFile(file)
    },
  }

  return {
    importing,
    dragOver,
    error,
    notice,
    pending,
    inputRef,
    openPicker,
    onInputChange,
    dropProps,
    choosePending: (mode) => {
      if (pending) finish(pending, mode)
    },
    cancelPending: () => setPending(null),
  }
}

/** The button (content-box label row) plus the hidden, non-focusable input. */
export function PdfImportButton({ importing, inputRef, openPicker, onInputChange }) {
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={onInputChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <Button
        size="sm"
        variant="secondary"
        icon={FileUp}
        busy={importing}
        disabled={importing}
        onClick={openPicker}
        title="Import text from a PDF (max 5 MB). You can also drop a PDF on the content box."
      >
        Import from PDF
      </Button>
    </>
  )
}

/** Status lines under the textarea: live progress, inline choice, confirmation, error. */
export function PdfImportStatus({
  importing,
  dragOver,
  error,
  notice,
  pending,
  choosePending,
  cancelPending,
}) {
  const replaceRef = useRef(null)
  // Keyboard users land straight on the choice when it appears.
  useEffect(() => {
    if (pending) replaceRef.current?.focus()
  }, [pending])

  const busyLine = importing
    ? 'Reading PDF...'
    : dragOver
      ? 'Drop the PDF to import its text.'
      : ''

  return (
    <div className={busyLine || pending || notice || error ? 'mt-2 space-y-2' : undefined}>
      <p aria-live="polite" className="text-xs text-muted">
        {busyLine}
      </p>

      {pending && (
        <div
          role="group"
          aria-label="Where should the imported text go?"
          className="rounded-md border border-line-strong bg-tint px-3 py-2.5"
        >
          <p className="text-xs leading-relaxed text-ink-soft">
            The content box already has text. Where should the imported text go?
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              ref={replaceRef}
              size="sm"
              variant="secondary"
              icon={Replace}
              onClick={() => choosePending('replace')}
            >
              Replace existing text
            </Button>
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => choosePending('append')}>
              Add to the end
            </Button>
            <Button size="sm" variant="ghost" icon={X} onClick={cancelPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {notice && !pending && (
        <p
          role="status"
          className="flex items-start gap-1.5 rounded-md border border-line bg-tint px-3 py-2 text-xs leading-relaxed text-ink-soft"
        >
          <CircleCheck size={13} aria-hidden="true" className="mt-px shrink-0" />
          <span className="[overflow-wrap:anywhere]">
            {notice.truncated
              ? `Imported the first ${CHECK_CHAR_LIMIT.toLocaleString()} of ${Number(notice.characters).toLocaleString()} characters (${notice.pages} pages) from ${notice.filename}. The rest was not imported.`
              : `Imported ${notice.pages} page${notice.pages === 1 ? '' : 's'}, ${Number(notice.characters).toLocaleString()} characters from ${notice.filename}.`}
          </span>
        </p>
      )}

      {error && <ErrorState error={error} title="The PDF could not be imported" />}
    </div>
  )
}
