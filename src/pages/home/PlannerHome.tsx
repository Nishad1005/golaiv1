import { useQuery } from '@tanstack/react-query'
import { FilePlus2, History, AlertTriangle, Undo2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ItemLocator } from '../../components/ItemLocator'
import { ModuleTile } from '../../components/ModuleTile'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'

/** Department status: open RRs, recent issuances, low-stock alerts (PRD 7.4). */
export function PlannerHome() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['planner-stats'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const count = async (table: string, build: (q: any) => any): Promise<number> => {
        const { count, error } = await build(
          supabase.from(table).select('id', { count: 'exact', head: true }),
        )
        return error ? 0 : count ?? 0
      }
      const [openRr, lowStock] = await Promise.all([
        count('release_requests', (q) =>
          q.in('status', ['DRAFT', 'APPROVED', 'PARTIALLY_FULFILLED']),
        ),
        count('alerts', (q) =>
          q.in('alert_type', ['low_stock', 'out_of_stock']).eq('status', 'UNREAD'),
        ),
      ])
      return { openRr, lowStock }
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Department Status" subtitle="Request material against a sales order and track it." />

      <ItemLocator />

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={History} label="Open requests" value={stats?.openRr ?? 0} tone="brand" to="/release" loading={isLoading} />
        <StatCard icon={AlertTriangle} label="Low / out of stock" value={stats?.lowStock ?? 0} tone={(stats?.lowStock ?? 0) > 0 ? 'red' : 'slate'} to="/alerts" loading={isLoading} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ModuleTile icon={FilePlus2} title="New Release Request" subtitle="Request material against an SO reference" to="/release/new" />
        <ModuleTile icon={History} title="Release Requests" subtitle="Status, approvals, issuance history" to="/release" />
        <ModuleTile icon={Undo2} title="Returns" subtitle="Return unused material to the store" to="/returns" />
        <ModuleTile icon={AlertTriangle} title="Alerts" subtitle="Low stock, out of stock, approvals" to="/alerts" />
      </div>
    </div>
  )
}
