import { useQuery } from '@tanstack/react-query'
import { Truck, LogIn, LogOut, PackageCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ModuleTile } from '../../components/ModuleTile'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'

/** Gate dashboard: vehicles in/out today, pending DCs to gate-out (PRD 7.4). */
export function SecurityHome() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['security-stats'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const today = startOfDay.toISOString()
      const count = async (table: string, build: (q: any) => any): Promise<number> => {
        const { count, error } = await build(
          supabase.from(table).select('id', { count: 'exact', head: true }),
        )
        return error ? 0 : count ?? 0
      }
      const [gateToday, dcReady] = await Promise.all([
        count('grns', (q) => q.gte('created_at', today)),
        count('dispatches', (q) => q.eq('status', 'READY')),
      ])
      return { gateToday, dcReady }
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Gate Dashboard" subtitle="Vehicles in and out, and dispatches ready to leave." />

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Truck} label="Gate entries today" value={stats?.gateToday ?? 0} tone="brand" to="/grn" loading={isLoading} />
        <StatCard icon={LogOut} label="Dispatches to gate-out" value={stats?.dcReady ?? 0} tone={(stats?.dcReady ?? 0) > 0 ? 'amber' : 'slate'} to="/dispatch" loading={isLoading} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ModuleTile icon={LogIn} title="New Gate Entry" subtitle="Vehicle arriving with material" to="/grn/new" />
        <ModuleTile icon={LogOut} title="Gate-Out Dispatch" subtitle="Approved DCs waiting for a vehicle" to="/dispatch" />
        <ModuleTile icon={PackageCheck} title="Gate Entries" subtitle="All GRNs — vehicles in, status, photos" to="/grn" />
      </div>
    </div>
  )
}
