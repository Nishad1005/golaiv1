import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Loader2, PackageCheck, Printer, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { uploadPhoto } from '../../lib/photos'
import { ScanInput } from '../../components/ScanInput'
import { PhotoInput } from '../../components/PhotoInput'
import { PhotoGallery } from '../../components/PhotoGallery'
import { ItemLabelDialog } from '../../components/ItemLabelDialog'
import type { Item } from '../../lib/types'

interface GrnDetailData {
  id: string
  grn_number: string
  status: 'DRAFT' | 'VERIFIED' | 'COMPLETED' | 'REJECTED'
  po_ref: string | null
  material_type_declared: string | null
  total_cartons_declared: number | null
  created_at: string
  supplier_name_freetext: string | null
  suppliers: { name: string } | null
  grn_gate_entries: {
    vehicle_number: string
    vehicle_photos: string[]
    driver_name: string
    driver_phone: string
    driver_license: string
    driver_photos: string[]
    transporter: string | null
    document_photos: string[]
    arrival_at: string
  }[]
  grn_lines: {
    id: string
    qty_received: number
    qty_invoice: number | null
    qty_po: number | null
    variance_reason: string | null
    qc_status: 'OK' | 'HOLD' | 'REJECT'
    damage_photos: string[]
    notes: string | null
    items: Pick<Item, 'id' | 'code' | 'name' | 'uom' | 'category'>
    grn_putaways: { qty: number; shelves: { code: string } | null }[]
  }[]
}

interface DraftLine {
  item: Item
  qty_received: string
  qty_invoice: string
  qty_po: string
  variance_reason: string
  qc_status: 'OK' | 'HOLD' | 'REJECT'
  damage_photos: File[]
  notes: string
}

