import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Ban,
  CircleHelp,
  ClipboardCheck,
  FileText,
  FileSearch,
  Info,
  MessageSquare,
  PenLine,
  ShieldCheck,
} from 'lucide-react'
import * as api from '../lib/api'
import { copyToClipboard } from '../lib/clipboard'
import { formatRelative, wordCount } from '../lib/format'
import { navigate } from '../lib/router'
import {
  clearLastDraftId,
  clearUnsent,
  readLastDraftId,
  readUnsent,
  writeLastDraftId,
  writeUnsent,
} from '../lib/reviewStore'
import { actorLabel, useDemo } from '../state/demo'
import Button from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingBlock, Skeleton } from '../components/ui/States'
import {
  VERDICT_META,
  VERDICT_ORDER,
  countVerdicts,
  draftStatusLabel,
  DraftStatusBadge,
  IdChip,
} from '../components/ui/badges'
import { useToast } from '../components/ui/Toast'
import ClaimCard from '../components/review/ClaimCard'
import DecisionDialog, { DECISION_META } from '../components/review/DecisionDialog'
import TextChecksSection from '../components/review/TextChecksSection'
import { PdfImportButton, PdfImportStatus, usePdfImport } from '../components/review/PdfImport'

const CONTENT_TYPES = [
  'Instagram caption',
  'Email',
  'Website copy',
  'Ad',
  'Blog post',
  'Packaging',
  'Other',
]

