import { Users, Map, Boxes, Building2, Printer, Settings, PackageCheck, Send } from 'lucide-react'
import { ItemLocator } from '../../components/ItemLocator'
import { ModuleTile } from '../../components/ModuleTile'
import { PageHeader } from '../../components/PageHeader'

/** Settings-heavy home: users, masters, zone setup, integrations (PRD 7.4). */
export function AdminHome() {
  return (
    <div className="space-y-6">
      <PageHeader title="Administration" subtitle="Set up the warehouse, masters, and staff." />

      <ItemLocator />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Master data</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModuleTile icon={Map} title="Zones & Shelves" subtitle="Define layout, generate shelf labels" to="/admin/zones" />
          <ModuleTile icon={Boxes} title="Items" subtitle="Item master, codes, CSV import, barcode labels" to="/admin/items" />
          <ModuleTile icon={Building2} title="Suppliers, Customers & Departments" subtitle="Contact masters (names only, no financials)" to="/admin/parties" />
          <ModuleTile icon={Users} title="Users & Roles" subtitle="Create staff logins, assign the five roles" to="/admin/users" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Operations</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModuleTile icon={PackageCheck} title="Receiving (GRN)" subtitle="All gate entries and putaway" to="/grn" />
          <ModuleTile icon={Send} title="Dispatch (DC)" subtitle="Outbound orders and gate-out" to="/dispatch" />
          <ModuleTile icon={Printer} title="Label Printing" subtitle="Shelf and item barcode label PDFs" to="/admin/zones" />
          <ModuleTile icon={Settings} title="Settings" subtitle="Edit lock, thresholds, working hours" comingInPhase={2} />
        </div>
      </section>
    </div>
  )
}
