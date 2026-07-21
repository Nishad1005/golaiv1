import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ItemLocator } from '../components/ItemLocator'
import { LocationContents } from '../components/LocationContents'
import { PageHeader } from '../components/PageHeader'
import { ScanInput } from '../components/ScanInput'

/**
 * "What is this?" / "Where is this?" — one box for both directions:
 * scan a LOCATION sticker to see everything sitting on it (with quantities),
 * or scan/type a PRODUCT to see where it lives.
 */
export function FindItem() {
  const [scanned, setScanned] = useState<string | null>(null)

  // A scan resolves to a location only if the code matches one exactly.
  const { data: location, isFetching } = useQuery({
    queryKey: ['location-lookup', scanned],
    enabled: !!scanned,
    queryFn: async () => {
      const { data } = await supabase
        .from('shelves')
        .select('id, code, fixture_type, description, zones(code, name)')
        .ilike('code', scanned!.trim())
        .is('deleted_at', null)
        .maybeSingle()
      return (data as never) ?? null
    },
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Find"
        subtitle="Scan a location sticker to see what's on it, or search a product to see where it is."
      />

      <div className="card space-y-2">
        <p className="text-sm font-semibold text-ink-600">Scan a location or product barcode</p>
        <ScanInput placeholder="location or product barcode" onScan={(v) => setScanned(v)} autoFocus={false} />
      </div>

      {isFetching && <Loader2 className="mx-auto h-7 w-7 animate-spin text-brand-500" />}

      {scanned && !isFetching && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-500">
              Scanned <span className="font-mono font-semibold text-ink-700">{scanned}</span>
            </span>
            <button
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-400 hover:bg-cream"
              onClick={() => setScanned(null)}
            >
              <X className="h-4 w-4" /> Clear
            </button>
          </div>
          {location ? (
            <LocationContents location={location} />
          ) : (
            <p className="text-sm text-ink-400">
              Not a location code — showing product matches below.
            </p>
          )}
        </div>
      )}

      {!location && (
        <ItemLocator initialQuery={scanned ?? ''} />
      )}

      <p className="text-sm text-ink-400">
        A product not showing a location? Use <span className="font-medium text-ink-600">Assign
        Location</span> to record where it sits.
      </p>
    </div>
  )
}
