import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, Search, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import type { Item } from '../../lib/types'

interface Line {
  item: Item
  qty: string
}

/**
 * New Release Request (PRD 4.4) — planner requests material against an
 * external SO reference (free text, stored verbatim, never validated).
 */
export function ReleaseRequestNew() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [soRef, setSoRef] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [foremanId, setForemanId] = useState('')
  const [requiredBy, setRequiredBy] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [itemSearch, setItemSearch] = useState('')

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments').select('id, name').is('deleted_at', null).order('name')
      if (error) throw error
      return data as { id: string; name: string }[]
    },
  })

  const { data: people } = useQuery({
    queryKey: ['profiles-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles').select('id, full_name, role').eq('status', 'active').order('full_name')
      if (error) throw error
      return data as { id: string; full_name: string; role: string }[]
    },
  })

  const { data: matches } = useQuery({
    queryKey: ['item-search', itemSearch],
    enabled: itemSearch.trim().length >= 2,
    queryFn: async () => {
      const q = itemSearch.trim()
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
        .eq('status', 'active')
        .is('deleted_at', null)
        .limit(8)
      if (error) throw error
      return data as Item[]
    },
  })

  const submit = useMutation({
    mutationFn: async () => {
      if (!departmentId) throw new Error('Select a department.')
      if (!foremanId) throw new Error('Select the receiving foreman.')
      if (lines.length === 0) throw new Error('Add at least one item.')
      for (const l of lines) {
        if (!l.qty || Number(l.qty) <= 0) throw new Error(`Enter quantity for ${l.item.name}.`)
      }
      const { data, error } = await supabase.rpc('create_release_request', {
        p_so_ref: soRef,
        p_customer_note: customerNote,
        p_department_id: departmentId,
        p_foreman_id: foremanId,
        p_required_by: requiredBy || null,
        p_notes: notes,
        p_lines: lines.map((l) => ({ item_id: l.item.id, qty_requested: Number(l.qty) })),
      })
      if (error) throw error
      const row = (data as { rr_id: string; rr_number: string }[])[0]
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'create.release_request',
        entityType: 'release_request',
        entityId: row.rr_id,
        after: { rr_number: row.rr_number, so_ref: soRef, lines: lines.length },
      })
      return row
    },
    onSuccess: (row) => navigate(`/release/${row.rr_id}`),
  })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">New Release Request</h1>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit.mutate()
        }}
      >
        <div className="card grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label-text">SO reference (from your ERP)</label>
            <input className="input-field font-mono" placeholder="SO-1234" value={soRef}
              onChange={(e) => setSoRef(e.target.value)} />
          </div>
          <div>
            <label className="label-text">Customer note</label>
            <input className="input-field" placeholder="ESPL Mumbai" value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)} />
          </div>
          <div>
            <label className="label-text">Department *</label>
            <select className="input-field" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required>
              <option value="">— select —</option>
              {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label-text">Receiving foreman *</label>
            <select className="input-field" value={foremanId} onChange={(e) => setForemanId(e.target.value)} required>
              <option value="">— select —</option>
              {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label-text">Required by</label>
            <input type="date" className="input-field" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} />
          </div>
          <div>
            <label className="label-text">Special instructions</label>
            <input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="card space-y-3">
          <p className="font-semibold">Items required</p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
            <input className="input-field pl-12" placeholder="Search items by name or code…"
              value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
          </div>
          {matches && matches.length > 0 && itemSearch.trim().length >= 2 && (
            <ul className="divide-y divide-tan/20 rounded-xl border border-tan/30">
              {matches
                .filter((m) => !lines.some((l) => l.item.id === m.id))
                .map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-cream"
                      onClick={() => {
                        setLines([...lines, { item: m, qty: '' }])
                        setItemSearch('')
                      }}
                    >
                      <span className="font-medium">{m.name}</span>
                      <span className="ml-auto text-xs text-ink-400">{m.code}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}

          {lines.map((line, i) => (
            <div key={line.item.id} className="flex items-center gap-3 rounded-xl border border-tan/30 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{line.item.name}</p>
                <p className="text-xs text-ink-400">{line.item.code}</p>
              </div>
              <input
                type="number" inputMode="decimal" min="0.01" step="any"
                className="input-field w-28 text-right font-bold"
                placeholder="qty"
                value={line.qty}
                onChange={(e) => setLines(lines.map((l, idx) => idx === i ? { ...l, qty: e.target.value } : l))}
              />
              <span className="w-10 text-sm text-ink-400">{line.item.uom}</span>
              <button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-400 hover:bg-cream"
                onClick={() => setLines(lines.filter((_, idx) => idx !== i))} aria-label="Remove">
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          ))}
        </div>

        {submit.isError && <p className="text-sm text-red-600">{(submit.error as Error).message}</p>}
        <button type="submit" className="btn-primary w-full" disabled={submit.isPending}>
          {submit.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
          Submit release request
        </button>
      </form>
    </div>
  )
}
