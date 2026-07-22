import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, ArrowLeftRight, ClipboardCheck, Loader2, MapPin, PackageCheck,
  PackageOpen, PencilRuler, Send, ShieldAlert, Undo2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { locationLabel } from '../lib/places'
import { PageHeader } from '../components/PageHeader'

interface Movement {
  item_id: string
  shelf_id: string | null
  moved_at: string
  kind: string
  qty: number
  reference: string | null
  reference_id: string | null
  person_id: string | null
  note: string | null
}

interface ShelfRow {
  id: string
  code: string
  fixture_type: string | null
  description: string | null
  zones: { code: string; name: string } | null
}

/** How each movement kind is shown. Tone is the colour of the quantity. */
const KINDS: Record<string, { label: string; icon: LucideIcon }> = {
  grn: { label: 'Received', icon: PackageCheck },
  capture: { label: 'Counted', icon: ClipboardCheck },
  transfer_in: { label: 'Transferred in', icon: ArrowLeftRight },
  transfer_out: { label: 'Transferred out', icon: ArrowLeftRight },
  issue: { label: 'Issued to production', icon: PackageOpen },
  return: { label: 'Returned', icon: Undo2 },
  dispatch: { label: 'Dispatched', icon: Send },
  adjust: { label: 'Adjusted', icon: PencilRuler },
  qc_release: { label: 'Released from QC', icon: ShieldAlert },
  placement: { label: 'Located', icon: MapPin },
}

/**
 * The stock card: one product's whole history — what came in, what went out,
 * when, by whom, against which document, and what was left after each move.
 *
 * The running balance is computed *backwards* from the live stock balance, so
 * the newest row always agrees with what the warehouse actually holds. Working
 * forwards from zero would drift if any movement predates the ledger.
 */
