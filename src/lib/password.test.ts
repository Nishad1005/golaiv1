import { describe, expect, it } from 'vitest'
import { passwordStrength } from './password'

describe('passwordStrength', () => {
  it('says nothing when nothing is typed', () => {
    expect(passwordStrength('')).toEqual({ score: 0, label: '' })
  })

  it('calls anything under the minimum weak, however varied', () => {
    expect(passwordStrength('aB3!').label).toBe('Weak')
    expect(passwordStrength('P@ss1').label).toBe('Weak')
  })

  it('rates a bare eight characters fair', () => {
    expect(passwordStrength('password').label).toBe('Fair')
  })

  it('rewards either length or variety', () => {
    expect(passwordStrength('Passw0rd!').label).toBe('Good') // 9 chars, 4 kinds
    expect(passwordStrength('storekeeper1').label).toBe('Good') // 12 chars, 2 kinds
  })

  it('rates a long passphrase strong even without symbols', () => {
    expect(passwordStrength('correcthorsebattery').label).toBe('Strong')
  })

  it('rates long and varied strong', () => {
    expect(passwordStrength('Golai#Store2026').label).toBe('Strong')
  })
})
