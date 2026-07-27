import { describe, expect, it } from 'vitest'
import { normalizeUom, uomLabel, UOM_UNITS } from './uom'

describe('normalizeUom', () => {
  it('maps the units the client named to canonical codes', () => {
    expect(normalizeUom('Metre')).toBe('m')
    expect(normalizeUom('KG')).toBe('kg')
    expect(normalizeUom('sq ft')).toBe('sqft')
    expect(normalizeUom('sq.mt')).toBe('sqm')
    expect(normalizeUom('Pieces')).toBe('pcs')
    expect(normalizeUom('rolls')).toBe('roll')
    expect(normalizeUom('Litres')).toBe('L')
    expect(normalizeUom('grams')).toBe('g')
    expect(normalizeUom('feet')).toBe('ft')
    expect(normalizeUom('inch')).toBe('in')
    expect(normalizeUom('yard')).toBe('yd')
    expect(normalizeUom('sheet')).toBe('sheet')
    expect(normalizeUom('packet')).toBe('pkt')
  })

  it('is insensitive to case, spaces, dots and dashes', () => {
    expect(normalizeUom('  MTR ')).toBe('m')
    expect(normalizeUom('Sq. Ft.')).toBe('sqft')
    expect(normalizeUom('kilo-gram')).toBe('kg')
  })

  it('defaults empty to pcs', () => {
    expect(normalizeUom('')).toBe('pcs')
    expect(normalizeUom(null)).toBe('pcs')
    expect(normalizeUom('   ')).toBe('pcs')
  })

  it('keeps an already-canonical code', () => {
    expect(normalizeUom('m')).toBe('m')
    expect(normalizeUom('sqft')).toBe('sqft')
  })

  it('returns an unrecognised unit trimmed, never silently forced', () => {
    expect(normalizeUom('widgets')).toBe('widgets')
    expect(normalizeUom('  bolt ')).toBe('bolt')
  })
})

describe('uomLabel', () => {
  it('shows the friendly name for a code', () => {
    expect(uomLabel('m')).toBe('Metre')
    expect(uomLabel('pcs')).toBe('Pieces')
    expect(uomLabel('sqft')).toBe('Sq. feet')
  })

  it('falls back to the code for anything off-list', () => {
    expect(uomLabel('widgets')).toBe('widgets')
    expect(uomLabel('')).toBe('')
  })
})

describe('UOM_UNITS', () => {
  it('has unique values', () => {
    expect(new Set(UOM_UNITS.map((u) => u.value)).size).toBe(UOM_UNITS.length)
  })
})
