import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, ThumbsDown, ThumbsUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { ScanInput } from '../../components/ScanInput'
import type { Item, Shelf } from '../../lib/types'

const REASONS = ['miscount', 'damage', 'theft', 'system_error', 'unknown', 'other'] as const

interface PendingAdjustment {
  id: string
  qty_change: number
  reason_code: string
  reason_note: string | null
  created_at: string
  items: Pick<Item, 'code' | 'name' | 'uom'>
  shelves: Pick<Shelf, 'code'>
  adjusted_by_profile: { full_name: string } | null
}

/**
 * Adjustments (PRD 4.9 variant): storekeeper proposes a qty change with a
 * mandatory reason; manager/admin approve (stock moves) or reject.
 * Managers/admins see the pending queue on this same screen.
 */
export function Adjustments() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const isApprover = profile!.role === 'manager' || profile!.role === 'admin'

  const [shelf, setShelf] = useState<(Shelf & { id: string }) | null>(null)
  const [item, setItem] = useState<Item | null>(null)
  const [currentQty, setCurrentQty] = useState(0)
  const [newQty, setNewQty] = useState('')
  const [reason, setReason] = useState<string>('miscount')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const findShelf = async (code: string) => {
    setError(null)
    const { data } = await supabase
      .from('shelves')
      .select('*')
      .ilike('code', code)
      .is('deleted_at', null)
      .maybeSingle()
    if (!data) return setError(`Shelf "${code}" not found.`)
    setShelf(data as Shelf)
  }

  const findItem = async (scan: string) => {
    setError(null)
    const { data: found } = await supabase
      .from('items')
      .select('*')
      .or(`code.eq.${scan},barcode.eq.${scan}`)
      .maybeSingle()
    if (!found) return setError(`Item "${scan}" not found.`)
    const { data: bal } = await supabase
      .from('stock_balances')
      .select('qty_on_hand')
      .eq('shelf_id', shelf!.id)
      .eq('item_id', found.id)
      .maybeSingle()
    setItem(found as Item)
    setCurrentQty(bal?.qty_on_hand ?? 0)
  }

  const createAdjustment = useMutation({
    mutationFn: async () => {
      const qtyChange = Number(newQty) - currentQty
      if (qtyChange === 0) throw new Error('New quantity equals current quantity — nothing to adjust.')
      const { data, error } = await supabase
        .from('adjustments')
        .insert({
          tenant_id: profile!.tenant_id,
          item_id: item!.id,
          shelf_id: shelf!.id,
          qty_change: qtyChange,
          reason_code: reason,
          reason_note: note.trim() || null,
          adjusted_by: profile!.id,
        })
        .select()
        .single()
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'create.adjustment',
        entityType: 'adjustment',
        entityId: data.id,
        after: { item: item!.code, shelf: shelf!.code, qty_change: qtyChange, reason },
      })
      // Managers/admins approve their own adjustment immediately (PRD matrix:
      // full edit rights); storekeepers wait for manager approval.
      if (isApprover) {
        const { error: decideError } = await supabase.rpc('decide_adjustment', {
          p_adjustment_id: data.id,
          p_approve: true,
        })
        if (decideError) throw decideError
      }
    },
    onSuccess: () => {
      setSaved(true)
      setItem(null)
      setNewQty('')
      setNote('')
      void queryClient.invalidateQueries({ queryKey: ['pending-adjustments'] })
      void queryClient.invalidateQueries({ queryKey: ['item-locator'] })
    },
  })

  // --- Manager approval queue ------------------------------------------------
  const { data: pending } = useQuery({
    queryKey: ['pending-adjustments'],
    enabled: isApprover,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('adjustments')
        .select(
          'id, qty_change, reason_code, reason_note, created_at, items(code, name, uom), shelves(code), adjusted_by_profile:profiles!adjustments_adjusted_by_fkey(full_name)',
        )
        .eq('status', 'PENDING')
        .order('created_at')
      if (error) throw error
      return data as unknown as PendingAdjustment[]
    },
  })

  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc('decide_adjustment', {
        p_adjustment_id: id,
        p_approve: approve,
      })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: approve ? 'approve.adjustment' : 'reject.adjustment',
        entityType: 'adjustment',
        entityId: id,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pending-adjustments'] })
      void queryClient.invalidateQueries({ queryKey: ['item-locator'] })
    },
  })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Adjustments</h1>

      {saved && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {isApprover ? 'Adjustment applied.' : 'Adjustment submitted for manager approval.'}
        </div>
      )}

      {!shelf ? (
        <div className="card space-y-3">
          <p className="font-semibold">Scan the shelf to adjust</p>
          <ScanInput placeholder="shelf code" onScan={(v) => void findShelf(v)} />
        </div>
      ) : !item ? (
        <div className="card space-y-3">
          <p className="font-semibold">
            Shelf <span className="font-mono">{shelf.code}</span> — scan the item
          </p>
          <ScanInput placeholder="item barcode" onScan={(v) => void findItem(v)} />
        </div>
      ) : (
        <form
          className="card space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            createAdjustment.mutate()
          }}
        >
          <p className="font-semibold">{item.name}</p>
          <p className="text-sm text-ink-400">
            {item.code} on {shelf.code} — system shows <b>{currentQty} {item.uom}</b>
          </p>
          <div>
            <label className="label-text">Correct quantity</label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className="input-field text-2xl font-bold"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label-text">Reason (mandatory)</label>
            <select className="input-field" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-text">Note</label>
            <input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={createAdjustment.isPending}>
              {createAdjustment.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
              {isApprover ? 'Apply adjustment' : 'Submit for approval'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShelf(null)
                setItem(null)
                setSaved(false)
              }}
            >
              Start over
            </button>
          </div>
          {createAdjustment.isError && (
            <p className="text-sm text-red-600">{(createAdjustment.error as Error).message}</p>
          )}
        </form>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {isApprover && (pending?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">Pending approval ({pending!.length})</h2>
          {pending!.map((adj) => (
            <div key={adj.id} className="card flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {adj.items.name}{' '}
                  <span
                    className={
                      'font-bold ' + (adj.qty_change > 0 ? 'text-green-700' : 'text-red-700')
                    }
                  >
                    {adj.qty_change > 0 ? '+' : ''}
                    {adj.qty_change} {adj.items.uom}
                  </span>
                </div>
                <div className="text-sm text-ink-400">
                  {adj.shelves.code} · {adj.reason_code}
                  {adj.reason_note ? ` — ${adj.reason_note}` : ''} ·{' '}
                  {adj.adjusted_by_profile?.full_name}
                </div>
              </div>
              <button
                className="btn-primary px-4"
                onClick={() => decide.mutate({ id: adj.id, approve: true })}
                disabled={decide.isPending}
              >
                <ThumbsUp className="h-5 w-5" /> Approve
              </button>
              <button
                className="btn-secondary px-4"
                onClick={() => decide.mutate({ id: adj.id, approve: false })}
                disabled={decide.isPending}
              >
                <ThumbsDown className="h-5 w-5" /> Reject
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
