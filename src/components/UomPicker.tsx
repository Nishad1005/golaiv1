import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { logActivity } from '../lib/audit'
import { UOM_GROUPS, UOM_UNITS, uomLabel } from '../lib/uom'

interface Props {
  itemId: string
  /** The product's current unit. */
  value: string
  /** Called after the change persists, so the parent can refresh its copy. */
  onChanged?: (uom: string) => void
  className?: string
}

/**
 * Pick a product's unit right where a quantity is entered.
 *
 * The chosen unit becomes the product's unit (one unit per product keeps its
 * stock totalable), saved through the guarded `set_item_uom` RPC so a
 * storekeeper can do it too. On success we invalidate the item caches so every
 * other screen shows the new unit immediately.
 */
export function UomPicker({ itemId, value, onChanged, className }: Props) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: async (uom: string) => {
      const { error } = await supabase.rpc('set_item_uom', { p_item_id: itemId, p_uom: uom })
      if (error) throw new Error(error.message)
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'update.item_uom', entityType: 'item', entityId: itemId, after: { uom },
      })
    },
    onSuccess: (_d, uom) => {
      // Every place that reads a product's unit.
      for (const key of ['items', 'item-locator', 'assign-item-search', 'adjust-item-search',
        'place-contents', 'count-expected', 'stock-by-zone', 'zone-stock', 'item-card', 'item-movements']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
      onChanged?.(uom)
    },
  })

  // Show the current value even if it's off the canonical list, so nothing is
  // force-changed and the select never lands on a blank.
  const known = UOM_UNITS.some((u) => u.value === value)

  return (
    <select
      className={className ?? 'h-11 rounded-xl border border-ink-200 bg-white px-2 text-sm disabled:opacity-60'}
      value={value}
      disabled={save.isPending}
      onChange={(e) => save.mutate(e.target.value)}
      aria-label="Unit"
      title={save.isError ? (save.error as Error).message : 'Unit for this product'}
    >
      {!known && value && <option value={value}>{uomLabel(value)}</option>}
      {UOM_GROUPS.map((g) => (
        <optgroup key={g} label={g}>
          {UOM_UNITS.filter((u) => u.group === g).map((u) => (
            <option key={u.value} value={u.value}>{u.label} ({u.value})</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
