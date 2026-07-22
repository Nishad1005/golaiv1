import { useQuery } from '@tanstack/react-query'
import {
  BadgeCheck, ClipboardCheck, ClipboardList, FileBarChart, PackageCheck, PackageOpen,
  Search, Send, ShieldAlert, Truck, AlertTriangle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ItemLocator } from '../../components/ItemLocator'
import { ModuleTile } from '../../components/ModuleTile'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'
import { StockOverview } from '../../components/StockOverview'
import { useAuth } from '../../stores/auth'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

/** KPI dashboard: today's activity, pending approvals, exceptions (PRD 7.4). */
export function ManagerHome() {
  const { profile } = useAuth()

  const { data: kpis, isLoading } = useQuery({
    queryKey: ['manager-kpis'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const today = startOfDay.toISOString()

      const count = async (
        table: string,
        build: (q: any) => any,
      ): Promise<number> => {
        const { count, error } = await build(
          supabase.from(table).select('id', { count: 'exact', head: true }),
        )
        return error ? 0 : count ?? 0
      }

      const [grnsToday, dispatchesToday, rrPending, dcPending, adjPending, lowStock] =
        await Promise.all([
          count('grns', (q) => q.gte('created_at', today)),
          count('dispatches', (q) => q.gte('created_at', today)),
          count('release_requests', (q) => q.eq('status', 'DRAFT')),
          count('dispatches', (q) => q.eq('status', 'PICKED')),
          count('adjustments', (q) => q.eq('status', 'PENDING')),
          count('alerts', (q) =>
            q.in('alert_type', ['low_stock', 'out_of_stock']).eq('status', 'UNREAD'),
          ),
        ])
      return { grnsToday, dispatchesToday, rrPending, dcPending, adjPending, lowStock }
    },
  })

  const pendingTotal = (kpis?.rrPending ?? 0) + (kpis?.dcPending ?? 0) + (kpis?.adjPending ?? 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${profile?.full_name.split(' ')[0]}`}
        subtitle="Today's activity and what needs your attention."
      />

      <ItemLocator />

      <StockOverview />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Today's activity</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Truck} label="GRNs today" value={kpis?.grnsToday ?? 0} tone="brand" to="/grn" loading={isLoading} />
          <StatCard icon={Send} label="Dispatches today" value={kpis?.dispatchesToday ?? 0} tone="brand" to="/dispatch" loading={isLoading} />
          <StatCard icon={BadgeCheck} label="Pending approvals" value={pendingTotal} tone={pendingTotal > 0 ? 'amber' : 'slate'} hint="Releases, dispatches, adjustments" to="/alerts" loading={isLoading} />
          <StatCard icon={AlertTriangle} label="Low / out of stock" value={kpis?.lowStock ?? 0} tone={(kpis?.lowStock ?? 0) > 0 ? 'red' : 'slate'} to="/alerts" loading={isLoading} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Approvals & review</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModuleTile icon={PackageOpen} title="Release Requests" subtitle="Approve requests, track fulfillment" to="/release" />
          <ModuleTile icon={Send} title="Dispatch (DC)" subtitle="Approve picked dispatches, gate-out" to="/dispatch" />
          <ModuleTile icon={ClipboardCheck} title="Adjustments" subtitle="Approve quantity corrections" to="/adjust" />
          <ModuleTile icon={ShieldAlert} title="QC Hold" subtitle="Release or reject quarantined items" to="/qc" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Operations & reports</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModuleTile icon={PackageCheck} title="Receiving (GRN)" subtitle="All GRNs with full photo + audit trail" to="/grn" />
          <ModuleTile icon={Search} title="SO-wise Movement" subtitle="Trace every transaction for an SO number" to="/so-movement" />
          <ModuleTile icon={ClipboardList} title="Stock Counts" subtitle="Plan cycle counts, approve variances" to="/counts" />
          <ModuleTile icon={FileBarChart} title="ERP Export" subtitle="Quantity CSVs for Tally / SAP reconciliation" to="/export" />
        </div>
      </section>
    </div>
  )
}
