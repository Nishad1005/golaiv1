import { describe, expect, it } from 'vitest'
import { minutesLeft, undoWindowLabel } from './settings'

const inMinutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString()

describe('minutesLeft', () => {
  it('is zero when nothing is set', () => {
    expect(minutesLeft(null)).toBe(0)
  })

  it('never goes negative once the window has closed', () => {
    expect(minutesLeft(inMinutes(-90))).toBe(0)
  })

  it('counts the remaining minutes', () => {
    expect(minutesLeft(inMinutes(45))).toBeGreaterThanOrEqual(44)
    expect(minutesLeft(inMinutes(45))).toBeLessThanOrEqual(45)
  })
})

describe('undoWindowLabel', () => {
  it('says nothing once the window has closed', () => {
    expect(undoWindowLabel(inMinutes(-1))).toBeNull()
    expect(undoWindowLabel(null)).toBeNull()
  })

  it('counts in minutes under an hour', () => {
    expect(undoWindowLabel(inMinutes(12))).toMatch(/^1[12] minutes left$/)
  })

  it('switches to hours past the hour, rounding down', () => {
    expect(undoWindowLabel(inMinutes(150))).toBe('2 hours left')
    expect(undoWindowLabel(inMinutes(61))).toBe('1 hour left')
  })
})
