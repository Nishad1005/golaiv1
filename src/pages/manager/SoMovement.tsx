import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface MovementEvent {
  when: string
  kind: string
  ref: string
  detail: string
  link: string
}

/**
 * SO-wise Movement Report (PRD 2.1): trace every transaction that referenced
 * a given SO number — receipts tagged with it, release requests, issuances,
 * returns, and dispatches — in one timeline.
 */
export function SoMovement() {
  const [input, setInput] = useState('')
  const [soRef, setSoRef] = useState('')

  const { data: events, isFetching } = useQuery({
    queryKey: ['so-movement', soRef],
    enabled: soRef.length > 0,
    queryFn: async (): Promise<MovementEvent[]> => {
      const [rrs, issuances, returns, dispatches, grns] = await Promise.all([
        supabase.from('release_requests')
          .select('id, rr_number, status, created_at, departments(name)')
          .eq('so_ref', soRef),
        supabase.from('issuances')
          .select('id, iss_number, issued_at, release_request_id, departments(name), issuance_lines(qty, items(name, uom))')
          .eq('so_ref', soRef),
        supabase.from('returns')
          .select('id, ret_number, returned_at, reason_code, return_lines(qty, items(name, uom))')
          .eq('so_ref', soRef),
        supabase.from('dispatches')
          .select('id, dc_number, status, created_at, customers(name)')
          .eq('so_ref', soRef),
        supabase.from('grns')
          .select('id, grn_number, status, created_at, po_ref')
          .eq('po_ref', soRef),
      ])

      const events: MovementEvent[] = []
      for (const r of (rrs.data ?? []) as any[]) {
        events.push({
          when: r.created_at, kind: 'Release Request', ref: r.rr_number,
          detail: `${r.departments?.name ?? ''} · ${r.status}`, link: `/release/${r.id}`,
        })
      }
      for (const i of (issuances.data ?? []) as any[]) {
        events.push({
          when: i.issued_at, kind: 'Issuance', ref: i.iss_number,
          detail: (i.issuance_lines ?? [])
            .map((l: any) => `${l.qty} ${l.items.uom} ${l.items.name}`)
            .join(', '),
          link: `/release/${i.release_request_id}`,
        })
      }
      for (const r of (returns.data ?? []) as any[]) {
        events.push({
          when: r.returned_at, kind: 'Return', ref: r.ret_number,
          detail: `${r.reason_code} · ` + (r.return_lines ?? [])
            .map((l: any) => `${l.qty} ${l.items.uom} ${l.items.name}`)
            .join(', '),
          link: '/returns',
        })
      }
      for (const d of (dispatches.data ?? []) as any[]) {
        events.push({
          when: d.created_at, kind: 'Dispatch', ref: d.dc_number,
          detail: `${d.customers?.name ?? ''} · ${d.status}`, link: `/dispatch/${d.id}`,
        })
      }
      for (const g of (grns.data ?? []) as any[]) {
        events.push({
          when: g.created_at, kind: 'GRN (PO ref)', ref: g.grn_number,
          detail: g.status, link: `/grn/${g.id}`,
        })
      }
      return events.sort((a, b) => a.when.localeCompare(b.when))
    },
  })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">SO-wise Movement</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setSoRef(input.trim())
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
          <input className="input-field pl-12 font-mono" placeholder="SO-1234"
            value={input} onChange={(e) => setInput(e.target.value)} />
        </div>
        <button type="submit" className="btn-primary">Trace</button>
      </form>

      {isFetching && <Loader2 className="mx-auto mt-8 h-8 w-8 animate-spin text-brand-500" />}

      {soRef && events && !isFetching && (
        events.length === 0 ? (
          <div className="card py-10 text-center text-ink-400">
            No transactions reference <span className="font-mono">{soRef}</span>.
          </div>
        ) : (
          <div className="card p-0">
            <div className="border-b border-tan/30 px-4 py-3">
              <p className="font-semibold">
                <span className="font-mono">{soRef}</span> — {events.length} transaction{events.length > 1 ? 's' : ''}
              </p>
            </div>
            <ol className="divide-y divide-tan/20">
              {events.map((e, i) => (
                <li key={i}>
                  <a href={e.link} className="flex items-baseline gap-3 px-4 py-3 hover:bg-cream">
                    <span className="w-36 shrink-0 text-xs text-ink-400">
                      {new Date(e.when).toLocaleString()}
                    </span>
                    <span className="w-32 shrink-0 text-sm font-semibold">{e.kind}</span>
                    <span className="shrink-0 font-mono text-sm">{e.ref}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-400">{e.detail}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        )
      )}
    </div>
  )
}
