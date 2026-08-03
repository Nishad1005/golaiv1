import {
  Users, Map, Boxes, Building, Building2, Printer, Settings, PackageCheck, Send,
  PackageOpen, ClipboardCheck, ShieldAlert, Search, ClipboardList, FileBarChart,
} from 'lucide-react'
import { ItemLocator } from '../../components/ItemLocator'
import { ModuleTile } from '../../components/ModuleTile'
import { PageHeader } from '../../components/PageHeader'
import { SetupChecklist } from '../../components/SetupChecklist'
import { SampleDataCard } from '../../components/SampleDataCard'
import { StockOverview } from '../../components/StockOverview'
import { TodayActivity } from '../../components/TodayActivity'

/**
 * Admin home: the setup checklist and masters (PRD 7.4), plus the full
 * operational dashboard the manager sees — stock overview, today's activity,
 * approvals and reports — so an admin gets the whole picture on one screen.
 */
export function AdminHome() {
  return (
    <div className="space-y-6">
      <PageHeader title="Administration" subtitle="Set up the warehouse, masters, and staff." />

      <SetupChecklist />

      <SampleDataCard />

      <ItemLocator />

      {/* Operational dashboard — same figures the manager home shows. */}
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
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Master data</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModuleTile icon={Map} title="Zones & Locations" subtitle="Define layout, print location labels" to="/admin/zones" />
          <ModuleTile icon={Boxes} title="Items" subtitle="Item master, codes, CSV import, barcode labels" to="/admin/items" />
          <ModuleTile icon={Building2} title="Suppliers, Customers & Departments" subtitle="Contact masters (names only, no financials)" to="/admin/parties" />
          <ModuleTile icon={Users} title="Users & Roles" subtitle="Create staff logins, assign the five roles" to="/admin/users" />
          <ModuleTile icon={Building} title="Company Profile" subtitle="Your name & logo — shown across the app" to="/admin/company" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Operations</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModuleTile icon={PackageCheck} title="Receiving (GRN)" subtitle="All gate entries and putaway" to="/grn" />
          <ModuleTile icon={Send} title="Dispatch (DC)" subtitle="Outbound orders and gate-out" to="/dispatch" />
          <ModuleTile icon={Printer} title="Label Printing" subtitle="Location and product barcode label PDFs" to="/admin/zones" />
          <ModuleTile icon={Settings} title="Settings" subtitle="Undo window, working hours, photo retention" to="/admin/settings" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Operations & reports</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModuleTile icon={Search} title="SO-wise Movement" subtitle="Trace every transaction for an SO number" to="/so-movement" />
          <ModuleTile icon={ClipboardList} title="Stock Counts" subtitle="Plan cycle counts, approve variances" to="/counts" />
          <ModuleTile icon={FileBarChart} title="ERP Export" subtitle="Quantity CSVs for Tally / SAP reconciliation" to="/export" />
        </div>
      </section>
    </div>
  )
}
