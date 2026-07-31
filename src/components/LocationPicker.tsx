import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, Loader2, MapPin } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { locationLabel } from '../lib/places'
import { PalletMap } from './PalletMap'
import type { Shelf, Zone } from '../lib/types'

export type PickedShelf = Shelf & { zones: Pick<Zone, 'code' | 'name'> | null }

/**
 * Pick a location without scanning — for pallets, whose overhanging stock hides
 * any barcode, and for any spot whose sticker is missing or unreachable. Choose
 * a zone, then tap the pallet on its car-park map (or a location from the list).
 */
export function LocationPicker({ onPick, onCancel }: {
  onPick: (shelf: PickedShelf) => void
  onCancel: () => void
}) {
  const [zone, setZone] = useState<Pick<Zone, 'id' | 'code' | 'name'> | null>(null)

  const { data: zones } = useQuery({
    queryKey: ['picker-zones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zones').select('id, code, name').is('deleted_at', null).order('code')
      if (error) throw error
      return (data ?? []) as Pick<Zone, 'id' | 'code' | 'name'>[]
    },
  })

  const { data: shelves, isLoading } = useQuery({
    queryKey: ['picker-shelves', zone?.id],
    enabled: !!zone,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shelves').select('*, zones(code, name)')
        .eq('zone_id', zone!.id).is('deleted_at', null).order('code')
      if (error) throw error
      return (data ?? []) as unknown as PickedShelf[]
    },
  })

  const pallets = (shelves ?? []).filter((s) => s.pallet_row != null && s.pallet_col != null)
  const others = (shelves ?? []).filter((s) => s.pallet_row == null || s.pallet_col == null)

  return (
    <div className="card space-y-3">
      <button className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-brand-600"
        onClick={() => (zone ? setZone(null) : onCancel())}>
        <ArrowLeft className="h-4 w-4" /> {zone ? 'Choose another zone' : 'Back to scanning'}
      </button>

      {!zone ? (
        <>
          <p className="font-semibold">Which zone?</p>
          <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
            {(zones ?? []).map((z) => (
              <li key={z.id}>
                <button className="flex min-h-tap w-full items-center gap-2 px-4 text-left hover:bg-cream"
                  onClick={() => setZone(z)}>
                  <span className="font-mono text-xs text-ink-400">{z.code}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{z.name}</span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-ink-300" />
                </button>
              </li>
            ))}
            {(zones ?? []).length === 0 && (
              <li className="px-4 py-3 text-sm text-ink-400">No zones defined yet.</li>
            )}
          </ul>
        </>
      ) : isLoading ? (
        <Loader2 className="mx-auto my-6 h-6 w-6 animate-spin text-brand-500" />
      ) : (
        <div className="space-y-3">
          <p className="font-semibold">{zone.name} <span className="font-mono text-xs text-ink-400">{zone.code}</span></p>

          {pallets.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-semibold text-ink-500">Tap a pallet</p>
              <PalletMap pallets={pallets} onSelect={(p) => {
                const full = pallets.find((s) => s.id === p.id)
                if (full) onPick(full)
              }} />
            </div>
          )}

          {others.length > 0 && (
            <div>
              {pallets.length > 0 && <p className="mb-1 text-sm font-semibold text-ink-500">Other locations</p>}
              <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
                {others.map((s) => (
                  <li key={s.id}>
                    <button className="flex min-h-tap w-full items-center gap-2 px-4 text-left hover:bg-cream"
                      onClick={() => onPick(s)}>
                      <MapPin className="h-4 w-4 shrink-0 text-brand-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{locationLabel(s)}</span>
                        <span className="block font-mono text-xs text-ink-400">{s.code}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(shelves ?? []).length === 0 && (
            <p className="rounded-xl bg-ink-50 px-4 py-4 text-center text-sm text-ink-400">
              No locations in this zone yet.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
