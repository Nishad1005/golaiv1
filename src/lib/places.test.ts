import { describe, expect, it } from 'vitest'
import { locationLabel, prefixFor } from './places'

describe('prefixFor', () => {
  it('takes the first letter of whatever the client types', () => {
    expect(prefixFor('Ghoda')).toBe('G')
    expect(prefixFor('shelf')).toBe('S')
    expect(prefixFor('Rack')).toBe('R')
    expect(prefixFor('  machan ')).toBe('M')
  })

  it('ignores leading non-letters and falls back sensibly', () => {
    expect(prefixFor('1st Floor Bin')).toBe('F')
    expect(prefixFor('')).toBe('S')
    expect(prefixFor('123')).toBe('S')
  })
})

describe('locationLabel', () => {
  it('derives the client wording from type + code number', () => {
    expect(locationLabel({ code: 'Z03-G001', fixture_type: 'Ghoda' })).toBe('Ghoda 1')
    expect(locationLabel({ code: 'Z01-S012', fixture_type: 'Shelf' })).toBe('Shelf 12')
  })

  it('prefers an explicit description when present', () => {
    expect(
      locationLabel({ code: 'Z03-G001', fixture_type: 'Ghoda', description: 'Foam Sheet 40D' }),
    ).toBe('Foam Sheet 40D')
  })

  it('falls back to the code when it has no trailing number', () => {
    expect(locationLabel({ code: 'ODDCODE', fixture_type: 'Ghoda' })).toBe('ODDCODE')
  })

  it('uses a neutral word when no type is set', () => {
    expect(locationLabel({ code: 'Z03-G001' })).toBe('Location 1')
  })
})
