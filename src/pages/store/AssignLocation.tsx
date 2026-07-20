import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, MapPin, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { locationLabel } from '../../lib/places'
import { ScanInput } from '../../components/ScanInput'
import { PageHeader } from '../../components/PageHeader'
import type { Item, Shelf, Zone } from '../../lib/types'

type PlaceWithZone = Shelf & { zones: Pick<Zone, 'code' | 'name'> | null }

interface StagedItem {
  item: Item
  qty: string
}

/**
 * Assign Location — the mapping walk.
 *
 * Products often have no barcodes, so this screen deliberately finds them by
 * NAME rather than by scan: scan the location's sticker once, then search and
 * tap products to record that they live there. Quantity is optional — the goal
 * is "where is it", counts come later from a stock count.
 */
export function AssignLocation() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const [place, setPlace] = useState<PlaceWithZone | null>(null)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [staged, setStaged] = useState<StagedItem[]>([])
  const [saved, setSaved] = useState<string | null>(null)

  // Progress across the whole warehouse — a multi-day job needs visible momentum
  const { data: progress } = useQuery({
    queryKey: ['assign-progress'],
    queryFn: async () => {
      const [{ count: total }, { data: located }] = await Promise.all([
        supabase.from('items').select('id', { count: 'exact', head: true })
          .is('deleted_at', null).eq('status', 'active'),
        supabase.from('stock_balances').select('item_id'),
      ])
      const distinct = new Set((located ?? []).map((r) => (r as { item_id: string }).item_id))
      return { total: total ?? 0, located: distinct.size }
    },
  })

  // What is already recorded at this location (so re-visits are obvious)
  const { data: existing } = useQuery({
    queryKey: ['place-contents', place?.id],
    enabled: !!place,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_balances')
        .select('qty_on_hand, items(id, code, name, uom)')
        .eq('shelf_id', place!.id)
      if (error) throw error
      return data as unknown as { qty_on_hand: number; items: Item }[]
    },
  })

  const { data: matches, isFetching } = useQuery({
    queryKey: ['assign-item-search', search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const q = search.trim()
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .or(`name.ilike.%${q}%,code.ilike.%${q}%,barcode.eq.${q}`)
        .eq('status', 'active')
        .is('deleted_at', null)
        .limit(10)
      if (error) throw error
      return data as Item[]
    },
  })

  const findPlace = async (code: string) => {
    setPlaceError(null)
    const { data } = await supabase
      .from('shelves')
      .select('*, zones(code, name)')
      .ilike('code', code.trim())
      .is('deleted_at', null)
      .maybeSingle()
    if (!data) {
      setPlaceError(`Location "${code}" not found. Scan a Golai sticker, or create the location first.`)
      return
    }
    setPlace(data as PlaceWithZone)
    setStaged([])
    setSaved(null)
  }

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('assign_placements', {
        p_shelf_id: place!.id,
        p_rows: staged.map((s) => ({ item_id: s.item.id, qty: s.qty.trim() || null })),
      })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'assign.placements',
        entityType: 'shelf',
        entityId: place!.id,
        after: { location: place!.code, items: staged.map((s) => s.item.code) },
      })
      return data as number
    },
    onSuccess: (count) => {
      setSaved(`${count} product${count === 1 ? '' : 's'} recorded at ${place!.code}`)
      setStaged([])
      void queryClient.invalidateQueries({ queryKey: ['place-contents', place!.id] })
      void queryClient.invalidateQueries({ queryKey: ['assign-progress'] })
      void queryClient.invalidateQueries({ queryKey: ['item-locator'] })
    },
  })

  const alreadyHere = (id: string) =>
    (existing ?? []).some((e) => e.items.id === id) || staged.some((s) => s.item.id === id)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Assign Location"
        subtitle="Scan a location's sticker, then search products by name to record what sits there."
        actions={
          progress ? (
            <span className="rounded-full bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-600">
              {progress.located} of {progress.total} products located
            </span>
          ) : undefined
        }
      />

      {saved && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> {saved}
        </div>
      )}

      {!place ? (
        <div className="card space-y-3">
          <p className="font-semibold">Scan the location sticker</p>
          <ScanInput placeholder="location code (e.g. Z03-G001)" onScan={(v) => void findPlace(v)} />
          {placeError && <p className="text-sm text-red-600">{placeError}</p>}
        </div>
      ) : (
        <>
          <div className="card flex items-center gap-3 border-brand-200 bg-brand-50">
            <MapPin className="h-6 w-6 shrink-0 text-brand-600" />
            <div className="min-w-0">
              <div className="font-mono text-lg font-bold">{place.code}</div>
              <div className="text-sm text-ink-500">
                {locationLabel(place)}
                {place.zones ? ` · ${place.zones.name} (${place.zones.code})` : ''}
              </div>
            </div>
            <button
              className="btn-secondary ml-auto"
              onClick={() => {
                setPlace(null)
                setStaged([])
                setSearch('')
              }}
            >
              <RotateCcw className="h-5 w-5" /> Next location
            </button>
          </div>

          {(existing ?? []).length > 0 && (
            <div className="card">
              <p className="mb-2 text-sm font-semibold text-ink-500">Already recorded here</p>
              <div className="flex flex-wrap gap-2">
                {(existing ?? []).map((e) => (
                  <span key={e.items.id} className="rounded-lg bg-cream-dark px-3 py-1.5 text-sm">
                    {e.items.name}
                    <span className="ml-1.5 text-ink-400">
                      {e.qty_on_hand > 0 ? `${e.qty_on_hand} ${e.items.uom}` : 'not counted'}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="card space-y-3">
            <p className="font-semibold">Which products are on this location?</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
              <input
                className="input-field pl-12"
                placeholder="Search product by name or code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              {isFetching && (
                <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-brand-500" />
              )}
            </div>

            {search.trim().length >= 2 && (
              <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
                {(matches ?? []).map((m) => {
                  const added = alreadyHere(m.id)
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        className="flex min-h-tap w-full items-center gap-2 px-4 text-left hover:bg-cream disabled:opacity-50"
                        disabled={added}
                        onClick={() => {
                          setStaged([...staged, { item: m, qty: '' }])
                          setSearch('')
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{m.name}</p>
                          <p className="text-xs text-ink-400">{m.code}</p>
                        </div>
                        {added ? (
                          <span className="text-xs text-ink-400">added</span>
                        ) : (
                          <Plus className="h-5 w-5 shrink-0 text-brand-600" />
                        )}
                      </button>
                    </li>
                  )
                })}
                {(matches ?? []).length === 0 && !isFetching && (
                  <li className="px-4 py-3 text-sm text-ink-400">
                    No product matches "{search.trim()}".
                  </li>
                )}
              </ul>
            )}

            {staged.map((s, i) => (
              <div key={s.item.id} className="flex items-center gap-2 rounded-xl bg-cream px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.item.name}</p>
                  <p className="text-xs text-ink-400">{s.item.code}</p>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  className="input-field w-24 text-right"
                  placeholder="qty"
                  value={s.qty}
                  onChange={(e) =>
                    setStaged(staged.map((x, idx) => (idx === i ? { ...x, qty: e.target.value } : x)))
                  }
                />
                <span className="w-8 text-sm text-ink-400">{s.item.uom}</span>
                <button
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-400 hover:bg-white"
                  onClick={() => setStaged(staged.filter((_, idx) => idx !== i))}
                  aria-label={`Remove ${s.item.name}`}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            ))}

            {staged.length > 0 && (
              <>
                <p className="text-xs text-ink-400">
                  Quantity is optional — leave it blank to record only the location. Counts can be
                  corrected later with a stock count.
                </p>
                <button
                  className="btn-primary w-full"
                  disabled={save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
                  Save {staged.length} product{staged.length === 1 ? '' : 's'} here
                </button>
              </>
            )}
            {save.isError && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
          </div>
        </>
      )}
    </div>
  )
}
