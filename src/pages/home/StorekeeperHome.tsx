import { ScanBarcode, ArrowLeftRight, ListChecks, PackageCheck, PackageOpen, PencilRuler, Undo2, ClipboardList } from 'lucide-react'
import { ItemLocator } from '../../components/ItemLocator'
import { ModuleTile } from '../../components/ModuleTile'

/** Task-centric home: GRNs to verify, RRs to fulfill, DCs to pick (PRD 7.4). */
export function StorekeeperHome() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">My Tasks</h1>
      <ItemLocator />
      <div className="grid gap-3 sm:grid-cols-2">
        <ModuleTile
          icon={ScanBarcode}
          title="Capture"
          subtitle="Scan shelf, scan items, record stock"
          to="/capture"
        />
        <ModuleTile
          icon={ArrowLeftRight}
          title="Internal Transfer"
          subtitle="Move items between shelves"
          to="/transfer"
        />
        <ModuleTile
          icon={PencilRuler}
          title="Adjust Quantity"
          subtitle="Correct a count with a reason (manager approves)"
          to="/adjust"
        />
        <ModuleTile
          icon={PackageCheck}
          title="Receiving (GRN)"
          subtitle="Verify material at gate, put away to shelves"
          to="/grn"
        />
        <ModuleTile
          icon={PackageOpen}
          title="Release Requests to Fulfill"
          subtitle="Approved requests from production"
          to="/release"
        />
        <ModuleTile
          icon={Undo2}
          title="Returns"
          subtitle="Scan issuance label, put material back"
          to="/returns"
        />
        <ModuleTile
          icon={ClipboardList}
          title="Dispatch"
          subtitle="Pick against SO, seal cartons, print labels"
          to="/dispatch"
        />
        <ModuleTile
          icon={ListChecks}
          title="Stock Counts"
          subtitle="Execute assigned cycle counts"
          to="/counts"
        />
      </div>
    </div>
  )
}
