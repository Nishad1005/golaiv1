import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2, MapPin, PackageSearch } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { locationLabel } from '../../lib/places'
import { PageHeader } from '../../components/PageHeader'
import { PalletMap } from '../../components/PalletMap'
import type { Shelf, Zone } from '../../lib/types'

interface StockRow {
  qty_on_hand: number
  qty_on_hold: number
  items: { id: string; code: string; name: string; uom: string } | null
  shelves: {
    id: string
    code: string
    fixture_type: string | null
    description: string | null
    zones: { id: string; code: string; name: string } | null
  } | null
}

interface ShelfGroup {
  id: string
  label: string
  code: string
  rows: StockRow[]
}

/**
 * Zone stock — the locations in one zone and the products on each, with
 * quantities. A pallet zone can be seen as a car-park map (bays × depth) with a
 * count on each cell; tapping a pallet shows what's on it. A product row links
 * to its stock card (/item/:id), so the drill-down ends on the page the user
 * already knows from Find Item.
 */
export function ZoneStock() {
  const { zoneId } = useParams<{ zoneId: string }>()
  const [selectedShelfId, setSelectedShelfId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['zone-stock', zoneId],
    enabled: !!zoneId,
    queryFn: async (): Promise<StockRow[]> => {
      const { data, error } = await supabase
        .from('stock_balances')
        .select('qty_on_hand, qty_on_hold, items(id, code, name, uom), shelves!inner(id, code, fixture_type, description, zones!inner(id, code, name))')
        .eq('shelves.zone_id', zoneId!)
        .or('qty_on_hand.gt.0,qty_on_hold.gt.0')
      if (error) throw error
      return (data ?? []) as unknown as StockRow[]
    },
  })

  // Every pallet in the zone — including empty ones — so the map shows the full
  // grid, not just pallets that happen to hold counted stock.
  const { data: palletShelves } = useQuery({
    queryKey: ['zone-pallets', zoneId],
    enabled: !!zoneId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shelves')
        .select('id, code, description, pallet_row, pallet_col, aisle_after, zones(code, name)')
        .eq('zone_id', zoneId!).is('deleted_at', null)
        .not('pallet_row', 'is', null)
      if (error) throw error
      return (data ?? []) as unknown as (Pick<Shelf, 'id' | 'code' | 'description' | 'pallet_row' | 'pallet_col' | 'aisle_after'> & { zones: Pick<Zone, 'code' | 'name'> | null })[]
    },
  })

  const zone = (data ?? []).find((r) => r.shelves?.zones)?.shelves?.zones
    ?? (palletShelves ?? []).find((p) => p.zones)?.zones ?? null

  const groups = useMemo<ShelfGroup[]>(() => {
    const map = new Map<string, ShelfGroup>()
    for (const r of data ?? []) {
      const sh = r.shelves
      if (!sh) continue
      let g = map.get(sh.id)
      if (!g) {
        g = { id: sh.id, code: sh.code, label: locationLabel(sh), rows: [] }
        map.set(sh.id, g)
      }
      if (r.items) g.rows.push(r)
    }
    for (const g of map.values()) {
      g.rows.sort((a, b) => (a.items!.name).localeCompare(b.items!.name))
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [data])

  const countByShelf = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of groups) m.set(g.id, g.rows.length)
    return m
  }, [groups])

  const hasPallets = (palletShelves ?? []).length > 0
  const [view, setView] = useState<'list' | 'map'>('map')
  const showMap = hasPallets && view === 'map'

  const productCount = (data ?? []).filter((r) => r.items).length
  const locationCount = hasPallets ? (palletShelves ?? []).length : groups.length
  const selectedGroup = groups.find((g) => g.id === selectedShelfId) ?? null
  const selectedPallet = (palletShelves ?? []).find((p) => p.id === selectedShelfId) ?? null

  return (
    <div>
      <Link to="/stock" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> All zones
      </Link>

      <PageHeader
        title={zone ? zone.name : 'Zone stock'}
        subtitle={zone
          ? `${zone.code} · ${locationCount} location${locationCount === 1 ? '' : 's'} · ${productCount} product${productCount === 1 ? '' : 's'} with stock`
          : undefined}
        actions={hasPallets ? (
          <div className="inline-flex rounded-xl bg-ink-100 p-1 text-sm font-semibold">
            <button className={`min-h-tap rounded-lg px-4 ${view === 'map' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
              onClick={() => setView('map')}>Map</button>
            <button className={`min-h-tap rounded-lg px-4 ${view === 'list' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
              onClick={() => setView('list')}>List</button>
          </div>
        ) : undefined}
      />

      {isLoading ? (
        <Loader2 className="mx-auto mt-10 h-7 w-7 animate-spin text-brand-500" />
      ) : showMap ? (
        <div className="space-y-3">
          <PalletMap
            pallets={palletShelves ?? []}
            selectedId={selectedShelfId}
            onSelect={(p) => setSelectedShelfId((cur) => (cur === p.id ? null : p.id))}
            annotate={(p) => {
              const n = countByShelf.get(p.id) ?? 0
              return n > 0 ? `${n} item${n === 1 ? '' : 's'}` : 'empty'
            }}
          />
          {selectedPallet && (
            <section className="card p-0">
              <div className="flex items-center gap-2 border-b border-ink-200/70 px-4 py-3">
                <MapPin className="h-4 w-4 shrink-0 text-brand-500" aria-hidden />
                <span className="font-semibold text-ink-900">{locationLabel(selectedPallet)}</span>
                <span className="font-mono text-xs text-ink-400">{selectedPallet.code}</span>
              </div>
              {selectedGroup && selectedGroup.rows.length > 0 ? (
                <ProductList rows={selectedGroup.rows} />
              ) : (
                <p className="px-4 py-5 text-center text-sm text-ink-400">No counted stock on this pallet yet.</p>
              )}
            </section>
          )}
        </div>
      ) : groups.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-10 text-center text-ink-400">
          <PackageSearch className="h-8 w-8" />
          <p>No counted stock in this zone.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.id} className="card p-0">
              <div className="flex items-center gap-2 border-b border-ink-200/70 px-4 py-3">
                <MapPin className="h-4 w-4 shrink-0 text-brand-500" aria-hidden />
                <span className="font-semibold text-ink-900">{g.label}</span>
                <span className="font-mono text-xs text-ink-400">{g.code}</span>
                <span className="ml-auto text-xs text-ink-400 tabular-nums">
                  {g.rows.length} product{g.rows.length === 1 ? '' : 's'}
                </span>
              </div>
              <ProductList rows={g.rows} />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function ProductList({ rows }: { rows: StockRow[] }) {
  return (
    <ul className="divide-y divide-ink-100">
      {rows.map((r) => (
        <li key={r.items!.id} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <Link
              to={`/item/${r.items!.id}`}
              className="font-medium hover:text-brand-600 hover:underline"
              title="Stock card — what came in, what went out, what's left"
            >
              {r.items!.name}
            </Link>
            <p className="text-xs text-ink-400">{r.items!.code}</p>
          </div>
          <span className="shrink-0 text-right tabular-nums">
            <span className="text-lg font-bold">
              {r.qty_on_hand}{' '}
              <span className="text-sm font-normal text-ink-400">{r.items!.uom}</span>
            </span>
            {r.qty_on_hold > 0 && (
              <span className="block text-xs text-amber-600">+{r.qty_on_hold} on hold</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
