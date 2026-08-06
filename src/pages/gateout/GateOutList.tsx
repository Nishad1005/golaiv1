import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DoorOpen, Hand, Loader2, Plus, Truck } from 'lucide-react'
import { EmptyState } from '../../components/EmptyState'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'

interface GateOutRow {
  id: string
  gate_out_number: string
  vehicle_number: string
  reference: string | null
  material_type_declared: string | null
  cartons_declared: number | null
  departed_at: string
  customers: { name: string } | null
  customer_freetext: string | null
}

/**
 * Gate Out — landing/list for the standalone outbound gate log. Mirrors the
 * Receiving list, but for goods leaving. A row is a hand collection when its
 * vehicle number is blank (same convention as GRN).
 */
export function GateOutList() {
  const { profile } = useAuth()
  const canCreate = profile!.role === 'security' || profile!.role === 'admin' || profile!.role === 'manager'

  const { data: gateOuts, isLoading } = useQuery({
    queryKey: ['gate-outs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gate_outs')
        .select('id, gate_out_number, vehicle_number, reference, material_type_declared, cartons_declared, departed_at, customer_freetext, customers(name)')
        .order('departed_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as unknown as GateOutRow[]
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Gate Out</h1>
        {canCreate && (
          <Link to="/gate-out/new" className="btn-primary">
            <Plus className="h-5 w-5" /> New Gate Out
          </Link>
        )}
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto mt-8 h-8 w-8 animate-spin text-brand-500" />
      ) : (
        <div className="space-y-2">
          {(gateOuts ?? []).map((g) => {
            const hand = !g.vehicle_number?.trim()
            return (
              <Link key={g.id} to={`/gate-out/${g.id}`} className="card flex items-center gap-3 hover:border-tan">
                {hand
                  ? <Hand className="h-6 w-6 shrink-0 text-brand-500" />
                  : <Truck className="h-6 w-6 shrink-0 text-brand-500" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold">{g.gate_out_number}</span>
                    {!hand && <span className="font-mono text-sm text-ink-500">{g.vehicle_number}</span>}
                    {hand && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">Hand</span>}
                  </div>
                  <div className="truncate text-sm text-ink-400">
                    {g.customers?.name ?? g.customer_freetext ?? 'Unknown customer'}
                    {g.reference ? ` · ${g.reference}` : ''}
                    {g.material_type_declared ? ` · ${g.material_type_declared}` : ''}
                    {g.cartons_declared ? ` · ${g.cartons_declared} cartons` : ''}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-ink-400">
                  {new Date(g.departed_at).toLocaleString()}
                </span>
              </Link>
            )
          })}
          {(gateOuts ?? []).length === 0 && (
            <EmptyState
              icon={DoorOpen}
              title="No gate-outs recorded yet"
              detail="When goods leave the gate, Security records the vehicle or hand collection, the driver, paperwork and photos here. This is a log — it doesn't change stock."
              action={canCreate ? { label: 'New Gate Out', to: '/gate-out/new' } : undefined}
            />
          )}
        </div>
      )}
    </div>
  )
}
