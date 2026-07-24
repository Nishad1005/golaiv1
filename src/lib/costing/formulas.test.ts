import { describe, expect, it } from 'vitest'
import { computeLine, summarise } from './formulas'

/**
 * The numbers below are taken from U&M's real chair sheet, so these tests prove
 * we reproduce what they get today rather than merely something plausible.
 */
describe('computeLine — against the real chair sheet', () => {
  it('wood: (2.75 × 3 × 2.5 ÷ 144) × 5 cft @ 2200 = 1575.52', () => {
    const r = computeLine('volume_rate', {
      length: 2.75, width: 3, thickness: 2.5, qty: 5, rate: 2200,
    })
    expect(r.derived.cft).toBeCloseTo(0.716146, 5)
    expect(r.amount).toBeCloseTo(1575.52, 2)
  })

  it('plywood: 67 × 24 sqft × 3 ÷ 4 per sheet = 1206', () => {
    const r = computeLine('area_yield', { area: 24, qty: 3, per_sheet: 4, rate: 67 })
    expect(r.amount).toBeCloseTo(1206, 2)
  })

  it('foam: sheet price 2100 ÷ 2 per sheet × 1 = 1050', () => {
    const r = computeLine('sheet_yield', { qty: 1, per_sheet: 2 }, 2100)
    expect(r.amount).toBeCloseTo(1050, 2)
  })

  it('spring: 2.5 ft × 5 × 10 = 125', () => {
    expect(computeLine('length_rate', { length: 2.5, qty: 5, rate: 10 }).amount).toBe(125)
  })

  it('fabric: 4.65 m @ 900 = 4185', () => {
    expect(computeLine('qty_rate', { qty: 4.65, rate: 900 }).amount).toBeCloseTo(4185, 2)
  })

  it('carton CBM: 33 × 33 × 34 inches = 0.6067', () => {
    const r = computeLine('cbm', { length: 33, width: 33, height: 34 })
    expect(r.derived.cbm).toBeCloseTo(0.606749, 5)
  })

  it('carton board area: (33+33+3)×2×(33+34+2)×60/1550 = 368.59', () => {
    const r = computeLine('carton_area', { length: 33, width: 33, height: 34, gsm: 60 })
    expect(r.amount).toBeCloseTo(368.59, 2)
  })

  it('packing allocation: 2000/84 + 150×0.6067 + 150 = 264.82', () => {
    const r = computeLine('container_alloc', {
      freight: 2000, per_container: 84, cbm: 0.6067487646, handling: 150,
    }, 150)
    expect(r.amount).toBeCloseTo(264.82, 2)
  })

  it('fixed: takes the amount as typed', () => {
    expect(computeLine('fixed', { amount: 950 }).amount).toBe(950)
  })
})

describe('the silent-zero their spreadsheet cannot catch', () => {
  it('flags a rate with no quantity', () => {
    const r = computeLine('qty_rate', { qty: 0, rate: 15 })
    expect(r.amount).toBe(0)
    expect(r.warning).toMatch(/no quantity/i)
  })

  it('flags a quantity with no rate', () => {
    expect(computeLine('qty_rate', { qty: 5, rate: 0 }).warning).toMatch(/no rate/i)
  })

  it('says nothing when the line is genuinely empty', () => {
    expect(computeLine('qty_rate', { qty: 0, rate: 0 }).warning).toBeUndefined()
  })

  it('refuses to divide by a missing pieces-per-sheet', () => {
    const r = computeLine('sheet_yield', { qty: 2, per_sheet: 0 }, 1000)
    expect(r.amount).toBe(0)
    expect(r.warning).toMatch(/pieces per sheet/i)
  })
})

describe('summarise', () => {
  const lines = [
    { categoryId: 'w', categoryName: 'Wood', amount: 4745.05 },
    { categoryId: 'f', categoryName: 'Fabric', amount: 4185 },
    { categoryId: 'w', categoryName: 'Wood', amount: 0 },
  ]

  it('groups by category, biggest first, with percentages', () => {
    const s = summarise(lines, 0, 0)
    expect(s.byCategory[0]).toMatchObject({ name: 'Wood' })
    expect(s.subtotal).toBeCloseTo(8930.05, 2)
    expect(s.byCategory[0].pct + s.byCategory[1].pct).toBeCloseTo(100, 6)
  })

  it('applies margin on top of subtotal + GST, as their sheet does', () => {
    const s = summarise([{ categoryId: 'a', categoryName: 'A', amount: 16759.71 }], 0, 40)
    expect(s.overheadMargin).toBeCloseTo(6703.88, 2)
    expect(s.total).toBeCloseTo(23463.59, 2)
  })

  it('handles an empty sheet without dividing by zero', () => {
    const s = summarise([], 18, 40)
    expect(s.total).toBe(0)
    expect(s.byCategory).toEqual([])
  })
})
