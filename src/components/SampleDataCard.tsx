import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FlaskConical, Loader2, Trash2, TriangleAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { logActivity } from '../lib/audit'
import { useSettings } from '../lib/settings'

/**
 * "Show me what this looks like with data in it."
 *
 * A new company opens Golai to a set of empty lists, and a salesperson needs a
 * populated warehouse in seconds rather than a fifteen-minute seed script. The
 * database refuses to load samples into a warehouse that already holds
 * products, so this cannot contaminate real stock.
 */
export function SampleDataCard() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const { data: settings } = useSettings()
  const [confirmClear, setConfirmClear] = useState(false)
  const loaded = settings?.settings?.sample_data === true

  // Offer this only to a warehouse that has nothing real in it yet.
  const { data: itemCount } = useQuery({
    queryKey: ['sample-data-item-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('items').select('id', { count: 'exact', head: true }).is('deleted_at', null)
      return count ?? 0
    },
  })

  const refresh = () => {
    void queryClient.invalidateQueries()
  }

  const load = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('load_sample_data')
      if (error) throw new Error(error.message)
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'load.sample_data', entityType: 'tenant', entityId: profile!.tenant_id,
      })
      return data as string
    },
    onSuccess: refresh,
  })

  const clear = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('clear_sample_data')
      if (error) throw new Error(error.message)
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'clear.sample_data', entityType: 'tenant', entityId: profile!.tenant_id,
      })
    },
    onSuccess: () => {
      setConfirmClear(false)
      refresh()
    },
  })

  // Nothing to offer: real stock exists and no sample data is present.
  if (itemCount === undefined || (itemCount > 0 && !loaded)) return null

  return (
    <section className="card border-dashed">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-50 text-ink-500">
          <FlaskConical className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-ink-900">
            {loaded ? 'Sample data is loaded' : 'Want to see it with data in it?'}
          </h2>
          <p className="mt-0.5 text-sm text-ink-400">
            {loaded
              ? 'A small demo warehouse is in place — three zones, six locations, seven products, one delivery and one issuance. Remove it before you start entering your own stock.'
              : 'Load a small demo warehouse — zones, locations, products, stock, a completed delivery and an issuance — so you can try every screen before entering anything real. You can remove it in one click.'}
          </p>

          {load.data && (
            <p className="mt-2 text-sm font-medium text-brand-700">{load.data}</p>
          )}
          {(load.isError || clear.isError) && (
            <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-red-700">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {((load.error ?? clear.error) as Error).message}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!loaded && (
              <button
                className="btn-secondary"
                disabled={load.isPending}
                onClick={() => load.mutate()}
              >
                {load.isPending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
                Load sample data
              </button>
            )}

            {loaded && !confirmClear && (
              <button className="btn-secondary" onClick={() => setConfirmClear(true)}>
                <Trash2 className="h-5 w-5" aria-hidden /> Remove sample data
              </button>
            )}

            {loaded && confirmClear && (
              <>
                <span className="text-sm font-medium text-ink-700">
                  Remove all sample zones, products and documents?
                </span>
                <button
                  className="btn-primary"
                  disabled={clear.isPending}
                  onClick={() => clear.mutate()}
                >
                  {clear.isPending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
                  Yes, remove it
                </button>
                <button className="btn-secondary" disabled={clear.isPending} onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
              </>
            )}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-ink-400">
            Only rows created by this button are removed — sample products carry a
            <code className="mx-1 rounded bg-ink-50 px-1">SAMPLE-</code>code. Anything you enter
            yourself is never touched.
          </p>
        </div>
      </div>
    </section>
  )
}
