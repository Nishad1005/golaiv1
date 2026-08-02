import { describe, expect, it } from 'vitest'
import { num, sumQty } from './qty'

describe('num', () => {
  it('passes numbers through', () => {
    expect(num(35)).toBe(35)
    expect(num(2.5)).toBe(2.5)
  })
  it('coerces numeric strings (Postgres numeric via supabase-js)', () => {
    expect(num('10')).toBe(10)
    expect(num('2.5')).toBe(2.5)
  })
  it('treats null / undefined / junk as 0', () => {
    expect(num(null)).toBe(0)
    expect(num(undefined)).toBe(0)
    expect(num('' as unknown as string)).toBe(0)
    expect(num('abc')).toBe(0)
  })
})

describe('sumQty', () => {
  it('adds numeric-strings instead of concatenating them', () => {
    // The actual bug: 0 + '10' + '5' + '20' === '0105 20' without coercion.
    const rows = [{ q: '10' }, { q: '5' }, { q: '20' }]
    expect(sumQty(rows, (r) => r.q)).toBe(35)
  })
  it('mixes numbers and strings, skips nulls', () => {
    const rows = [{ q: 10 }, { q: '5.5' }, { q: null }]
    expect(sumQty(rows, (r) => r.q)).toBe(15.5)
  })
  it('is 0 for an empty list', () => {
    expect(sumQty([], (r: { q: number }) => r.q)).toBe(0)
  })
})
