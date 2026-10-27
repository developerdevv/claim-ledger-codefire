import { Router } from 'express'
import { dbState } from '../db.js'

const router = Router()

// Keep-alive-safe health target: no database query, no seed, no external call.
router.get('/', (_req, res) => {
  res.json({ ok: true, mode: 'live', db: dbState() })
})

export default router