export default function ReviewPage({ route }) {
  const { role, refreshKey } = useDemo()
  const toast = useToast()
  const draftParam = route.params.draft || null

  /* ------------------------------ editor state ----------------------------- */
  const [title, setTitle] = useState('')
  const [contentType, setContentType] = useState(CONTENT_TYPES[0])
  const [text, setText] = useState('')

  /* --------------------------- draft/results state -------------------------- */
  const [draftId, setDraftId] = useState(null)
  const [draftStatus, setDraftStatus] = useState(null)
  const [decisions, setDecisions] = useState([])
  const [claims, setClaims] = useState(null) // null = nothing checked yet
  const [manualReview, setManualReview] = useState(false)
  // Wording/readability findings (never mixed with claims). null = no check
  // has run yet, so the section (and its empty line) stays hidden.
  const [textChecks, setTextChecks] = useState(null)
  const [checkedText, setCheckedText] = useState(null)
  const [lastCheckedAt, setLastCheckedAt] = useState(null)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState(null)
  const [draftLoad, setDraftLoad] = useState({ loading: false, error: null })

  /* -------------------------- samples + source lists ------------------------ */
  const [samples, setSamples] = useState(null)
  const [samplesError, setSamplesError] = useState(null)
  const [sources, setSources] = useState({ facts: [], terminology: [] })

  /* ------------------------------ decision UI ------------------------------ */
  const [decisionAction, setDecisionAction] = useState(null)
  const [deciding, setDeciding] = useState(false)

  /* --------------------- draft persistence (sessionStorage) --------------------- */
  const [goneNotice, setGoneNotice] = useState(false)
  // Mutable mirror of draftId for effect guards (no extra renders).
  const draftIdRef = useRef(null)
  // `${draftParam}|${refreshKey}` currently reflected in state — lets the
  // routing effect skip reloads triggered by our own replaceState URL sync.
  const loadedKeyRef = useRef(null)

  const dirty = checkedText !== null && checkedText !== text
  const hasResults = Array.isArray(claims)
  const canDecide = role === 'reviewer' || role === 'manager'

  /* --------------------------------- effects -------------------------------- */

  const loadSamples = useCallback(() => {
    let alive = true
    setSamples(null)
    setSamplesError(null)
    api
      .listDrafts()
      .then((drafts) => alive && setSamples(drafts))
      .catch((err) => alive && setSamplesError(err))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => loadSamples(), [loadSamples, refreshKey])

  // Source lists for resolving cited fact IDs (best-effort; cards fall back to
  // the excerpt carried by each claim).
  useEffect(() => {
    let alive = true
    Promise.all([
      api.listFacts().catch(() => []),
      api.getGuidelines().catch(() => ({ guidelines: [], terminology: [] })),
    ]).then(([facts, guide]) => {
      if (alive) setSources({ facts, terminology: guide.terminology ?? [] })
    })
    return () => {
      alive = false
    }
  }, [refreshKey])

  const loadDraft = useCallback((id) => {
    let alive = true
    setDraftLoad({ loading: true, error: null })
    setGoneNotice(false)
    api
      .getDraft(id)
      .then(({ draft, claims: savedClaims, textChecks: savedTextChecks }) => {
        if (!alive || !draft) return
        setTitle(draft.title || '')
        setContentType(draft.contentType || 'Other')
        setText(draft.text || '')
        draftIdRef.current = draft._id
        setDraftId(draft._id)
        writeLastDraftId(draft._id)
        setDraftStatus(draft.status ?? null)
        setDecisions(draft.decisions ?? [])
        setClaims(savedClaims)
        setManualReview(false)
        setTextChecks(savedTextChecks ?? [])
        setCheckedText(draft.text || '')
        setLastCheckedAt(draft.updatedAt ?? null)
        setCheckError(null)
        setDraftLoad({ loading: false, error: null })
      })
      .catch((err) => {
        if (!alive) return
        // A draft that no longer exists is NOT a red error: forget the stored
        // id and show the empty composer with a small neutral notice instead.
        // Real network failures keep the existing error state + Retry.
        const gone = err?.status === 404 || /not found/i.test(String(err?.message ?? ''))
        setClaims(null)
        setCheckedText(null)
        setLastCheckedAt(null)
        setManualReview(false)
        setTextChecks(null)
        draftIdRef.current = null
        setDraftId(null)
        setDraftStatus(null)
        setDecisions([])
        clearLastDraftId()
        loadedKeyRef.current = null
        if (gone) {
          setTitle('')
          setContentType(CONTENT_TYPES[0])
          setText('')
          setGoneNotice(true)
          setDraftLoad({ loading: false, error: null })
        } else {
          setGoneNotice(false)
          setDraftLoad({ loading: false, error: err })
        }
      })
    return () => {
      alive = false
    }
  }, [])

  // Load the draft requested via #/review?draft=D-2 (Impact View, samples …).
  // Plain #/review reopens the remembered draft (sessionStorage) when there is
  // one — that covers the sidebar link and every other draft-less link;
  // otherwise start a fresh composer and restore any unsent text.
  useEffect(() => {
    if (draftParam) {
      const key = `${draftParam}|${refreshKey}`
      // Our own replaceState URL sync re-fires this effect — skip the reload
      // when the state already reflects exactly this draft + refresh cycle.
      if (loadedKeyRef.current === key) return
      loadedKeyRef.current = key
      const cleanup = loadDraft(draftParam)
      return () => {
        // Leaving this param/refresh state invalidates the guard, so React
        // StrictMode's double-invoked effects (and HMR) always re-fetch.
        loadedKeyRef.current = null
        cleanup?.()
      }
    }

    const remembered = readLastDraftId()
    if (remembered) {
      navigate(`/review?draft=${encodeURIComponent(remembered)}`, { replace: true })
      return
    }

    setGoneNotice(false)
    setTitle('')
    setContentType(CONTENT_TYPES[0])
    setText('')
    draftIdRef.current = null
    setDraftId(null)
    setDraftStatus(null)
    setDecisions([])
    setClaims(null)
    setManualReview(false)
    setTextChecks(null)
    setCheckedText(null)
    setLastCheckedAt(null)
    setCheckError(null)
    setDraftLoad({ loading: false, error: null })
    loadedKeyRef.current = null

    // Restore text typed but not checked yet. This branch only runs when no
    // draft is open, so it can never overwrite a draft loaded from the server.
    const unsent = readUnsent()
    if (unsent) {
      setTitle(String(unsent.title ?? ''))
      setContentType(
        CONTENT_TYPES.includes(unsent.contentType) ? unsent.contentType : CONTENT_TYPES[0],
      )
      setText(String(unsent.text ?? ''))
    }
  }, [draftParam, refreshKey, loadDraft])

  // Persist unsent composer text while no draft is open. It is cleared
  // explicitly when the content is checked or a fresh draft is started; the
  // helpers no-op when storage is blocked.
  useEffect(() => {
    if (draftIdRef.current) return
    if (title.trim() || text.trim()) writeUnsent({ title, contentType, text })
  }, [title, contentType, text])

  /* PDF import (Round 3, F4): extracted text lands in the composer exactly
     like typed text — the unsent-buffer effect above persists it, the stale-
     text notice behaves the same, and no check runs until the reviewer
     presses "Check content". */
  const pdf = usePdfImport({
    getHasText: () => text.trim().length > 0,
    applyImport(res, mode) {
      setText((prev) =>
        mode === 'append' && prev.trim() ? `${prev.trimEnd()}\n\n${res.text}` : res.text,
      )
      setTitle((prev) => (prev.trim() ? prev : String(res.filename).replace(/\.pdf$/i, '')))
    },
  })

  /* --------------------------------- actions -------------------------------- */

  async function handleCheck() {
    if (checking) return
    if (!text.trim()) {
      toast({
        kind: 'error',
        title: 'Nothing to check',
        message: 'Write some draft content or load a sample first.',
      })
      return
    }
    setChecking(true)
    setCheckError(null)
    try {
      let id = draftId
      if (!id) {
        const created = await api.createDraft({
          title: title.trim() || 'Untitled draft',
          contentType,
          text,
        })
        id = created?._id ?? null
        if (id) {
          setDraftId(id)
          setDraftStatus(created.status ?? 'in_review')
          setDecisions(created.decisions ?? [])
        }
      }
      const res = await api.checkContent({
        draftId: id ?? undefined,
        title: title.trim() || 'Untitled draft',
        contentType,
        text,
      })
      const finalId = res.draftId ?? id
      if (finalId) {
        if (finalId !== draftId) setDraftId(finalId)
        draftIdRef.current = finalId
        writeLastDraftId(finalId)
        clearUnsent() // the text is checked now — it lives on the draft
        loadedKeyRef.current = `${finalId}|${refreshKey}`
        // Keep the address in sync without stacking browser-history entries.
        if (draftParam !== finalId) {
          navigate(`/review?draft=${encodeURIComponent(finalId)}`, { replace: true })
        }
      }
      setClaims(res.claims)
      setManualReview(res.manualReview)
      setTextChecks(res.textChecks ?? [])
      setCheckedText(text)
      setLastCheckedAt(new Date().toISOString())
      loadSamples()
      if (res.manualReview) {
        toast({
          kind: 'info',
          title: 'Check finished — manual review needed',
          message: 'The output was malformed or could not be grounded. A human should review this draft.',
        })
      } else {
        const counts = countVerdicts(res.claims)
        toast({
          kind: 'success',
          title: `Check finished — ${res.claims.length} claim${res.claims.length === 1 ? '' : 's'} found`,
          message: `${counts.verified} verified · ${counts.conflicts} conflicts · ${counts.unsupported} unsupported`,
        })
      }
    } catch (err) {
      setCheckError(err)
    } finally {
      setChecking(false)
    }
  }

  function handleApply(claim) {
    if (!claim.suggestion) return
    const idx = text.indexOf(claim.text)
    if (idx === -1) {
      toast({
        kind: 'error',
        title: 'Could not apply this suggestion',
        message: 'The exact claim text is no longer in the editor — it may already be edited. Re-check to refresh findings.',
      })
      return
    }
    setText(text.slice(0, idx) + claim.suggestion + text.slice(idx + claim.text.length))
    setClaims((list) =>
      list.map((c) => (c._id === claim._id ? { ...c, appliedLocally: true } : c)),
    )
    toast({
      kind: 'info',
      title: 'Suggestion applied to this claim',
      message: 'Only that sentence changed. Run “Check content” again to verify the updated text.',
    })
  }

  async function handleCopy(claim) {
    const ok = await copyToClipboard(claim.suggestion ?? '')
    if (ok) toast({ kind: 'success', title: 'Suggested rewrite copied to clipboard.' })
    else
      toast({
        kind: 'error',
        title: 'Copy failed',
        message: 'Your browser blocked clipboard access — select the text and copy manually.',
      })
  }

  /**
   * Dismiss a wrong flag. ClaimCard's modal awaits this call: on success the
   * card updates in place (no page reload) and the modal closes; on failure
   * the error propagates so the modal can show the server's message.
   */
  async function handleDismiss(claim, reason) {
    const did = claim.draftId ?? draftId
    if (!did) {
      throw new Error('This claim is not attached to a saved draft yet — run a check first.')
    }
    const updated = await api.dismissClaim(did, claim._id, reason, actorLabel(role))
    setClaims((list) =>
      list.map((c) =>
        c._id === claim._id ? { ...c, ...updated, appliedLocally: c.appliedLocally } : c,
      ),
    )
    toast({
      kind: 'success',
      title: 'Flag dismissed',
      message: `${actorLabel(role)} marked this finding as wrong. The claim stays visible with the reason.`,
    })
    return updated
  }

  /** Undo a dismissal — no confirmation; restores the card in place. */
  async function handleUndoDismiss(claim) {
    const did = claim.draftId ?? draftId
    if (!did) return
    try {
      const updated = await api.undoDismiss(did, claim._id)
      setClaims((list) =>
        list.map((c) =>
          c._id === claim._id ? { ...c, ...updated, appliedLocally: c.appliedLocally } : c,
        ),
      )
      toast({ kind: 'success', title: 'Dismissal undone' })
    } catch (err) {
      toast({
        kind: 'error',
        title: 'Could not undo the dismissal',
        message: err.message,
      })
    }
  }

  function loadSample(draft) {
    if (draftParam === draft._id) loadDraft(draft._id)
    else navigate(`/review?draft=${encodeURIComponent(draft._id)}`)
  }

  function startFresh() {
    // A fresh draft forgets the remembered id and any unsent text.
    clearLastDraftId()
    clearUnsent()
    setGoneNotice(false)
    if (draftParam) navigate('/review')
    draftIdRef.current = null
    loadedKeyRef.current = null
    setTitle('')
    setText('')
    setContentType(CONTENT_TYPES[0])
    setDraftId(null)
    setDraftStatus(null)
    setDecisions([])
    setClaims(null)
    setManualReview(false)
    setTextChecks(null)
    setCheckedText(null)
    setLastCheckedAt(null)
    setCheckError(null)
    setDraftLoad({ loading: false, error: null })
  }

  async function handleDecisionSubmit(comment) {
    const action = decisionAction
    if (!action || !draftId || deciding) return
    setDeciding(true)
    try {
      const updated = await api.decideDraft(draftId, {
        decision: action,
        comment: comment || null,
        actor: actorLabel(role),
      })
      // Status changes ONLY after the API confirms.
      const newStatus = updated?.status ?? action
      setDraftStatus(newStatus)
      setDecisions(
        updated?.decisions ?? [
          ...decisions,
          { decision: action, comment: comment || null, actor: actorLabel(role), at: new Date().toISOString() },
        ],
      )
      setDecisionAction(null)
      loadSamples()
      toast({
        kind: 'success',
        title: `Draft ${DECISION_META[action].verb === 'requested changes on' ? 'marked “changes requested”' : DECISION_META[action].verb}`,
        message: `“${title.trim() || 'Untitled draft'}” is now ${draftStatusLabel(newStatus)}. Logged in History.`,
      })
    } catch (err) {
      toast({ kind: 'error', title: 'Decision not saved', message: err.message })
    } finally {
      setDeciding(false)
    }
  }

  /* --------------------------------- derived -------------------------------- */

  const counts = useMemo(() => (hasResults ? countVerdicts(claims) : null), [claims, hasResults])
  const dismissedCount = useMemo(
    () => (hasResults ? claims.filter((c) => c.dismissal).length : 0),
    [claims, hasResults],
  )
  const words = wordCount(text)
  const hasContent = text.trim().length > 0
  const previousDecisions = useMemo(
    () => [...(decisions ?? [])].sort((a, b) => new Date(b.at) - new Date(a.at)),
    [decisions],
  )

  /* ---------------------------------- render --------------------------------- */

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* ------------------------------ LEFT: composer ----------------------------- */}
      <div className="space-y-5">
        <section aria-labelledby="draft-editor-heading" className="rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(27,34,54,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
            <h2 id="draft-editor-heading" className="font-heading flex items-center gap-2 text-base font-semibold text-ink">
              <PenLine size={15} aria-hidden="true" className="text-ink-soft" />
              Draft content
            </h2>
            <div className="flex items-center gap-2">
              {draftId && <IdChip id={draftId} title="Draft ID" />}
              {draftStatus && <DraftStatusBadge status={draftStatus} />}
            </div>
          </div>

          <div className="space-y-4 px-4 py-4 sm:px-5">
            {goneNotice && (
              <p
                role="status"
                className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-md border border-line-strong bg-tint px-3.5 py-2.5 text-xs leading-relaxed text-ink-soft"
              >
                <Info size={13} aria-hidden="true" className="shrink-0" />
                That draft is no longer available.
                <Button size="sm" variant="secondary" onClick={startFresh}>
                  Start a fresh draft
                </Button>
              </p>
            )}
            <div>
              <label htmlFor="draft-title" className="block text-sm font-medium text-ink">
                Title
              </label>
              <input
                id="draft-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Festive Sale — Instagram caption"
                className="mt-1.5 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-navy focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="draft-content-type" className="block text-sm font-medium text-ink">
                Content type
              </label>
              <select
                id="draft-content-type"
                value={contentType}
                onChange={(e) => setContentType(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-navy focus:outline-none"
              >
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div
              {...pdf.dropProps}
              className={
                pdf.dragOver ? 'rounded-lg ring-2 ring-navy ring-offset-2 ring-offset-surface' : undefined
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <label htmlFor="draft-text" className="block text-sm font-medium text-ink">
                  Content
                </label>
                <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                  <p aria-live="polite" className="text-xs text-muted tabular-nums">
                    {words} word{words === 1 ? '' : 's'}
                  </p>
                  <PdfImportButton {...pdf} />
                </div>
              </div>
              <textarea
                id="draft-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                placeholder={'Paste the creator’s draft here, or load one of the sample drafts below.\n\nEvery factual promise — prices, offers, delivery, materials — will be checked against the Brand Vault.'}
                className="mt-1.5 w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-muted/70 focus:border-navy focus:outline-none"
              />
              <PdfImportStatus {...pdf} />
              {dirty && (
                <p className="mt-2 flex items-start gap-1.5 rounded-md border border-line-strong bg-tint px-3 py-2 text-xs leading-relaxed text-ink-soft">
                  <Info size={13} aria-hidden="true" className="mt-px shrink-0" />
                  Text changed since the last check — the findings shown may be stale. Run
                  “Check content” again after your edits.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="lg"
                icon={FileSearch}
                busy={checking}
                disabled={!hasContent}
                onClick={handleCheck}
                title={!hasContent ? 'Add some draft content first' : undefined}
              >
                {checking ? 'Checking…' : hasResults ? 'Re-check content' : 'Check content'}
              </Button>
              {(hasContent || draftId) && (
                <Button variant="ghost" size="lg" onClick={startFresh} disabled={checking}>
                  Start a fresh draft
                </Button>
              )}
            </div>

            {checkError && (
              <ErrorState
                error={checkError}
                title="The check did not complete"
                onRetry={handleCheck}
              />
            )}
          </div>
        </section>

        {/* Sample drafts */}
        <section aria-labelledby="samples-heading" className="rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(27,34,54,0.05)]">
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <h2 id="samples-heading" className="font-heading flex items-center gap-2 text-base font-semibold text-ink">
              <FileText size={15} aria-hidden="true" className="text-ink-soft" />
              Sample drafts
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Fictional drafts for the demo — load one and press “Check content”.
            </p>
          </div>
          <div className="px-4 py-3 sm:px-5">
            {samplesError && (
              <ErrorState error={samplesError} title="Could not load drafts" onRetry={loadSamples} />
            )}
            {!samplesError && samples === null && (
              <ul className="space-y-2" aria-label="Loading sample drafts">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="rounded-md border border-line px-3 py-2.5">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="mt-2 h-3 w-1/3" />
                  </li>
                ))}
              </ul>
            )}
            {!samplesError && Array.isArray(samples) && samples.length === 0 && (
              <p className="text-xs text-muted">
                No saved drafts yet. Run a check on your own text — it will appear here.
              </p>
            )}
            {!samplesError && Array.isArray(samples) && samples.length > 0 && (
              <ul className="space-y-2">
                {samples.slice(0, 6).map((draft) => (
                  <li key={draft._id}>
                    <button
                      type="button"
                      onClick={() => loadSample(draft)}
                      disabled={checking}
                      aria-current={draftParam === draft._id ? 'true' : undefined}
                      className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                        draftParam === draft._id
                          ? 'border-navy bg-navy-soft'
                          : 'border-line bg-surface hover:border-line-strong hover:bg-tint'
                      }`}
                    >
                      <IdChip id={draft._id} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {draft.title || 'Untitled draft'}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {draft.contentType || 'Other'} · {wordCount(draft.text)} words
                        </span>
                      </span>
                      <DraftStatusBadge status={draft.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* ---------------------------- RIGHT: claim ledger --------------------------- */}
      <div className="space-y-5">
        <section aria-labelledby="ledger-heading" className="rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(27,34,54,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
            <h2 id="ledger-heading" className="font-heading flex items-center gap-2 text-base font-semibold text-ink">
              <ClipboardCheck size={15} aria-hidden="true" className="text-ink-soft" />
              Claim ledger
            </h2>
            {lastCheckedAt && hasResults && (
              <span className="text-xs text-muted">Last checked {formatRelative(lastCheckedAt)}</span>
            )}
          </div>

          <div className="px-4 py-4 sm:px-5">
            {draftLoad.loading && <LoadingBlock label="Loading draft…" rows={2} />}

            {!draftLoad.loading && draftLoad.error && (
              <ErrorState
                error={draftLoad.error}
                title="Could not load this draft"
                onRetry={() => loadDraft(draftParam)}
              />
            )}

            {!draftLoad.loading && !draftLoad.error && !hasResults && (
              <EmptyState
                icon={FileSearch}
                title="No check results yet"
                description="Load a sample draft (or paste your own) on the left, then press “Check content”. Each factual claim gets a verdict, the cited source, and a suggested rewrite."
              />
            )}

            {!draftLoad.loading && hasResults && (
              <div className="space-y-4">
                {/* Summary counts */}
                <div aria-live="polite" className="flex flex-wrap items-center gap-2">
                  {VERDICT_ORDER.filter((v) => counts[v] > 0 || v !== 'manual').map((verdict) => {
                    const meta = VERDICT_META[verdict]
                    return (
                      <span
                        key={verdict}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${meta.chip}`}
                      >
                        <meta.Icon size={13} aria-hidden="true" strokeWidth={2.2} />
                        {counts[verdict]} {meta.label}
                      </span>
                    )
                  })}
                  {dismissedCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-tint px-3 py-1 text-xs font-semibold text-ink-soft">
                      <Ban size={13} aria-hidden="true" strokeWidth={2.2} />
                      {dismissedCount} dismissed
                    </span>
                  )}
                  <span className="text-xs text-muted">
                    {claims.length} claim{claims.length === 1 ? '' : 's'} · AI-generated, a human
                    decides
                  </span>
                </div>

                {/* Manual review flag */}
                {manualReview && (
                  <div className="flex items-start gap-3 rounded-lg border border-line-strong bg-tint px-4 py-3">
                    <CircleHelp size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-soft" />
                    <div>
                      <p className="text-sm font-semibold text-ink">Manual review needed</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                        The check output was malformed or could not be grounded in approved
                        sources, so no automatic findings are shown. A human should review this
                        draft line by line.
                      </p>
                    </div>
                  </div>
                )}

                {claims.length === 0 && !manualReview && (
                  <EmptyState
                    icon={ClipboardCheck}
                    title="No factual claims detected"
                    description="Nothing in this draft looks like a checkable brand claim (prices, offers, delivery, materials, statistics). A human can still review and record a decision."
                  />
                )}

                {/* Findings */}
                <ul className="space-y-4">
                  {claims.map((claim) => (
                    <li key={claim._id}>
                      <ClaimCard
                        claim={claim}
                        facts={sources.facts}
                        terminology={sources.terminology}
                        role={role}
                        onApply={handleApply}
                        onCopy={handleCopy}
                        onDismiss={handleDismiss}
                        onUndoDismiss={handleUndoDismiss}
                        busy={checking}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* Wording & readability checks — separate from claims, never counted
            in the claim totals. Shown once a check has run or a draft opened. */}
        {textChecks !== null && <TextChecksSection checks={textChecks} />}

        {/* --------------------------- reviewer decisions --------------------------- */}
        {hasResults && draftId && (
          <section aria-labelledby="decision-heading" className="rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(27,34,54,0.05)]">
            <div className="border-b border-line px-4 py-3 sm:px-5">
              <h2 id="decision-heading" className="font-heading text-base font-semibold text-ink">
                Human decision
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                The AI only drafts findings — a person approves, rejects or requests changes.
                Decisions are saved only after the API confirms.
              </p>
            </div>
            <div className="space-y-4 px-4 py-4 sm:px-5">
              {canDecide ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" icon={ShieldCheck} onClick={() => setDecisionAction('approved')}>
                    {DECISION_META.approved.label}
                  </Button>
                  <Button variant="secondary" icon={MessageSquare} onClick={() => setDecisionAction('changes')}>
                    {DECISION_META.changes.label}
                  </Button>
                  <Button variant="dark" icon={Ban} onClick={() => setDecisionAction('rejected')}>
                    {DECISION_META.rejected.label}
                  </Button>
                  <span className="self-center text-xs text-muted">
                    Acting as <strong className="font-semibold text-ink-soft">{actorLabel(role)}</strong>
                  </span>
                </div>
              ) : (
                <p className="flex items-start gap-2 rounded-md border border-line-strong bg-tint px-3.5 py-2.5 text-xs leading-relaxed text-ink-soft">
                  <Info size={14} aria-hidden="true" className="mt-px shrink-0" />
                  You are viewing as <strong className="font-semibold">{actorLabel(role)}</strong>.
                  Decisions are recorded by Reviewers and Managers — use the demo role switch in
                  the top bar (it is a demo aid, not a login).
                </p>
              )}

              {previousDecisions.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                    Previous decisions
                  </h3>
                  <ol className="mt-2 space-y-2">
                    {previousDecisions.map((d, i) => (
                      <li
                        key={`${d.at}-${i}`}
                        className="rounded-md border border-line bg-paper px-3.5 py-2.5"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <DraftStatusBadge status={d.decision === 'changes' ? 'changes' : d.decision} />
                          <span className="text-xs text-muted">
                            {d.actor ?? 'Reviewer (demo)'} · {formatRelative(d.at)}
                          </span>
                        </div>
                        {d.comment && (
                          <p className="mt-1.5 border-l-2 border-line-strong pl-2.5 text-xs leading-relaxed text-ink-soft italic">
                            “{d.comment}”
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      <DecisionDialog
        open={decisionAction !== null}
        action={decisionAction ?? 'approved'}
        draftTitle={title.trim() || 'Untitled draft'}
        busy={deciding}
        onClose={() => !deciding && setDecisionAction(null)}
        onSubmit={handleDecisionSubmit}
      />
    </div>
  )
}
