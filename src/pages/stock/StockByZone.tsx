import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Boxes, ChevronRight, Loader2, MapPin } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/EmptyState'

/** One stock line as the "stock by shelf" export returns it. */
interface StockRow {
  qty_on_hand: number
  qty_on_hold: number
  items: { uom: string } | null
  shelves: { id: string; zones: { id: string; code: string; name: string } | null } | null
}

interface ZoneSummary {
  id: string
  code: string
  name: string
  shelves: number
  lines: number
  onHold: number
}

/**
 * Stock by zone — the top of the drill-down reached from the Total stock tile.
 *
 * Lists every zone that currently holds counted stock; tapping one opens its
 * shelves. Same source as the ERP "stock by shelf" export (qty_on_hand > 0), so
 * the two always agree.
 */
export function StockByZone() {
  const { data, isLoading } = useQuery({
    queryKey: ['stock-by-zone'],
    queryFn: async (): Promise<StockRow[]> => {
      const { data, error } = await supabase
        .from('stock_balances')
        .select('qty_on_hand, qty_on_hold, items(uom), shelves(id, zones(id, code, name))')
        .or('qty_on_hand.gt.0,qty_on_hold.gt.0')
      if (error) throw error
      return (data ?? []) as unknown as StockRow[]
    },
  })

  const zones = useMemo<ZoneSummary[]>(() => {
    const map = new Map<string, ZoneSummary & { shelfIds: Set<string> }>()
    for (const r of data ?? []) {
      const z = r.shelves?.zones
      if (!z) continue
      let s = map.get(z.id)
      if (!s) {
        s = { id: z.id, code: z.code, name: z.name, shelves: 0, lines: 0, onHold: 0, shelfIds: new Set() }
        map.set(z.id, s)
      }
      s.lines += 1
      s.onHold += r.qty_on_hold
      if (r.shelves?.id) s.shelfIds.add(r.shelves.id)
    }
    return [...map.values()]
      .map((s) => ({ ...s, shelves: s.shelfIds.size }))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [data])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Total stock"
        subtitle="Stock counted across the warehouse, by zone. Tap a zone to see its shelves."
      />

      {isLoading ? (
        <Loader2 className="mx-auto mt-10 h-7 w-7 animate-spin text-brand-500" />
      ) : zones.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No counted stock yet"
          detail="Once products are put away or counted onto a location, the stock shows up here grouped by zone and shelf."
        />
      ) : (
        <div className="space-y-2">
          {zones.map((z) => (
            <Link
              key={z.id}
              to={`/stock/${z.id}`}
              className="card flex items-center gap-3 transition-all duration-200 hover:border-brand-200 hover:shadow-card-hover"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <MapPin className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink-900">
                  {z.name} <span className="font-mono text-sm font-normal text-ink-400">{z.code}</span>
                </span>
                <span className="block text-sm text-ink-400 tabular-nums">
                  {z.shelves} location{z.shelves === 1 ? '' : 's'} · {z.lines} product
                  {z.lines === 1 ? '' : 's'} with stock
                  {z.onHold > 0 && <span className="text-amber-600"> · {z.onHold} on hold</span>}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-ink-300" aria-hidden />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