export function ItemMovement() {
  const { id } = useParams<{ id: string }>()

  const { data: item } = useQuery({
    queryKey: ['item-card', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select('id, code, name, item_type, uom, code_auto_assigned, stock_balances(qty_on_hand, qty_on_hold, shelf_id, shelves(code, fixture_type, description, zones(code, name)))')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as never as {
        id: string; code: string; name: string; item_type: string | null; uom: string
        code_auto_assigned: boolean
        stock_balances: {
          qty_on_hand: number; qty_on_hold: number; shelf_id: string
          shelves: ShelfRow | null
        }[]
      }
    },
  })

  const { data: movements, isLoading } = useQuery({
    queryKey: ['item-movements', id],
    enabled: !!id,
    queryFn: async (): Promise<Movement[]> => {
      const { data, error } = await supabase
        .from('item_movements')
        .select('item_id, shelf_id, moved_at, kind, qty, reference, reference_id, person_id, note')
        .eq('item_id', id!)
        .order('moved_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return (data ?? []) as Movement[]
    },
  })

  // The view carries ids, not names — resolve the ones this page actually uses.
  const shelfIds = useMemo(
    () => [...new Set((movements ?? []).map((m) => m.shelf_id).filter(Boolean))] as string[],
    [movements],
  )
  const personIds = useMemo(
    () => [...new Set((movements ?? []).map((m) => m.person_id).filter(Boolean))] as string[],
    [movements],
  )

  const { data: shelves } = useQuery({
    queryKey: ['movement-shelves', shelfIds],
    enabled: shelfIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('shelves')
        .select('id, code, fixture_type, description, zones(code, name)')
        .in('id', shelfIds)
      return new Map(((data ?? []) as never as ShelfRow[]).map((s) => [s.id, s]))
    },
  })

  const { data: people } = useQuery({
    queryKey: ['movement-people', personIds],
    enabled: personIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', personIds)
      return new Map(((data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]))
    },
  })

  const onHand = (item?.stock_balances ?? []).reduce((s, b) => s + b.qty_on_hand, 0)
  const onHold = (item?.stock_balances ?? []).reduce((s, b) => s + b.qty_on_hold, 0)
  const locations = (item?.stock_balances ?? []).filter((b) => b.shelves)

  // Walk backwards from the live balance so the top row is always the truth.
  const ledger = useMemo(() => {
    let running = onHand
    return (movements ?? []).map((m) => {
      const balanceAfter = running
      running -= m.qty
      return { ...m, balanceAfter }
    })
  }, [movements, onHand])

  if (!item) {
    return <Loader2 className="mx-auto mt-10 h-7 w-7 animate-spin text-brand-500" />
  }

  return (
    <div>
      <Link to="/find" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> Back to Find
      </Link>

      <PageHeader title={item.name} subtitle={`${item.code}${item.item_type ? ` · ${item.item_type}` : ''}`} />

      {/* ---------- Where it stands right now ---------- */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">In stock</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-ink-900">
            {onHand} <span className="text-base font-medium text-ink-400">{item.uom}</span>
          </p>
        </div>
        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">On QC hold</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${onHold > 0 ? 'text-amber-600' : 'text-ink-300'}`}>
            {onHold} <span className="text-base font-medium text-ink-400">{item.uom}</span>
          </p>
        </div>
        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Locations</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-ink-900">{locations.length}</p>
        </div>
      </div>

      <section className="card mt-4">
        <h2 className="font-semibold text-ink-900">Where it is</h2>
        {locations.length === 0 ? (
          <p className="mt-3 rounded-xl bg-ink-50 px-4 py-5 text-center text-sm text-ink-400">
            No location recorded yet — use <strong>Assign Location</strong> to record where this sits.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {locations.map((b) => (
              <li key={b.shelf_id} className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 shrink-0 text-brand-500" />
                <span className="min-w-0">
                  {b.shelves?.zones ? `${b.shelves.zones.name} (${b.shelves.zones.code})` : '—'}
                  {' · '}
                  {b.shelves ? locationLabel(b.shelves) : '—'}
                  <span className="ml-1.5 text-ink-400">{b.shelves?.code}</span>
                </span>
                <span className="ml-auto shrink-0 font-semibold tabular-nums">
                  {b.qty_on_hand > 0 ? `${b.qty_on_hand} ${item.uom}` : <span className="font-normal text-ink-400">not counted yet</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- The ledger ---------- */}
      <section className="card mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-ink-900">Movement history</h2>
          {ledger.length > 0 && (
            <span className="badge bg-ink-100 text-ink-600 tabular-nums">{ledger.length} movements</span>
          )}
        </div>

        {isLoading ? (
          <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-brand-500" />
        ) : ledger.length === 0 ? (
          <p className="mt-3 rounded-xl bg-ink-50 px-4 py-6 text-center text-sm text-ink-400">
            Nothing has moved yet. Receiving, issuing, transfers and counts all appear here.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-200/70">
            {ledger.map((m, i) => {
              const meta = KINDS[m.kind] ?? { label: m.kind, icon: ClipboardCheck }
              const Icon = meta.icon
              const shelf = m.shelf_id ? shelves?.get(m.shelf_id) : undefined
              const person = m.person_id ? people?.get(m.person_id) : undefined
              const incoming = m.qty > 0

              return (
                <li key={`${m.kind}-${m.reference_id}-${i}`} className="flex items-start gap-3 py-3">
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      m.qty === 0 ? 'bg-ink-50 text-ink-400'
                        : incoming ? 'bg-brand-50 text-brand-600' : 'bg-amber-50 text-amber-600'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold text-ink-800">{meta.label}</span>
                      {m.reference && (
                        <span className="font-mono text-xs text-ink-500">{m.reference}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-ink-400">
                      {shelf ? `${shelf.zones?.code ?? ''} · ${locationLabel(shelf)}` : 'Location not recorded'}
                      {person && ` · ${person}`}
                    </p>
                    {m.note && <p className="mt-0.5 truncate text-xs text-ink-400">{m.note}</p>}
                    <p className="mt-0.5 text-xs text-ink-400">{new Date(m.moved_at).toLocaleString()}</p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={`font-bold tabular-nums ${
                        m.qty === 0 ? 'text-ink-400' : incoming ? 'text-brand-600' : 'text-amber-700'
                      }`}
                    >
                      {m.qty === 0 ? '—' : `${incoming ? '+' : ''}${m.qty}`}
                    </p>
                    <p className="text-xs tabular-nums text-ink-400">{m.balanceAfter} left</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {ledger.length >= 300 && (
          <p className="mt-3 text-xs text-ink-400">
            Showing the most recent 300 movements.
          </p>
        )}
      </section>
    </div>
  )
}
