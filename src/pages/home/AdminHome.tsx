import { Users, Map, Boxes, Building2, Printer, Settings } from 'lucide-react'
import { ItemLocator } from '../../components/ItemLocator'
import { ModuleTile } from '../../components/ModuleTile'

/** Settings-heavy home: users, masters, zone setup, integrations (PRD 7.4). */
export function AdminHome() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Administration</h1>
      <ItemLocator />
      <div className="grid gap-3 sm:grid-cols-2">
        <ModuleTile
          icon={Map}
          title="Zones & Shelves"
          subtitle="Define layout, generate shelf labels"
          to="/admin/zones"
        />
        <ModuleTile
          icon={Boxes}
          title="Items"
          subtitle="Item master, codes, CSV import"
          to="/admin/items"
        />
        <ModuleTile
          icon={Building2}
          title="Suppliers, Customers & Departments"
          subtitle="Contact masters (names only, no financials)"
          to="/admin/parties"
        />
        <ModuleTile
          icon={Users}
          title="Users & Roles"
          subtitle="Assign the five Golai roles"
          to="/admin/users"
        />
        <ModuleTile
          icon={Printer}
          title="Label Printing"
          subtitle="Shelf label PDFs — per zone, from Zones & Shelves"
          to="/admin/zones"
        />
        <ModuleTile
          icon={Settings}
          title="Settings"
          subtitle="Edit lock, thresholds, working hours"
          comingInPhase={2}
        />
      </div>
    </div>
  )
}
