import {
  ClipboardCheck, ClipboardList, FileBarChart, PackageCheck, PackageOpen,
  Search, Send, ShieldAlert,
} from 'lucide-react'
import { ItemLocator } from '../../components/ItemLocator'
import { ModuleTile } from '../../components/ModuleTile'
import { PageHeader } from '../../components/PageHeader'
import { StockOverview } from '../../components/StockOverview'
import { TodayActivity } from '../../components/TodayActivity'
import { useAuth } from '../../stores/auth'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

/** KPI dashboard: today's activity, pending approvals, exceptions (PRD 7.4). */
export function ManagerHome() {
  const { profile } = useAuth()

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${profile?.full_name.split(' ')[0]}`}
        subtitle="Today's activity and what needs your attention."
      />

      <ItemLocator />

      <StockOverview />

      <TodayActivity />

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
