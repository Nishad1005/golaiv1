import { LayoutDashboard, BadgeCheck, Search, FileBarChart } from 'lucide-react'
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
          icon={Search}
          title="SO-wise Movement"
          subtitle="Trace every transaction for an SO number"
          comingInPhase={6}
        />
        <ModuleTile
          icon={FileBarChart}
          title="Reports"
          subtitle="Stock, variance, activity exports"
          comingInPhase={6}
        />
      </div>
    </div>
  )
}
