#!/usr/bin/env node
/**
 * Claim Ledger — AI Evaluation Runner
 *
 * Runs the labelled test set against the claim-checking API (POST /api/check),
 * compares verdicts and cited fact IDs, measures grounding and reliability,
 * and prints a comprehensive baseline report.
 *
 * Requirements: Node.js >= 20 (uses native fetch). No extra dependencies.
 * Usage:
 *   node server/eval/run-eval.js [BASE_URL]
 * Example:
 *   node server/eval/run-eval.js https://claim-ledger-codefire.onrender.com
 *   node server/eval/run-eval.js http://localhost:4000
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const BASE_URL = (process.argv[2] || 'http://localhost:4000').replace(/\/+$/, '')
const PAUSE_MS = 3500 // Rate limit is 20 req/min/IP -> ~3.5s pause between checks

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeKey(str) {
  return String(str ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

async function main() {
  console.log('='.repeat(70))
  console.log('  CLAIM LEDGER — AI EVALUATION RUNNER')
  console.log('='.repeat(70))
  console.log(`Backend Target : ${BASE_URL}`)
  console.log(`Timestamp      : ${new Date().toISOString()}`)

  // 1. Load test set
  const testsetPath = resolve(__dirname, 'testset.json')
  const testset = JSON.parse(readFileSync(testsetPath, 'utf8'))
  console.log(`Loaded test set: ${testset.length} test items\n`)

  // 2. Fetch active facts and terminology rules for grounding verification
  console.log('Fetching approved Brand Vault facts and terminology for verification...')
  let brandFacts = []
  let brandTerminology = []
  try {
    const factsRes = await fetch(`${BASE_URL}/api/facts`)
    if (factsRes.ok) {
      const data = await factsRes.json()
      brandFacts = Array.isArray(data) ? data : data.facts || []
    }
    const guideRes = await fetch(`${BASE_URL}/api/guidelines`)
    if (guideRes.ok) {
      const data = await guideRes.json()
      brandTerminology = data.terminology || []
    }
    console.log(`Loaded ${brandFacts.length} vault facts and ${brandTerminology.length} terminology rules.\n`)
  } catch (err) {
    console.warn(`Warning: Could not fetch facts/guidelines (${err.message}). Grounding will check local rules.\n`)
  }

  const factMap = new Map()
  for (const f of brandFacts) factMap.set(f._id, f)
  for (const t of brandTerminology) factMap.set(t._id, { _id: t._id, text: `Use “${t.use}”, never “${t.avoid}”.` })

  // 3. Run evaluation across test items
  const results = []
  let detectedCheckMode = 'unknown'

  console.log('Starting evaluation runs (3.5s delay per item for rate limits)...\n')
  console.log(
    'ID'.padEnd(5) +
      'Status'.padEnd(8) +
      'Expected'.padEnd(16) +
      'Actual'.padEnd(16) +
      'FactId'.padEnd(10) +
      'Category'
  )
  console.log('-'.repeat(70))

  for (let i = 0; i < testset.length; i++) {
    const item = testset[i]

    let checkResult = null
    let errorMsg = null

    try {
      const res = await fetch(`${BASE_URL}/api/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: item.text,
          title: 'eval',
        }),
      })

      if (res.status === 429) {
        console.warn(`[${item.id}] Rate limited (429). Retrying after 10s...`)
        await sleep(10000)
        i--
        continue
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      checkResult = await res.json()
    } catch (err) {
      errorMsg = err.message
    }

    // Determine actual verdict and cited fact
    const claims = checkResult?.claims || []
    const firstClaim = claims[0] || null

    if (firstClaim?.checkMode) {
      detectedCheckMode = firstClaim.checkMode
    }

    let actualVerdict = 'unsupported'
    let actualFactId = null
    let actualExcerpt = ''
    let actualSourceType = null

    if (firstClaim) {
      actualVerdict = firstClaim.verdict || 'manual'
      actualFactId = firstClaim.factId || null
      actualExcerpt = firstClaim.excerpt || ''
      actualSourceType = firstClaim.sourceType || null
    } else if (checkResult?.manualReview) {
      actualVerdict = 'manual'
    }

    // Compare with expectations
    const verdictMatch = actualVerdict === item.expected
    const factMatch = !item.expectedFactId || actualFactId === item.expectedFactId
    const isPass = verdictMatch && factMatch

    // Grounding check: does cited factId exist, and does excerpt appear in that fact's text?
    let isGrounded = true
    if (actualFactId) {
      const stored = factMap.get(actualFactId)
      if (!stored) {
        isGrounded = false
      } else if (actualExcerpt) {
        const storedNorm = normalizeKey(stored.text)
        const excerptNorm = normalizeKey(actualExcerpt)
        isGrounded = storedNorm.includes(excerptNorm) || excerptNorm.includes(storedNorm)
      }
    }

    // False verified detection
    const isFalseVerified = actualVerdict === 'verified' && item.expected !== 'verified'

    // Injection vulnerability check
    const isInjectionVulnerable =
      item.category === 'prompt-injection' && actualVerdict === 'verified' && !isGrounded

    const evalRecord = {
      id: item.id,
      text: item.text,
      category: item.category,
      expected: item.expected,
      expectedFactId: item.expectedFactId,
      actualVerdict,
      actualFactId,
      actualExcerpt,
      actualSourceType,
      isPass,
      verdictMatch,
      factMatch,
      isGrounded,
      isFalseVerified,
      isInjectionVulnerable,
      errorMsg,
    }

    results.push(evalRecord)

    const statusStr = isPass ? 'PASS' : 'FAIL'
    const expectedStr = `${item.expected}${item.expectedFactId ? ` (${item.expectedFactId})` : ''}`
    const actualStr = `${actualVerdict}${actualFactId ? ` (${actualFactId})` : ''}`

    console.log(
      item.id.padEnd(5) +
        statusStr.padEnd(8) +
        expectedStr.padEnd(16) +
        actualStr.padEnd(16) +
        (actualFactId || '-').padEnd(10) +
        item.category
    )

    if (i < testset.length - 1) {
      await sleep(PAUSE_MS)
    }
  }

  // 4. Compute Metrics
  const total = results.length
  const totalPass = results.filter((r) => r.isPass).length
  const verdictMatches = results.filter((r) => r.verdictMatch).length
  const overallAccuracy = (verdictMatches / total) * 100

  // Per category accuracy
  const categories = [...new Set(testset.map((t) => t.category))]
  const catStats = {}
  for (const cat of categories) {
    const items = results.filter((r) => r.category === cat)
    const matches = items.filter((r) => r.verdictMatch).length
    catStats[cat] = {
      total: items.length,
      matches,
      acc: ((matches / items.length) * 100).toFixed(1),
    }
  }

  // Source validity: claims citing a factId
  const citingClaims = results.filter((r) => r.actualFactId !== null)
  const groundedCitingClaims = citingClaims.filter((r) => r.isGrounded).length
  const sourceValidity = citingClaims.length > 0 ? ((groundedCitingClaims / citingClaims.length) * 100).toFixed(1) : '100.0'

  // False verified
  const falseVerifiedCount = results.filter((r) => r.isFalseVerified).length

  // Injection resistance
  const injectionItems = results.filter((r) => r.category === 'prompt-injection')
  const injectionPassed = injectionItems.filter((r) => !r.isInjectionVulnerable && r.actualVerdict !== 'verified').length
  const injectionResistance = `${injectionPassed} / ${injectionItems.length}`

  // Manual review rate
  const manualCount = results.filter((r) => r.actualVerdict === 'manual').length
  const manualReviewRate = ((manualCount / total) * 100).toFixed(1)

  // 5. Print Summary
  console.log('\n' + '='.repeat(70))
  console.log('  EVALUATION SUMMARY & BASELINE METRICS')
  console.log('='.repeat(70))
  console.log(`Execution Mode          : ${detectedCheckMode.toUpperCase()}`)
  console.log(`Total Items Evaluated   : ${total}`)
  console.log(`Verdict Accuracy        : ${verdictMatches}/${total} (${overallAccuracy.toFixed(1)}%)`)
  console.log(`Full Exact Match (P/F)  : ${totalPass}/${total} (${((totalPass / total) * 100).toFixed(1)}%)`)
  console.log(`Source Validity         : ${groundedCitingClaims}/${citingClaims.length} (${sourceValidity}%)`)
  console.log(`False "Verified" Rate   : ${falseVerifiedCount} (CRITICAL: 0 is target)`)
  console.log(`Injection Resistance    : ${injectionResistance} prevented false verification`)
  console.log(`Manual Review Rate      : ${manualCount}/${total} (${manualReviewRate}%)\n`)

  console.log('Category Breakdown:')
  console.log('-'.repeat(50))
  for (const [cat, s] of Object.entries(catStats)) {
    console.log(`  - ${cat.padEnd(18)}: ${s.matches}/${s.total} (${s.acc}%)`)
  }
  console.log('-'.repeat(50))

  // Failures list
  const failures = results.filter((r) => !r.isPass)
  console.log(`\nFailures / Divergences (${failures.length}):`)
  for (const f of failures) {
    const reason = !f.verdictMatch
      ? `Verdict mismatch: expected '${f.expected}', got '${f.actualVerdict}'`
      : `FactId mismatch: expected '${f.expectedFactId}', got '${f.actualFactId}'`
    console.log(`  [${f.id}] (${f.category}): ${reason} | Text: "${f.text}"`)
  }

  console.log('\n' + '='.repeat(70))
  console.log('Evaluation finished.')

  return {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    total,
    detectedCheckMode,
    verdictMatches,
    overallAccuracy: overallAccuracy.toFixed(1),
    sourceValidity,
    falseVerifiedCount,
    injectionResistance,
    manualReviewRate,
    catStats,
    failures,
  }
}

main().catch((err) => {
  console.error('Fatal error running evaluation:', err)
  process.exit(1)
})

