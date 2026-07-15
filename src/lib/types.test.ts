import { describe, expect, it } from 'vitest'
import { SHELF_CODE_REGEX } from './types'

// Shelf codes: Z<zone>-<fixture prefix><number>; prefix letters come from the
// client's own fixture name (Shelf/Ghoda/anything), so any letters are valid.
describe('SHELF_CODE_REGEX', () => {
  it.each(['Z02-S012', 'Z1-G3', 'Z11-P100', 'Z07-R001', 'z02-s012', 'Z02-X012', 'Z13-GH005'])(
    'accepts %s',
    (code) => {
      expect(SHELF_CODE_REGEX.test(code)).toBe(true)
    },
  )

  it.each(['Z02S012', 'A02-S012', 'Z02-S', 'Z-S012', 'Z02_S012', 'Z02-012', ''])(
    'rejects %s',
    (code) => {
      expect(SHELF_CODE_REGEX.test(code)).toBe(false)
    },
  )
})
