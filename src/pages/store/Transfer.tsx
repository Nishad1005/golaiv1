import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, CheckCircle2, Loader2, MapPin, RotateCcw, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { useOffline } from '../../lib/offline/queue'
import { findShelfOffline, findItemOffline } from '../../lib/offline/masters'
import { ScanInput } from '../../components/ScanInput'
import { ItemThumb } from '../../components/ItemThumb'
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
  const [itemSearch, setItemSearch] = useState('')
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

  const online = useOffline((s) => s.online)
  // Offline the local balance is unknown; the server enforces it on sync.
  const available = item
    ? online
      ? sourceStock?.find((r) => r.items.id === item.id)?.qty_on_hand ?? 0
      : Infinity
    : 0

  const findShelf = async (code: string, manual: boolean, which: 'source' | 'destination') => {
    setError(null)
    if (manual) setUsedManual(true)
    let data: ShelfWithZone | null = null
    if (navigator.onLine) {
      const res = await supabase
        .from('shelves')
        .select('*, zones(code, name)')
        .ilike('code', code)
        .is('deleted_at', null)
        .maybeSingle()
      data = res.data as ShelfWithZone | null
    } else {
      const cached = await findShelfOffline(code)
      if (cached) {
        data = {
          id: cached.id,
          code: cached.code,
          zones: { code: cached.zone_code, name: cached.zone_name },
        } as ShelfWithZone
      }
    }
    if (!data) {
      setError(`Shelf "${code}" not found.`)
      return
    }
    if (which === 'source') setSource(data)
    else setDestination(data)
  }

  const findItem = async (scan: string) => {
    setError(null)
    if (!navigator.onLine) {
      // Offline: accept any known item; the server re-checks stock on sync
      const cached = await findItemOffline(scan)
      if (!cached) {
        setError(`"${scan}" is not in the cached item master.`)
        return
      }
      setItem(cached as unknown as Item)
      return
    }
    const match = sourceStock?.find((r) => r.items.code === scan || r.items.barcode === scan)
    if (!match) {
      setError(`"${scan}" has no stock on ${source!.code}. Scan an item from this shelf.`)
      return
    }
    setItem(match.items)
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!navigator.onLine) {
        await useOffline.getState().enqueue(
          'transfer',
          {
            p_source_shelf_id: source!.id,
            p_destination_shelf_id: destination!.id,
            p_item_id: item!.id,
            p_qty: Number(qty),
            p_manual_entry: usedManual,
          },
          {},
          'transfer',
          profile!.tenant_id,
        )
        return
      }
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
    setItemSearch('')
    setQty('')
    setDestination(null)
    setUsedManual(false)
    setDone(null)
    setError(null)
  }

  const shelfCard = (shelf: ShelfWithZone, label: string) => (
    <div className="card flex items-center gap-3 border-tan bg-cream">
      <MapPin className="h-6 w-6 text-brand-500" />
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
          <p className="font-semibold">Step 2 — Pick the item to move</p>

          {/* Tap the product off the shelf — no barcode needed. */}
          {sourceStock === undefined ? (
            <Loader2 className="mx-auto my-3 h-5 w-5 animate-spin text-brand-500" />
          ) : sourceStock.length === 0 ? (
            <p className="text-sm text-amber-700">This shelf has no stock recorded.</p>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
                <input
                  className="input-field pl-12"
                  placeholder="Search products on this shelf by name or code…"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                />
              </div>

              {(() => {
                const q = itemSearch.trim().toLowerCase()
                const matches = sourceStock.filter((r) =>
                  !q || r.items.name.toLowerCase().includes(q) || r.items.code.toLowerCase().includes(q))
                if (matches.length === 0) {
                  return <p className="text-sm text-ink-400">No product on this shelf matches "{itemSearch.trim()}".</p>
                }
                return (
                  <ul className="divide-y divide-ink-200/70 rounded-xl border border-ink-200">
                    {matches.map((r) => (
                      <li key={r.items.id}>
                        <button
                          className="flex min-h-tap w-full items-center gap-3 px-3 text-left hover:bg-cream"
                          onClick={() => { setItem(r.items); setItemSearch('') }}
                        >
                          <ItemThumb path={r.items.photo_url} name={r.items.name} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{r.items.name}</span>
                            <span className="block text-xs text-ink-400">{r.items.code}</span>
                          </span>
                          <span className="shrink-0 text-sm tabular-nums text-ink-500">
                            {r.qty_on_hand} {r.items.uom}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              })()}
            </>
          )}

          {/* Scanner / offline fallback — resolves against the shelf's stock or the cached master. */}
          <div>
            <p className="mb-1 text-xs font-medium text-ink-400">Or scan the item's barcode</p>
            <ScanInput placeholder="item barcode" onScan={(v) => void findItem(v)} autoFocus={false} />
          </div>
        </div>
      )}

      {item && (
        <div className="card space-y-3">
          <p className="font-semibold">{item.name}</p>
          <p className="text-sm text-ink-400">
            {item.code} · available on {source!.code}:{' '}
            <b>{online ? `${available} ${item.uom}` : 'checked on sync (offline)'}</b>
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
