import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, CheckCircle2, Loader2, MapPin, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { ScanInput } from '../../components/ScanInput'
import type { Item, Shelf, Zone } from '../../lib/types'

type ShelfWithZone = Shelf & { zones: Pick<Zone, 'code' | 'name'> | null }

/**
 * Internal transfer (PRD 4.2): scan source shelf → scan item → qty →
 * scan destination shelf → submit. Strict scan-first; manual typing is
 * flagged on the transfer record and audit log.
 */
export function Transfer() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const [source, setSource] = useState<ShelfWithZone | null>(null)
  const [item, setItem] = useState<Item | null>(null)
  const [qty, setQty] = useState('')
  const [destination, setDestination] = useState<ShelfWithZone | null>(null)
  const [usedManual, setUsedManual] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  // Items with stock on the source shelf, so wrong scans are caught instantly
  const { data: sourceStock } = useQuery({
    queryKey: ['shelf-stock', source?.id],
    enabled: !!source,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_balances')
        .select('qty_on_hand, items(*)')
        .eq('shelf_id', source!.id)
        .gt('qty_on_hand', 0)
      if (error) throw error
      return data as unknown as { qty_on_hand: number; items: Item }[]
    },
  })

  const available = item
    ? sourceStock?.find((r) => r.items.id === item.id)?.qty_on_hand ?? 0
    : 0

  const findShelf = async (code: string, manual: boolean, which: 'source' | 'destination') => {
    setError(null)
    if (manual) setUsedManual(true)
    const { data } = await supabase
      .from('shelves')
      .select('*, zones(code, name)')
      .ilike('code', code)
      .is('deleted_at', null)
      .maybeSingle()
    if (!data) {
      setError(`Shelf "${code}" not found.`)
      return
    }
    if (which === 'source') setSource(data as ShelfWithZone)
    else setDestination(data as ShelfWithZone)
  }

  const findItem = (scan: string) => {
    setError(null)
    const match = sourceStock?.find((r) => r.items.code === scan || r.items.barcode === scan)
    if (!match) {
      setError(`"${scan}" has no stock on ${source!.code}. Scan an item from this shelf.`)
      return
    }
    setItem(match.items)
  }

  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('transfer_stock', {
        p_source_shelf_id: source!.id,
        p_destination_shelf_id: destination!.id,
        p_item_id: item!.id,
        p_qty: Number(qty),
        p_manual_entry: usedManual,
      })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'create.transfer',
        entityType: 'transfer',
        entityId: data as string,
        after: {
          item: item!.code,
          qty: Number(qty),
          from: source!.code,
          to: destination!.code,
          manual_entry: usedManual,
        },
      })
    },
    onSuccess: () => {
      setDone(`${qty} ${item!.uom} of ${item!.name}: ${source!.code} → ${destination!.code}`)
      setItem(null)
      setQty('')
      setDestination(null)
      void queryClient.invalidateQueries({ queryKey: ['shelf-stock'] })
      void queryClient.invalidateQueries({ queryKey: ['item-locator'] })
    },
  })

  const reset = () => {
    setSource(null)
    setItem(null)
    setQty('')
    setDestination(null)
    setUsedManual(false)
    setDone(null)
    setError(null)
  }

  const shelfCard = (shelf: ShelfWithZone, label: string) => (
    <div className="card flex items-center gap-3 border-tan bg-cream">
      <MapPin className="h-6 w-6 text-tan-dark" />
      <div>
        <div className="text-xs uppercase tracking-wide text-ink-400">{label}</div>
        <div className="font-mono text-lg font-bold">{shelf.code}</div>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Internal Transfer</h1>
        {source && (
          <button className="btn-secondary" onClick={reset}>
            <RotateCcw className="h-5 w-5" /> Start over
          </button>
        )}
      </div>

      {done && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> Transferred: {done}
        </div>
      )}

      {!source ? (
        <div className="card space-y-3">
          <p className="font-semibold">Step 1 — Scan the source shelf</p>
          <ScanInput placeholder="source shelf" onScan={(v, m) => void findShelf(v, m, 'source')} />
        </div>
      ) : (
        shelfCard(source, 'From')
      )}

      {source && !item && (
        <div className="card space-y-3">
          <p className="font-semibold">Step 2 — Scan the item to move</p>
          <ScanInput placeholder="item barcode" onScan={(v) => findItem(v)} />
          {sourceStock && sourceStock.length === 0 && (
            <p className="text-sm text-amber-700">This shelf has no stock recorded.</p>
          )}
        </div>
      )}

      {item && (
        <div className="card space-y-3">
          <p className="font-semibold">{item.name}</p>
          <p className="text-sm text-ink-400">
            {item.code} · available on {source!.code}: <b>{available} {item.uom}</b>
          </p>
          <div>
            <label className="label-text">Quantity to move</label>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              max={available}
              step="any"
              className="input-field text-2xl font-bold"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      )}

      {item && qty && Number(qty) > 0 && Number(qty) <= available && (
        <>
          <ArrowDown className="mx-auto h-6 w-6 text-ink-300" />
          {!destination ? (
            <div className="card space-y-3">
              <p className="font-semibold">Step 3 — Scan the destination shelf</p>
              <ScanInput
                placeholder="destination shelf"
                onScan={(v, m) => void findShelf(v, m, 'destination')}
              />
            </div>
          ) : (
            <>
              {shelfCard(destination, 'To')}
              <button
                className="btn-primary w-full"
                disabled={submit.isPending}
                onClick={() => submit.mutate()}
              >
                {submit.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
                Confirm transfer
              </button>
            </>
          )}
        </>
      )}

      {item && qty && Number(qty) > available && (
        <p className="text-sm text-red-600">
          Only {available} {item.uom} available on {source!.code}.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {submit.isError && <p className="text-sm text-red-600">{(submit.error as Error).message}</p>}
    </div>
  )
}
