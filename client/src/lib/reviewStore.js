/**
 * Session persistence for the Review page.
 *
 * Two sessionStorage keys:
 *   • claimledger.review.lastDraftId — the last draft opened or checked, so
 *     the sidebar "Review" link (and any plain #/review navigation) can
 *     reopen it after the page unmounts.
 *   • claimledger.review.unsent      — composer text typed but not checked
 *     yet (title, content type, content).
 *
 * EVERY read and write is wrapped in try/catch: the app must keep working
 * when storage is blocked (private browsing, embedded frames, disabled
 * cookies). Nothing here ever contains secrets.
 */

const LAST_DRAFT_KEY = 'claimledger.review.lastDraftId'
const UNSENT_KEY = 'claimledger.review.unsent'

/** The last opened/check draft id, or null (also null when storage is blocked). */
export function readLastDraftId() {
  try {
    const value = window.sessionStorage.getItem(LAST_DRAFT_KEY)
    return value ? String(value) : null
  } catch {
    return null
  }
}

export function writeLastDraftId(id) {
  if (!id) return
  try {
    window.sessionStorage.setItem(LAST_DRAFT_KEY, String(id))
  } catch {
    /* storage blocked — nothing is remembered, the app still works */
  }
}

export function clearLastDraftId() {
  try {
    window.sessionStorage.removeItem(LAST_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

/** The unsent composer buffer { title, contentType, text }, or null. */
export function readUnsent() {
  try {
    const raw = window.sessionStorage.getItem(UNSENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function writeUnsent({ title, contentType, text }) {
  try {
    window.sessionStorage.setItem(
      UNSENT_KEY,
      JSON.stringify({
        title: String(title ?? ''),
        contentType: String(contentType ?? ''),
        text: String(text ?? ''),
      }),
    )
  } catch {
    /* ignore */
  }
}

export function clearUnsent() {
  try {
    window.sessionStorage.removeItem(UNSENT_KEY)
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------------------------------- */
/* First-run help hint                                                         */
/* -------------------------------------------------------------------------- */

/**
 * "Got it" on the How-to card is a cross-session preference, so it lives in
 * localStorage (sessionStorage would forget it every new tab). Every access
 * is wrapped in try/catch: when storage is blocked the read returns false and
 * the hint simply shows again — nothing crashes.
 */
const HELP_KEY = 'claimledger.review.helpDismissed'

export function readHelpDismissed() {
  try {
    return window.localStorage.getItem(HELP_KEY) === '1'
  } catch {
    return false
  }
}

export function writeHelpDismissed() {
  try {
    window.localStorage.setItem(HELP_KEY, '1')
  } catch {
    /* ignore — the hint will show again next visit */
  }
}

export function clearHelpDismissed() {
  try {
    window.localStorage.removeItem(HELP_KEY)
  } catch {
    /* ignore */
  }
}
