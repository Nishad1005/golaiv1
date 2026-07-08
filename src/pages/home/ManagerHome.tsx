import { LayoutDashboard, BadgeCheck, ClipboardCheck, ClipboardList, Search, Send, ShieldAlert, FileBarChart } from 'lucide-react'
import { ItemLocator } from '../../components/ItemLocator'
import { ModuleTile } from '../../components/ModuleTile'

/** KPI dashboard: today's GRN/DC/RR, alerts, pending approvals (PRD 7.4). */
export function ManagerHome() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Dashboard</h1>
      <ItemLocator />
      <div className="grid gap-3 sm:grid-cols-2">
        <ModuleTile
          icon={BadgeCheck}
          title="Release Requests"
          subtitle="Approve requests, track fulfillment"
          to="/release"
        />
        <ModuleTile
          icon={ClipboardCheck}
          title="Pending Adjustments"
          subtitle="Approve or reject quantity corrections"
          to="/adjust"
        />
        <ModuleTile
          icon={LayoutDashboard}
          title="Receiving (GRN)"
          subtitle="All GRNs with full photo + audit trail"
          to="/grn"
        />
        <ModuleTile
          icon={Send}
          title="Dispatch (DC)"
          subtitle="Approve picked dispatches, track gate-out"
          to="/dispatch"
        />
        <ModuleTile
          icon={ShieldAlert}
          title="QC Hold"
          subtitle="Inspect quarantined items — release or reject"
          to="/qc"
        />
        <ModuleTile
          icon={Search}
          title="SO-wise Movement"
          subtitle="Trace every transaction for an SO number"
          to="/so-movement"
        />
        <ModuleTile
          icon={ClipboardList}
          title="Stock Counts"
          subtitle="Plan cycle counts, approve variances"
          to="/counts"
        />
        <ModuleTile
          icon={FileBarChart}
          title="ERP Export"
          subtitle="Quantity CSVs for Tally / SAP reconciliation"
          to="/export"
        />
      </div>
    </div>
  )
}
