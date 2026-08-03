import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, CheckCircle2, Loader2, MapPin, PackageSearch, Search, ThumbsDown, ThumbsUp,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { locationLabel } from '../../lib/places'
import { num } from '../../lib/qty'
import { ScanInput } from '../../components/ScanInput'
import { LocationPicker } from '../../components/LocationPicker'
import { UomPicker } from '../../components/UomPicker'
import { ItemThumb } from '../../components/ItemThumb'
import { PageHeader } from '../../components/PageHeader'
import type { Item, Shelf } from '../../lib/types'

const REASONS = ['miscount', 'damage', 'theft', 'system_error', 'unknown', 'other'] as const

/** Product + location + the quantity Golai currently believes is there. */
interface Target {
  item: Pick<Item, 'id' | 'code' | 'name' | 'uom' | 'photo_url'>
  shelf: Pick<Shelf, 'id' | 'code'>
  currentQty: number
}

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
 *
 * Finding the product works TWO ways — by location or by product — and neither
 * needs a barcode, because most clients' products don't have one. This mirrors
 * Assign Location and Stock Counts, the other screens that pick an (item,
 * location) pair off the shelf balances rather than a scan.
 */
export function Adjustments() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const isApprover = profile!.role === 'manager' || profile!.role === 'admin'

  const [mode, setMode] = useState<'location' | 'product'>('location')
  const [target, setTarget] = useState<Target | null>(null)
  const [saved, setSaved] = useState(false)

  const reset = () => {
    setTarget(null)
    setSaved(false)
  }

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
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: approve ? 'approve.adjustment' : 'reject.adjustment',
        entityType: 'adjustment', entityId: id,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pending-adjustments'] })
      void queryClient.invalidateQueries({ queryKey: ['item-locator'] })
    },
  })

  return (
    <div className="space-y-4">
      <PageHeader title="Adjustments" subtitle="Correct a quantity when stock comes in or out outside the normal flows." />

      {saved && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {isApprover ? 'Adjustment applied.' : 'Adjustment submitted for manager approval.'}
        </div>
      )}

      {target ? (
        <CorrectionForm
          target={target}
          isApprover={isApprover}
          onDone={() => { setSaved(true); setTarget(null) }}
          onCancel={reset}
        />
      ) : (
        <div className="card space-y-4">
          {/* Entry-point toggle */}
          <div className="inline-flex rounded-xl bg-ink-100 p-1 text-sm font-semibold">
            <button
              className={`min-h-tap rounded-lg px-4 ${mode === 'location' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
              onClick={() => setMode('location')}
            >
              By location
            </button>
            <button
              className={`min-h-tap rounded-lg px-4 ${mode === 'product' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
              onClick={() => setMode('product')}
            >
              By product
            </button>
          </div>

          {mode === 'location'
            ? <ByLocation onPick={(t) => { setSaved(false); setTarget(t) }} />
            : <ByProduct onPick={(t) => { setSaved(false); setTarget(t) }} />}
        </div>
      )}

      {isApprover && (pending?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">Pending approval ({pending!.length})</h2>
          {pending!.map((adj) => (
            <div key={adj.id} className="card flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {adj.items.name}{' '}
                  <span className={'font-bold ' + (adj.qty_change > 0 ? 'text-green-700' : 'text-red-700')}>
                    {adj.qty_change > 0 ? '+' : ''}{adj.qty_change} {adj.items.uom}
                  </span>
                </div>
                <div className="text-sm text-ink-400">
                  {adj.shelves.code} · {adj.reason_code}
                  {adj.reason_note ? ` — ${adj.reason_note}` : ''} · {adj.adjusted_by_profile?.full_name}
                </div>
              </div>
              <button className="btn-primary px-4" onClick={() => decide.mutate({ id: adj.id, approve: true })} disabled={decide.isPending}>
                <ThumbsUp className="h-5 w-5" /> Approve
              </button>
              <button className="btn-secondary px-4" onClick={() => decide.mutate({ id: adj.id, approve: false })} disabled={decide.isPending}>
                <ThumbsDown className="h-5 w-5" /> Reject
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entry point 1: scan a location, tap a product on it
// ---------------------------------------------------------------------------
function ByLocation({ onPick }: { onPick: (t: Target) => void }) {
  const [shelf, setShelf] = useState<Pick<Shelf, 'id' | 'code'> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState('')

  const findShelf = async (code: string) => {
    setError(null)
    const { data } = await supabase
      .from('shelves').select('id, code').ilike('code', code.trim()).is('deleted_at', null).maybeSingle()
    if (!data) return setError(`Location "${code}" not found.`)
    setShelf(data as Pick<Shelf, 'id' | 'code'>)
  }

  // Everything Golai believes is on this location.
  const { data: onShelf } = useQuery({
    queryKey: ['adjust-shelf-contents', shelf?.id],
    enabled: !!shelf,
    queryFn: async () => {
      const { data } = await supabase
        .from('stock_balances')
        .select('qty_on_hand, items(id, code, name, uom, photo_url)')
        .eq('shelf_id', shelf!.id)
      return ((data ?? []) as never as { qty_on_hand: number; items: Target['item'] }[])
        .filter((r) => r.items)
        .sort((a, b) => a.items.name.localeCompare(b.items.name))
    },
  })

  // A product not currently on this location — "stock coming in".
  const { data: matches, isFetching } = useItemSearch(search)

  if (!shelf) {
    if (picking) {
      return (
        <LocationPicker
          onPick={(p) => { setShelf(p); setError(null); setPicking(false) }}
          onCancel={() => setPicking(false)}
        />
      )
    }
    return (
      <div className="space-y-2">
        <p className="font-semibold">Scan or type the location</p>
        <ScanInput placeholder="location code (e.g. Z04-R003)" onScan={(v) => void findShelf(v)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-secondary" onClick={() => { setError(null); setPicking(true) }}>
          <MapPin className="h-5 w-5" /> Can't scan? Pick location
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-5 w-5 text-brand-500" />
        <span className="font-mono font-bold">{shelf.code}</span>
        <button className="btn-secondary ml-auto" onClick={() => { setShelf(null); setSearch('') }}>
          Change location
        </button>
      </div>

      <p className="text-sm font-semibold text-ink-500">Tap a product to correct its count</p>
      {onShelf == null ? (
        <Loader2 className="mx-auto my-4 h-5 w-5 animate-spin text-brand-500" />
      ) : onShelf.length === 0 ? (
        <p className="rounded-xl bg-ink-50 px-4 py-4 text-center text-sm text-ink-400">
          Nothing recorded on this location yet. Search below to add what came in.
        </p>
      ) : (
        <ul className="divide-y divide-ink-200/70 rounded-xl border border-ink-200">
          {onShelf.map((r) => (
            <li key={r.items.id}>
              <button
                className="flex min-h-tap w-full items-center gap-3 px-3 text-left hover:bg-cream"
                onClick={() => onPick({ item: r.items, shelf, currentQty: num(r.qty_on_hand) })}
              >
                <ItemThumb path={r.items.photo_url} name={r.items.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.items.name}</span>
                  <span className="block text-xs text-ink-400">{r.items.code}</span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-ink-500">
                  {r.qty_on_hand} {r.items.uom}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="pt-1">
        <p className="mb-1 text-sm font-semibold text-ink-500">Stock coming in? Add a product not listed</p>
        <SearchBox value={search} onChange={setSearch} busy={isFetching} />
        {search.trim().length >= 2 && (
          <ResultList
            matches={matches}
            busy={isFetching}
            onPick={(item) => { onPick({ item, shelf, currentQty: 0 }); setSearch('') }}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entry point 2: search a product, then choose which location
// ---------------------------------------------------------------------------
function ByProduct({ onPick }: { onPick: (t: Target) => void }) {
  const [search, setSearch] = useState('')
  const [item, setItem] = useState<Target['item'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { data: matches, isFetching } = useItemSearch(search)

  const { data: locations } = useQuery({
    queryKey: ['adjust-item-locations', item?.id],
    enabled: !!item,
    queryFn: async () => {
      const { data } = await supabase
        .from('stock_balances')
        .select('qty_on_hand, shelves(id, code, fixture_type, description, zones(code, name))')
        .eq('item_id', item!.id)
      return ((data ?? []) as never as {
        qty_on_hand: number
        shelves: (Pick<Shelf, 'id' | 'code' | 'fixture_type' | 'description'> & { zones: { code: string; name: string } | null }) | null
      }[]).filter((r) => r.shelves)
    },
  })

  const findShelf = async (code: string) => {
    setError(null)
    const { data } = await supabase
      .from('shelves').select('id, code').ilike('code', code.trim()).is('deleted_at', null).maybeSingle()
    if (!data) return setError(`Location "${code}" not found.`)
    onPick({ item: item!, shelf: data as Pick<Shelf, 'id' | 'code'>, currentQty: 0 })
  }

  if (!item) {
    return (
      <div className="space-y-2">
        <p className="font-semibold">Search a product by name</p>
        <SearchBox value={search} onChange={setSearch} busy={isFetching} />
        {search.trim().length >= 2 && (
          <ResultList
            matches={matches}
            busy={isFetching}
            onPick={(it) => { setItem(it); setSearch('') }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <PackageSearch className="h-5 w-5 text-brand-500" />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{item.name}</span>
          <span className="block text-xs text-ink-400">{item.code}</span>
        </span>
        <button className="btn-secondary ml-auto" onClick={() => setItem(null)}>
          Change product
        </button>
      </div>

      <p className="text-sm font-semibold text-ink-500">Which location?</p>
      {locations == null ? (
        <Loader2 className="mx-auto my-4 h-5 w-5 animate-spin text-brand-500" />
      ) : locations.length > 0 ? (
        <ul className="divide-y divide-ink-200/70 rounded-xl border border-ink-200">
          {locations.map((r) => (
            <li key={r.shelves!.id}>
              <button
                className="flex min-h-tap w-full items-center gap-3 px-4 text-left hover:bg-cream"
                onClick={() => onPick({ item, shelf: r.shelves!, currentQty: num(r.qty_on_hand) })}
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
      ) : (
        <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-400">
          This product isn't recorded on any location yet.
        </p>
      )}

      <div className="pt-1">
        <p className="mb-1 text-sm font-semibold text-ink-500">Or scan/type another location</p>
        <ScanInput placeholder="location code" onScan={(v) => void findShelf(v)} autoFocus={false} />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared correction form — same for both entry points
// ---------------------------------------------------------------------------
type AdjustMode = 'add' | 'remove' | 'set'

const MODE_LABELS: Record<AdjustMode, string> = {
  add: 'Quantity to add',
  remove: 'Quantity to remove',
  set: 'New total quantity',
}

/** Turn what the user typed into the signed delta the DB stores + the total it lands on. */
function deriveChange(mode: AdjustMode, amount: number, currentQty: number) {
  const newTotal = mode === 'add' ? currentQty + amount : mode === 'remove' ? currentQty - amount : amount
  return { qtyChange: newTotal - currentQty, newTotal }
}

function CorrectionForm({ target, isApprover, onDone, onCancel }: {
  target: Target
  isApprover: boolean
  onDone: () => void
  onCancel: () => void
}) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<AdjustMode>('add')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState<string>('miscount')
  const [note, setNote] = useState('')
  // Local so the label reflects a unit changed via the picker without a refetch.
  const [unit, setUnit] = useState(target.item.uom)

  const amt = amount === '' ? null : Number(amount)
  const { qtyChange, newTotal } = deriveChange(mode, amt ?? 0, target.currentQty)
  // Same guard move_stock enforces server-side — catch it here so nobody submits
  // an adjustment that can only fail at approval.
  const wouldGoNegative = amt !== null && newTotal < 0

  const submit = useMutation({
    mutationFn: async () => {
      if (amt === null || Number.isNaN(amt)) throw new Error('Enter a quantity.')
      if (mode !== 'set' && amt <= 0) throw new Error('Enter a quantity greater than zero.')
      if (newTotal < 0) throw new Error(`You can only remove up to ${target.currentQty} ${unit} on hand.`)
      if (qtyChange === 0) throw new Error('Nothing to adjust — the quantity is unchanged.')
      const { data, error } = await supabase
        .from('adjustments')
        .insert({
          tenant_id: profile!.tenant_id,
          item_id: target.item.id,
          shelf_id: target.shelf.id,
          qty_change: qtyChange,
          reason_code: reason,
          reason_note: note.trim() || null,
          adjusted_by: profile!.id,
        })
        .select()
        .single()
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'create.adjustment', entityType: 'adjustment', entityId: data.id,
        after: { item: target.item.code, shelf: target.shelf.code, qty_change: qtyChange, reason },
      })
      // Managers/admins approve their own immediately; storekeepers wait.
      if (isApprover) {
        const { error: decideError } = await supabase.rpc('decide_adjustment', {
          p_adjustment_id: data.id, p_approve: true,
        })
        if (decideError) throw decideError
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pending-adjustments'] })
      void queryClient.invalidateQueries({ queryKey: ['item-locator'] })
      void queryClient.invalidateQueries({ queryKey: ['adjust-shelf-contents'] })
      onDone()
    },
  })

  return (
    <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); submit.mutate() }}>
      <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-brand-600" onClick={onCancel}>
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div>
        <p className="font-semibold">{target.item.name}</p>
        <p className="text-sm text-ink-400">
          {target.item.code} on <span className="font-mono">{target.shelf.code}</span> — system shows{' '}
          <b>{target.currentQty} {unit}</b>
        </p>
      </div>

      {/* How to change it: add to / remove from what's there, or set an exact total. */}
      <div className="inline-flex rounded-xl bg-ink-100 p-1 text-sm font-semibold">
        {(['add', 'remove', 'set'] as const).map((m) => (
          <button
            key={m} type="button"
            className={`min-h-tap rounded-lg px-4 capitalize ${mode === m ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
            onClick={() => setMode(m)}
          >
            {m === 'set' ? 'Set total' : m}
          </button>
        ))}
      </div>

      <div>
        <label className="label-text" htmlFor="adj-qty">{MODE_LABELS[mode]}</label>
        <div className="flex items-center gap-2">
          <input
            id="adj-qty" type="number" inputMode="decimal" min="0" step="any"
            className="input-field flex-1 text-2xl font-bold" value={amount}
            onChange={(e) => setAmount(e.target.value)} required autoFocus
          />
          <UomPicker
            itemId={target.item.id}
            value={unit}
            className="min-h-tap w-32 rounded-xl border border-ink-200 bg-white px-3 text-base"
            onChanged={setUnit}
          />
        </div>
        {amt !== null && !Number.isNaN(amt) && (
          wouldGoNegative ? (
            <p className="mt-1 text-sm font-medium text-red-600">
              You can only remove up to {target.currentQty} {unit} on hand.
            </p>
          ) : qtyChange !== 0 && (
            <p className="mt-1 text-sm font-medium text-ink-500">
              {target.currentQty} → <b className="text-ink-800">{newTotal} {unit}</b>{' '}
              <span className={qtyChange > 0 ? 'text-green-700' : 'text-red-700'}>
                ({qtyChange > 0 ? `+${qtyChange}` : qtyChange} {unit}, {qtyChange > 0 ? 'stock in' : 'stock out'})
              </span>
            </p>
          )
        )}
      </div>

      <div>
        <label className="label-text" htmlFor="adj-reason">Reason (mandatory)</label>
        <select id="adj-reason" className="input-field" value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
        </select>
      </div>

      <div>
        <label className="label-text" htmlFor="adj-note">Note</label>
        <input id="adj-note" className="input-field" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="flex gap-2">
        <button
          type="submit" className="btn-primary"
          disabled={submit.isPending || amt === null || Number.isNaN(amt) || qtyChange === 0 || wouldGoNegative}
        >
          {submit.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
          {isApprover ? 'Apply adjustment' : 'Submit for approval'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
      {submit.isError && <p className="text-sm text-red-600">{(submit.error as Error).message}</p>}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Shared search bits
// ---------------------------------------------------------------------------
function useItemSearch(search: string) {
  const q = search.trim()
  return useQuery({
    queryKey: ['adjust-item-search', q],
    enabled: q.length >= 2,
    queryFn: async (): Promise<Target['item'][]> => {
      const { data, error } = await supabase
        .from('items')
        .select('id, code, name, uom, photo_url')
        .or(`name.ilike.%${q}%,code.ilike.%${q}%,item_type.ilike.%${q}%,barcode.eq.${q}`)
        .eq('status', 'active')
        .is('deleted_at', null)
        .limit(10)
      if (error) throw error
      return (data ?? []) as Target['item'][]
    },
  })
}

function SearchBox({ value, onChange, busy }: {
  value: string; onChange: (v: string) => void; busy: boolean
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
      <input
        className="input-field pl-12"
        placeholder="Search product by name or code…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {busy && <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-brand-500" />}
    </div>
  )
}

function ResultList({ matches, busy, onPick }: {
  matches: Target['item'][] | undefined
  busy: boolean
  onPick: (item: Target['item']) => void
}) {
  return (
    <ul className="mt-2 divide-y divide-ink-100 rounded-xl border border-ink-200">
      {(matches ?? []).map((m) => (
        <li key={m.id}>
          <button
            className="flex min-h-tap w-full items-center gap-2 px-3 text-left hover:bg-cream"
            onClick={() => onPick(m)}
          >
            <ItemThumb path={m.photo_url} name={m.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{m.name}</span>
              <span className="block text-xs text-ink-400">{m.code}</span>
            </span>
          </button>
        </li>
      ))}
      {!busy && (matches ?? []).length === 0 && (
        <li className="px-4 py-3 text-sm text-ink-400">No product matches.</li>
      )}
    </ul>
  )
}
