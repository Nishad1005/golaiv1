import { useQuery } from '@tanstack/react-query'
import { Loader2, MapPin, PackageSearch } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { locationLabel } from '../lib/places'
import type { Item } from '../lib/types'

interface LocationRow {
  id: string
  code: string
  fixture_type: string | null
  description: string | null
  zones: { code: string; name: string } | null
}

/**
 * Everything sitting on one location, with quantities. This is what a floor
 * worker needs when a shelf holds five similar things (five screw types) and
 * the label on the rack only says where they are, not which is which.
 */
export function LocationContents({ location }: { location: LocationRow }) {
  const { data, isLoading } = useQuery({
    queryKey: ['location-contents', location.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_balances')
        .select('qty_on_hand, qty_on_hold, items(id, code, name, uom, item_type)')
        .eq('shelf_id', location.id)
      if (error) throw error
      return data as unknown as { qty_on_hand: number; qty_on_hold: number; items: Item }[]
    },
  })

  const rows = (data ?? []).filter((r) => r.items)

  return (
    <div className="space-y-3">
      <div className="card flex items-center gap-3 border-brand-200 bg-brand-50">
        <MapPin className="h-6 w-6 shrink-0 text-brand-600" />
        <div className="min-w-0">
          <div className="font-mono text-lg font-bold">{location.code}</div>
          <div className="text-sm text-ink-500">
            {locationLabel(location)}
            {location.zones ? ` · ${location.zones.name} (${location.zones.code})` : ''}
          </div>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-white px-3 py-1 text-sm font-semibold text-ink-600">
          {rows.length} item{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto mt-6 h-7 w-7 animate-spin text-brand-500" />
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-8 text-center text-ink-400">
          <PackageSearch className="h-8 w-8" />
          <p>Nothing recorded on this location yet.</p>
          <p className="text-sm">Use Assign Location to record what sits here.</p>
        </div>
      ) : (
        <div className="card divide-y divide-ink-100 p-0">
          {rows.map((r) => (
            <div key={r.items.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.items.name}</p>
                <p className="text-xs text-ink-400">
                  {r.items.code}
                  {r.items.item_type ? ` · ${r.items.item_type}` : ''}
                </p>
              </div>
              <span className="shrink-0 text-right tabular-nums">
                {r.qty_on_hand > 0 ? (
                  <span className="text-lg font-bold">
                    {r.qty_on_hand}{' '}
                    <span className="text-sm font-normal text-ink-400">{r.items.uom}</span>
                  </span>
                ) : (
                  <span className="text-sm text-ink-400">not counted yet</span>
                )}
                {r.qty_on_hold > 0 && (
                  <span className="block text-xs text-amber-600">+{r.qty_on_hold} on hold</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
