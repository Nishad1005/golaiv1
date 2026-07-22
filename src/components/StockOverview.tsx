import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Boxes, Clock, Loader2, PackageX, TrendingDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { MOVEMENT_LABELS } from '../lib/movements'

interface Overview {
  items_total: number
  items_in_stock: number
  items_out_of_stock: number
  items_low_stock: number
  items_dead_stock: number
  qty_on_hold: number
  locations_total: number
  locations_used: number
}

interface RecentRow {
  item_id: string
  moved_at: string
  kind: string
  qty: number
  reference: string | null
}

/**
 * "How much do I have?" — the question every owner asks first, and the one the
 * manager home could not answer. Counts come from the stock_overview view
 * (migration 0020) rather than being aggregated in the browser, so opening the
 * home screen does not download the whole stock table.
 */
export function StockOverview() {
  const { data: o, isLoading } = useQuery({
    queryKey: ['stock-overview'],
    refetchInterval: 60_000,
    queryFn: async (): Promise<Overview | null> => {
      const { data, error } = await supabase.from('stock_overview').select('*').maybeSingle()
      if (error) throw error
      return data as Overview | null
    },
  })

  const { data: recent } = useQuery({
    queryKey: ['recent-movements'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('item_movements')
        .select('item_id, moved_at, kind, qty, reference')
        .order('moved_at', { ascending: false })
        .limit(6)
      if (error) throw error
      const rows = (data ?? []) as RecentRow[]
      if (rows.length === 0) return { rows, names: new Map<string, string>() }

      const { data: items } = await supabase
        .from('items')
        .select('id, name, uom')
        .in('id', [...new Set(rows.map((r) => r.item_id))])
      const names = new Map(
        ((items ?? []) as { id: string; name: string; uom: string }[]).map((i) => [i.id, `${i.name}|${i.uom}`]),
      )
      return { rows, names }
    },
  })

  const located = o ? o.items_total - o.items_out_of_stock : 0
  const locatedPct = o && o.items_total > 0 ? Math.round((located / o.items_total) * 100) : 0

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Stock right now</h2>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={Boxes} tone="brand" loading={isLoading}
          label="Items in stock" value={o?.items_in_stock ?? 0}
          hint={o ? `of ${o.items_total} products` : undefined}
        />
        <Tile
          icon={TrendingDown} tone={(o?.items_low_stock ?? 0) > 0 ? 'amber' : 'slate'} loading={isLoading}
          label="Low stock" value={o?.items_low_stock ?? 0}
          hint="At or below reorder point" to="/alerts"
        />
        <Tile
          icon={PackageX} tone={(o?.items_out_of_stock ?? 0) > 0 ? 'red' : 'slate'} loading={isLoading}
          label="Nothing on shelf" value={o?.items_out_of_stock ?? 0}
          hint="Includes never located" to="/admin/items"
        />
        <Tile
          icon={Clock} tone={(o?.items_dead_stock ?? 0) > 0 ? 'amber' : 'slate'} loading={isLoading}
          label="Not moved 90 days" value={o?.items_dead_stock ?? 0}
          hint="Dead stock"
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {/* Mapping progress — the number that matters during onboarding */}
        <div className="card">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-semibold text-ink-900">Products located</h3>
            <span className="text-sm font-semibold tabular-nums text-ink-500">{locatedPct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500 motion-reduce:transition-none"
              style={{ width: `${locatedPct}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-ink-400 tabular-nums">
            {located} of {o?.items_total ?? 0} products sit somewhere Golai knows ·{' '}
            {o?.locations_used ?? 0} of {o?.locations_total ?? 0} locations in use
          </p>
          {o != null && o.qty_on_hold > 0 && (
            <p className="mt-1 text-sm font-medium text-amber-600 tabular-nums">
              {o.qty_on_hold} held for QC
            </p>
          )}
        </div>

        {/* Live feed */}
        <div className="card">
          <h3 className="font-semibold text-ink-900">Last movements</h3>
          {!recent ? (
            <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-brand-500" />
          ) : recent.rows.length === 0 ? (
            <p className="mt-3 text-sm text-ink-400">Nothing has moved yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-ink-200/70">
              {recent.rows.map((r, i) => {
                const [name, uom] = (recent.names.get(r.item_id) ?? '—|').split('|')
                return (
                  <li key={`${r.kind}-${i}`} className="flex items-center gap-2 py-2 text-sm">
                    <Link to={`/item/${r.item_id}`} className="min-w-0 flex-1 truncate font-medium hover:text-brand-600 hover:underline">
                      {name}
                    </Link>
                    <span className="shrink-0 text-xs text-ink-400">
                      {MOVEMENT_LABELS[r.kind] ?? r.kind}
                    </span>
                    <span
                      className={`w-20 shrink-0 text-right font-semibold tabular-nums ${
                        r.qty > 0 ? 'text-brand-600' : r.qty < 0 ? 'text-amber-700' : 'text-ink-400'
                      }`}
                    >
                      {r.qty === 0 ? '—' : `${r.qty > 0 ? '+' : ''}${r.qty} ${uom}`}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

/** Local variant of StatCard that supports a hint plus an optional link. */
function Tile({ icon: Icon, label, value, hint, tone, to, loading }: {
  icon: typeof Boxes
  label: string
  value: number
  hint?: string
  tone: 'brand' | 'amber' | 'red' | 'slate'
  to?: string
  loading?: boolean
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-ink-100 text-ink-500',
  }
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink-500">{label}</span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
      <div className="mt-2 text-3xl font-bold tabular-nums text-ink-900">
        {loading ? <span className="inline-block h-8 w-12 animate-pulse rounded bg-ink-100" /> : value}
      </div>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </>
  )
  const className =
    'card block transition-all duration-200 ' +
    (to ? 'cursor-pointer hover:border-brand-200 hover:shadow-card-hover' : '')
  return to ? <Link to={to} className={className}>{body}</Link> : <div className={className}>{body}</div>
}
