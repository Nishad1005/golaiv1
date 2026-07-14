import { useQuery } from '@tanstack/react-query'
import {
  ScanBarcode, ArrowLeftRight, ListChecks, PackageCheck, PackageOpen, PencilRuler,
  Undo2, ClipboardList,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ItemLocator } from '../../components/ItemLocator'
import { ModuleTile } from '../../components/ModuleTile'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'

/** Task-centric home: GRNs to verify, RRs to fulfill, DCs to pick (PRD 7.4). */
export function StorekeeperHome() {
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['storekeeper-tasks'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const count = async (table: string, build: (q: any) => any): Promise<number> => {
        const { count, error } = await build(
          supabase.from(table).select('id', { count: 'exact', head: true }),
        )
        return error ? 0 : count ?? 0
      }
      const [grnDraft, rrApproved, dcReady] = await Promise.all([
        count('grns', (q) => q.eq('status', 'DRAFT')),
        count('release_requests', (q) => q.in('status', ['APPROVED', 'PARTIALLY_FULFILLED'])),
        count('dispatches', (q) => q.eq('status', 'READY')),
      ])
      return { grnDraft, rrApproved, dcReady }
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="My Tasks" subtitle="Find anything, capture stock, and clear what's waiting." />

      <ItemLocator />

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={PackageCheck} label="GRNs to verify" value={tasks?.grnDraft ?? 0} tone={(tasks?.grnDraft ?? 0) > 0 ? 'amber' : 'slate'} to="/grn" loading={isLoading} />
        <StatCard icon={PackageOpen} label="Requests to fulfill" value={tasks?.rrApproved ?? 0} tone={(tasks?.rrApproved ?? 0) > 0 ? 'amber' : 'slate'} to="/release" loading={isLoading} />
        <StatCard icon={ClipboardList} label="Dispatches to pick" value={tasks?.dcReady ?? 0} tone={(tasks?.dcReady ?? 0) > 0 ? 'amber' : 'slate'} to="/dispatch" loading={isLoading} />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Stock</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModuleTile icon={ScanBarcode} title="Capture" subtitle="Scan shelf, scan items, record stock" to="/capture" />
          <ModuleTile icon={ArrowLeftRight} title="Internal Transfer" subtitle="Move items between shelves" to="/transfer" />
          <ModuleTile icon={PencilRuler} title="Adjust Quantity" subtitle="Correct a count with a reason" to="/adjust" />
          <ModuleTile icon={ListChecks} title="Stock Counts" subtitle="Execute assigned cycle counts" to="/counts" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Material flow</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModuleTile icon={PackageCheck} title="Receiving (GRN)" subtitle="Verify material at gate, put away to shelves" to="/grn" />
          <ModuleTile icon={PackageOpen} title="Release Requests" subtitle="Fulfill approved requests from production" to="/release" />
          <ModuleTile icon={Undo2} title="Returns" subtitle="Scan issuance label, put material back" to="/returns" />
          <ModuleTile icon={ClipboardList} title="Dispatch" subtitle="Pick against SO, seal cartons, print labels" to="/dispatch" />
        </div>
      </section>
    </div>
  )
}
