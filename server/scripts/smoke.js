#!/usr/bin/env node

/**
 * Deployment smoke test — Node 20's built-in fetch only; no dependencies.
 *
 * Usage:
 *   npm run smoke -- http://localhost:4000
 *   npm run smoke -- https://your-service.onrender.com
 *   npm run smoke -- https://your-service.onrender.com/api
 *
 * It creates two ordinary drafts and appends one ordinary demo decision. It
 * does NOT reset the database and does NOT edit approved facts, so it is safe
 * to run against a long-lived deployed demo (subject to normal demo data use).
 */

const input = process.argv[2]

if (!input) {
  console.error('Usage: npm run smoke -- <BASE_URL>')
  process.exitCode = 1
} else {
  const normalized = input.replace(/\/+$/, '')
  const apiBase = normalized.endsWith('/api') ? normalized : `${normalized}/api`
  const runLabel = `smoke-${new Date().toISOString().replace(/[:.]/g, '-')}`
  const summary = { passed: 0, failed: 0, skipped: 0 }

  function compactError(value) {
    const source =
      value && typeof value === 'object' && typeof value.error === 'string'
        ? value.error
        : typeof value === 'string'
          ? value
          : 'No response message.'
    return source.replace(/\s+/g, ' ').slice(0, 280)
  }

  async function request(method, path, body) {
    let response
    try {
      response = await fetch(`${apiBase}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch (error) {
      throw new Error(`${method} ${path} network error: ${error.message}`)
    }

    const raw = await response.text()
    let data = null
    if (raw) {
      try {
        data = JSON.parse(raw)
      } catch {
        data = raw
      }
    }

    if (!response.ok) {
      throw new Error(`${method} ${path} returned HTTP ${response.status}: ${compactError(data)}`)
    }
    return data
  }

  async function step(name, action) {
    try {
      const result = await action()
      summary.passed += 1
      console.log(`PASS  ${name}`)
      return result
    } catch (error) {
      summary.failed += 1
      console.error(`FAIL  ${name} — ${error.message}`)
      return null
    }
  }

  function skip(name, reason) {
    summary.skipped += 1
    console.log(`SKIP  ${name} — ${reason}`)
  }

  const health = await step('health endpoint', async () => {
    const data = await request('GET', '/health')
    if (data?.ok !== true) throw new Error('Response did not include ok: true.')
    return data
  })

  const facts = await step('active demo facts available', async () => {
    const data = await request('GET', '/facts')
    if (!Array.isArray(data)) throw new Error('Expected a bare facts array.')
    if (!data.some((fact) => fact?._id === 'F-001')) {
      throw new Error('Expected seeded fact F-001. Set SEED_ON_START=true or run npm run seed.')
    }
    return data
  })

  await step('guidelines and terminology endpoint', async () => {
    const data = await request('GET', '/guidelines')
    if (!Array.isArray(data?.guidelines) || !Array.isArray(data?.terminology)) {
      throw new Error('Expected { guidelines: [], terminology: [] }.')
    }
    return data
  })

  const checked = await step('check creates a draft', async () => {
    const data = await request('POST', '/check', {
      title: `${runLabel} checked draft`,
      contentType: 'Smoke test',
      text: 'Free delivery on all orders above ₹499 within India.',
    })
    if (!data?.draftId || !Array.isArray(data?.claims) || typeof data?.manualReview !== 'boolean') {
      throw new Error('Expected { draftId, claims, manualReview }.')
    }
    return data
  })

  if (checked?.draftId) {
    await step('checked draft can be read', async () => {
      const data = await request('GET', `/drafts/${encodeURIComponent(checked.draftId)}`)
      if (data?.draft?._id !== checked.draftId || !Array.isArray(data?.claims)) {
        throw new Error('Draft detail response did not match the created checked draft.')
      }
      return data
    })

    await step('review decision is recorded', async () => {
      const data = await request('PATCH', `/drafts/${encodeURIComponent(checked.draftId)}/decision`, {
        decision: 'approved',
        actor: 'Smoke script',
      })
      if (data?.status !== 'approved') throw new Error('Expected approved draft status.')
      if (!Array.isArray(data?.decisions) || data.decisions.at(-1)?.actor !== 'Smoke script') {
        throw new Error('Expected the decision to be appended to decisions[].')
      }
      return data
    })

    await step('edited checked draft re-enters review', async () => {
      const data = await request('POST', '/check', {
        draftId: checked.draftId,
        title: `${runLabel} checked draft — edited`,
        contentType: 'Smoke test',
        text: 'Get free delivery on all orders above ₹499.',
      })
      if (data?.draftId !== checked.draftId) throw new Error('Check did not update the intended draft.')

      const detail = await request('GET', `/drafts/${encodeURIComponent(checked.draftId)}`)
      if (detail?.draft?.status !== 'in_review') {
        throw new Error('Changed text did not reset the draft status to in_review.')
      }
      if (!detail.draft.decisions?.some((decision) => decision.actor === 'Smoke script')) {
        throw new Error('The existing decision was not retained after the edit.')
      }
      return detail
    })

    await step('stored-text recheck alias', async () => {
      const data = await request('POST', `/drafts/${encodeURIComponent(checked.draftId)}/recheck`)
      if (data?.draftId !== checked.draftId || !Array.isArray(data?.claims)) {
        throw new Error('Expected recheck response for the same draft.')
      }
      return data
    })
  } else {
    skip('checked draft read / decision / recheck flow', 'the check-create step failed')
  }

  await step('bare draft creation', async () => {
    const data = await request('POST', '/drafts', {
      title: `${runLabel} bare draft`,
      contentType: 'Smoke test',
      text: 'A bare draft is created without a check.',
    })
    if (!data?._id || data.status !== 'in_review' || !Array.isArray(data?.decisions)) {
      throw new Error('Expected a bare in_review draft with decisions[].')
    }
    return data
  })

  await step('impact and history feeds', async () => {
    const [impact, history] = await Promise.all([
      request('GET', '/impact'),
      request('GET', '/history'),
    ])
    if (!Array.isArray(impact) || !Array.isArray(history)) {
      throw new Error('Expected bare arrays from both feeds.')
    }
    return { impact, history }
  })

  if (!health || !facts) {
    console.error('Smoke prerequisites failed; inspect the failed health/facts step above.')
  }

  console.log(
    `\nSummary: ${summary.passed} PASS, ${summary.failed} FAIL, ${summary.skipped} SKIP (${apiBase})`,
  )
  if (summary.failed > 0) process.exitCode = 1
}
