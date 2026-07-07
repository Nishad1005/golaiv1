import { Truck, LogIn, LogOut } from 'lucide-react'
import { ModuleTile } from '../../components/ModuleTile'

/** Gate dashboard: vehicles in/out today, pending DCs to gate-out (PRD 7.4). */
export function SecurityHome() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Gate Dashboard</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <ModuleTile
          icon={LogIn}
          title="New Gate Entry"
          subtitle="Vehicle arriving with material (GRN Stage 1)"
          to="/grn/new"
        />
        <ModuleTile
          icon={Truck}
          title="Gate Entries"
          subtitle="All GRNs — vehicles in, status, photos"
          to="/grn"
        />
        <ModuleTile
          icon={LogOut}
          title="Gate-Out Dispatch"
          subtitle="Approved DCs waiting for vehicle"
          comingInPhase={5}
        />
      </div>
    </div>
  )
}
