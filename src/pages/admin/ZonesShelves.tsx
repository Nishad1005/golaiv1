import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Printer, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { generateShelfLabelsPdf } from '../../lib/labels'
import type { FixtureType, Shelf, Zone } from '../../lib/types'

const FIXTURE_LABELS: Record<FixtureType, string> = {
  S: 'Shelf',
  G: 'Ghoda (pallet stand)',
  P: 'Pallet',
  R: 'Rack',
}

export function ZonesShelves() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [expandedZone, setExpandedZone] = useState<string | null>(null)
  const [showZoneForm, setShowZoneForm] = useState(false)

  const { data: zones, isLoading } = useQuery({
    queryKey: ['zones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zones')
        .select('*')
        .is('deleted_at', null)
        .order('code')
      if (error) throw error
      return data as Zone[]
    },
  })

  const { data: shelves } = useQuery({
    queryKey: ['shelves'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shelves')
        .select('*')
        .is('deleted_at', null)
        .order('code')
      if (error) throw error
      return data as Shelf[]
    },
  })

  // --- Create zone -----------------------------------------------------------
  const [zoneCode, setZoneCode] = useState('')
  const [zoneName, setZoneName] = useState('')

  const createZone = useMutation({
    mutationFn: async () => {
      const code = zoneCode.trim().toUpperCase()
      const { data, error } = await supabase
        .from('zones')
        .insert({ tenant_id: profile!.tenant_id, code, name: zoneName.trim() })
        .select()
        .single()
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'create.zone',
        entityType: 'zone',
        entityId: data.id,
        after: { code, name: zoneName.trim() },
      })
    },
    onSuccess: () => {
      setZoneCode('')
      setZoneName('')
      setShowZoneForm(false)
      void queryClient.invalidateQueries({ queryKey: ['zones'] })
    },
  })

  // --- Bulk create shelves ---------------------------------------------------
  const [bulkZoneId, setBulkZoneId] = useState<string | null>(null)
  const [fixture, setFixture] = useState<FixtureType>('S')
  const [fromNum, setFromNum] = useState(1)
  const [toNum, setToNum] = useState(10)

  const createShelves = useMutation({
    mutationFn: async () => {
      const zone = zones!.find((z) => z.id === bulkZoneId)!
      const zoneNum = zone.code.replace(/^Z/i, '')
      const rows = []
      for (let n = fromNum; n <= toNum; n++) {
        rows.push({
          tenant_id: profile!.tenant_id,
          zone_id: zone.id,
          code: `Z${zoneNum}-${fixture}${String(n).padStart(3, '0')}`,
          fixture_type: fixture,
        })
      }
      const { error } = await supabase
        .from('shelves')
        .upsert(rows, { onConflict: 'tenant_id,code', ignoreDuplicates: true })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'create.shelves_bulk',
        entityType: 'shelf',
        after: { zone: zone.code, fixture, from: fromNum, to: toNum },
      })
    },
    onSuccess: () => {
      setBulkZoneId(null)
      void queryClient.invalidateQueries({ queryKey: ['shelves'] })
    },
  })

  const shelvesByZone = (zoneId: string) => (shelves ?? []).filter((s) => s.zone_id === zoneId)

  const printZoneLabels = (zone: Zone) => {
    const zoneShelves = shelvesByZone(zone.id)
    if (zoneShelves.length === 0) return
    generateShelfLabelsPdf(
      zoneShelves.map((s) => ({ code: s.code, zoneName: zone.name })),
      `${zone.code}-labels.pdf`,
    )
    void logActivity({
      tenantId: profile!.tenant_id,
      userId: profile!.id,
      userRole: profile!.role,
      action: 'print.shelf_labels',
      entityType: 'zone',
      entityId: zone.id,
      after: { count: zoneShelves.length },
    })
  }

  if (isLoading) return <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin text-brand-500" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Zones & Shelves</h1>
        <button className="btn-primary" onClick={() => setShowZoneForm((v) => !v)}>
          <Plus className="h-5 w-5" /> New Zone
        </button>
      </div>

      {showZoneForm && (
        <form
          className="card flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            createZone.mutate()
          }}
        >
          <div>
            <label className="label-text">Zone code</label>
            <input
              className="input-field w-28"
              placeholder="Z01"
              value={zoneCode}
              onChange={(e) => setZoneCode(e.target.value)}
              pattern="Z\d+"
              title="Format: Z followed by a number, e.g. Z01"
              required
            />
          </div>
          <div className="min-w-48 flex-1">
            <label className="label-text">Zone name</label>
            <input
              className="input-field"
              placeholder="Fabric Store"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={createZone.isPending}>
            Create
          </button>
          {createZone.isError && (
            <p className="w-full text-sm text-red-600">{(createZone.error as Error).message}</p>
          )}
        </form>
      )}

      {(zones ?? []).length === 0 && (
        <div className="card py-10 text-center text-ink-400">
          No zones yet. Create zones from the client's warehouse layout, add shelves, then print
          the barcode labels.
        </div>
      )}

      {(zones ?? []).map((zone) => {
        const zoneShelves = shelvesByZone(zone.id)
        const expanded = expandedZone === zone.id
        return (
          <div key={zone.id} className="card">
            <div className="flex items-center gap-3">
              <button
                className="flex min-h-tap flex-1 items-center gap-2 text-left"
                onClick={() => setExpandedZone(expanded ? null : zone.id)}
              >
                {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                <span className="font-semibold">{zone.code}</span>
                <span className="text-ink-400">{zone.name}</span>
                <span className="ml-auto text-sm text-ink-400">{zoneShelves.length} shelves</span>
              </button>
              <button
                className="btn-secondary"
                onClick={() => printZoneLabels(zone)}
                disabled={zoneShelves.length === 0}
                title="Download printable barcode labels for all shelves in this zone"
              >
                <Printer className="h-5 w-5" /> Labels
              </button>
            </div>

            {expanded && (
              <div className="mt-4 space-y-3 border-t border-tan/20 pt-4">
                <div className="flex flex-wrap gap-2">
                  {zoneShelves.map((s) => (
                    <span key={s.id} className="rounded-lg bg-cream px-3 py-1.5 font-mono text-sm">
                      {s.code}
                    </span>
                  ))}
                  {zoneShelves.length === 0 && (
                    <span className="text-sm text-ink-400">No shelves in this zone yet.</span>
                  )}
                </div>

                {bulkZoneId === zone.id ? (
                  <form
                    className="flex flex-wrap items-end gap-3"
                    onSubmit={(e) => {
                      e.preventDefault()
                      createShelves.mutate()
                    }}
                  >
                    <div>
                      <label className="label-text">Fixture</label>
                      <select
                        className="input-field"
                        value={fixture}
                        onChange={(e) => setFixture(e.target.value as FixtureType)}
                      >
                        {Object.entries(FIXTURE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {k} — {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label-text">From #</label>
                      <input
                        type="number"
                        min={1}
                        className="input-field w-24"
                        value={fromNum}
                        onChange={(e) => setFromNum(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="label-text">To #</label>
                      <input
                        type="number"
                        min={fromNum}
                        className="input-field w-24"
                        value={toNum}
                        onChange={(e) => setToNum(Number(e.target.value))}
                      />
                    </div>
                    <button type="submit" className="btn-primary" disabled={createShelves.isPending}>
                      Add shelves
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setBulkZoneId(null)}>
                      Cancel
                    </button>
                    {createShelves.isError && (
                      <p className="w-full text-sm text-red-600">
                        {(createShelves.error as Error).message}
                      </p>
                    )}
                  </form>
                ) : (
                  <button className="btn-secondary" onClick={() => setBulkZoneId(zone.id)}>
                    <Plus className="h-5 w-5" /> Add shelves
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
