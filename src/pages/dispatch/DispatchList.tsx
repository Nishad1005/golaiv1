import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Plus, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'

export const DC_STATUS_STYLES: Record<string, string> = {
  PICKED: 'bg-amber-100 text-amber-800',
  READY: 'bg-blue-100 text-blue-800',
  DISPATCHED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
}

export const DC_STATUS_LABELS: Record<string, string> = {
  PICKED: 'Awaiting approval',
  READY: 'Ready for gate-out',
  DISPATCHED: 'Dispatched',
  REJECTED: 'Rejected',
}

interface DcRow {
  id: string
  dc_number: string
  so_ref: string | null
  customer_note: string | null
  status: string
  created_at: string
  customers: { name: string } | null
}

export function DispatchList() {
  const { profile } = useAuth()
  const canCreate = ['storekeeper', 'manager', 'admin'].includes(profile!.role)

  const { data: dcs, isLoading } = useQuery({
    queryKey: ['dispatches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dispatches')
        .select('id, dc_number, so_ref, customer_note, status, created_at, customers(name)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as unknown as DcRow[]
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Dispatch (DC)</h1>
        {canCreate && (
          <Link to="/dispatch/new" className="btn-primary">
            <Plus className="h-5 w-5" /> New Dispatch
          </Link>
        )}
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto mt-8 h-8 w-8 animate-spin text-tan-dark" />
      ) : (
        <div className="space-y-2">
          {(dcs ?? []).map((dc) => (
            <Link key={dc.id} to={`/dispatch/${dc.id}`} className="card flex items-center gap-3 hover:border-tan">
              <Send className="h-6 w-6 shrink-0 text-tan-dark" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{dc.dc_number}</span>
                  {dc.so_ref && <span className="font-mono text-sm text-ink-500">{dc.so_ref}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DC_STATUS_STYLES[dc.status]}`}>
                    {DC_STATUS_LABELS[dc.status]}
                  </span>
                </div>
                <div className="truncate text-sm text-ink-400">
                  {dc.customers?.name ?? dc.customer_note ?? ''}
                </div>
              </div>
              <span className="shrink-0 text-xs text-ink-400">
                {new Date(dc.created_at).toLocaleDateString()}
              </span>
            </Link>
          ))}
          {(dcs ?? []).length === 0 && (
            <div className="card py-10 text-center text-ink-400">
              No dispatches yet. Storekeepers create them by picking against an SO reference.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
