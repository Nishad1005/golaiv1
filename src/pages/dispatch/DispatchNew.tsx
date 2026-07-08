import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, Search, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { uploadPhoto } from '../../lib/photos'
import { generateCartonLabelsPdf } from '../../lib/labels'
import { ScanInput } from '../../components/ScanInput'
import { PhotoInput } from '../../components/PhotoInput'
import type { Item } from '../../lib/types'

interface PickedLine {
  item: Item
  shelfId: string
  shelfCode: string
  qty: number
  cartonBarcode: string
}

let cartonCounter = 0
function newCartonBarcode(): string {
  cartonCounter += 1
  return `CTN-${Date.now().toString(36).toUpperCase()}-${cartonCounter}`
}

/**
 * Dispatch Stage 1 — picking (PRD 4.7). Storekeeper enters SO ref, picks
 * items off shelves by scan, cartons get barcodes, photo of packed cartons,
 * submit → PICKED (awaiting manager approval). Carton labels print for
 * sealing.
 */
export function DispatchNew() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [soRef, setSoRef] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  const [itemSearch, setItemSearch] = useState('')
  const [pickingItem, setPickingItem] = useState<Item | null>(null)
  const [qty, setQty] = useState('')
  const [lines, setLines] = useState<PickedLine[]>([])
  const [photos, setPhotos] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers').select('id, name').is('deleted_at', null).order('name')
      if (error) throw error
      return data as { id: string; name: string }[]
    },
  })

  const { data: matches } = useQuery({
    queryKey: ['item-search', itemSearch],
    enabled: itemSearch.trim().length >= 2,
    queryFn: async () => {
      const q = itemSearch.trim()
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .or(`name.ilike.%${q}%,code.ilike.%${q}%,barcode.eq.${q}`)
        .eq('status', 'active')
        .is('deleted_at', null)
        .limit(8)
      if (error) throw error
      return data as Item[]
    },
  })

  const { data: locations } = useQuery({
    queryKey: ['pick-locations', pickingItem?.id],
    enabled: !!pickingItem,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_balances')
        .select('shelf_id, qty_on_hand, shelves(code)')
        .eq('item_id', pickingItem!.id)
        .gt('qty_on_hand', 0)
      if (error) throw error
      return data as unknown as { shelf_id: string; qty_on_hand: number; shelves: { code: string } | null }[]
    },
  })

  const stagePick = (shelfCode: string) => {
    setError(null)
    const amount = Number(qty)
    const loc = (locations ?? []).find(
      (l) => l.shelves?.code.toLowerCase() === shelfCode.toLowerCase(),
    )
    if (!loc) {
      setError(`${pickingItem!.name} has no stock on "${shelfCode}".`)
      return
    }
    const alreadyPicked = lines
      .filter((l) => l.item.id === pickingItem!.id && l.shelfId === loc.shelf_id)
      .reduce((s, l) => s + l.qty, 0)
    if (!amount || amount <= 0 || amount + alreadyPicked > loc.qty_on_hand) {
      setError(`Only ${loc.qty_on_hand - alreadyPicked} available on ${shelfCode}.`)
      return
    }
    setLines([
      ...lines,
      {
        item: pickingItem!,
        shelfId: loc.shelf_id,
        shelfCode: loc.shelves!.code,
        qty: amount,
        cartonBarcode: newCartonBarcode(),
      },
    ])
    setPickingItem(null)
    setQty('')
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (lines.length === 0) throw new Error('Pick at least one item.')
      if (photos.length === 0) throw new Error('Photo of packed cartons is mandatory.')
      const photoPaths = await Promise.all(
        photos.map((f) => uploadPhoto(f, profile!.tenant_id, 'dispatch')),
      )
      const { data, error } = await supabase.rpc('create_dispatch', {
        p_so_ref: soRef,
        p_customer_id: customerId || null,
        p_customer_note: customerNote,
        p_photo_urls: photoPaths,
        p_lines: lines.map((l) => ({
          item_id: l.item.id,
          shelf_id: l.shelfId,
          qty: l.qty,
          carton_barcode: l.cartonBarcode,
        })),
      })
      if (error) throw error
      const row = (data as { dispatch_id: string; dc_number: string }[])[0]
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'create.dispatch',
        entityType: 'dispatch',
        entityId: row.dispatch_id,
        after: { dc_number: row.dc_number, so_ref: soRef, lines: lines.length },
      })
      return row
    },
    onSuccess: (row) => {
      const customerName = customers?.find((c) => c.id === customerId)?.name ?? customerNote ?? null
      void generateCartonLabelsPdf(
        lines.map((l) => ({
          cartonBarcode: l.cartonBarcode,
          dcNumber: row.dc_number,
          soRef: soRef || null,
          customerName,
          contents: `${l.qty} ${l.item.uom} × ${l.item.name}`,
        })),
        `${row.dc_number.replaceAll('/', '-')}-cartons.pdf`,
      )
      navigate(`/dispatch/${row.dispatch_id}`)
    },
  })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">New Dispatch</h1>

      <div className="card grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label-text">SO reference</label>
          <input className="input-field font-mono" placeholder="SO-1234" value={soRef}
            onChange={(e) => setSoRef(e.target.value)} />
        </div>
        <div>
          <label className="label-text">Customer</label>
          <select className="input-field" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— select —</option>
            {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label-text">Customer note</label>
          <input className="input-field" value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} />
        </div>
      </div>

      <div className="card space-y-3">
        <p className="font-semibold">Pick items</p>
        {!pickingItem ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
              <input className="input-field pl-12" placeholder="Search item to pick (name / code / barcode)…"
                value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
            </div>
            {matches && itemSearch.trim().length >= 2 && (
              <ul className="divide-y divide-tan/20 rounded-xl border border-tan/30">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-cream"
                      onClick={() => {
                        setPickingItem(m)
                        setItemSearch('')
                      }}
                    >
                      <span className="font-medium">{m.name}</span>
                      <span className="ml-auto text-xs text-ink-400">{m.code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="space-y-2 rounded-xl border border-tan/30 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{pickingItem.name}</p>
                <p className="text-xs text-ink-400">
                  {(locations ?? []).length > 0
                    ? 'on ' + (locations ?? []).map((l) => `${l.shelves?.code} (${l.qty_on_hand})`).join(', ')
                    : 'no stock found'}
                </p>
              </div>
              <button className="btn-secondary" onClick={() => setPickingItem(null)}>Cancel</button>
            </div>
            <div>
              <label className="label-text">Quantity</label>
              <input type="number" inputMode="decimal" min="0.01" step="any"
                className="input-field w-40" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
            </div>
            <ScanInput placeholder="shelf you are picking from" onScan={(code) => stagePick(code)} />
          </div>
        )}

        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-cream px-3 py-2 text-sm">
            <span className="flex-1">
              {l.qty} {l.item.uom} × {l.item.name} from {l.shelfCode}
              <span className="ml-2 font-mono text-xs text-ink-400">{l.cartonBarcode}</span>
            </span>
            <button className="text-ink-400" onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
              aria-label="Remove picked line">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {lines.length > 0 && (
        <div className="card space-y-3">
          <label className="label-text">Photo of packed cartons (mandatory)</label>
          <PhotoInput files={photos} onChange={setPhotos} label="Cartons" />
          <button className="btn-primary w-full" disabled={submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
            Submit picking & print carton labels
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {submit.isError && <p className="text-sm text-red-600">{(submit.error as Error).message}</p>}
    </div>
  )
}
