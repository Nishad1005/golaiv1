import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, MapPin, PackagePlus, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { resolveItemCode } from '../../lib/itemCode'
import { uploadPhoto } from '../../lib/photos'
import { useOffline } from '../../lib/offline/queue'
import { findShelfOffline, findItemOffline } from '../../lib/offline/masters'
import { ScanInput } from '../../components/ScanInput'
import { PhotoInput } from '../../components/PhotoInput'
import type { Item, Shelf, Zone } from '../../lib/types'

type ShelfWithZone = Shelf & { zones: Pick<Zone, 'code' | 'name'> | null }

/**
 * Capture: discover what is physically on a shelf (PRD 4.1).
 * Scan shelf → scan item → qty → optional photo → submit, stay on shelf.
 * Unknown barcodes create a NEW item on the spot: a scanned client code is
 * kept verbatim; the code is auto-assigned only if the field is cleared.
 */
export function Capture() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const [shelf, setShelf] = useState<ShelfWithZone | null>(null)
  const [shelfError, setShelfError] = useState<string | null>(null)
  const [item, setItem] = useState<Item | null>(null)
  const [unknownScan, setUnknownScan] = useState<string | null>(null)
  const [newItem, setNewItem] = useState({ code: '', name: '', uom: 'pcs' })
  const [qty, setQty] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [lastSaved, setLastSaved] = useState<string | null>(null)

  // Current balance for the scanned item on this shelf → merge-or-replace prompt
  const { data: existingQty } = useQuery({
    queryKey: ['balance', shelf?.id, item?.id],
    enabled: !!shelf && !!item,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_balances')
        .select('qty_on_hand')
        .eq('shelf_id', shelf!.id)
        .eq('item_id', item!.id)
        .maybeSingle()
      if (error) throw error
      return data?.qty_on_hand ?? 0
    },
  })

  const findShelf = async (code: string, manual: boolean) => {
    setShelfError(null)
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
      setShelfError(`Shelf "${code}" not found in the shelf master.`)
      return
    }
    setShelf(data)
    if (manual) {
      void logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'manual_entry.shelf_code',
        entityType: 'shelf',
        entityId: data.id,
        after: { screen: 'capture', code },
      })
    }
  }

  const findItem = async (scan: string) => {
    setUnknownScan(null)
    if (!navigator.onLine) {
      const cached = await findItemOffline(scan)
      if (cached) {
        setItem(cached as unknown as Item)
      } else {
        setShelfError(`"${scan}" is not in the cached item master. Creating new items needs a connection.`)
      }
      return
    }
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .or(`code.eq.${scan},barcode.eq.${scan}`)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    if (error) {
      setShelfError(error.message)
      return
    }
    if (data) {
      setItem(data as Item)
    } else {
      // Unknown barcode → create NEW item. The scanned value is most likely the
      // client's existing code, so pre-fill it — kept verbatim unless cleared.
      setUnknownScan(scan)
      setNewItem({ code: scan, name: '', uom: 'pcs' })
    }
  }

  const createNewItem = useMutation({
    mutationFn: async () => {
      const code = await resolveItemCode(newItem.code)
      const { data, error } = await supabase
        .from('items')
        .insert({
          tenant_id: profile!.tenant_id,
          code,
          barcode: unknownScan !== code ? unknownScan : null,
          name: newItem.name.trim(),
          uom: newItem.uom.trim() || 'pcs',
        })
        .select()
        .single()
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'create.item',
        entityType: 'item',
        entityId: data.id,
        after: { code, name: newItem.name.trim(), created_during: 'capture', auto_assigned: !newItem.code.trim() },
      })
      return data as Item
    },
    onSuccess: (created) => {
      setItem(created)
      setUnknownScan(null)
    },
  })

  const saveEntry = useMutation({
    mutationFn: async (mode: 'add' | 'set') => {
      // Offline: queue locally with photos; server re-validates on sync (PRD 7.5)
      if (!navigator.onLine) {
        await useOffline.getState().enqueue(
          'capture',
          {
            p_shelf_id: shelf!.id,
            p_item_id: item!.id,
            p_qty: Number(qty),
            p_mode: mode,
            p_lock_hours: 24,
          },
          { p_photo_urls: photos },
          'capture',
          profile!.tenant_id,
        )
        return
      }
      const photoPaths = []
      for (const f of photos) {
        photoPaths.push(await uploadPhoto(f, profile!.tenant_id, 'capture'))
      }
      const { data, error } = await supabase.rpc('capture_entry', {
        p_shelf_id: shelf!.id,
        p_item_id: item!.id,
        p_qty: Number(qty),
        p_mode: mode,
        p_photo_urls: photoPaths,
        p_lock_hours: 24,
      })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'create.entry',
        entityType: 'entry',
        entityId: data as string,
        after: { shelf: shelf!.code, item: item!.code, qty: Number(qty), mode },
      })
    },
    onSuccess: () => {
      setLastSaved(`${item!.name} — ${qty} ${item!.uom} on ${shelf!.code}`)
      setItem(null)
      setQty('')
      setPhotos([])
      void queryClient.invalidateQueries({ queryKey: ['item-locator'] })
    },
  })

  const resetShelf = () => {
    setShelf(null)
    setItem(null)
    setUnknownScan(null)
    setQty('')
    setPhotos([])
    setLastSaved(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Capture</h1>
        {shelf && (
          <button className="btn-secondary" onClick={resetShelf}>
            <RotateCcw className="h-5 w-5" /> Change shelf
          </button>
        )}
      </div>

      {/* Step 1 — shelf */}
      {!shelf ? (
        <div className="card space-y-3">
          <p className="font-semibold">Step 1 — Scan the shelf label</p>
          <ScanInput placeholder="shelf code (e.g. Z02-S012)" onScan={(v, m) => void findShelf(v, m)} />
          {shelfError && <p className="text-sm text-red-600">{shelfError}</p>}
        </div>
      ) : (
        <div className="card flex items-center gap-3 border-tan bg-cream">
          <MapPin className="h-6 w-6 text-tan-dark" />
          <div>
            <div className="font-mono text-lg font-bold">{shelf.code}</div>
            <div className="text-sm text-ink-400">
              {shelf.zones ? `${shelf.zones.name} (${shelf.zones.code})` : ''}
            </div>
          </div>
        </div>
      )}

      {lastSaved && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> Saved: {lastSaved}. Scan the next item.
        </div>
      )}

      {/* Step 2 — item */}
      {shelf && !item && !unknownScan && (
        <div className="card space-y-3">
          <p className="font-semibold">Step 2 — Scan an item on this shelf</p>
          <ScanInput placeholder="item barcode" onScan={(v) => void findItem(v)} />
          {shelfError && <p className="text-sm text-red-600">{shelfError}</p>}
        </div>
      )}

      {/* Step 2b — unknown item: create on the spot */}
      {shelf && unknownScan && (
        <form
          className="card space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            createNewItem.mutate()
          }}
        >
          <div className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-tan-dark" />
            <p className="font-semibold">New item — barcode not in the master</p>
          </div>
          <p className="text-sm text-ink-400">
            Scanned: <span className="font-mono">{unknownScan}</span>. If this is the client's
            existing code it stays exactly as-is. Clear the field to auto-assign an ITM- code.
          </p>
          <div>
            <label className="label-text">Item code (kept verbatim)</label>
            <input
              className="input-field font-mono"
              value={newItem.code}
              onChange={(e) => setNewItem({ ...newItem, code: e.target.value })}
              placeholder="Leave blank to auto-assign"
            />
          </div>
          <div>
            <label className="label-text">Item name</label>
            <input
              className="input-field"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label-text">Unit</label>
            <input
              className="input-field w-32"
              value={newItem.uom}
              onChange={(e) => setNewItem({ ...newItem, uom: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={createNewItem.isPending}>
              {createNewItem.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
              Create & continue
            </button>
            <button type="button" className="btn-secondary" onClick={() => setUnknownScan(null)}>
              Cancel
            </button>
          </div>
          {createNewItem.isError && (
            <p className="text-sm text-red-600">{(createNewItem.error as Error).message}</p>
          )}
        </form>
      )}

      {/* Step 3 — quantity + photo */}
      {shelf && item && (
        <div className="card space-y-4">
          <div>
            <p className="font-semibold">{item.name}</p>
            <p className="text-sm text-ink-400">
              {item.code} · counts in {item.uom}
            </p>
          </div>

          <div>
            <label className="label-text">Quantity on this shelf</label>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="any"
              className="input-field text-2xl font-bold"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              autoFocus
            />
          </div>

          <PhotoInput files={photos} onChange={setPhotos} label="Shelf photo" />

          {existingQty !== undefined && existingQty > 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This shelf already shows <b>{existingQty} {item.uom}</b> of this item. Add on top, or
              replace with your new count?
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {existingQty !== undefined && existingQty > 0 ? (
              <>
                <button
                  className="btn-primary"
                  disabled={!qty || Number(qty) <= 0 || saveEntry.isPending}
                  onClick={() => saveEntry.mutate('add')}
                >
                  {saveEntry.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
                  Add {qty || '…'} on top
                </button>
                <button
                  className="btn-secondary"
                  disabled={!qty || Number(qty) <= 0 || saveEntry.isPending}
                  onClick={() => saveEntry.mutate('set')}
                >
                  Replace count with {qty || '…'}
                </button>
              </>
            ) : (
              <button
                className="btn-primary w-full"
                disabled={!qty || Number(qty) <= 0 || saveEntry.isPending}
                onClick={() => saveEntry.mutate('add')}
              >
                {saveEntry.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
                Save entry
              </button>
            )}
            <button className="btn-secondary" onClick={() => setItem(null)} disabled={saveEntry.isPending}>
              Cancel
            </button>
          </div>
          {saveEntry.isError && (
            <p className="text-sm text-red-600">{(saveEntry.error as Error).message}</p>
          )}
        </div>
      )}
    </div>
  )
}
