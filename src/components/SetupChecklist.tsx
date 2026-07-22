import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronRight, PartyPopper } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTenant } from '../lib/tenant'

interface Step {
  key: string
  title: string
  detail: string
  to: string
  done: boolean
}

async function countOf(table: string, build?: (q: any) => any): Promise<number> {
  const base = supabase.from(table).select('id', { count: 'exact', head: true })
  const { count, error } = await (build ? build(base) : base)
  return error ? 0 : count ?? 0
}

/**
 * The setup checklist — what a new company has to do, in the order that works,
 * ticking itself off as the data appears.
 *
 * Without it a new admin lands in an empty app and has to already know the
 * sequence (zones → locations → labels → items → the walk), which today lives
 * in a PDF. Every step is detected from real data, so nothing can be "ticked"
 * without actually being done. Once all steps pass, the whole panel disappears
 * rather than nagging a warehouse that is already running.
 */
export function SetupChecklist() {
  const { data: tenant } = useTenant()

  const { data } = useQuery({
    queryKey: ['setup-checklist'],
    staleTime: 30_000,
    queryFn: async () => {
      const [zones, items, staff, overview, labelPrints] = await Promise.all([
        countOf('zones', (q: any) => q.is('deleted_at', null)),
        countOf('items', (q: any) => q.is('deleted_at', null)),
        countOf('profiles'),
        supabase.from('stock_overview').select('locations_total, locations_used').maybeSingle(),
        countOf('activity_log', (q: any) => q.eq('action', 'print.shelf_labels')),
      ])
      return {
        zones,
        items,
        staff,
        locations: overview.data?.locations_total ?? 0,
        located: overview.data?.locations_used ?? 0,
        labelPrints,
      }
    },
  })

  if (!data || !tenant) return null

  const steps: Step[] = [
    {
      key: 'company',
      title: 'Add your company name and logo',
      detail: 'Shown top-right for everyone on your team',
      to: '/admin/company',
      done: !!tenant.logo_url,
    },
    {
      key: 'zones',
      title: 'Set up your zones',
      detail: 'The areas of your warehouse',
      to: '/admin/zones',
      done: data.zones > 0,
    },
    {
      key: 'locations',
      title: 'Add locations inside each zone',
      detail: 'Shelves, ghodas, racks — call them whatever you call them',
      to: '/admin/zones',
      done: data.locations > 0,
    },
    {
      key: 'labels',
      title: 'Print location labels and stick them on',
      detail: 'It does not matter which sticker goes where',
      to: '/admin/zones',
      done: data.labelPrints > 0,
    },
    {
      key: 'items',
      title: 'Bring in your product list',
      detail: 'Import your CSV — your existing codes are kept exactly as they are',
      to: '/admin/items',
      done: data.items > 0,
    },
    {
      key: 'staff',
      title: 'Create logins for your team',
      detail: 'Email or mobile number — floor staff need no email',
      to: '/admin/users',
      done: data.staff > 1,
    },
    {
      key: 'walk',
      title: 'Record where each product sits',
      detail: 'Scan a location, search products by name — no product barcodes needed',
      to: '/assign',
      done: data.located > 0,
    },
  ]

  const doneCount = steps.filter((s) => s.done).length
  if (doneCount === steps.length) return null

  const next = steps.find((s) => !s.done)
  const pct = Math.round((doneCount / steps.length) * 100)

  return (
    <section className="card border-brand-200 bg-brand-50/40">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-ink-900">
            <PartyPopper className="h-5 w-5 text-brand-600" aria-hidden />
            Getting set up
          </h2>
          <p className="mt-0.5 text-sm text-ink-500">
            Work down this list once and the warehouse is live. It disappears when you're done.
          </p>
        </div>
        <span className="badge bg-white text-ink-600 tabular-nums">{doneCount} of {steps.length} done</span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol className="mt-4 space-y-1.5">
        {steps.map((s) => {
          const isNext = s.key === next?.key
          return (
            <li key={s.key}>
              <Link
                to={s.to}
                className={`flex min-h-tap items-center gap-3 rounded-xl border px-3 py-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
                  isNext
                    ? 'border-brand-300 bg-white shadow-card'
                    : 'border-transparent bg-white/60 hover:bg-white'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    s.done
                      ? 'border-brand-500 bg-brand-500 text-white'
                      : isNext ? 'border-brand-400 text-brand-600' : 'border-ink-300 text-ink-400'
                  }`}
                >
                  {s.done && <Check className="h-3.5 w-3.5" aria-hidden />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold ${s.done ? 'text-ink-400 line-through' : 'text-ink-800'}`}>
                    {s.title}
                  </span>
                  {!s.done && <span className="block text-xs text-ink-400">{s.detail}</span>}
                </span>

                {isNext && (
                  <span className="badge shrink-0 bg-brand-100 text-brand-700">Next</span>
                )}
                {!s.done && <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" aria-hidden />}
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
