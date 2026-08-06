import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, BadgeCheck, CalendarClock, Send, Truck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompanyModules } from '../lib/platform'
import { useSettings, DEFAULT_EXPIRY_WARN_DAYS } from '../lib/settings'
import { StatCard } from './StatCard'

/**
 * Today's activity KPIs — GRNs/dispatches today, pending approvals, low stock.
 * Shared by the Manager and Admin home screens so the figures stay in one place.
 */
export function TodayActivity() {
  const companyModules = useCompanyModules()
  const hasExpiry = companyModules?.['expiry'] === true
  const { data: settings } = useSettings()
  const warnDays = settings?.expiry_warn_days ?? DEFAULT_EXPIRY_WARN_DAYS

  const { data: kpis, isLoading } = useQuery({
    queryKey: ['manager-kpis', hasExpiry, warnDays],
    refetchInterval: 60_000,
    queryFn: async () => {
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const today = startOfDay.toISOString()

      const count = async (
        table: string,
        build: (q: any) => any,
      ): Promise<number> => {
        const { count, error } = await build(
          supabase.from(table).select('id', { count: 'exact', head: true }),
        )
        return error ? 0 : count ?? 0
      }

      // Cutoff (local date) for "expiring within N days".
      const cut = new Date()
      cut.setHours(0, 0, 0, 0)
      cut.setDate(cut.getDate() + warnDays)
      const cutoff = cut.toISOString().slice(0, 10)

      const [grnsToday, dispatchesToday, rrPending, dcPending, adjPending, lowStock, expiringSoon] =
        await Promise.all([
          count('grns', (q) => q.gte('created_at', today)),
          count('dispatches', (q) => q.gte('created_at', today)),
          count('release_requests', (q) => q.eq('status', 'DRAFT')),
          count('dispatches', (q) => q.eq('status', 'PICKED')),
          count('adjustments', (q) => q.eq('status', 'PENDING')),
          count('alerts', (q) =>
            q.in('alert_type', ['low_stock', 'out_of_stock']).eq('status', 'UNREAD'),
          ),
          hasExpiry
            ? count('item_batches', (q) => q.eq('status', 'active').lte('expiry_date', cutoff))
            : Promise.resolve(0),
        ])
      return { grnsToday, dispatchesToday, rrPending, dcPending, adjPending, lowStock, expiringSoon }
    },
  })

  const pendingTotal = (kpis?.rrPending ?? 0) + (kpis?.dcPending ?? 0) + (kpis?.adjPending ?? 0)

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Today's activity</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Truck} label="GRNs today" value={kpis?.grnsToday ?? 0} tone="brand" to="/grn" loading={isLoading} />
        <StatCard icon={Send} label="Dispatches today" value={kpis?.dispatchesToday ?? 0} tone="brand" to="/dispatch" loading={isLoading} />
        <StatCard icon={BadgeCheck} label="Pending approvals" value={pendingTotal} tone={pendingTotal > 0 ? 'amber' : 'slate'} hint="Releases, dispatches, adjustments" to="/alerts" loading={isLoading} />
        <StatCard icon={AlertTriangle} label="Low / out of stock" value={kpis?.lowStock ?? 0} tone={(kpis?.lowStock ?? 0) > 0 ? 'red' : 'slate'} to="/alerts" loading={isLoading} />
        {hasExpiry && (
          <StatCard icon={CalendarClock} label="Expiring soon" value={kpis?.expiringSoon ?? 0} tone={(kpis?.expiringSoon ?? 0) > 0 ? 'amber' : 'slate'} to="/perishables" loading={isLoading} />
        )}
      </div>
    </section>
  )
}
