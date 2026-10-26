import { useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { todayInputValue, toInputDate } from '../../lib/format'

const EMPTY = {
  text: '',
  owner: '',
  verifiedOn: '',
  expiresOn: '',
}

/**
 * Add / edit an approved fact. On edit, the parent submits a PATCH and gets
 * back { fact, impact } — the impact ("N drafts need re-review") is surfaced
 * by the Vault page, never invented here.
 */
export default function FactDialog({ open, fact, onClose, onSubmit }) {
  const isEdit = Boolean(fact?._id)
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({})
    setFormError(null)
    setPending(false)
    setValues(
      fact
        ? {
            text: fact.text ?? '',
            owner: fact.owner ?? '',
            verifiedOn: toInputDate(fact.verifiedOn) || todayInputValue(),
            expiresOn: toInputDate(fact.expiresOn),
          }
        : { ...EMPTY, verifiedOn: todayInputValue() },
    )
  }, [open, fact])

  function setField(name, value) {
    setValues((v) => ({ ...v, [name]: value }))
    setErrors((e) => ({ ...e, [name]: undefined }))
  }

  function validate() {
    const next = {}
    if (values.text.trim().length < 8) {
      next.text = 'Fact text must be at least 8 characters — a full, checkable statement.'
    }
    if (!values.owner.trim()) {
      next.owner = 'An owner is required so reviewers know who verified the fact.'
    }
    if (!values.verifiedOn) {
      next.verifiedOn = 'A verification date is required.'
    }
    if (values.expiresOn && values.verifiedOn && values.expiresOn < values.verifiedOn) {
      next.expiresOn = 'Expiry must be after the verification date.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const expiryInPast =
    values.expiresOn && values.expiresOn < todayInputValue() ? true : false

  async function handleSubmit(e) {
    e.preventDefault()
    if (pending) return
    if (!validate()) return
    setPending(true)
    setFormError(null)
    try {
      await onSubmit({
        text: values.text.trim(),
        owner: values.owner.trim(),
        verifiedOn: values.verifiedOn,
        expiresOn: values.expiresOn || null,
      })
    } catch (err) {
      setFormError(err?.message || 'The fact could not be saved.')
      setPending(false)
    }
  }

  const inputCls = (name) =>
    `mt-1.5 w-full rounded-md border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:outline-none ${
      errors[name] ? 'border-ink' : 'border-line-strong focus:border-navy'
    }`

  return (
    <Modal
      open={open}
      onClose={pending ? undefined : onClose}
      title={isEdit ? `Edit fact ${fact._id}` : 'Add an approved fact'}
      subtitle={
        isEdit
          ? 'Editing approved text re-judges nothing by itself — but every draft citing this fact is flagged for re-review.'
          : 'Approved facts are the only sources the checker treats as ground truth.'
      }
      labelledBy="fact-dialog-title"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="fact-form" variant="primary" busy={pending}>
            {isEdit ? 'Save changes' : 'Add fact'}
          </Button>
        </>
      }
    >
      <form id="fact-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="fact-text" className="block text-sm font-medium text-ink">
            Approved text <span className="text-muted">(required)</span>
          </label>
          <textarea
            id="fact-text"
            rows={3}
            value={values.text}
            onChange={(e) => setField('text', e.target.value)}
            placeholder="e.g. Free delivery on all orders above ₹499 within India."
            aria-required="true"
            aria-invalid={errors.text ? 'true' : undefined}
            aria-describedby={errors.text ? 'fact-text-error' : undefined}
            className={inputCls('text')}
          />
          {errors.text && (
            <p id="fact-text-error" role="alert" className="mt-1 text-xs font-semibold text-ink">
              {errors.text}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="fact-owner" className="block text-sm font-medium text-ink">
              Owner <span className="text-muted">(required)</span>
            </label>
            <input
              id="fact-owner"
              type="text"
              value={values.owner}
              onChange={(e) => setField('owner', e.target.value)}
              placeholder="e.g. Priya Nair (Operations)"
              aria-required="true"
              aria-invalid={errors.owner ? 'true' : undefined}
              aria-describedby={errors.owner ? 'fact-owner-error' : undefined}
              className={inputCls('owner')}
            />
            {errors.owner && (
              <p id="fact-owner-error" role="alert" className="mt-1 text-xs font-semibold text-ink">
                {errors.owner}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="fact-verified" className="block text-sm font-medium text-ink">
              Verified on <span className="text-muted">(required)</span>
            </label>
            <input
              id="fact-verified"
              type="date"
              value={values.verifiedOn}
              onChange={(e) => setField('verifiedOn', e.target.value)}
              aria-required="true"
              aria-invalid={errors.verifiedOn ? 'true' : undefined}
              aria-describedby={errors.verifiedOn ? 'fact-verified-error' : undefined}
              className={inputCls('verifiedOn')}
            />
            {errors.verifiedOn && (
              <p id="fact-verified-error" role="alert" className="mt-1 text-xs font-semibold text-ink">
                {errors.verifiedOn}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="fact-expires" className="block text-sm font-medium text-ink">
            Expires on <span className="text-muted">(optional)</span>
          </label>
          <input
            id="fact-expires"
            type="date"
            value={values.expiresOn}
            onChange={(e) => setField('expiresOn', e.target.value)}
            aria-invalid={errors.expiresOn ? 'true' : undefined}
            aria-describedby={errors.expiresOn ? 'fact-expires-error' : 'fact-expires-hint'}
            className={inputCls('expiresOn')}
          />
          {errors.expiresOn ? (
            <p id="fact-expires-error" role="alert" className="mt-1 text-xs font-semibold text-ink">
              {errors.expiresOn}
            </p>
          ) : (
            <p id="fact-expires-hint" className="mt-1 text-xs text-muted">
              After this date the fact can no longer verify claims.
            </p>
          )}
          {expiryInPast && !errors.expiresOn && (
            <p className="mt-2 rounded-md border border-line-strong bg-tint px-3 py-2 text-xs leading-relaxed text-ink-soft">
              Heads up: this expiry date is in the past — saving will immediately expire the
              fact and flag every draft citing it as “Needs re-review”.
            </p>
          )}
        </div>

        {formError && (
          <p role="alert" className="rounded-md border border-line-strong bg-tint px-3 py-2 text-xs font-semibold text-ink">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  )
}
