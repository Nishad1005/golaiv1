import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, CheckCircle2, Loader2, MapPin, Plus, Search, Trash2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { locationLabel } from '../../lib/places'
import { PageHeader } from '../../components/PageHeader'
import type { Item, Shelf } from '../../lib/types'

interface IssueLine {
  item: Pick<Item, 'id' | 'code' | 'name' | 'uom'>
  shelf: Pick<Shelf, 'id' | 'code'>
  available: number
  qty: string
}

/**
 * Issuance — issue stock straight out against a work order.
 *
 * Header (work order, department, issued-to) + one or more product lines, each
 * taken off a specific location. Submitting decrements stock immediately via
 * the guarded issue_stock RPC, which routes through move_stock, so the item's
 * stock card and the dashboard reflect it at once. Barcode-free: products are
 * found by name, like the rest of the floor.
 */
export function Issuance() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const [workOrder, setWorkOrder] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [issuedTo, setIssuedTo] = useState('')
  const [lines, setLines] = useState<IssueLine[]>([])
  const [picking, setPicking] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data } = await supabase
        .from('departments').select('id, name').is('deleted_at', null).order('name')
      return (data ?? []) as { id: string; name: string }[]
    },
  })

  const submit = useMutation({
    mutationFn: async () => {
      const payload = lines.map((l) => ({ item_id: l.item.id, shelf_id: l.shelf.id, qty: Number(l.qty) }))
      const { data, error } = await supabase.rpc('issue_stock', {
        p_work_order: workOrder.trim() || null,
        p_department_id: departmentId || null,
        p_issued_to: issuedTo.trim() || null,
        p_lines: payload,
      })
      if (error) throw new Error(error.message)
      const row = (Array.isArray(data) ? data[0] : data) as { issue_number: string }
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'create.issuance', entityType: 'stock_issue',
        after: { work_order: workOrder.trim(), issued_to: issuedTo.trim(), lines: payload.length },
      })
      return row.issue_number
    },
    onSuccess: (issueNumber) => {
      setDone(issueNumber)
      setWorkOrder(''); setDepartmentId(''); setIssuedTo(''); setLines([])
      void queryClient.invalidateQueries({ queryKey: ['item-locator'] })
      void queryClient.invalidateQueries({ queryKey: ['stock-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['stock-by-zone'] })
    },
  })

  const canSubmit = lines.length > 0 &&
    lines.every((l) => Number(l.qty) > 0 && Number(l.qty) <= l.available)

  return (
    <div className="space-y-4">
      <PageHeader title="Issuance" subtitle="Issue stock out against a work order — the count drops straight away." />

      {done && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> Issued — <b>{done}</b>. Stock updated.
        </div>
      )}

      {picking ? (
        <ProductPicker
          onCancel={() => setPicking(false)}
          onPick={(line) => {
            setDone(null)
            setLines((prev) => [...prev, line])
            setPicking(false)
          }}
        />
      ) : (
        <>
          <div className="card space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label-text" htmlFor="wo">Work order no.</label>
                <input id="wo" className="input-field" value={workOrder}
                  onChange={(e) => setWorkOrder(e.target.value)} placeholder="e.g. WO-1234" />
              </div>
              <div>
                <label className="label-text" htmlFor="dept">Department</label>
                <select id="dept" className="input-field" value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}>
                  <option value="">Choose…</option>
                  {(departments ?? []).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-text" htmlFor="to">Issued to</label>
                <input id="to" className="input-field" value={issuedTo}
                  onChange={(e) => setIssuedTo(e.target.value)} placeholder="person's name" />
              </div>
            </div>
          </div>

          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Products to issue</p>
              <button className="btn-secondary" onClick={() => { setDone(null); setPicking(true) }}>
                <Plus className="h-5 w-5" aria-hidden /> Add product
              </button>
            </div>

            {lines.length === 0 ? (
              <p className="rounded-xl bg-ink-50 px-4 py-5 text-center text-sm text-ink-400">
                Add the products this person is taking.
              </p>
            ) : (
              lines.map((l, i) => {
                const over = Number(l.qty) > l.available
                return (
                  <div key={`${l.item.id}-${l.shelf.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.item.name}</p>
                      <p className="text-xs text-ink-400">
                        {l.item.code} · <span className="font-mono">{l.shelf.code}</span> · {l.available} {l.item.uom} available
                      </p>
                    </div>
                    <input
                      type="number" inputMode="decimal" min="0.01" max={l.available} step="any"
                      className={`h-11 w-24 rounded-xl border px-3 text-right text-base tabular-nums ${over ? 'border-red-400' : 'border-ink-200'}`}
                      placeholder="qty" value={l.qty}
                      onChange={(e) => setLines(lines.map((x, idx) => idx === i ? { ...x, qty: e.target.value } : x))}
                    />
                    <span className="w-8 text-sm text-ink-400">{l.item.uom}</span>
                    <button
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600"
                      onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
                      aria-label={`Remove ${l.item.name}`}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                    {over && (
                      <p className="w-full text-xs text-red-600">
                        Only {l.available} {l.item.uom} on {l.shelf.code}.
                      </p>
                    )}
                  </div>
                )
              })
            )}

            {lines.length > 0 && (
              <button className="btn-primary w-full" disabled={!canSubmit || submit.isPending}
                onClick={() => submit.mutate()}>
                {submit.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
                Issue {lines.length} product{lines.length === 1 ? '' : 's'}
              </button>
            )}
            {submit.isError && <p className="text-sm text-red-600">{(submit.error as Error).message}</p>}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pick a product by name, then which location to issue it from.
// (Mirrors Adjustments' ByProduct — no barcode needed.)
// ---------------------------------------------------------------------------
function ProductPicker({ onPick, onCancel }: {
  onPick: (line: IssueLine) => void
  onCancel: () => void
}) {
  const [search, setSearch] = useState('')
  const [item, setItem] = useState<IssueLine['item'] | null>(null)

  const { data: matches, isFetching } = useQuery({
    queryKey: ['issuance-item-search', search.trim()],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const q = search.trim()
      const { data } = await supabase
        .from('items').select('id, code, name, uom')
        .or(`name.ilike.%${q}%,code.ilike.%${q}%,item_type.ilike.%${q}%,barcode.eq.${q}`)
        .eq('status', 'active').is('deleted_at', null).limit(10)
      return (data ?? []) as IssueLine['item'][]
    },
  })

  const { data: locations } = useQuery({
    queryKey: ['issuance-item-locations', item?.id],
    enabled: !!item,
    queryFn: async () => {
      const { data } = await supabase
        .from('stock_balances')
        .select('qty_on_hand, shelves(id, code, fixture_type, description, zones(code, name))')
        .eq('item_id', item!.id)
        .gt('qty_on_hand', 0)
      return ((data ?? []) as never as {
        qty_on_hand: number
        shelves: (Pick<Shelf, 'id' | 'code' | 'fixture_type' | 'description'> & { zones: { code: string; name: string } | null }) | null
      }[]).filter((r) => r.shelves)
    },
  })

  return (
    <div className="card space-y-3">
      <button className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-brand-600" onClick={onCancel}>
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {!item ? (
        <>
          <p className="font-semibold">Search a product by name</p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
            <input className="input-field pl-12" placeholder="Search product by name or code…"
              value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
            {isFetching && <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-brand-500" />}
          </div>
          {search.trim().length >= 2 && (
            <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
              {(matches ?? []).map((m) => (
                <li key={m.id}>
                  <button className="flex min-h-tap w-full items-center px-4 text-left hover:bg-cream"
                    onClick={() => { setItem(m); setSearch('') }}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.name}</span>
                      <span className="block text-xs text-ink-400">{m.code}</span>
                    </span>
                  </button>
                </li>
              ))}
              {!isFetching && (matches ?? []).length === 0 && (
                <li className="px-4 py-3 text-sm text-ink-400">No product matches.</li>
              )}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="min-w-0">
              <span className="block truncate font-semibold">{item.name}</span>
              <span className="block text-xs text-ink-400">{item.code}</span>
            </span>
            <button className="btn-secondary ml-auto" onClick={() => setItem(null)}>Change product</button>
          </div>

          <p className="text-sm font-semibold text-ink-500">Issue from which location?</p>
          {locations == null ? (
            <Loader2 className="mx-auto my-4 h-5 w-5 animate-spin text-brand-500" />
          ) : locations.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This product has no stock on any location, so there's nothing to issue.
            </p>
          ) : (
            <ul className="divide-y divide-ink-200/70 rounded-xl border border-ink-200">
              {locations.map((r) => (
                <li key={r.shelves!.id}>
                  <button
                    className="flex min-h-tap w-full items-center gap-3 px-4 text-left hover:bg-cream"
                    onClick={() => onPick({
                      item, shelf: r.shelves!, available: r.qty_on_hand, qty: '',
                    })}
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-brand-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {r.shelves!.zones ? `${r.shelves!.zones.name} · ` : ''}{locationLabel(r.shelves!)}
                      </span>
                      <span className="block font-mono text-xs text-ink-400">{r.shelves!.code}</span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-ink-500">
                      {r.qty_on_hand} {item.uom}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
