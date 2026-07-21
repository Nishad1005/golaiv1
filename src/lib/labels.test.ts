import { describe, expect, it } from 'vitest'
import { __testables } from './labels'

const { nameWithoutCode } = __testables

// Client masters often repeat the code inside the product name; the label must
// not print it twice.
describe('nameWithoutCode', () => {
  it('strips a trailing code from the name', () => {
    expect(nameWithoutCode('0.75MM WIRE UNMPL/SKU/25-26/2229', 'UNMPL/SKU/25-26/2229')).toBe(
      '0.75MM WIRE',
    )
  })

  it('strips a leading code and tidies separators', () => {
    expect(nameWithoutCode('UM-000939 - Thread mara30', 'UM-000939')).toBe('Thread mara30')
    expect(nameWithoutCode('UM-000939: Thread mara30', 'UM-000939')).toBe('Thread mara30')
  })

  it('is case-insensitive', () => {
    expect(nameWithoutCode('Foam Block hw-0042', 'HW-0042')).toBe('Foam Block')
  })

  it('leaves a name that does not contain the code untouched', () => {
    expect(nameWithoutCode('Cupcake Fabric — Beige', 'AU162590')).toBe('Cupcake Fabric — Beige')
  })

  it('keeps the name when it is only the code (never blank)', () => {
    expect(nameWithoutCode('UM-000939', 'UM-000939')).toBe('UM-000939')
  })
})
