import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, MapPin, ThumbsDown, ThumbsUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { ScanInput } from '../../components/ScanInput'
import { COUNT_STATUS_STYLES } from './CountList'
import type { Item, Shelf } from '../../lib/types'

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
    return <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin text-tan-dark" />
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
// Execution: scan shelf → scan item → physical qty (+ reason if variance)
// ---------------------------------------------------------------------------
function ExecutePanel({ countId }: { countId: string }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [shelf, setShelf] = useState<Shelf | null>(null)
  const [item, setItem] = useState<Item | null>(null)
  const [systemQty, setSystemQty] = useState(0)
  const [physicalQty, setPhysicalQty] = useState('')
  const [reason, setReason] = useState(VARIANCE_REASONS[0])
  const [error, setError] = useState<string | null>(null)

  const findShelf = async (code: string) => {
    setError(null)
    const { data } = await supabase
      .from('shelves').select('*').ilike('code', code).is('deleted_at', null).maybeSingle()
    if (!data) return setError(`Shelf "${code}" not found.`)
    setShelf(data as Shelf)
  }

  const findItem = async (scan: string) => {
    setError(null)
    const { data: found } = await supabase
      .from('items').select('*').or(`code.eq.${scan},barcode.eq.${scan}`).maybeSingle()
    if (!found) return setError(`Item "${scan}" not found.`)
    const { data: bal } = await supabase
      .from('stock_balances')
      .select('qty_on_hand')
      .eq('shelf_id', shelf!.id)
      .eq('item_id', found.id)
      .maybeSingle()
    setItem(found as Item)
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
    },
  })

  const variance = physicalQty !== '' ? Number(physicalQty) - systemQty : 0

  return (
    <div className="card space-y-3">
      {!shelf ? (
        <>
          <p className="font-semibold">Scan the shelf to count</p>
          <ScanInput placeholder="shelf code" onScan={(v) => void findShelf(v)} />
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-tan-dark" />
            <span className="font-mono font-bold">{shelf.code}</span>
            <button className="btn-secondary ml-auto" onClick={() => { setShelf(null); setItem(null) }}>
              Change shelf
            </button>
          </div>
          {!item ? (
            <>
              <p className="font-semibold">Scan each item on this shelf</p>
              <ScanInput placeholder="item barcode" onScan={(v) => void findItem(v)} />
            </>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                record.mutate()
              }}
            >
              <p className="font-medium">{item.name}</p>
              <div>
                <label className="label-text">Physical quantity (system shows {systemQty} {item.uom})</label>
                <input type="number" inputMode="decimal" min="0" step="any"
                  className="input-field text-2xl font-bold" value={physicalQty}
                  onChange={(e) => setPhysicalQty(e.target.value)} required autoFocus />
              </div>
              {physicalQty !== '' && variance !== 0 && (
                <div>
                  <label className="label-text">
                    Variance {variance > 0 ? '+' : ''}{variance} — reason required
                  </label>
                  <select className="input-field" value={reason} onChange={(e) => setReason(e.target.value)}>
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
          )}
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
