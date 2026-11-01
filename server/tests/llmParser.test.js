import { describe, it, expect } from 'vitest'
import { parseProposals } from '../src/services/llmClient.js'

const base = { text: 'Free delivery above Rs 499.', verdict: 'verified' }

describe('model proposal parser', () => {
  it('accepts a complete proposal', () => {
    const out = parseProposals(JSON.stringify([
      { ...base, factId: 'F-001', excerpt: 'Free delivery', explanation: 'ok', suggestion: null, uncertainty: 'low' },
    ]))
    expect(out[0].uncertainty).toBe('low')
  })

  it('accepts omitted optional fields and empty strings', () => {
    const out = parseProposals(JSON.stringify([{ ...base, factId: '', excerpt: '' }]))
    expect(out[0].factId).toBeNull()
    expect(out[0].explanation).toBe('')
  })

  it('turns an unexpected uncertainty value into null', () => {
    const out = parseProposals(JSON.stringify([{ ...base, uncertainty: 0.9 }]))
    expect(out[0].uncertainty).toBeNull()
  })

  it('accepts a JSON array wrapped in a markdown fence', () => {
    const out = parseProposals('```json\n' + JSON.stringify([base]) + '\n```')
    expect(out).toHaveLength(1)
  })

  it('rejects text that is not a claims array', () => {
    expect(() => parseProposals('Sorry, I cannot help.')).toThrow()
  })
})
