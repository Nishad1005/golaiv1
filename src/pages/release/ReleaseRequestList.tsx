import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, PackageOpen, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'

export const RR_STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  PARTIALLY_FULFILLED: 'bg-violet-100 text-violet-800',
  FULFILLED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
}

export const RR_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Awaiting approval',
  APPROVED: 'To fulfill',
  PARTIALLY_FULFILLED: 'Partially fulfilled',
  FULFILLED: 'Fulfilled',
  CANCELLED: 'Cancelled',
}

interface RrRow {
  id: string
  rr_number: string
  so_ref: string | null
  customer_note: string | null
  status: string
  required_by: string | null
  created_at: string
  departments: { name: string } | null
}

export function ReleaseRequestList() {
  const { profile } = useAuth()
  const canCreate = ['planner', 'manager', 'admin'].includes(profile!.role)

  const { data: rrs, isLoading } = useQuery({
    queryKey: ['release-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('release_requests')
        .select('id, rr_number, so_ref, customer_note, status, required_by, created_at, departments(name)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as unknown as RrRow[]
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Release Requests</h1>
        {canCreate && (
          <Link to="/release/new" className="btn-primary">
            <Plus className="h-5 w-5" /> New Request
          </Link>
        )}
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto mt-8 h-8 w-8 animate-spin text-brand-500" />
      ) : (
        <div className="space-y-2">
          {(rrs ?? []).map((rr) => (
            <Link key={rr.id} to={`/release/${rr.id}`} className="card flex items-center gap-3 hover:border-tan">
              <PackageOpen className="h-6 w-6 shrink-0 text-brand-500" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{rr.rr_number}</span>
                  {rr.so_ref && <span className="font-mono text-sm text-ink-500">{rr.so_ref}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RR_STATUS_STYLES[rr.status]}`}>
                    {RR_STATUS_LABELS[rr.status]}
                  </span>
                </div>
                <div className="truncate text-sm text-ink-400">
                  {rr.departments?.name}
                  {rr.customer_note ? ` · ${rr.customer_note}` : ''}
                  {rr.required_by ? ` · needed by ${new Date(rr.required_by).toLocaleDateString()}` : ''}
                </div>
              </div>
              <span className="shrink-0 text-xs text-ink-400">{new Date(rr.created_at).toLocaleDateString()}</span>
            </Link>
          ))}
          {(rrs ?? []).length === 0 && (
            <div className="card py-10 text-center text-ink-400">
              No release requests yet. Planners create them against SO references.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
