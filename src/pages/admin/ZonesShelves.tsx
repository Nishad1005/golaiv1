import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, ChevronDown, ChevronRight, FileDown, ListChecks, Loader2, Map, Pencil, Plus, Printer, Trash2, Upload, X } from 'lucide-react'
import { EmptyState } from '../../components/EmptyState'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { generateShelfLabelsPdf, SHELF_LABEL_SIZES, type ShelfLabelSize } from '../../lib/labels'
import { parseCsv, findColumn, downloadZoneTemplate } from '../../lib/csv'
import { blockLetter, locationLabel, palletLabel, prefixFor } from '../../lib/places'
import { num } from '../../lib/qty'
import { PageHeader } from '../../components/PageHeader'
import { PalletMap } from '../../components/PalletMap'
import type { Shelf, Zone } from '../../lib/types'

const LOCATION_TYPE_SUGGESTIONS = ['Shelf', 'Ghoda', 'Rack', 'Pallet', 'Bin', 'Floor Area']

type ZoneRow = Zone & { description: string | null; default_category: string | null }

const pad2 = (n: number) => String(n).padStart(2, '0')
const pad3 = (n: number) => String(n).padStart(3, '0')

/**
 * Add generated locations, reviving any that were previously deleted.
 *
 * Deleting a location soft-deletes it (delete_location, 0039) — the row stays,
 * so its code still occupies the (tenant_id, code) unique constraint. A plain
 * `upsert(..., { ignoreDuplicates: true })` (ON CONFLICT DO NOTHING) would then
 * silently skip that code, so re-adding a location after deleting it added
 * nothing. So first un-delete any soft-deleted rows whose code is being added
 * (restores them exactly), then insert the genuinely-new codes.
 */
async function addOrReviveShelves(tenantId: string, rows: Record<string, unknown>[]) {
  const codes = rows.map((r) => r.code as string)
  const { error: reviveErr } = await supabase
    .from('shelves')
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .in('code', codes)
    .not('deleted_at', 'is', null)
  if (reviveErr) throw reviveErr

  const { error } = await supabase
    .from('shelves')
    .upsert(rows, { onConflict: 'tenant_id,code', ignoreDuplicates: true })
  if (error) throw error
}

