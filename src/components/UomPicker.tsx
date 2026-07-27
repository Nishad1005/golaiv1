import { useEffect, useState } from 'react'
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
 * storekeeper can do it too.
 *
 * The select is optimistic: it shows the new unit immediately rather than
 * waiting for the save round-trip (which otherwise looks like "it won't
 * select"). If the save fails it reverts and shows why — including the tell-tale
 * "function set_item_uom does not exist" when migration 0029 hasn't been run.
 */
export function UomPicker({ itemId, value, onChanged, className }: Props) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [sel, setSel] = useState(value)

  // Follow the product's unit when the parent changes it (refetch / onChanged).
  useEffect(() => { setSel(value) }, [value])

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
      for (const key of ['items', 'item-locator', 'assign-item-search', 'adjust-item-search',
        'place-contents', 'count-expected', 'stock-by-zone', 'zone-stock', 'item-card', 'item-movements']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
      onChanged?.(uom)
    },
    onError: () => setSel(value), // revert the optimistic pick
  })

  const known = UOM_UNITS.some((u) => u.value === sel)

  return (
    <span className="inline-flex flex-col gap-1">
      <select
        className={className ?? 'h-11 rounded-xl border border-ink-200 bg-white px-2 text-sm disabled:opacity-60'}
        value={sel}
        disabled={save.isPending}
        onChange={(e) => { setSel(e.target.value); save.mutate(e.target.value) }}
        aria-label="Unit"
      >
        {!known && sel && <option value={sel}>{uomLabel(sel)}</option>}
        {UOM_GROUPS.map((g) => (
          <optgroup key={g} label={g}>
            {UOM_UNITS.filter((u) => u.group === g).map((u) => (
              <option key={u.value} value={u.value}>{u.label} ({u.value})</option>
            ))}
          </optgroup>
        ))}
      </select>
      {save.isError && (
        <span className="text-xs font-medium text-red-600">
          {(save.error as Error).message.includes('set_item_uom')
            ? 'Unit update needs migration 0029.'
            : (save.error as Error).message}
        </span>
      )}
    </span>
  )
}
