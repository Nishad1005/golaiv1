import { FilePlus2, History, AlertTriangle } from 'lucide-react'
import { ItemLocator } from '../../components/ItemLocator'
import { ModuleTile } from '../../components/ModuleTile'

/** Department status: open RRs, recent issuances, low-stock alerts (PRD 7.4). */
export function PlannerHome() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Department Status</h1>
      <ItemLocator />
      <div className="grid gap-3 sm:grid-cols-2">
        <ModuleTile
          icon={FilePlus2}
          title="New Release Request"
          subtitle="Request material against an SO reference"
          to="/release/new"
        />
        <ModuleTile
          icon={History}
          title="Release Requests"
          subtitle="Status, approvals, issuance history"
          to="/release"
        />
        <ModuleTile
          icon={AlertTriangle}
          title="Alerts"
          subtitle="Low stock, out of stock, approvals"
          to="/alerts"
        />
      </div>
    </div>
  )
}
