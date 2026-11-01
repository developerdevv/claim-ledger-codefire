import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

import app from '../src/app.js'
import { config } from '../src/config.js'
import { Claim } from '../src/models/Claim.js'
import { Override } from '../src/models/Override.js'
import { runSeed } from '../src/seed/runSeed.js'

const IP = '203.0.113.60'
const withIp = (req, ip = IP) => req.set('X-Forwarded-For', ip)

async function claimsOf(draftId) {
  const res = await withIp(request(app).get(`/api/drafts/${draftId}`)).expect(200)
  return res.body.claims
}

beforeEach(async () => {
  config.demoMode = true
  await runSeed()
  await Override.deleteMany({})
  await Claim.updateMany({}, { dismissal: null })
})

describe('Guideline Health: reviewer flag dismissals', () => {
  it('starts empty', async () => {
    const res = await withIp(request(app).get('/api/guideline-health')).expect(200)
    expect(res.body).toEqual({ totalOverrides: 0, items: [] })
  })

  it('requires a reason of at least 3 characters', async () => {
    const flagged = (await claimsOf('D-1')).find((c) => c.verdict !== 'verified')
    const res = await withIp(
      request(app).patch(`/api/drafts/D-1/claims/${flagged._id}/dismiss`).send({ reason: 'x' }),
    ).expect(400)
    expect(res.body.error).toMatch(/reason/i)
    expect(await Override.countDocuments({})).toBe(0)
  })

  it('refuses to dismiss a verified claim', async () => {
    const verified = (await claimsOf('D-1')).find((c) => c.verdict === 'verified')
    const res = await withIp(
      request(app)
        .patch(`/api/drafts/D-1/claims/${verified._id}/dismiss`)
        .send({ reason: 'Not actually a problem' }),
    ).expect(400)
    expect(res.body).toEqual({ error: 'Only flagged claims can be dismissed.' })
  })

  it('returns 404 for a claim that is not on that draft', async () => {
    const flagged = (await claimsOf('D-1')).find((c) => c.verdict !== 'verified')
    await withIp(
      request(app)
        .patch(`/api/drafts/D-4/claims/${flagged._id}/dismiss`)
        .send({ reason: 'Wrong draft on purpose' }),
    ).expect(404)
  })

  it('counts a repeated dismissal only once', async () => {
    const flagged = (await claimsOf('D-1')).find((c) => c.verdict !== 'verified')
    const url = `/api/drafts/D-1/claims/${flagged._id}/dismiss`
    const first = await withIp(request(app).patch(url).send({ reason: 'Approved by legal' })).expect(200)
    await withIp(request(app).patch(url).send({ reason: 'Approved by legal' })).expect(200)

    expect(first.body.dismissal.reason).toBe('Approved by legal')
    expect(await Override.countDocuments({})).toBe(1)
  })

  it('undoes a dismissal and removes it from the log', async () => {
    const flagged = (await claimsOf('D-1')).find((c) => c.verdict !== 'verified')
    const url = `/api/drafts/D-1/claims/${flagged._id}/dismiss`
    await withIp(request(app).patch(url).send({ reason: 'Approved by legal' })).expect(200)
    const undone = await withIp(request(app).delete(url)).expect(200)

    expect(undone.body.dismissal).toBeNull()
    expect(await Override.countDocuments({})).toBe(0)
  })

  it('ranks the most-overridden source first and keeps reasons', async () => {
    const flagged = (await claimsOf('D-1')).filter((c) => c.verdict !== 'verified')
    expect(flagged.length).toBeGreaterThanOrEqual(2)

    for (const claim of flagged) {
      await withIp(
        request(app)
          .patch(`/api/drafts/D-1/claims/${claim._id}/dismiss`)
          .send({ reason: `Reviewer says ${claim._id} is fine` }),
      ).expect(200)
    }

    const res = await withIp(request(app).get('/api/guideline-health')).expect(200)
    expect(res.body.totalOverrides).toBe(flagged.length)
    expect(res.body.items.length).toBeGreaterThan(0)

    const counts = res.body.items.map((item) => item.count)
    expect([...counts].sort((a, b) => b - a)).toEqual(counts)
    expect(res.body.items[0].reasons.length).toBeGreaterThan(0)
    expect(res.body.items[0].label).toBeTruthy()
  })
})
