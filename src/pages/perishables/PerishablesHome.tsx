import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Loader2, PackagePlus, ScanBarcode, TriangleAlert, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSettings, DEFAULT_EXPIRY_WARN_DAYS } from '../../lib/settings'
import { ItemThumb } from '../../components/ItemThumb'
import { ScanInput } from '../../components/ScanInput'
import { EmptyState } from '../../components/EmptyState'

interface BatchRow {
  id: string
  batch_no: string | null
  mfg_date: string | null
  expiry_date: string
  received_qty: number | string | null
  item_id: string
  items: { code: string; name: string; photo_url: string | null } | null
  shelves: { code: string } | null
}

/** Whole-day difference from today to an ISO date (negative = already past). */
function daysLeft(iso: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(iso + 'T00:00:00')
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

function isoInDays(n: number): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function expiryTone(days: number): string {
  if (days < 0) return 'bg-red-100 text-red-800'
  if (days <= 2) return 'bg-red-100 text-red-800'
  if (days <= 7) return 'bg-amber-100 text-amber-800'
  return 'bg-green-100 text-green-800'
}

function expiryLabel(days: number): string {
  if (days < 0) return `expired ${-days}d ago`
  if (days === 0) return 'expires today'
  return `${days}d left`
}

/**
 * Perishables home — scan a product to see its live batches (mfg / expiry / days
 * left), and an "Expiring soon" list computed on read (the near-expiry flag). No
 * scheduler exists, so this live view plus the inward-time alert are the flag.
 */
export function PerishablesHome() {
  const queryClient = useQueryClient()
  const { data: settings } = useSettings()
  const warnDays = settings?.expiry_warn_days ?? DEFAULT_EXPIRY_WARN_DAYS

  const [selected, setSelected] = useState<{ id: string; code: string; name: string; photo_url: string | null } | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const findItem = async (scan: string) => {
    setLookupError(null)
    const { data, error } = await supabase
      .from('items')
      .select('id, code, name, photo_url')
      .or(`code.eq.${scan},barcode.eq.${scan},name.ilike.%${scan}%`)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    if (error) { setLookupError(error.message); return }
    if (!data) { setLookupError(`No product matches "${scan}".`); return }
    setSelected(data as typeof selected)
  }

  const selectedBatches = useQuery({
    queryKey: ['item-batches', selected?.id],
    enabled: !!selected,
    queryFn: async (): Promise<BatchRow[]> => {
      const { data, error } = await supabase
        .from('item_batches')
        .select('id, batch_no, mfg_date, expiry_date, received_qty, item_id, items(code, name, photo_url), shelves(code)')
        .eq('item_id', selected!.id)
        .eq('status', 'active')
        .order('expiry_date', { ascending: true })
      if (error) throw error
      return data as unknown as BatchRow[]
    },
  })

  const expiringSoon = useQuery({
    queryKey: ['expiring-soon', warnDays],
    queryFn: async (): Promise<BatchRow[]> => {
      const { data, error } = await supabase
        .from('item_batches')
        .select('id, batch_no, mfg_date, expiry_date, received_qty, item_id, items(code, name, photo_url), shelves(code)')
        .eq('status', 'active')
        .lte('expiry_date', isoInDays(warnDays))
        .order('expiry_date', { ascending: true })
        .limit(100)
      if (error) throw error
      return data as unknown as BatchRow[]
    },
  })

  const markFinished = useMutation({
    mutationFn: async (batchId: string) => {
      const { error } = await supabase.rpc('set_item_batch_status', { p_batch_id: batchId, p_status: 'finished' })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['item-batches'] })
      void queryClient.invalidateQueries({ queryKey: ['expiring-soon'] })
    },
  })

  const renderBatch = (b: BatchRow, showItem: boolean) => {
    const days = daysLeft(b.expiry_date)
    return (
      <div key={b.id} className="flex items-center gap-3 rounded-xl border border-tan/20 px-3 py-2 text-sm">
        {showItem && <ItemThumb path={b.items?.photo_url ?? null} name={b.items?.name ?? ''} size="sm" />}
        <div className="min-w-0 flex-1">
          {showItem && <p className="truncate font-medium">{b.items?.name} <span className="text-xs text-ink-400 font-mono">{b.items?.code}</span></p>}
          <p className="text-xs text-ink-400">
            {b.batch_no ? `Batch ${b.batch_no} · ` : ''}
            exp {new Date(b.expiry_date + 'T00:00:00').toLocaleDateString()}
            {b.mfg_date ? ` · mfg ${new Date(b.mfg_date + 'T00:00:00').toLocaleDateString()}` : ''}
            {b.received_qty != null ? ` · ${b.received_qty}` : ''}
            {b.shelves?.code ? ` · ${b.shelves.code}` : ''}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${expiryTone(days)}`}>
          {expiryLabel(days)}
        </span>
        <button
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-ink-400 hover:bg-ink-50 hover:text-ink-700"
          disabled={markFinished.isPending}
          onClick={() => markFinished.mutate(b.id)}
          title="Mark this batch finished / used up"
        >
          Mark finished
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-6 w-6 text-brand-500" />
          <h1 className="text-xl font-bold">Perishables</h1>
        </div>
        <Link to="/perishables/inward" className="btn-primary">
          <PackagePlus className="h-5 w-5" /> New inward
        </Link>
      </div>

      {/* Scan a product to see its batches */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <ScanBarcode className="h-5 w-5 text-brand-500" />
          <p className="font-semibold">Scan or search a product</p>
        </div>
        {selected ? (
          <>
            <div className="flex items-center gap-3">
              <ItemThumb path={selected.photo_url} name={selected.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{selected.name}</p>
                <p className="text-xs text-ink-400 font-mono">{selected.code}</p>
              </div>
              <button className="text-ink-400 hover:text-ink-700" onClick={() => setSelected(null)} title="Clear"><X className="h-4 w-4" /></button>
            </div>
            {selectedBatches.isLoading ? (
              <Loader2 className="mx-auto my-4 h-5 w-5 animate-spin text-brand-500" />
            ) : (selectedBatches.data ?? []).length === 0 ? (
              <p className="rounded-xl bg-ink-50 px-3 py-2 text-sm text-ink-500">No active batches on record for this product.</p>
            ) : (
              <div className="space-y-2">{selectedBatches.data!.map((b) => renderBatch(b, false))}</div>
            )}
          </>
        ) : (
          <>
            <ScanInput placeholder="Scan / type barcode, code or name" onScan={(v) => findItem(v)} />
            {lookupError && <p className="text-sm text-red-600">{lookupError}</p>}
          </>
        )}
      </div>

      {/* Expiring soon — the flag */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <TriangleAlert className="h-5 w-5 text-amber-500" />
          <p className="font-semibold">Expiring soon</p>
          <span className="text-xs text-ink-400">within {warnDays} days</span>
        </div>
        {expiringSoon.isLoading ? (
          <Loader2 className="mx-auto my-4 h-5 w-5 animate-spin text-brand-500" />
        ) : (expiringSoon.data ?? []).length === 0 ? (
          <EmptyState icon={CalendarClock} title="Nothing expiring soon" detail={`No active batches are within ${warnDays} days of expiry.`} />
        ) : (
          <div className="space-y-2">{expiringSoon.data!.map((b) => renderBatch(b, true))}</div>
        )}
      </div>
    </div>
  )
}
