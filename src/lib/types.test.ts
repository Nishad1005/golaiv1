import { describe, expect, it } from 'vitest'
import { SHELF_CODE_REGEX } from './types'

// PRD 4.1: shelf codes are Z<zone>-<fixture><number>, fixture S/G/P/R
describe('SHELF_CODE_REGEX', () => {
  it.each(['Z02-S012', 'Z1-G3', 'Z11-P100', 'Z07-R001', 'z02-s012'])('accepts %s', (code) => {
    expect(SHELF_CODE_REGEX.test(code)).toBe(true)
  })

  it.each(['Z02S012', 'A02-S012', 'Z02-X012', 'Z02-S', 'Z-S012', 'Z02_S012', ''])(
    'rejects %s',
    (code) => {
      expect(SHELF_CODE_REGEX.test(code)).toBe(false)
    },
  )
})
