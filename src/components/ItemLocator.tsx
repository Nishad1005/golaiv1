import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, MapPin, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { locationLabel } from '../lib/places'

interface LocatorRow {
  id: string
  code: string
  name: string
  item_type: string | null
  uom: string
  stock_balances: {
    qty_on_hand: number
    qty_on_hold: number
    shelves: {
      code: string
      fixture_type: string | null
      description: string | null
      zones: { code: string; name: string } | null
    } | null
  }[]
}

/**
 * The core promise of Golai: type an item's name (or code / barcode) and see
 * the exact zone + shelf it sits on, with quantity. Available on every home
 * screen.
 */
export function ItemLocator({ initialQuery = '' }: { initialQuery?: string } = {}) {
  const [query, setQuery] = useState(initialQuery)
  // A scan upstream (Find screen) refills the box
  const [lastInitial, setLastInitial] = useState(initialQuery)
  if (initialQuery !== lastInitial) {
    setLastInitial(initialQuery)
    setQuery(initialQuery)
  }
  const trimmed = query.trim()

  const { data, isFetching } = useQuery({
    queryKey: ['item-locator', trimmed],
    enabled: trimmed.length >= 2,
    queryFn: async (): Promise<LocatorRow[]> => {
      const { data, error } = await supabase
        .from('items')
        .select(
          'id, code, name, item_type, uom, stock_balances(qty_on_hand, qty_on_hold, shelves(code, fixture_type, description, zones(code, name)))',
        )
        .or(`name.ilike.%${trimmed}%,code.ilike.%${trimmed}%,item_type.ilike.%${trimmed}%,barcode.eq.${trimmed}`)
        .eq('status', 'active')
        .limit(10)
      if (error) throw error
      return (data ?? []) as unknown as LocatorRow[]
    },
  })

  return (
    <div className="card">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
        <input
          className="input-field pl-12"
          placeholder="Find any item… name, code or barcode"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {isFetching && (
          <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-brand-500" />
        )}
      </div>

      {trimmed.length >= 2 && data && (
        <ul className="mt-3 divide-y divide-tan/20">
          {data.length === 0 && (
            <li className="py-3 text-sm text-ink-400">No matching items.</li>
          )}
          {data.map((item) => {
            // Zero-quantity rows are kept: "located but not counted yet" is a
            // valid state during the mapping walk, and still answers "where is it".
            const locations = item.stock_balances.filter((b) => b.shelves)
            return (
              <li key={item.id} className="py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {item.name}
                    {item.item_type && (
                      <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 align-middle text-xs font-medium text-ink-500">
                        {item.item_type}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-ink-400">{item.code}</span>
                </div>
                {locations.length === 0 ? (
                  <p className="mt-1 text-sm text-ink-400">No location recorded yet.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {locations.map((b, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 shrink-0 text-brand-500" />
                        <span className="min-w-0 font-medium">
                          {b.shelves?.zones ? `${b.shelves.zones.name} (${b.shelves.zones.code})` : '—'}
                          {' · '}
                          {b.shelves ? locationLabel(b.shelves) : '—'}
                          <span className="ml-1.5 font-normal text-ink-400">{b.shelves?.code}</span>
                        </span>
                        <span className="ml-auto shrink-0 tabular-nums">
                          {b.qty_on_hand > 0 ? (
                            <>
                              {b.qty_on_hand} {item.uom}
                              {b.qty_on_hold > 0 && (
                                <span className="ml-1 text-amber-600">(+{b.qty_on_hold} on hold)</span>
                              )}
                            </>
                          ) : (
                            <span className="text-ink-400">not counted yet</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
