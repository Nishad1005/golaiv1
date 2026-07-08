import { beforeEach, describe, expect, it, vi } from 'vitest'

// The owner's non-negotiable rule: client item codes are stored VERBATIM;
// a new ITM- code is allocated ONLY when no code exists at all.
const rpcMock = vi.fn()
vi.mock('./supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}))

import { resolveItemCode } from './itemCode'

beforeEach(() => rpcMock.mockReset())

describe('resolveItemCode', () => {
  it('keeps an existing client code exactly as given', async () => {
    expect(await resolveItemCode('AU162590')).toBe('AU162590')
    expect(rpcMock).not.toHaveBeenCalled() // no sequence consumed
  })

  it('never normalizes case, separators, or format of client codes', async () => {
    expect(await resolveItemCode('fab/cup-cake_01 a')).toBe('fab/cup-cake_01 a')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('trims surrounding whitespace only', async () => {
    expect(await resolveItemCode('  AU162590  ')).toBe('AU162590')
  })

  it('auto-assigns ITM-NNNNN only when the code is empty', async () => {
    rpcMock.mockResolvedValue({ data: 42, error: null })
    expect(await resolveItemCode('')).toBe('ITM-00042')
    expect(await resolveItemCode(null)).toBe('ITM-00042')
    expect(await resolveItemCode('   ')).toBe('ITM-00042')
    expect(rpcMock).toHaveBeenCalledWith('next_sequence', { seq_name: 'item_code' })
  })

  it('surfaces sequence allocation failures', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'offline' } })
    await expect(resolveItemCode(undefined)).rejects.toThrow('Could not allocate item code')
  })
})
