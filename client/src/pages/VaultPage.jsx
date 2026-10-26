import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  Flame,
  Pencil,
  Plus,
  Search,
  Tags,
  Vault as VaultIcon,
  Waypoints,
  X,
} from 'lucide-react'
import * as api from '../lib/api'
import { daysUntil, formatDate, isExpired } from '../lib/format'
import { navigate } from '../lib/router'
import { actorLabel, useDemo } from '../state/demo'
import Button from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingBlock } from '../components/ui/States'
import { ExpiryChip, FactStatusChip, IdChip } from '../components/ui/badges'
import { useToast } from '../components/ui/Toast'
import FactDialog from '../components/vault/FactDialog'

const TABS = [
  { id: 'facts', label: 'Facts', Icon: VaultIcon },
  { id: 'guidelines', label: 'Guidelines', Icon: BookOpen },
  { id: 'terminology', label: 'Terminology', Icon: Tags },
]

/**
 * BRAND VAULT — the approved sources of truth.
 * Facts: searchable/filterable table (cards on mobile), add + edit. Saving an
 * edit surfaces the impact returned by the API ("3 drafts need re-review").
 * Guidelines & Terminology: read-only lists from GET /api/guidelines.
 */
export default function VaultPage() {
  const { refreshKey, bumpRefresh, role } = useDemo()
  const toast = useToast()

  const [tab, setTab] = useState('facts')
  const [facts, setFacts] = useState(null) // null = loading
  const [guide, setGuide] = useState(null) // { guidelines, terminology }
  const [error, setError] = useState(null)

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expiringOnly, setExpiringOnly] = useState(false)

  const [dialog, setDialog] = useState(null) // { fact } | { fact: null } for add
  const [impactNotice, setImpactNotice] = useState(null) // { factId, drafts, claims }

  const tabRefs = useRef([])

  const load = useCallback(() => {
    let alive = true
    setFacts(null)
    setGuide(null)
    setError(null)
    Promise.all([api.listFacts(), api.getGuidelines()])
      .then(([factList, guideData]) => {
        if (!alive) return
        setFacts(factList)
        setGuide(guideData)
      })
      .catch((err) => alive && setError(err))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => load(), [load, refreshKey])

  /* --------------------------------- filtering -------------------------------- */

  const filteredFacts = useMemo(() => {
    if (!Array.isArray(facts)) return []
    const q = query.trim().toLowerCase()
    return facts.filter((f) => {
      if (
        q &&
        !(
          String(f._id).toLowerCase().includes(q) ||
          String(f.text ?? '').toLowerCase().includes(q) ||
          String(f.owner ?? '').toLowerCase().includes(q)
        )
      ) {
        return false
      }
      const expired = f.status === 'expired' || isExpired(f)
      if (statusFilter === 'active' && expired) return false
      if (statusFilter === 'expired' && !expired) return false
      if (expiringOnly) {
        const d = daysUntil(f.expiresOn)
        if (d === null || d < 0 || d > 21) return false
      }
      return true
    })
  }, [facts, query, statusFilter, expiringOnly])

  const hasFilters = Boolean(query.trim()) || statusFilter !== 'all' || expiringOnly

  function clearFilters() {
    setQuery('')
    setStatusFilter('all')
    setExpiringOnly(false)
  }

  /* ---------------------------------- saving ---------------------------------- */

  async function handleSubmitFact(values) {
    if (dialog?.fact) {
      const { fact, impact } = await api.updateFact(dialog.fact._id, {
        ...values,
        actor: actorLabel(role),
      })
      toast({ kind: 'success', title: `Fact ${fact?._id ?? dialog.fact._id} saved.` })
      if (impact && impact.drafts.length > 0) {
        setImpactNotice({
          factId: fact?._id ?? dialog.fact._id,
          drafts: impact.drafts.length,
          claims: impact.claims.length,
        })
        bumpRefresh() // updates the Impact View badge everywhere
      } else {
        setImpactNotice(null)
      }
    } else {
      const fact = await api.createFact({ ...values, actor: actorLabel(role) })
      toast({
        kind: 'success',
        title: `Fact ${fact?._id ?? ''} added to the Brand Vault.`,
        message: 'New checks can now cite it as an approved source.',
      })
    }
    setDialog(null)
    load()
  }

  /* -------------------------------- tab keys ---------------------------------- */

  function onTabKeyDown(e, index) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next =
      e.key === 'ArrowRight'
        ? (index + 1) % TABS.length
        : (index - 1 + TABS.length) % TABS.length
    setTab(TABS[next].id)
    tabRefs.current[next]?.focus()
  }

  /* ---------------------------------- render ---------------------------------- */

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm leading-relaxed text-ink-soft">
        The Brand Vault holds the <strong className="font-semibold text-ink">approved facts</strong>{' '}
        the checker treats as ground truth, plus the brand guidelines and terminology rules.
        Editing a fact here ripples outward — citing drafts are flagged for re-review.
      </p>

      {/* Impact notice after an edit (counts come from the PATCH response) */}
      {impactNotice && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-ember bg-ember-soft px-4 py-3"
        >
          <Flame size={16} aria-hidden="true" className="text-ember" />
          <p className="min-w-0 flex-1 text-sm text-ember-ink">
            <strong className="font-bold">
              {impactNotice.drafts} draft{impactNotice.drafts === 1 ? '' : 's'} need
              {impactNotice.drafts === 1 ? 's' : ''} re-review
            </strong>{' '}
            because fact <span className="font-mono text-[13px]">{impactNotice.factId}</span>{' '}
            changed — {impactNotice.claims} stored claim
            {impactNotice.claims === 1 ? '' : 's'} cited it.
          </p>
          <Button size="sm" variant="ember" icon={Waypoints} onClick={() => navigate('/impact')}>
            Open Impact View
          </Button>
          <button
            type="button"
            onClick={() => setImpactNotice(null)}
            aria-label="Dismiss impact notice"
            className="rounded p-1 text-ember-ink transition-colors hover:bg-ember/15"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Brand Vault sections"
        className="flex flex-wrap gap-1.5 border-b border-line pb-px"
      >
        {TABS.map(({ id, label, Icon }, i) => (
          <button
            key={id}
            ref={(el) => (tabRefs.current[i] = el)}
            type="button"
            role="tab"
            id={`vault-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`vault-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onKeyDown={(e) => onTabKeyDown(e, i)}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-t-md border border-b-0 px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? 'border-line bg-surface text-ink shadow-[0_-2px_0_var(--color-navy)_inset]'
                : 'border-transparent text-muted hover:bg-tint hover:text-ink'
            }`}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {/* ------------------------------- FACTS TAB ------------------------------- */}
      <div
        role="tabpanel"
        id="vault-panel-facts"
        aria-labelledby="vault-tab-facts"
        hidden={tab !== 'facts'}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <label htmlFor="fact-search" className="sr-only">
              Search facts by text, owner or ID
            </label>
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
            />
            <input
              id="fact-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by text, owner or ID…"
              className="w-full rounded-md border border-line-strong bg-surface py-2 pr-3 pl-8.5 text-sm text-ink placeholder:text-muted/70 focus:border-navy focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="fact-status" className="sr-only">
              Filter by status
            </label>
            <select
              id="fact-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-navy focus:outline-none"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink-soft select-none hover:bg-tint">
            <input
              type="checkbox"
              checked={expiringOnly}
              onChange={(e) => setExpiringOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-navy)]"
            />
            Expiring soon
          </label>
          <Button variant="primary" icon={Plus} onClick={() => setDialog({ fact: null })} className="ml-auto">
            Add fact
          </Button>
        </div>

        {error && <ErrorState error={error} title="Could not load the Brand Vault" onRetry={load} />}

        {!error && facts === null && <LoadingBlock label="Loading facts…" rows={3} />}

        {!error && facts !== null && facts.length === 0 && (
          <EmptyState
            icon={VaultIcon}
            title="The Brand Vault is empty"
            description="Add the first approved fact — claims can only be verified against facts stored here."
          >
            <Button variant="primary" icon={Plus} onClick={() => setDialog({ fact: null })}>
              Add fact
            </Button>
          </EmptyState>
        )}

        {!error && facts !== null && facts.length > 0 && filteredFacts.length === 0 && (
          <EmptyState
            icon={Search}
            title="No facts match your filters"
            description="Try a different search term, or clear the filters to see the whole Vault."
          >
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          </EmptyState>
        )}

        {!error && filteredFacts.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(27,34,54,0.05)] md:block">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">
                  Approved facts: ID, text, owner, verification and expiry dates, status
                </caption>
                <thead>
                  <tr className="border-b border-line bg-paper text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                    <th scope="col" className="px-4 py-2.5">ID</th>
                    <th scope="col" className="px-4 py-2.5">Approved text</th>
                    <th scope="col" className="px-4 py-2.5">Owner</th>
                    <th scope="col" className="px-4 py-2.5">Verified</th>
                    <th scope="col" className="px-4 py-2.5">Expires</th>
                    <th scope="col" className="px-4 py-2.5">Status</th>
                    <th scope="col" className="px-4 py-2.5">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFacts.map((fact) => (
                    <tr key={fact._id} className="border-b border-line align-top last:border-b-0 hover:bg-paper/60">
                      <td className="px-4 py-3">
                        <IdChip id={fact._id} />
                      </td>
                      <td className="max-w-md px-4 py-3 text-sm leading-relaxed text-ink">
                        {fact.text}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-soft">{fact.owner || '—'}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-ink-soft">
                        {formatDate(fact.verifiedOn)}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-ink-soft">
                        {fact.expiresOn ? formatDate(fact.expiresOn) : '—'}
                        <div>
                          <ExpiryChip fact={fact} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <FactStatusChip fact={fact} />
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Pencil}
                          aria-label={`Edit fact ${fact._id}`}
                          onClick={() => setDialog({ fact })}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="space-y-3 md:hidden">
              {filteredFacts.map((fact) => (
                <li key={fact._id} className="rounded-xl border border-line bg-surface px-4 py-3.5 shadow-[0_1px_2px_rgba(27,34,54,0.05)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <IdChip id={fact._id} />
                    <FactStatusChip fact={fact} />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Pencil}
                      className="ml-auto"
                      aria-label={`Edit fact ${fact._id}`}
                      onClick={() => setDialog({ fact })}
                    >
                      Edit
                    </Button>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink">{fact.text}</p>
                  <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div>
                      <dt className="font-semibold text-muted">Owner</dt>
                      <dd className="text-ink-soft">{fact.owner || '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted">Verified</dt>
                      <dd className="text-ink-soft">{formatDate(fact.verifiedOn)}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted">Expires</dt>
                      <dd className="text-ink-soft">
                        {fact.expiresOn ? formatDate(fact.expiresOn) : '—'}
                        <ExpiryChip fact={fact} />
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>

            <p className="text-xs text-muted" aria-live="polite">
              Showing {filteredFacts.length} of {facts.length} approved fact
              {facts.length === 1 ? '' : 's'}
              {hasFilters ? ' (filters active)' : ''}.
            </p>
          </>
        )}
      </div>

      {/* ---------------------------- GUIDELINES TAB ---------------------------- */}
      <div
        role="tabpanel"
        id="vault-panel-guidelines"
        aria-labelledby="vault-tab-guidelines"
        hidden={tab !== 'guidelines'}
      >
        {error && <ErrorState error={error} title="Could not load guidelines" onRetry={load} />}
        {!error && guide === null && <LoadingBlock label="Loading guidelines…" rows={2} />}
        {!error && guide !== null && (guide.guidelines ?? []).length === 0 && (
          <EmptyState
            icon={BookOpen}
            title="No guidelines published"
            description="Brand guidelines maintained by the brand team will appear here."
          />
        )}
        {!error && guide !== null && (guide.guidelines ?? []).length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-muted">
              Read-only — guidelines are maintained by the brand team and apply to every check.
            </p>
            <ul className="space-y-3">
              {guide.guidelines.map((g) => (
                <li key={g._id ?? g.id} className="rounded-xl border border-line bg-surface px-4 py-3.5 shadow-[0_1px_2px_rgba(27,34,54,0.05)]">
                  <div className="flex items-center gap-2">
                    <IdChip id={g._id ?? g.id} />
                    {g.title && <p className="text-sm font-semibold text-ink">{g.title}</p>}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{g.text}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* --------------------------- TERMINOLOGY TAB --------------------------- */}
      <div
        role="tabpanel"
        id="vault-panel-terminology"
        aria-labelledby="vault-tab-terminology"
        hidden={tab !== 'terminology'}
      >
        {error && <ErrorState error={error} title="Could not load terminology" onRetry={load} />}
        {!error && guide === null && <LoadingBlock label="Loading terminology…" rows={2} />}
        {!error && guide !== null && (guide.terminology ?? []).length === 0 && (
          <EmptyState
            icon={Tags}
            title="No terminology rules published"
            description="Preferred and banned wording will appear here."
          />
        )}
        {!error && guide !== null && (guide.terminology ?? []).length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-muted">
              Read-only — the exact words the brand uses (and never uses). Checks cite these
              rules by ID, e.g. T-004.
            </p>
            <ul className="space-y-3">
              {guide.terminology.map((t) => (
                <li key={t._id ?? t.id} className="rounded-xl border border-line bg-surface px-4 py-3.5 shadow-[0_1px_2px_rgba(27,34,54,0.05)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <IdChip id={t._id ?? t.id} />
                    <p className="text-sm text-ink">
                      Use <strong className="font-semibold">“{t.use}”</strong>
                      {t.avoid && (
                        <>
                          {' '}— never{' '}
                          <span className="text-muted line-through decoration-line-strong">
                            “{t.avoid}”
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  {t.note && <p className="mt-1.5 text-xs leading-relaxed text-muted">{t.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <FactDialog
        open={dialog !== null}
        fact={dialog?.fact ?? null}
        onClose={() => setDialog(null)}
        onSubmit={handleSubmitFact}
      />
    </div>
  )
}