export function GrnDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const canVerify = ['storekeeper', 'manager', 'admin'].includes(profile!.role)

  const { data: grn, isLoading } = useQuery({
    queryKey: ['grn', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grns')
        .select(
          `id, grn_number, status, po_ref, material_type_declared, total_cartons_declared,
           created_at, supplier_name_freetext, suppliers(name),
           grn_gate_entries(vehicle_number, vehicle_photos, driver_name, driver_phone,
             driver_license, driver_photos, transporter, document_photos, arrival_at),
           grn_lines(id, qty_received, qty_invoice, qty_po, variance_reason, qc_status,
             damage_photos, notes, items(id, code, name, uom, category),
             grn_putaways(qty, shelves(code)))`,
        )
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as unknown as GrnDetailData
    },
  })

  if (isLoading || !grn) {
    return <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin text-brand-500" />
  }

  const gate = grn.grn_gate_entries[0]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-mono text-xl font-bold">{grn.grn_number}</h1>
        <p className="text-sm text-ink-400">
          {grn.suppliers?.name ?? grn.supplier_name_freetext} · {grn.material_type_declared} ·{' '}
          {grn.total_cartons_declared} cartons declared
          {grn.po_ref ? ` · PO ref: ${grn.po_ref}` : ''}
        </p>
      </div>

      {gate && (
        <div className="card space-y-3">
          <p className="font-semibold">Gate entry</p>
          <p className="text-sm">
            <span className="font-mono font-semibold">{gate.vehicle_number}</span> · driver{' '}
            {gate.driver_name} ({gate.driver_phone}) · DL {gate.driver_license}
            {gate.transporter ? ` · via ${gate.transporter}` : ''} · arrived{' '}
            {new Date(gate.arrival_at).toLocaleString()}
          </p>
          <PhotoGallery
            paths={[...gate.vehicle_photos, ...gate.driver_photos, ...gate.document_photos]}
          />
        </div>
      )}

      {grn.status === 'DRAFT' && canVerify && <VerifyPanel grn={grn} />}
      {grn.status !== 'DRAFT' && <LinesView grn={grn} />}
      {grn.status === 'VERIFIED' && canVerify && <PutawayPanel grn={grn} />}
      {grn.status === 'COMPLETED' && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5" /> Receiving completed — all stock placed on shelves.
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stage 2 — verification
// ---------------------------------------------------------------------------
function VerifyPanel({ grn }: { grn: GrnDetailData }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [lines, setLines] = useState<DraftLine[]>([])
  const [scanError, setScanError] = useState<string | null>(null)

  const addItem = async (scan: string) => {
    setScanError(null)
    const { data } = await supabase
      .from('items')
      .select('*')
      .or(`code.eq.${scan},barcode.eq.${scan}`)
      .is('deleted_at', null)
      .maybeSingle()
    if (!data) {
      setScanError(`"${scan}" is not in the item master. Create it in Items (codes are kept verbatim) and scan again.`)
      return
    }
    if (lines.some((l) => l.item.id === data.id)) {
      setScanError(`${data.name} is already on this GRN.`)
      return
    }
    setLines([
      ...lines,
      {
        item: data as Item,
        qty_received: '',
        qty_invoice: '',
        qty_po: '',
        variance_reason: '',
        qc_status: 'OK',
        damage_photos: [],
        notes: '',
      },
    ])
  }

  const update = (i: number, patch: Partial<DraftLine>) =>
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  const submit = useMutation({
    mutationFn: async () => {
      const payload = []
      for (const line of lines) {
        if (!line.qty_received || Number(line.qty_received) < 0) {
          throw new Error(`Enter received qty for ${line.item.name}`)
        }
        if (
          line.qty_invoice &&
          Number(line.qty_received) !== Number(line.qty_invoice) &&
          !line.variance_reason.trim()
        ) {
          throw new Error(`${line.item.name}: invoice vs received variance needs a reason`)
        }
        const damagePaths = await Promise.all(
          line.damage_photos.map((f) => uploadPhoto(f, profile!.tenant_id, 'grn')),
        )
        payload.push({
          item_id: line.item.id,
          qty_received: Number(line.qty_received),
          qty_invoice: line.qty_invoice || null,
          qty_po: line.qty_po || null,
          variance_reason: line.variance_reason,
          qc_status: line.qc_status,
          damage_photos: damagePaths,
          notes: line.notes,
        })
      }
      const { error } = await supabase.rpc('verify_grn', { p_grn_id: grn.id, p_lines: payload })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'verify.grn',
        entityType: 'grn',
        entityId: grn.id,
        after: { grn_number: grn.grn_number, lines: payload.length },
      })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['grn', grn.id] }),
  })

  const materialMismatch = (item: Item) =>
    grn.material_type_declared &&
    item.category &&
    item.category.toLowerCase() !== grn.material_type_declared.toLowerCase()

  return (
    <div className="card space-y-4">
      <p className="font-semibold">Verification — scan each item, enter quantities</p>
      <ScanInput placeholder="item barcode" onScan={(v) => void addItem(v)} autoFocus={false} />
      {scanError && <p className="text-sm text-red-600">{scanError}</p>}

      {lines.map((line, i) => (
        <div key={line.item.id} className="space-y-3 rounded-xl border border-tan/30 p-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{line.item.name}</p>
              <p className="text-xs text-ink-400">{line.item.code} · {line.item.uom}</p>
            </div>
            <button
              className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-400 hover:bg-cream"
              onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
              aria-label="Remove line"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>

          {materialMismatch(line.item) && (
            <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Declared material was {grn.material_type_declared}, but this item is {line.item.category}.
            </p>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label-text">PO qty</label>
              <input type="number" inputMode="decimal" className="input-field" value={line.qty_po}
                onChange={(e) => update(i, { qty_po: e.target.value })} />
            </div>
            <div>
              <label className="label-text">Invoice qty</label>
              <input type="number" inputMode="decimal" className="input-field" value={line.qty_invoice}
                onChange={(e) => update(i, { qty_invoice: e.target.value })} />
            </div>
            <div>
              <label className="label-text">Received qty *</label>
              <input type="number" inputMode="decimal" className="input-field font-bold" value={line.qty_received}
                onChange={(e) => update(i, { qty_received: e.target.value })} required />
            </div>
          </div>

          {line.qty_invoice && line.qty_received &&
            Number(line.qty_invoice) !== Number(line.qty_received) && (
              <div>
                <label className="label-text">Variance reason (mandatory)</label>
                <input className="input-field" value={line.variance_reason}
                  placeholder="short / damaged / excess — details"
                  onChange={(e) => update(i, { variance_reason: e.target.value })} />
              </div>
            )}

          <div className="flex flex-wrap items-center gap-2">
            <label className="label-text mb-0">QC status:</label>
            {(['OK', 'HOLD', 'REJECT'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={
                  'min-h-tap rounded-xl px-4 text-sm font-semibold transition-colors ' +
                  (line.qc_status === s
                    ? s === 'OK'
                      ? 'bg-green-600 text-white'
                      : s === 'HOLD'
                        ? 'bg-amber-500 text-white'
                        : 'bg-red-600 text-white'
                    : 'bg-cream text-ink-400')
                }
                onClick={() => update(i, { qc_status: s })}
              >
                {s === 'HOLD' ? 'Hold for QC' : s === 'REJECT' ? 'Reject (RTV)' : 'OK'}
              </button>
            ))}
          </div>

          {line.qc_status !== 'OK' && (
            <div>
              <label className="label-text">Damage / issue photos (mandatory for damaged goods)</label>
              <PhotoInput
                files={line.damage_photos}
                onChange={(files) => update(i, { damage_photos: files })}
                label="Damage"
              />
            </div>
          )}
        </div>
      ))}

      {lines.length > 0 && (
        <button
          className="btn-primary w-full"
          disabled={submit.isPending}
          onClick={() => submit.mutate()}
        >
          {submit.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
          Submit verification ({lines.length} item{lines.length > 1 ? 's' : ''})
        </button>
      )}
      {submit.isError && <p className="text-sm text-red-600">{(submit.error as Error).message}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Verified lines (read view)
// ---------------------------------------------------------------------------
function LinesView({ grn }: { grn: GrnDetailData }) {
  const [printing, setPrinting] = useState(false)
  if (grn.grn_lines.length === 0) return null

  // Rejected lines never reach a shelf, so they never need a sticker.
  const labelRows = grn.grn_lines
    .filter((l) => l.qc_status !== 'REJECT')
    .map((l) => ({
      code: l.items.code,
      name: l.items.name,
      uom: l.items.uom,
      category: l.items.category ?? null,
      quantity: l.qty_received,
    }))

  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Verified items</p>
        {labelRows.length > 0 && (
          <button className="btn-secondary" onClick={() => setPrinting(true)}>
            <Printer className="h-5 w-5" /> Print item labels
          </button>
        )}
      </div>

      {printing && (
        <ItemLabelDialog
          rows={labelRows}
          source={`grn:${grn.grn_number}`}
          title={`Label what arrived on ${grn.grn_number}`}
          onClose={() => setPrinting(false)}
        />
      )}
      {grn.grn_lines.map((line) => {
        const placed = line.grn_putaways.reduce((s, p) => s + p.qty, 0)
        return (
          <div key={line.id} className="rounded-xl border border-tan/20 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{line.items.name}</span>
              <span className="text-ink-400">{line.items.code}</span>
              <span
                className={
                  'rounded-full px-2 py-0.5 text-xs font-medium ' +
                  (line.qc_status === 'OK'
                    ? 'bg-green-100 text-green-800'
                    : line.qc_status === 'HOLD'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800')
                }
              >
                {line.qc_status}
              </span>
              <span className="ml-auto tabular-nums">
                {line.qty_received} {line.items.uom} received
                {line.qty_invoice != null && ` · invoice ${line.qty_invoice}`}
              </span>
            </div>
            {line.variance_reason && (
              <p className="mt-1 text-xs text-amber-700">Variance: {line.variance_reason}</p>
            )}
            {line.grn_putaways.length > 0 && (
              <p className="mt-1 text-xs text-ink-400">
                Placed: {line.grn_putaways.map((p) => `${p.qty} → ${p.shelves?.code}`).join(', ')}
                {placed < line.qty_received && line.qc_status !== 'REJECT' && (
                  <span className="text-amber-700"> · {line.qty_received - placed} remaining</span>
                )}
              </p>
            )}
            {line.damage_photos.length > 0 && (
              <div className="mt-2">
                <PhotoGallery paths={line.damage_photos} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stage 3 — putaway
// ---------------------------------------------------------------------------
function PutawayPanel({ grn }: { grn: GrnDetailData }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [activeLine, setActiveLine] = useState<string | null>(null)
  const [qty, setQty] = useState('')
  const [error, setError] = useState<string | null>(null)

  const pendingLines = grn.grn_lines.filter((l) => {
    const placed = l.grn_putaways.reduce((s, p) => s + p.qty, 0)
    return l.qc_status !== 'REJECT' && placed < l.qty_received
  })

  const putaway = useMutation({
    mutationFn: async ({ lineId, shelfCode, amount }: { lineId: string; shelfCode: string; amount: number }) => {
      const { data: shelf } = await supabase
        .from('shelves')
        .select('id, code')
        .ilike('code', shelfCode)
        .is('deleted_at', null)
        .maybeSingle()
      if (!shelf) throw new Error(`Shelf "${shelfCode}" not found.`)
      const { error } = await supabase.rpc('putaway_grn_line', {
        p_grn_line_id: lineId,
        p_shelf_id: shelf.id,
        p_qty: amount,
      })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'putaway.grn_line',
        entityType: 'grn',
        entityId: grn.id,
        after: { line: lineId, shelf: shelf.code, qty: amount },
      })
    },
    onSuccess: () => {
      setActiveLine(null)
      setQty('')
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['grn', grn.id] })
      void queryClient.invalidateQueries({ queryKey: ['item-locator'] })
    },
    onError: (e) => setError((e as Error).message),
  })

  if (pendingLines.length === 0) return null

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <PackageCheck className="h-5 w-5 text-brand-500" />
        <p className="font-semibold">Putaway — place each item on its shelf</p>
      </div>
      {pendingLines.map((line) => {
        const placed = line.grn_putaways.reduce((s, p) => s + p.qty, 0)
        const remaining = line.qty_received - placed
        const active = activeLine === line.id
        return (
          <div key={line.id} className="rounded-xl border border-tan/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">{line.items.name}</p>
                <p className="text-xs text-ink-400">
                  {remaining} {line.items.uom} to place
                  {line.qc_status === 'HOLD' && ' — goes to QC hold'}
                </p>
              </div>
              {!active && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setActiveLine(line.id)
                    setQty(String(remaining))
                  }}
                >
                  Place
                </button>
              )}
            </div>
            {active && (
              <div className="mt-3 space-y-2">
                <div>
                  <label className="label-text">Quantity</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    max={remaining}
                    step="any"
                    className="input-field w-40"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </div>
                <ScanInput
                  placeholder="destination shelf"
                  onScan={(code) => {
                    const amount = Number(qty)
                    if (!amount || amount <= 0 || amount > remaining) {
                      setError(`Quantity must be between 0 and ${remaining}.`)
                      return
                    }
                    putaway.mutate({ lineId: line.id, shelfCode: code, amount })
                  }}
                />
              </div>
            )}
          </div>
        )
      })}
      {putaway.isPending && <Loader2 className="h-5 w-5 animate-spin text-brand-500" />}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
