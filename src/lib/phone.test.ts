import { describe, expect, it } from 'vitest'
import { looksLikePhone, normalizePhone } from './phone'

describe('normalizePhone', () => {
  it('prepends +91 to a bare 10-digit Indian mobile', () => {
    expect(normalizePhone('9829012345')).toBe('+919829012345')
  })

  it('handles spaces, dashes and parens', () => {
    expect(normalizePhone('98290 12345')).toBe('+919829012345')
    expect(normalizePhone('98290-12345')).toBe('+919829012345')
    expect(normalizePhone('(98290) 12345')).toBe('+919829012345')
  })

  it('strips a leading trunk zero', () => {
    expect(normalizePhone('09829012345')).toBe('+919829012345')
  })

  it('keeps international numbers as-is', () => {
    expect(normalizePhone('+91 98290 12345')).toBe('+919829012345')
    expect(normalizePhone('+14155552671')).toBe('+14155552671')
  })

  it('accepts country code typed without the +', () => {
    expect(normalizePhone('919829012345')).toBe('+919829012345')
  })

  it('rejects emails, garbage, and wrong lengths', () => {
    expect(normalizePhone('user@test.com')).toBeNull()
    expect(normalizePhone('hello')).toBeNull()
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('+12')).toBeNull()
  })
})

describe('looksLikePhone', () => {
  it.each(['9829012345', '+91 98290 12345', '098290-12345'])('true for %s', (v) => {
    expect(looksLikePhone(v)).toBe(true)
  })

  it.each(['user@test.com', 'merchant@uandm.co.in', 'abc123', '', '12'])('false for %s', (v) => {
    expect(looksLikePhone(v)).toBe(false)
  })
})
