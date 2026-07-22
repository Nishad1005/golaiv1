import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, PackageCheck, Plus, Truck } from 'lucide-react'
import { EmptyState } from '../../components/EmptyState'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-amber-100 text-amber-800',
  VERIFIED: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'At gate — verify',
  VERIFIED: 'Awaiting putaway',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
}

interface GrnRow {
  id: string
  grn_number: string
  status: string
  po_ref: string | null
  material_type_declared: string | null
  total_cartons_declared: number | null
  created_at: string
  suppliers: { name: string } | null
  supplier_name_freetext: string | null
}

export function GrnList() {
  const { profile } = useAuth()
  const canCreate = profile!.role === 'security' || profile!.role === 'admin' || profile!.role === 'manager'

  const { data: grns, isLoading } = useQuery({
    queryKey: ['grns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grns')
        .select('id, grn_number, status, po_ref, material_type_declared, total_cartons_declared, created_at, supplier_name_freetext, suppliers(name)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as unknown as GrnRow[]
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Receiving (GRN)</h1>
        {canCreate && (
          <Link to="/grn/new" className="btn-primary">
            <Plus className="h-5 w-5" /> New Gate Entry
          </Link>
        )}
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto mt-8 h-8 w-8 animate-spin text-brand-500" />
      ) : (
        <div className="space-y-2">
          {(grns ?? []).map((grn) => (
            <Link key={grn.id} to={`/grn/${grn.id}`} className="card flex items-center gap-3 hover:border-tan">
              <Truck className="h-6 w-6 shrink-0 text-brand-500" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{grn.grn_number}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[grn.status]}`}>
                    {STATUS_LABELS[grn.status]}
                  </span>
                </div>
                <div className="truncate text-sm text-ink-400">
                  {grn.suppliers?.name ?? grn.supplier_name_freetext ?? 'Unknown supplier'}
                  {grn.po_ref ? ` · ${grn.po_ref}` : ''}
                  {grn.material_type_declared ? ` · ${grn.material_type_declared}` : ''}
                  {grn.total_cartons_declared ? ` · ${grn.total_cartons_declared} cartons` : ''}
                </div>
              </div>
              <span className="shrink-0 text-xs text-ink-400">
                {new Date(grn.created_at).toLocaleString()}
              </span>
            </Link>
          ))}
          {(grns ?? []).length === 0 && (
            <EmptyState
              icon={PackageCheck}
              title="No deliveries recorded yet"
              detail="When a truck reaches the gate, Security records the vehicle, driver and paperwork here — then the storekeeper verifies and puts the goods away."
              action={canCreate ? { label: 'New Gate Entry', to: '/grn/new' } : undefined}
            />
          )}
        </div>
      )}
    </div>
  )
}
