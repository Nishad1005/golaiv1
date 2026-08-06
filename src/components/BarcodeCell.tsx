import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ScanBarcode } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { logActivity } from '../lib/audit'
import { ScanInput } from './ScanInput'

interface Props {
  itemId: string
  /** The product's current barcode, or null. */
  value: string | null
}

/**
 * Scan (or type) a product's existing manufacturer barcode right in the Items
 * list, so it's noted in the system. Saved through the guarded `set_item_barcode`
 * RPC (migration 0043), which also lets floor/perishables roles set it.
 */
export function BarcodeCell({ itemId, value }: Props) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)

  const save = useMutation({
    mutationFn: async (barcode: string) => {
      const { error } = await supabase.rpc('set_item_barcode', {
        p_item_id: itemId,
        p_barcode: barcode.trim() || null,
      })
      if (error) throw new Error(error.message)
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'update.item_barcode', entityType: 'item', entityId: itemId,
        after: { barcode: barcode.trim() || null },
      })
    },
    onSuccess: () => {
      setEditing(false)
      for (const key of ['items', 'item-locator', 'item-card']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
  })

  if (editing) {
    return (
      <div className="w-56">
        <ScanInput
          placeholder="Scan / type barcode"
          onScan={(v) => save.mutate(v)}
          autoFocus
        />
        <div className="mt-1 flex items-center gap-2">
          <button className="text-xs text-ink-400 hover:text-ink-700" onClick={() => setEditing(false)}>Cancel</button>
          {save.isError && <span className="text-xs text-red-600">{(save.error as Error).message}</span>}
        </div>
      </div>
    )
  }

  return (
    <button
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-ink-500 hover:bg-ink-50 hover:text-ink-800"
      onClick={() => setEditing(true)}
      title="Scan or set the manufacturer barcode"
    >
      <ScanBarcode className="h-4 w-4 shrink-0 text-ink-400" />
      {value ? <span className="font-mono">{value}</span> : <span className="text-ink-300">Scan</span>}
    </button>
  )
}
