import { supabase } from './supabase'

/**
 * Item code policy (owner rule, non-negotiable):
 * - If the client already has a code for an item (their own or from another
 *   ERP), it is stored VERBATIM — never renamed, normalized, or renumbered.
 *   Changing codes mid-operation delays the floor and breaks ERP reconciliation.
 * - A new code is auto-assigned ONLY when the item has no code at all.
 *
 * Allocation goes through next_item_code(), a guarded wrapper (migration 0024).
 * The raw next_sequence() is not callable by clients — 0017 locked it down so
 * document numbering (GRN/ISS/DC) cannot be advanced by a crafted API call.
 */
export async function resolveItemCode(existingCode: string | null | undefined): Promise<string> {
  const trimmed = existingCode?.trim()
  if (trimmed) return trimmed // keep client's code exactly as given

  const { data, error } = await supabase.rpc('next_item_code')
  if (error) throw new Error(`Could not allocate item code: ${error.message}`)
  return data as string
}

/**
 * Reserve a block of auto-codes in one call — for CSV import, where allocating
 * one per row would mean a network round-trip per un-coded item. Returns codes
 * in order; assign them to the un-coded rows in the same order.
 */
export async function allocateItemCodes(count: number): Promise<string[]> {
  if (count <= 0) return []
  const { data, error } = await supabase.rpc('next_item_codes', { p_count: count })
  if (error) throw new Error(`Could not allocate item codes: ${error.message}`)
  return (data ?? []) as string[]
}
