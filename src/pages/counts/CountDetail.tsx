import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, CheckCircle2, Loader2, MapPin, ThumbsDown, ThumbsUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { ScanInput } from '../../components/ScanInput'
import { COUNT_STATUS_STYLES } from './CountList'
import type { Shelf } from '../../lib/types'

const VARIANCE_REASONS = ['miscount', 'theft', 'damage', 'system_error', 'unknown']

interface CountDetailData {
  id: string
  count_number: string
  plan_name: string
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED'
  scope: { note?: string }
  stock_count_lines: {
    id: string
    system_qty: number
    physical_qty: number | null
    variance: number
    reason_code: string | null
    items: { code: string; name: string; uom: string }
    shelves: { code: string }
  }[]
}

export function CountDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const isManager = ['manager', 'admin'].includes(profile!.role)
  const canExecute = ['storekeeper', 'manager', 'admin'].includes(profile!.role)

  const { data: count, isLoading } = useQuery({
    queryKey: ['stock-count', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_counts')
        .select(
          `id, count_number, plan_name, status, scope,
           stock_count_lines(id, system_qty, physical_qty, variance, reason_code,
             items(code, name, uom), shelves(code))`,
        )
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as unknown as CountDetailData
    },
  })

  const complete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('complete_stock_count', { p_count_id: id })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'complete.stock_count', entityType: 'stock_count', entityId: id,
      })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['stock-count', id] }),
  })

  const decide = useMutation({
    mutationFn: async (approve: boolean) => {
      const { error } = await supabase.rpc('decide_stock_count', {
        p_count_id: id,
        p_approve: approve,
      })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: approve ? 'approve.stock_count' : 'reject.stock_count',
        entityType: 'stock_count', entityId: id,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock-count', id] })
      void queryClient.invalidateQueries({ queryKey: ['item-locator'] })
    },
  })

  if (isLoading || !count) {
    return <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin text-brand-500" />
  }

  const variances = count.stock_count_lines.filter((l) => l.variance !== 0)

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl font-bold">{count.count_number}</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COUNT_STATUS_STYLES[count.status]}`}>
            {count.status.replace('_', ' ')}
          </span>
        </div>
        <p className="text-sm text-ink-400">
          {count.plan_name}
          {count.scope?.note ? ` · ${count.scope.note}` : ''}
        </p>
      </div>

      {count.status === 'IN_PROGRESS' && canExecute && <ExecutePanel countId={count.id} />}

      {count.stock_count_lines.length > 0 && (
        <div className="card space-y-2">
          <p className="font-semibold">
            Counted lines ({count.stock_count_lines.length}) — {variances.length} variance
            {variances.length === 1 ? '' : 's'}
          </p>
          {count.stock_count_lines.map((line) => (
            <div key={line.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-tan/20 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{line.items.name}</p>
                <p className="text-xs text-ink-400">
                  {line.shelves.code}
                  {line.reason_code ? ` · ${line.reason_code}` : ''}
                </p>
              </div>
              <span className="tabular-nums text-ink-400">system {line.system_qty}</span>
              <span className="tabular-nums font-semibold">counted {line.physical_qty}</span>
              <span
                className={
                  'w-20 text-right font-bold tabular-nums ' +
                  (line.variance === 0 ? 'text-green-700' : 'text-red-700')
                }
              >
                {line.variance > 0 ? '+' : ''}
                {line.variance}
              </span>
            </div>
          ))}
        </div>
      )}

      {count.status === 'IN_PROGRESS' && canExecute && count.stock_count_lines.length > 0 && (
        <button className="btn-primary w-full" disabled={complete.isPending} onClick={() => complete.mutate()}>
          {complete.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
          Finish counting — send for review
        </button>
      )}

      {count.status === 'COMPLETED' && isManager && (
        <div className="card flex flex-wrap items-center gap-3">
          <p className="flex-1 font-semibold">
            {variances.length === 0
              ? 'No variances — approve to close.'
              : `Approve ${variances.length} variance adjustment${variances.length > 1 ? 's' : ''}? Stock will be corrected to match physical counts.`}
          </p>
          <button className="btn-primary" onClick={() => decide.mutate(true)} disabled={decide.isPending}>
            <ThumbsUp className="h-5 w-5" /> Approve
          </button>
          <button className="btn-secondary" onClick={() => decide.mutate(false)} disabled={decide.isPending}>
            <ThumbsDown className="h-5 w-5" /> Reject — recount
          </button>
          {decide.isError && <p className="w-full text-sm text-red-600">{(decide.error as Error).message}</p>}
        </div>
      )}

      {count.status === 'APPROVED' && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5" /> Count approved — adjustments posted with full audit trail.
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Execution: scan a location → count everything expected on it
// ---------------------------------------------------------------------------

/** Enough of an item to count it — the expected list carries no more than this. */
interface CountItem {
  id: string
  code: string
  name: string
  uom: string
}

interface ExpectedRow {
  item: CountItem
  systemQty: number
  countedQty: number | null
}

function ExecutePanel({ countId }: { countId: string }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [shelf, setShelf] = useState<Shelf | null>(null)
  const [item, setItem] = useState<CountItem | null>(null)
  const [systemQty, setSystemQty] = useState(0)
  const [physicalQty, setPhysicalQty] = useState('')
  const [reason, setReason] = useState(VARIANCE_REASONS[0])
  const [error, setError] = useState<string | null>(null)

  /**
   * What Golai believes is on this location, and what has been counted so far.
   *
   * Without this the screen only showed what the storekeeper happened to scan,
   * so missing one of five products on a shelf raised no variance at all — the
   * count passed silently and the error stayed in the system. It also makes
   * counting possible for products with no barcode: tap the row instead.
   */
  const { data: expected } = useQuery({
    queryKey: ['count-expected', countId, shelf?.id],
    enabled: !!shelf,
    queryFn: async (): Promise<ExpectedRow[]> => {
      const [balances, lines] = await Promise.all([
        supabase
          .from('stock_balances')
          .select('qty_on_hand, items(id, code, name, uom)')
          .eq('shelf_id', shelf!.id),
        supabase
          .from('stock_count_lines')
          .select('item_id, physical_qty')
          .eq('stock_count_id', countId)
          .eq('shelf_id', shelf!.id),
      ])
      const counted = new Map(
        ((lines.data ?? []) as { item_id: string; physical_qty: number | null }[])
          .map((l) => [l.item_id, l.physical_qty]),
      )
      return ((balances.data ?? []) as never as { qty_on_hand: number; items: CountItem | null }[])
        .filter((b) => b.items)
        .map((b) => ({
          item: b.items!,
          systemQty: b.qty_on_hand,
          countedQty: counted.has(b.items!.id) ? counted.get(b.items!.id) ?? null : null,
        }))
        .sort((a, b) => a.item.name.localeCompare(b.item.name))
    },
  })

  const pick = (row: ExpectedRow) => {
    setError(null)
    setItem(row.item)
    setSystemQty(row.systemQty)
    setPhysicalQty(row.countedQty != null ? String(row.countedQty) : '')
  }

  const findShelf = async (code: string) => {
    setError(null)
    const { data } = await supabase
      .from('shelves').select('*').ilike('code', code).is('deleted_at', null).maybeSingle()
    if (!data) return setError(`Location "${code}" not found.`)
    setShelf(data as Shelf)
    setItem(null)
  }

  // Anything found on the location that Golai did not expect — scan or type it.
  const findItem = async (scan: string) => {
    setError(null)
    const { data: found } = await supabase
      .from('items')
      .select('id, code, name, uom')
      .or(`code.eq.${scan},barcode.eq.${scan}`)
      .maybeSingle()
    if (!found) return setError(`Product "${scan}" not found.`)
    const { data: bal } = await supabase
      .from('stock_balances')
      .select('qty_on_hand')
      .eq('shelf_id', shelf!.id)
      .eq('item_id', found.id)
      .maybeSingle()
    setItem(found as CountItem)
    setSystemQty(bal?.qty_on_hand ?? 0)
    setPhysicalQty('')
  }

  const record = useMutation({
    mutationFn: async () => {
      const variance = Number(physicalQty) - systemQty
      const { error } = await supabase.rpc('record_count_line', {
        p_count_id: countId,
        p_shelf_id: shelf!.id,
        p_item_id: item!.id,
        p_physical_qty: Number(physicalQty),
        p_reason_code: variance !== 0 ? reason : null,
      })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'record.count_line', entityType: 'stock_count', entityId: countId,
        after: { shelf: shelf!.code, item: item!.code, physical: Number(physicalQty), variance },
      })
    },
    onSuccess: () => {
      setItem(null)
      setPhysicalQty('')
      void queryClient.invalidateQueries({ queryKey: ['stock-count', countId] })
      void queryClient.invalidateQueries({ queryKey: ['count-expected', countId, shelf?.id] })
    },
  })

  const variance = physicalQty !== '' ? Number(physicalQty) - systemQty : 0
  const done = (expected ?? []).filter((r) => r.countedQty != null).length
  const remaining = (expected ?? []).length - done

  return (
    <div className="card space-y-3">
      {!shelf ? (
        <>
          <p className="font-semibold">Scan the location to count</p>
          <ScanInput placeholder="location code" onScan={(v) => void findShelf(v)} />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <MapPin className="h-5 w-5 text-brand-500" />
            <span className="font-mono font-bold">{shelf.code}</span>
            {expected && expected.length > 0 && (
              <span className={`badge tabular-nums ${remaining === 0 ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700'}`}>
                {done} of {expected.length} counted
              </span>
            )}
            <button className="btn-secondary ml-auto" onClick={() => { setShelf(null); setItem(null) }}>
              Change location
            </button>
          </div>

          {item ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                record.mutate()
              }}
            >
              <p className="font-medium">
                {item.name} <span className="text-sm font-normal text-ink-400">{item.code}</span>
              </p>
              <div>
                <label className="label-text" htmlFor="physical-qty">
                  Physical quantity (system shows {systemQty} {item.uom})
                </label>
                <input id="physical-qty" type="number" inputMode="decimal" min="0" step="any"
                  className="input-field text-2xl font-bold" value={physicalQty}
                  onChange={(e) => setPhysicalQty(e.target.value)} required autoFocus />
                <p className="mt-1 text-xs text-ink-400">
                  Nothing there? Enter <strong>0</strong> — that is a real count, not a skip.
                </p>
              </div>
              {physicalQty !== '' && variance !== 0 && (
                <div>
                  <label className="label-text" htmlFor="variance-reason">
                    Variance {variance > 0 ? '+' : ''}{variance} — reason required
                  </label>
                  <select id="variance-reason" className="input-field" value={reason} onChange={(e) => setReason(e.target.value)}>
                    {VARIANCE_REASONS.map((r) => (
                      <option key={r} value={r}>{r.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={record.isPending}>
                  {record.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
                  Record count
                </button>
                <button type="button" className="btn-secondary" onClick={() => setItem(null)}>
                  Cancel
                </button>
              </div>
              {record.isError && <p className="text-sm text-red-600">{(record.error as Error).message}</p>}
            </form>
          ) : (
            <>
              <p className="font-semibold">
                Golai expects these here — tap each one and enter what you actually see
              </p>

              {expected == null ? (
                <Loader2 className="mx-auto my-4 h-5 w-5 animate-spin text-brand-500" />
              ) : expected.length === 0 ? (
                <p className="rounded-xl bg-ink-50 px-4 py-5 text-center text-sm text-ink-400">
                  Nothing is recorded on this location. Scan anything you find here.
                </p>
              ) : (
                <ul className="divide-y divide-ink-200/70">
                  {expected.map((row) => (
                    <li key={row.item.id}>
                      <button
                        className="flex min-h-tap w-full items-center gap-3 py-2 text-left transition-colors hover:bg-cream"
                        onClick={() => pick(row)}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                            row.countedQty != null
                              ? 'border-brand-500 bg-brand-500 text-white'
                              : 'border-ink-300'
                          }`}
                        >
                          {row.countedQty != null && <Check className="h-3.5 w-3.5" aria-hidden />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{row.item.name}</span>
                          <span className="block text-xs text-ink-400">
                            {row.item.code} · system {row.systemQty} {row.item.uom}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-sm tabular-nums">
                          {row.countedQty != null ? (
                            <span className="font-semibold text-brand-700">counted {row.countedQty}</span>
                          ) : (
                            <span className="text-amber-600">not counted</span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {remaining > 0 && (
                <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {remaining} product{remaining === 1 ? '' : 's'} here {remaining === 1 ? 'has' : 'have'} not been
                  counted. Anything left out keeps its old figure — enter 0 if it is not there.
                </p>
              )}

              <div>
                <p className="label-text">Found something not on the list?</p>
                <ScanInput placeholder="scan or type a product code" onScan={(v) => void findItem(v)} autoFocus={false} />
              </div>
            </>
          )}
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
