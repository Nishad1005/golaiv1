import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { CalendarClock, CheckCircle2, Loader2, MapPin, PackagePlus, ScanBarcode, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { ScanInput } from '../../components/ScanInput'
import { ItemThumb } from '../../components/ItemThumb'
import type { Item } from '../../lib/types'

interface ShelfLite { id: string; code: string; zones: { code: string; name: string } | null }

/**
 * Perishable inward — scan a barcode to register/find the item, record its batch
 * (no, mfg & expiry) and quantity, and add it to stock on a chosen location.
 * Everything runs through the guarded `inward_perishable` RPC (which also raises
 * a near-expiry alert). Online-only, like the other gate/scan flows.
 */
export function PerishableInward() {
  const { profile } = useAuth()

  const [item, setItem] = useState<Item | null>(null)
  const [unknownScan, setUnknownScan] = useState<string | null>(null)
  const [newItem, setNewItem] = useState({ code: '', name: '', uom: 'pcs' })
  const [itemError, setItemError] = useState<string | null>(null)

  const [shelf, setShelf] = useState<ShelfLite | null>(null)
  const [shelfError, setShelfError] = useState<string | null>(null)

  const [batchNo, setBatchNo] = useState('')
  const [mfgDate, setMfgDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [done, setDone] = useState<{ code: string; name: string } | null>(null)

  const resetForNext = () => {
    setItem(null); setUnknownScan(null); setNewItem({ code: '', name: '', uom: 'pcs' })
    setBatchNo(''); setMfgDate(''); setExpiryDate(''); setQty(''); setNote('')
  }

  const findItem = async (scan: string) => {
    setItemError(null); setUnknownScan(null); setDone(null)
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .or(`code.eq.${scan},barcode.eq.${scan}`)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    if (error) { setItemError(error.message); return }
    if (data) {
      setItem(data as Item)
    } else {
      // Unknown barcode → register a new perishable. The scan is the manufacturer
      // barcode; the code is auto-assigned unless the user types their own.
      setUnknownScan(scan)
      setNewItem({ code: '', name: '', uom: 'pcs' })
    }
  }

  const findShelf = async (code: string) => {
    setShelfError(null)
    const { data, error } = await supabase
      .from('shelves')
      .select('id, code, zones(code, name)')
      .ilike('code', code)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) { setShelfError(error.message); return }
    if (!data) { setShelfError(`Location "${code}" not found.`); return }
    setShelf(data as unknown as ShelfLite)
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!item && !unknownScan) throw new Error('Scan the product barcode first.')
      if (!item && !newItem.name.trim()) throw new Error('Enter a name for the new product.')
      if (!shelf) throw new Error('Scan the storage location.')
      if (!expiryDate) throw new Error('Enter the expiry date.')
      if (!qty || Number(qty) <= 0) throw new Error('Enter a quantity greater than zero.')

      const { data, error } = await supabase.rpc('inward_perishable', {
        p_item_id: item?.id ?? null,
        p_new_code: item ? null : (newItem.code.trim() || null),
        p_new_name: item ? null : newItem.name.trim(),
        p_new_barcode: item ? null : unknownScan,
        p_new_uom: item ? null : (newItem.uom.trim() || 'pcs'),
        p_shelf_id: shelf.id,
        p_batch_no: batchNo.trim() || null,
        p_mfg_date: mfgDate || null,
        p_expiry_date: expiryDate,
        p_qty: Number(qty),
        p_note: note.trim() || null,
      })
      if (error) throw error
      const row = (data as { batch_id: string; item_id: string; item_code: string; item_name: string }[])[0]
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'inward.perishable', entityType: 'item', entityId: row.item_id,
        after: { code: row.item_code, batch: batchNo.trim() || null, expiry: expiryDate, qty: Number(qty) },
      })
      return row
    },
    onSuccess: (row) => {
      setDone({ code: row.item_code, name: row.item_name })
      resetForNext()
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <PackagePlus className="h-6 w-6 text-brand-500" />
        <h1 className="text-xl font-bold">Perishable inward</h1>
      </div>

      {done && (
        <div className="card flex items-center gap-2 border-brand-200 bg-brand-50 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>Recorded <b>{done.name}</b> ({done.code}) and added to stock. Scan the next one.</span>
        </div>
      )}

      {/* Step 1 — the product */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <ScanBarcode className="h-5 w-5 text-brand-500" />
          <p className="font-semibold">Product</p>
        </div>

        {item ? (
          <div className="flex items-center gap-3 rounded-xl border border-tan/20 px-3 py-2">
            <ItemThumb path={item.photo_url ?? null} name={item.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.name}</p>
              <p className="text-xs text-ink-400 font-mono">
                {item.code}{item.barcode ? ` · ${item.barcode}` : ''}
              </p>
            </div>
            <button className="text-ink-400 hover:text-ink-700" onClick={() => { setItem(null) }} title="Change">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : unknownScan ? (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
            <p className="text-sm text-ink-600">
              New product — barcode <span className="font-mono">{unknownScan}</span>. Give it a name.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label-text">Code (optional)</label>
                <input className="input-field font-mono" value={newItem.code}
                  onChange={(e) => setNewItem({ ...newItem, code: e.target.value })} placeholder="auto" />
              </div>
              <div>
                <label className="label-text">Name *</label>
                <input className="input-field" value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
              </div>
              <div>
                <label className="label-text">UOM</label>
                <input className="input-field" value={newItem.uom}
                  onChange={(e) => setNewItem({ ...newItem, uom: e.target.value })} />
              </div>
            </div>
            <button className="text-xs text-ink-400 hover:text-ink-700" onClick={() => setUnknownScan(null)}>Cancel</button>
          </div>
        ) : (
          <>
            <ScanInput placeholder="Scan / type barcode or code" onScan={(v) => findItem(v)} />
            {itemError && <p className="text-sm text-red-600">{itemError}</p>}
          </>
        )}
      </div>

      {/* Step 2 — batch, dates, qty, location */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-brand-500" />
          <p className="font-semibold">Batch & expiry</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label-text">Batch / lot no.</label>
            <input className="input-field font-mono" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} />
          </div>
          <div>
            <label className="label-text">Quantity *</label>
            <input type="number" min="0" step="any" className="input-field tabular-nums" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <label className="label-text">Manufacturing date</label>
            <input type="date" className="input-field" value={mfgDate} onChange={(e) => setMfgDate(e.target.value)} />
          </div>
          <div>
            <label className="label-text">Expiry date *</label>
            <input type="date" className="input-field" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label-text">Note (optional)</label>
          <input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      {/* Step 3 — location */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-brand-500" />
          <p className="font-semibold">Store at location</p>
        </div>
        {shelf ? (
          <div className="flex items-center gap-2 rounded-xl border border-tan/20 px-3 py-2 text-sm">
            <span className="font-mono font-semibold">{shelf.code}</span>
            {shelf.zones && <span className="text-ink-400">· {shelf.zones.name}</span>}
            <button className="ml-auto text-ink-400 hover:text-ink-700" onClick={() => setShelf(null)} title="Change"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <>
            <ScanInput placeholder="Scan / type location code" onScan={(v) => findShelf(v)} autoFocus={false} />
            {shelfError && <p className="text-sm text-red-600">{shelfError}</p>}
          </>
        )}
      </div>

      {submit.isError && <p className="text-sm text-red-600">{(submit.error as Error).message}</p>}

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={submit.isPending} onClick={() => submit.mutate()}>
          {submit.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <PackagePlus className="h-5 w-5" />}
          Record & add to stock
        </button>
        <Link to="/perishables" className="btn-secondary">Done</Link>
      </div>
    </div>
  )
}
