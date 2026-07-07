import { supabase } from './supabase'

/**
 * Item code policy (owner rule, non-negotiable):
 * - If the client already has a code for an item (their own or from another
 *   ERP), it is stored VERBATIM — never renamed, normalized, or renumbered.
 *   Changing codes mid-operation delays the floor and breaks ERP reconciliation.
 * - A new code is auto-assigned ONLY when the item has no code at all.
 */
export async function resolveItemCode(existingCode: string | null | undefined): Promise<string> {
  const trimmed = existingCode?.trim()
  if (trimmed) return trimmed // keep client's code exactly as given

  const { data, error } = await supabase.rpc('next_sequence', { seq_name: 'item_code' })
  if (error) throw new Error(`Could not allocate item code: ${error.message}`)
  return `ITM-${String(data).padStart(5, '0')}`
}
