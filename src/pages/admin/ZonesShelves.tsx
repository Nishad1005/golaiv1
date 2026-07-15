import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, FileDown, Loader2, Pencil, Plus, Printer, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { generateShelfLabelsPdf } from '../../lib/labels'
import { parseCsv, findColumn, downloadZoneTemplate } from '../../lib/csv'
import { PageHeader } from '../../components/PageHeader'
import type { Shelf, Zone } from '../../lib/types'

const FIXTURE_SUGGESTIONS = ['Shelf', 'Ghoda', 'Rack', 'Pallet', 'Bin', 'Floor Area']

type ZoneRow = Zone & { description: string | null; default_category: string | null }

const pad2 = (n: number) => String(n).padStart(2, '0')
const pad3 = (n: number) => String(n).padStart(3, '0')

/** "Z03-G001" + fixture "Ghoda" → "Ghoda 1" (the client's own words on the sticker) */
function locationLabel(shelf: Shelf): string {
  const m = shelf.code.match(/-([A-Za-z]+)0*(\d+)$/)
  return m ? `${shelf.fixture_type} ${Number(m[2])}` : shelf.code
}

export function ZonesShelves() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [expandedZone, setExpandedZone] = useState<string | null>(null)
  const [showZoneForm, setShowZoneForm] = useState(false)
  const [editingZone, setEditingZone] = useState<string | null>(null)
  const csvInput = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)

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
  const [fixtureName, setFixtureName] = useState('Shelf')
  const [prefix, setPrefix] = useState('S')
  const [fromNum, setFromNum] = useState(1)
  const [toNum, setToNum] = useState(6)

  const createShelves = useMutation({
    mutationFn: async () => {
      const zone = zones!.find((z) => z.id === bulkZoneId)!
      const cleanPrefix = (prefix.trim() || fixtureName.trim().charAt(0)).toUpperCase().replace(/[^A-Z]/g, '')
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
      const { error } = await supabase
        .from('shelves')
        .upsert(rows, { onConflict: 'tenant_id,code', ignoreDuplicates: true })
      if (error) throw error
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

  const shelvesByZone = (zoneId: string) => (shelves ?? []).filter((s) => s.zone_id === zoneId)

  const printZoneLabels = async (zone: ZoneRow) => {
    const zoneShelves = shelvesByZone(zone.id)
    if (zoneShelves.length === 0) return
    await generateShelfLabelsPdf(
      zoneShelves.map((s) => ({
        code: s.code,
        companyName: tenant?.name ?? '',
        zoneName: zone.name,
        zoneNo: 'Zone ' + Number(zone.code.replace(/^Z/i, '')),
        locationLabel: locationLabel(s),
      })),
      `${zone.code}-labels.pdf`,
    )
    void logActivity({
      tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
      action: 'print.shelf_labels', entityType: 'zone', entityId: zone.id,
      after: { count: zoneShelves.length },
    })
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
        title="Zones & Shelves"
        subtitle="Define the warehouse layout in the client's own words, then print the stickers."
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
        <div className="card py-10 text-center text-ink-400">
          No zones yet. Import the client's zone list as CSV, or create zones one by one.
        </div>
      )}

      {(zones ?? []).map((zone) => {
        const zoneShelves = shelvesByZone(zone.id)
        const expanded = expandedZone === zone.id
        const editing = editingZone === zone.id
        return (
          <div key={zone.id} className="card">
            <div className="flex items-center gap-2">
              <button className="flex min-h-tap flex-1 items-center gap-2 text-left"
                onClick={() => setExpandedZone(expanded ? null : zone.id)}>
                {expanded ? <ChevronDown className="h-5 w-5 shrink-0" /> : <ChevronRight className="h-5 w-5 shrink-0" />}
                <span className="font-mono font-semibold">{zone.code}</span>
                <span className="min-w-0 truncate font-medium">{zone.name}</span>
                {zone.default_category && (
                  <span className="hidden rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-500 sm:inline">
                    {zone.default_category}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-sm text-ink-400">{zoneShelves.length} places</span>
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
              <button className="btn-secondary" onClick={() => void printZoneLabels(zone)}
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
                <div className="flex flex-wrap gap-2">
                  {zoneShelves.map((s) => (
                    <span key={s.id} className="rounded-lg bg-cream-dark px-3 py-1.5 text-sm">
                      <span className="font-mono">{s.code}</span>
                      <span className="ml-1.5 text-ink-400">{locationLabel(s)}</span>
                    </span>
                  ))}
                  {zoneShelves.length === 0 && (
                    <span className="text-sm text-ink-400">
                      No storage places in this zone yet — add shelves, ghodas, racks… whatever the floor calls them.
                    </span>
                  )}
                </div>

                {bulkZoneId === zone.id ? (
                  <form className="flex flex-wrap items-end gap-3"
                    onSubmit={(e) => { e.preventDefault(); createShelves.mutate() }}>
                    <div className="min-w-40">
                      <label className="label-text">What is this place called?</label>
                      <input className="input-field" list="fixture-suggestions" value={fixtureName}
                        placeholder="Shelf / Ghoda / Rack…"
                        onChange={(e) => {
                          setFixtureName(e.target.value)
                          setPrefix(e.target.value.trim().charAt(0).toUpperCase())
                        }} required />
                      <datalist id="fixture-suggestions">
                        {FIXTURE_SUGGESTIONS.map((f) => <option key={f} value={f} />)}
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
                      Add {Math.max(0, toNum - fromNum + 1)} place{toNum - fromNum === 0 ? '' : 's'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setBulkZoneId(null)}>Cancel</button>
                    {createShelves.isError && (
                      <p className="w-full text-sm text-red-600">{(createShelves.error as Error).message}</p>
                    )}
                  </form>
                ) : (
                  <button className="btn-secondary" onClick={() => setBulkZoneId(zone.id)}>
                    <Plus className="h-5 w-5" /> Add storage places
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
