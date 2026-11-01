import { describe, expect, it } from 'vitest'
import { runTextChecks } from '../src/services/textChecks.js'

const ids = (text) => runTextChecks(text).map((f) => f.ruleId)

describe('readability and accessibility checks', () => {
  it('leaves clean copy alone', () => {
    expect(runTextChecks('Free delivery on all orders above ₹499.')).toEqual([])
  })

  it('flags vague link text', () => {
    expect(ids('Click here to see the offer.')).toContain('A-1')
  })

  it('flags a run of capitals', () => {
    expect(ids('Please BUY NOW AND SAVE BIG today.')).toContain('A-2')
  })

  it('flags a long lowercase hashtag but not a CamelCase one', () => {
    expect(ids('Join us #freedeliveryindia')).toContain('A-3')
    expect(ids('Join us #FreeDeliveryIndia')).not.toContain('A-3')
  })

  it('flags a string of emoji', () => {
    expect(ids('Sale is on 🎉🎉🎉🎉🎉')).toContain('A-4')
  })

  it('flags a sentence over 30 words', () => {
    expect(ids(`${'word '.repeat(35)}end.`)).toContain('R-1')
  })

  it('handles empty and missing input', () => {
    expect(runTextChecks('')).toEqual([])
    expect(runTextChecks(null)).toEqual([])
    expect(runTextChecks(undefined)).toEqual([])
  })
})