export function ZonesShelves() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [expandedZone, setExpandedZone] = useState<string | null>(null)
  const [showZoneForm, setShowZoneForm] = useState(false)
  const [editingZone, setEditingZone] = useState<string | null>(null)
  const csvInput = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [printZone, setPrintZone] = useState<ZoneRow | null>(null)
  const [labelSize, setLabelSize] = useState<ShelfLabelSize>('thermal-100x50')
  const [printing, setPrinting] = useState(false)
  const [deleteShelf, setDeleteShelf] = useState<Shelf | null>(null)
  // Multi-select delete (scoped to the one expanded zone at a time).
  const [selectMode, setSelectMode] = useState(false)
  const [selectedShelves, setSelectedShelves] = useState<Set<string>>(new Set())
  const [bulkDelete, setBulkDelete] = useState<Shelf[] | null>(null)

  const { data: tenant } = useQuery({
    queryKey: ['tenant'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants').select('name').eq('id', profile!.tenant_id).single()
      if (error) throw error
      return data as { name: string }
    },
  })

  const { data: zones, isLoading } = useQuery({
    queryKey: ['zones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zones').select('*').is('deleted_at', null).order('code')
      if (error) throw error
      return data as ZoneRow[]
    },
  })

  const { data: shelves } = useQuery({
    queryKey: ['shelves'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shelves').select('*').is('deleted_at', null).order('code')
      if (error) throw error
      return data as Shelf[]
    },
  })

  // Which locations have products recorded on them — so filled ones show green.
  const { data: filledShelves } = useQuery({
    queryKey: ['shelves-with-stock'],
    queryFn: async () => {
      const ids = new Set<string>()
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('stock_balances').select('shelf_id').order('shelf_id').range(from, from + 999)
        if (error) throw error
        for (const r of data ?? []) ids.add((r as { shelf_id: string }).shelf_id)
        if (!data || data.length < 1000) break
      }
      return ids
    },
  })

  // --- Create / edit zone ----------------------------------------------------
  const emptyZone = { number: '', name: '', category: '', notes: '' }
  const [zoneForm, setZoneForm] = useState(emptyZone)

  const saveZone = useMutation({
    mutationFn: async (existingId: string | null) => {
      const payload = {
        name: zoneForm.name.trim(),
        default_category: zoneForm.category.trim() || null,
        description: zoneForm.notes.trim() || null,
      }
      if (existingId) {
        const { error } = await supabase.from('zones').update(payload).eq('id', existingId)
        if (error) throw error
        await logActivity({
          tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
          action: 'update.zone', entityType: 'zone', entityId: existingId, after: payload,
        })
      } else {
        const code = 'Z' + pad2(Number(zoneForm.number))
        const { data, error } = await supabase
          .from('zones')
          .insert({ tenant_id: profile!.tenant_id, code, ...payload })
          .select().single()
        if (error) throw error
        await logActivity({
          tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
          action: 'create.zone', entityType: 'zone', entityId: data.id, after: { code, ...payload },
        })
      }
    },
    onSuccess: () => {
      setZoneForm(emptyZone)
      setShowZoneForm(false)
      setEditingZone(null)
      void queryClient.invalidateQueries({ queryKey: ['zones'] })
    },
  })

  // --- Bulk zone CSV import (Zone No. / Zone Name / Category Type / Notes) ----
  const importZones = async (file: File) => {
    setImportStatus(null)
    const rows = parseCsv(await file.text())
    if (rows.length < 2) return setImportStatus('CSV appears empty (need a header row plus data).')
    const headers = rows[0]
    const noCol = findColumn(headers, ['zoneno', 'zone', 'no', 'number', 'znum'])
    const nameCol = findColumn(headers, ['zonename', 'name'])
    const catCol = findColumn(headers, ['categorytype', 'category', 'type'])
    const notesCol = findColumn(headers, ['notes', 'description', 'note'])
    if (noCol === -1 || nameCol === -1) {
      return setImportStatus(`Need "Zone No." and "Zone Name" columns. Headers seen: ${headers.join(', ')}`)
    }
    const payload = rows.slice(1)
      .map((r) => ({
        number: Number(r[noCol]?.trim()),
        name: r[nameCol]?.trim() ?? '',
        category: catCol !== -1 ? r[catCol]?.trim() || null : null,
        notes: notesCol !== -1 ? r[notesCol]?.trim() || null : null,
      }))
      .filter((r) => r.name && Number.isFinite(r.number) && r.number > 0)
      .map((r) => ({
        tenant_id: profile!.tenant_id,
        code: 'Z' + pad2(r.number),
        name: r.name,
        default_category: r.category,
        description: r.notes,
      }))
    if (payload.length === 0) return setImportStatus('No valid zone rows found.')
    const { error, count } = await supabase
      .from('zones')
      .upsert(payload, { onConflict: 'tenant_id,code', ignoreDuplicates: true, count: 'exact' })
    if (error) return setImportStatus(`Import failed: ${error.message}`)
    await logActivity({
      tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
      action: 'import.zones_csv', entityType: 'zone', after: { rows: payload.length, added: count },
    })
    setImportStatus(`Imported ${count ?? payload.length} zones (existing codes skipped).`)
    void queryClient.invalidateQueries({ queryKey: ['zones'] })
  }

  // --- Bulk create storage places ---------------------------------------------
  const [bulkZoneId, setBulkZoneId] = useState<string | null>(null)
  const [bulkMode, setBulkMode] = useState<'run' | 'pallet'>('run')
  const [fixtureName, setFixtureName] = useState('Shelf')
  const [prefix, setPrefix] = useState('S')
  const [fromNum, setFromNum] = useState(1)
  const [toNum, setToNum] = useState(6)
  // Pallet area: several blocks, each a rows × cols grid. Roads are drawn
  // between blocks automatically, so there's nothing to configure for them.
  const [palletBlocks, setPalletBlocks] = useState<{ rows: number; cols: number }[]>([
    { rows: 5, cols: 2 },
  ])

  const openBulk = (zoneId: string) => {
    setBulkZoneId(zoneId)
    setBulkMode('run')
    setPalletBlocks([{ rows: 5, cols: 2 }])
  }

  const palletTotal = palletBlocks.reduce((a, b) => a + b.rows * b.cols, 0)

  // Continue block lettering from what the zone already has, so a second pallet
  // area starts at Block B rather than re-using Block A (which would collide).
  const blockOffset = (() => {
    const existing = (shelves ?? [])
      .filter((s) => s.zone_id === bulkZoneId && s.pallet_block != null)
      .map((s) => num(s.pallet_block))
    return existing.length ? Math.max(...existing) : 0
  })()

  const createShelves = useMutation({
    mutationFn: async () => {
      const zone = zones!.find((z) => z.id === bulkZoneId)!
      const cleanPrefix = prefix.trim().toUpperCase().replace(/[^A-Z]/g, '') || prefixFor(fixtureName)
      if (!cleanPrefix) throw new Error('Code prefix must contain letters')
      const rows = []
      for (let n = fromNum; n <= toNum; n++) {
        rows.push({
          tenant_id: profile!.tenant_id,
          zone_id: zone.id,
          code: `${zone.code}-${cleanPrefix}${pad3(n)}`,
          fixture_type: fixtureName.trim() || 'Shelf',
        })
      }
      await addOrReviveShelves(profile!.tenant_id, rows)
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'create.shelves_bulk', entityType: 'shelf',
        after: { zone: zone.code, fixture: fixtureName, prefix: cleanPrefix, from: fromNum, to: toNum },
      })
    },
    onSuccess: () => {
      setBulkZoneId(null)
      void queryClient.invalidateQueries({ queryKey: ['shelves'] })
    },
  })

  // Pallet area — a car-park grid. Each bay is a row; its depth is how many
  // pallets deep. Positions are addressed by coordinate (Row 2 · Col 3), never
  // scanned, because long stock on a pallet hides any barcode.
  const createPalletGrid = useMutation({
    mutationFn: async () => {
      const zone = zones!.find((z) => z.id === bulkZoneId)!
      const rows: Record<string, unknown>[] = []
      palletBlocks.forEach((block, bi) => {
        const b = blockOffset + bi + 1
        for (let r = 1; r <= block.rows; r++) {
          for (let c = 1; c <= block.cols; c++) {
            rows.push({
              tenant_id: profile!.tenant_id,
              zone_id: zone.id,
              code: `${zone.code}-${blockLetter(b)}-R${pad2(r)}-C${pad2(c)}`,
              fixture_type: 'Pallet',
              description: palletLabel(b, r, c),
              pallet_block: b,
              pallet_row: r,
              pallet_col: c,
            })
          }
        }
      })
      if (rows.length === 0) throw new Error('Add at least one block with rows and columns.')
      await addOrReviveShelves(profile!.tenant_id, rows)
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'create.pallets_bulk', entityType: 'shelf',
        after: { zone: zone.code, blocks: palletBlocks, total: rows.length },
      })
    },
    onSuccess: () => {
      setBulkZoneId(null)
      void queryClient.invalidateQueries({ queryKey: ['shelves'] })
    },
  })

  // --- Delete a location ------------------------------------------------------
  // What's recorded on the shelf being deleted, so we can warn before removing it.
  const { data: deleteContents } = useQuery({
    queryKey: ['shelf-contents', deleteShelf?.id],
    enabled: !!deleteShelf,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_balances')
        .select('qty_on_hand, qty_on_hold, items(name, uom)')
        .eq('shelf_id', deleteShelf!.id)
      if (error) throw error
      return (data ?? []) as unknown as { qty_on_hand: number; qty_on_hold: number; items: { name: string; uom: string } | null }[]
    },
  })

  const deleteLocation = useMutation({
    mutationFn: async (shelf: Shelf) => {
      const { error } = await supabase.rpc('delete_location', { p_shelf_id: shelf.id })
      if (error) throw new Error(error.message)
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'delete.location', entityType: 'shelf', entityId: shelf.id, after: { code: shelf.code },
      })
    },
    onSuccess: () => {
      setDeleteShelf(null)
      for (const k of [['shelves'], ['shelves-with-stock'], ['item-locator'], ['stock-overview'], ['stock-by-zone']]) {
        void queryClient.invalidateQueries({ queryKey: k })
      }
    },
  })

  // Delete several locations at once — each goes through the same guarded RPC.
  const bulkDeleteMut = useMutation({
    mutationFn: async (list: Shelf[]) => {
      await Promise.all(
        list.map((s) =>
          supabase.rpc('delete_location', { p_shelf_id: s.id }).then(({ error }) => {
            if (error) throw new Error(error.message)
          }),
        ),
      )
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'delete.locations_bulk', entityType: 'shelf',
        after: { count: list.length, codes: list.map((s) => s.code) },
      })
    },
    onSuccess: () => {
      setBulkDelete(null)
      setSelectMode(false)
      setSelectedShelves(new Set())
      for (const k of [['shelves'], ['shelves-with-stock'], ['item-locator'], ['stock-overview'], ['stock-by-zone']]) {
        void queryClient.invalidateQueries({ queryKey: k })
      }
    },
  })

  const toggleShelfSel = (id: string) =>
    setSelectedShelves((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const shelvesByZone = (zoneId: string) => (shelves ?? []).filter((s) => s.zone_id === zoneId)

  const printZoneLabels = async (zone: ZoneRow, size: ShelfLabelSize) => {
    const zoneShelves = shelvesByZone(zone.id)
    if (zoneShelves.length === 0) return
    setPrinting(true)
    try {
      await generateShelfLabelsPdf(
        zoneShelves.map((s) => ({
          code: s.code,
          companyName: tenant?.name ?? '',
          zoneName: zone.name,
          zoneNo: 'Zone ' + Number(zone.code.replace(/^Z/i, '')),
          locationLabel: locationLabel(s),
        })),
        `${zone.code}-labels.pdf`,
        size,
      )
      void logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'print.shelf_labels', entityType: 'zone', entityId: zone.id,
        after: { count: zoneShelves.length, size },
      })
      setPrintZone(null)
    } finally {
      setPrinting(false)
    }
  }

  if (isLoading) return <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin text-brand-500" />

  const zoneFormFields = (
    <>
      <div className="min-w-48 flex-1">
        <label className="label-text">Zone name *</label>
        <input className="input-field" placeholder="Foam" value={zoneForm.name}
          onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} required />
      </div>
      <div className="min-w-40">
        <label className="label-text">Category</label>
        <input className="input-field" placeholder="Raw Material" value={zoneForm.category}
          onChange={(e) => setZoneForm({ ...zoneForm, category: e.target.value })} />
      </div>
      <div className="min-w-48 flex-1">
        <label className="label-text">Notes</label>
        <input className="input-field" placeholder="Foam blocks / sheets" value={zoneForm.notes}
          onChange={(e) => setZoneForm({ ...zoneForm, notes: e.target.value })} />
      </div>
    </>
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Zones & Locations"
        subtitle="Define the warehouse layout in your own words, then print the stickers."
        actions={
          <>
            <button
              className="btn-secondary"
              onClick={downloadZoneTemplate}
              title="Download a fill-in CSV with the exact columns the import expects"
            >
              <FileDown className="h-5 w-5" /> CSV template
            </button>
            <button className="btn-secondary" onClick={() => csvInput.current?.click()}>
              <Upload className="h-5 w-5" /> Import zones CSV
            </button>
            <button className="btn-primary" onClick={() => { setShowZoneForm((v) => !v); setEditingZone(null); setZoneForm(emptyZone) }}>
              <Plus className="h-5 w-5" /> New Zone
            </button>
          </>
        }
      />
      <input ref={csvInput} type="file" accept=".csv,text/csv" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void importZones(f)
          e.target.value = ''
        }} />
      {importStatus && <p className="text-sm text-ink-500">{importStatus}</p>}

      {printZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4"
          onClick={() => !printing && setPrintZone(null)}>
          <div className="card w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="text-lg font-bold">Print location labels</p>
              <p className="mt-1 text-sm text-ink-500">
                {shelvesByZone(printZone.id).length} labels for {printZone.code} {printZone.name}
              </p>
            </div>
            <div>
              <label className="label-text">Label size</label>
              <select className="input-field" value={labelSize}
                onChange={(e) => setLabelSize(e.target.value as ShelfLabelSize)}>
                {SHELF_LABEL_SIZES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-400">
                Using a label printer (TSC / TVS)? Pick the size that matches your roll — each
                sticker prints on its own page. Choose A4 only for sticker sheets in an office
                printer.
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={printing}
                onClick={() => void printZoneLabels(printZone, labelSize)}>
                {printing && <Loader2 className="h-5 w-5 animate-spin" />}
                Download PDF
              </button>
              <button className="btn-secondary" disabled={printing} onClick={() => setPrintZone(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteShelf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4"
          onClick={() => !deleteLocation.isPending && setDeleteShelf(null)}>
          <div className="card w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="text-lg font-bold">Delete this location?</p>
              <p className="mt-1 text-sm text-ink-500">
                <span className="font-mono font-semibold">{deleteShelf.code}</span> · {locationLabel(deleteShelf)}
              </p>
            </div>

            {deleteContents == null ? (
              <Loader2 className="mx-auto my-2 h-5 w-5 animate-spin text-brand-500" />
            ) : deleteContents.length === 0 ? (
              <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-500">This location is empty — safe to remove.</p>
            ) : (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> This location still has stock recorded on it:
                </p>
                <ul className="mt-2 space-y-0.5">
                  {deleteContents.map((c, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{c.items?.name ?? 'Unknown item'}</span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {num(c.qty_on_hand)}{num(c.qty_on_hold) > 0 ? ` (+${num(c.qty_on_hold)} hold)` : ''} {c.items?.uom ?? ''}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">Deleting removes the location <b>and clears this recorded stock</b>. This can't be undone.</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                className="inline-flex min-h-tap items-center justify-center gap-2 rounded-xl bg-red-600 px-4 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                disabled={deleteLocation.isPending || deleteContents == null}
                onClick={() => deleteLocation.mutate(deleteShelf)}>
                {deleteLocation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                {deleteContents && deleteContents.length > 0 ? 'Delete anyway' : 'Delete location'}
              </button>
              <button className="btn-secondary" disabled={deleteLocation.isPending} onClick={() => setDeleteShelf(null)}>Cancel</button>
            </div>
            {deleteLocation.isError && <p className="text-sm text-red-600">{(deleteLocation.error as Error).message}</p>}
          </div>
        </div>
      )}

      {bulkDelete && (() => {
        const withStock = bulkDelete.filter((s) => filledShelves?.has(s.id))
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4"
            onClick={() => !bulkDeleteMut.isPending && setBulkDelete(null)}>
            <div className="card w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
              <div>
                <p className="text-lg font-bold">Delete {bulkDelete.length} location{bulkDelete.length === 1 ? '' : 's'}?</p>
                <p className="mt-1 break-words font-mono text-sm text-ink-500">
                  {bulkDelete.slice(0, 10).map((s) => s.code).join(', ')}
                  {bulkDelete.length > 10 ? `, +${bulkDelete.length - 10} more` : ''}
                </p>
              </div>
              {withStock.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {withStock.length} of these still have stock recorded
                  </p>
                  <p className="mt-1 text-xs">
                    Deleting removes {withStock.length === 1 ? 'that location' : 'those locations'} <b>and clears
                    that recorded stock</b>. This can't be undone.
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  className="inline-flex min-h-tap items-center justify-center gap-2 rounded-xl bg-red-600 px-4 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  disabled={bulkDeleteMut.isPending}
                  onClick={() => bulkDeleteMut.mutate(bulkDelete)}>
                  {bulkDeleteMut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                  Delete {bulkDelete.length} location{bulkDelete.length === 1 ? '' : 's'}
                </button>
                <button className="btn-secondary" disabled={bulkDeleteMut.isPending} onClick={() => setBulkDelete(null)}>Cancel</button>
              </div>
              {bulkDeleteMut.isError && <p className="text-sm text-red-600">{(bulkDeleteMut.error as Error).message}</p>}
            </div>
          </div>
        )
      })()}

      {showZoneForm && (
        <form className="card flex flex-wrap items-end gap-3"
          onSubmit={(e) => { e.preventDefault(); saveZone.mutate(null) }}>
          <div className="w-28">
            <label className="label-text">Zone no. *</label>
            <input type="number" min="1" className="input-field" placeholder="3" value={zoneForm.number}
              onChange={(e) => setZoneForm({ ...zoneForm, number: e.target.value })} required />
          </div>
          {zoneFormFields}
          <button type="submit" className="btn-primary" disabled={saveZone.isPending}>Create</button>
          {saveZone.isError && (
            <p className="w-full text-sm text-red-600">{(saveZone.error as Error).message}</p>
          )}
        </form>
      )}

      {(zones ?? []).length === 0 && (
        <EmptyState
          icon={Map}
          title="No zones yet"
          detail="Zones are the areas of your warehouse. Add them one by one, or import your whole list from a CSV — then add the shelves, ghodas or racks inside each one and print their barcode labels."
        />
      )}

      {(zones ?? []).map((zone) => {
        const zoneShelves = shelvesByZone(zone.id)
        const zoneFilled = zoneShelves.filter((s) => filledShelves?.has(s.id)).length
        const expanded = expandedZone === zone.id
        const editing = editingZone === zone.id
        return (
          <div key={zone.id} className={'card transition-shadow ' + (expanded ? 'ring-1 ring-brand-100' : '')}>
            <div className="flex items-center gap-2">
              <button className="flex min-h-tap flex-1 items-center gap-3 text-left"
                onClick={() => { setExpandedZone(expanded ? null : zone.id); setSelectMode(false); setSelectedShelves(new Set()) }}>
                {expanded
                  ? <ChevronDown className="h-5 w-5 shrink-0 text-ink-400" />
                  : <ChevronRight className="h-5 w-5 shrink-0 text-ink-400" />}
                <span className="shrink-0 rounded-lg bg-brand-50 px-2.5 py-1 font-mono text-sm font-bold text-brand-700">
                  {zone.code}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink-900">{zone.name}</span>
                  <span className="block text-xs text-ink-400">
                    {zoneShelves.length} location{zoneShelves.length === 1 ? '' : 's'}
                    {zoneFilled > 0 && <> · <span className="font-medium text-green-700">{zoneFilled} with stock</span></>}
                    {zone.default_category && ` · ${zone.default_category}`}
                  </span>
                </span>
              </button>
              <button
                className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-400 hover:bg-ink-100"
                aria-label={`Edit ${zone.name}`}
                onClick={() => {
                  setEditingZone(editing ? null : zone.id)
                  setShowZoneForm(false)
                  setZoneForm({
                    number: String(Number(zone.code.replace(/^Z/i, ''))),
                    name: zone.name,
                    category: zone.default_category ?? '',
                    notes: zone.description ?? '',
                  })
                }}
              >
                <Pencil className="h-5 w-5" />
              </button>
              <button className="btn-secondary" onClick={() => setPrintZone(zone)}
                disabled={zoneShelves.length === 0 || !tenant}
                title="Printable stickers: company name, code, barcode + QR, zone and place name">
                <Printer className="h-5 w-5" /> Labels
              </button>
            </div>

            {editing && (
              <form className="mt-4 flex flex-wrap items-end gap-3 border-t border-ink-100 pt-4"
                onSubmit={(e) => { e.preventDefault(); saveZone.mutate(zone.id) }}>
                {zoneFormFields}
                <button type="submit" className="btn-primary" disabled={saveZone.isPending}>Save</button>
                <button type="button" className="btn-secondary" onClick={() => setEditingZone(null)}>Cancel</button>
              </form>
            )}

            {expanded && (
              <div className="mt-4 space-y-3 border-t border-ink-100 pt-4">
                {zoneShelves.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {!selectMode ? (
                      <>
                        <p className="flex items-center gap-3 text-xs text-ink-400">
                          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" /> has stock</span>
                          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-ink-300" /> empty</span>
                        </p>
                        <button
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-500 hover:bg-ink-100"
                          onClick={() => { setSelectMode(true); setSelectedShelves(new Set()) }}>
                          <ListChecks className="h-4 w-4" /> Select
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-ink-600">{selectedShelves.size} selected</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <button className="text-sm text-ink-500 hover:text-ink-900"
                            onClick={() => setSelectedShelves(new Set(zoneShelves.map((s) => s.id)))}>Select all</button>
                          <button className="text-sm text-ink-500 hover:text-ink-900"
                            onClick={() => setSelectedShelves(new Set())}>Clear</button>
                          <button
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                            disabled={selectedShelves.size === 0}
                            onClick={() => setBulkDelete(zoneShelves.filter((s) => selectedShelves.has(s.id)))}>
                            <Trash2 className="h-4 w-4" /> Delete {selectedShelves.size}
                          </button>
                          <button className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-ink-500 hover:bg-ink-100"
                            onClick={() => { setSelectMode(false); setSelectedShelves(new Set()) }}>
                            <X className="h-4 w-4" /> Done
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {zoneShelves.map((s) => {
                    const filled = filledShelves?.has(s.id) ?? false
                    const sel = selectedShelves.has(s.id)
                    if (selectMode) {
                      return (
                        <button key={s.id} type="button" onClick={() => toggleShelfSel(s.id)}
                          className={'inline-flex items-center gap-2 rounded-lg border py-1.5 pl-2 pr-3 text-sm transition-colors ' +
                            (sel ? 'border-brand-500 bg-brand-50 text-ink-900' : 'border-tan/50 bg-cream-dark hover:border-ink-300')}>
                          <span className={'flex h-4 w-4 items-center justify-center rounded border ' +
                            (sel ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-300 bg-white')}>
                            {sel && <Check className="h-3 w-3" />}
                          </span>
                          <span className={'inline-block h-2 w-2 rounded-full ' + (filled ? 'bg-green-500' : 'bg-ink-300')} />
                          <span className="font-mono">{s.code}</span>
                        </button>
                      )
                    }
                    return (
                      <span key={s.id}
                        className={'inline-flex items-center gap-1.5 rounded-lg py-1 pl-2.5 pr-1 text-sm ' +
                          (filled ? 'bg-green-100 text-green-900' : 'bg-cream-dark')}>
                        <span className={'inline-block h-2 w-2 rounded-full ' + (filled ? 'bg-green-500' : 'bg-ink-300')} />
                        <span className="font-mono">{s.code}</span>
                        <span className={filled ? 'text-green-700' : 'text-ink-400'}>{locationLabel(s)}</span>
                        <button
                          className="flex h-6 w-6 items-center justify-center rounded text-ink-300 hover:bg-red-100 hover:text-red-600"
                          onClick={() => setDeleteShelf(s)} aria-label={`Delete ${s.code}`} title="Delete this location">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )
                  })}
                  {zoneShelves.length === 0 && (
                    <span className="text-sm text-ink-400">
                      No locations in this zone yet — add them using whatever your team calls them.
                    </span>
                  )}
                </div>

                {bulkZoneId === zone.id ? (
                  <div className="space-y-3">
                    <div className="inline-flex rounded-xl bg-ink-100 p-1 text-sm font-semibold">
                      <button type="button"
                        className={`min-h-tap rounded-lg px-4 ${bulkMode === 'run' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
                        onClick={() => setBulkMode('run')}>
                        Shelves / racks
                      </button>
                      <button type="button"
                        className={`min-h-tap rounded-lg px-4 ${bulkMode === 'pallet' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
                        onClick={() => setBulkMode('pallet')}>
                        Pallet area
                      </button>
                    </div>

                    {bulkMode === 'run' ? (
                    <form className="flex flex-wrap items-end gap-3"
                      onSubmit={(e) => { e.preventDefault(); createShelves.mutate() }}>
                      <div className="min-w-40">
                        <label className="label-text">What do you call this location type?</label>
                        <input className="input-field" list="fixture-suggestions" value={fixtureName}
                          placeholder="Shelf / Ghoda / Rack…"
                          onChange={(e) => {
                            setFixtureName(e.target.value)
                            setPrefix(prefixFor(e.target.value))
                          }} required />
                        <datalist id="fixture-suggestions">
                          {LOCATION_TYPE_SUGGESTIONS.map((f) => <option key={f} value={f} />)}
                        </datalist>
                      </div>
                      <div className="w-24">
                        <label className="label-text">Code prefix</label>
                        <input className="input-field font-mono uppercase" value={prefix} maxLength={3}
                          onChange={(e) => setPrefix(e.target.value.toUpperCase())} required />
                      </div>
                      <div className="w-24">
                        <label className="label-text">From #</label>
                        <input type="number" min={1} className="input-field" value={fromNum}
                          onChange={(e) => setFromNum(Number(e.target.value))} />
                      </div>
                      <div className="w-24">
                        <label className="label-text">To #</label>
                        <input type="number" min={fromNum} className="input-field" value={toNum}
                          onChange={(e) => setToNum(Number(e.target.value))} />
                      </div>
                      <p className="w-full text-xs text-ink-400 sm:w-auto">
                        → codes {zone.code}-{(prefix || 'S')}{pad3(fromNum)} … {zone.code}-{(prefix || 'S')}{pad3(toNum)}
                      </p>
                      <button type="submit" className="btn-primary" disabled={createShelves.isPending}>
                        Add {Math.max(0, toNum - fromNum + 1)} location{toNum - fromNum === 0 ? '' : 's'}
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setBulkZoneId(null)}>Cancel</button>
                      {createShelves.isError && (
                        <p className="w-full text-sm text-red-600">{(createShelves.error as Error).message}</p>
                      )}
                    </form>
                    ) : (
                    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); createPalletGrid.mutate() }}>
                      <p className="text-xs text-ink-400">
                        A pallet area is one or more <b>blocks</b> of pallets, with roads (aisles)
                        drawn between them. Set each block's rows × columns. No barcodes needed:
                        pallets are found by coordinate (Block B · Row 2 · Col 3).
                      </p>

                      <div className="space-y-2">
                        {palletBlocks.map((block, i) => (
                          <div key={i} className="flex flex-wrap items-end gap-2">
                            <span className="flex h-11 w-20 items-center justify-center rounded-lg bg-ink-100 text-sm font-semibold text-ink-600">
                              Block {blockLetter(blockOffset + i + 1)}
                            </span>
                            <div className="w-24">
                              <label className="label-text">Rows</label>
                              <input type="number" min={1} className="input-field" value={block.rows}
                                onChange={(e) => setPalletBlocks(palletBlocks.map((b, idx) => idx === i ? { ...b, rows: Math.max(1, Number(e.target.value)) } : b))} />
                            </div>
                            <div className="w-24">
                              <label className="label-text">Columns</label>
                              <input type="number" min={1} className="input-field" value={block.cols}
                                onChange={(e) => setPalletBlocks(palletBlocks.map((b, idx) => idx === i ? { ...b, cols: Math.max(1, Number(e.target.value)) } : b))} />
                            </div>
                            {palletBlocks.length > 1 && (
                              <button type="button" aria-label={`Remove Block ${blockLetter(blockOffset + i + 1)}`}
                                className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600"
                                onClick={() => setPalletBlocks(palletBlocks.filter((_, idx) => idx !== i))}>
                                <Trash2 className="h-5 w-5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button type="button" className="btn-secondary"
                        onClick={() => setPalletBlocks([...palletBlocks, { rows: 5, cols: 2 }])}>
                        <Plus className="h-5 w-5" /> Add block
                      </button>

                      <div>
                        <p className="label-text">Preview — {palletTotal} pallets</p>
                        <PalletMap pallets={palletBlocks.flatMap((block, bi) =>
                          Array.from({ length: block.rows }, (_, ri) =>
                            Array.from({ length: block.cols }, (_, ci) => ({
                              id: `b${blockOffset + bi + 1}r${ri + 1}c${ci + 1}`,
                              code: `${zone.code}-${blockLetter(blockOffset + bi + 1)}-R${pad2(ri + 1)}-C${pad2(ci + 1)}`,
                              pallet_block: blockOffset + bi + 1, pallet_row: ri + 1, pallet_col: ci + 1,
                            })),
                          ).flat(),
                        )} />
                      </div>

                      <div className="flex gap-2">
                        <button type="submit" className="btn-primary" disabled={createPalletGrid.isPending}>
                          {createPalletGrid.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
                          Create {palletTotal} pallets
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => setBulkZoneId(null)}>Cancel</button>
                      </div>
                      {createPalletGrid.isError && (
                        <p className="text-sm text-red-600">{(createPalletGrid.error as Error).message}</p>
                      )}
                    </form>
                    )}
                  </div>
                ) : (
                  <button className="btn-secondary" onClick={() => openBulk(zone.id)}>
                    <Plus className="h-5 w-5" /> Add locations
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
