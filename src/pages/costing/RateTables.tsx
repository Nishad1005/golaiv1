import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Check, History, Loader2, Plus, Sparkles, Tags, TriangleAlert, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { useCostingRates } from '../../lib/costing/queries'
import type { CostingRateEntry } from '../../lib/costing/types'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Rate tables — the actual product.
 *
 * Their spreadsheet is "hard to maintain" because a price change means editing
 * it in twenty places and missing three. Here a rate lives once: change it and
 * every costing sheet reprices. Superseding rather than overwriting keeps the
 * history, so a sheet costed in March is still explicable in December.
 */
export function RateTables() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const { data, isLoading } = useCostingRates()
  const [selected, setSelected] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [draft, setDraft] = useState({ lookup_key: '', rate: '', effective_from: today() })
  const [newTable, setNewTable] = useState<{ key: string; name: string } | null>(null)

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['costing-rates'] })

  const tables = data?.tables ?? []
  const active = tables.find((t) => t.id === selected) ?? tables[0]
  const entries = (data?.entries ?? []).filter((e) => e.rate_table_id === active?.id)
  const liveFor = active ? data?.live[active.key] ?? {} : {}

  const seedFoam = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('seed_costing_foam_rates')
      if (error) throw new Error(error.message)
    },
    onSuccess: refresh,
  })

  const addRate = useMutation({
    mutationFn: async () => {
      if (!active) return
      const rate = Number(draft.rate)
      if (!draft.lookup_key.trim()) throw new Error('Give the rate a name to look it up by.')
      if (!Number.isFinite(rate) || rate < 0) throw new Error('Enter a valid rate.')

      const { error } = await supabase.from('costing_rate_entries').insert({
        rate_table_id: active.id,
        tenant_id: profile!.tenant_id,
        lookup_key: draft.lookup_key.trim(),
        rate,
        effective_from: draft.effective_from || today(),
        attributes: {},
      })
      if (error) throw new Error(error.message)
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'update.costing_rate', entityType: 'costing_rate', entityId: active.id,
        after: { table: active.key, key: draft.lookup_key.trim(), rate },
      })
    },
    onSuccess: () => {
      setDraft({ lookup_key: '', rate: '', effective_from: today() })
      refresh()
    },
  })

  const removeEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('costing_rate_entries').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: refresh,
  })

  const createTable = useMutation({
    mutationFn: async () => {
      if (!newTable?.name.trim()) throw new Error('Name is required.')
      const key = (newTable.key.trim() || newTable.name.trim())
        .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      const { error } = await supabase.from('costing_rate_tables').insert({
        tenant_id: profile!.tenant_id, key, name: newTable.name.trim(),
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { setNewTable(null); refresh() },
  })

  // Newest-first per key; the first one still in force is what sheets use.
  const isLive = (e: CostingRateEntry) =>
    liveFor[e.lookup_key] !== undefined &&
    entries.filter((x) => x.lookup_key === e.lookup_key && x.effective_from <= today())
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]?.id === e.id

  const visible = showHistory ? entries : entries.filter(isLive)

  return (
    <div className="space-y-4">
      <Link to="/costing" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> All costing sheets
      </Link>

      <PageHeader
        title="Rate tables"
        subtitle="Prices live here once. Change one and every costing sheet reprices."
        actions={
          <button className="btn-secondary" onClick={() => setNewTable({ key: '', name: '' })}>
            <Plus className="h-5 w-5" aria-hidden /> New table
          </button>
        }
      />

      {isLoading ? (
        <Loader2 className="mx-auto mt-10 h-7 w-7 animate-spin text-brand-500" />
      ) : tables.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No rate tables yet"
          detail="A rate table holds prices you look up rather than type each time — foam by sheet size, plywood by thickness. Costing sheets read today's rate automatically."
        />
      ) : (
        <>
          {tables.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {tables.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`min-h-tap rounded-xl border px-4 text-sm font-semibold transition-colors ${
                    active?.id === t.id
                      ? 'border-brand-300 bg-brand-50 text-brand-700'
                      : 'border-ink-200 bg-white text-ink-600 hover:bg-cream'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}

          {active && (
            <section className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-ink-900">{active.name}</h2>
                  {active.note && <p className="mt-0.5 text-sm text-ink-400">{active.note}</p>}
                </div>
                <button
                  className="btn-secondary"
                  onClick={() => setShowHistory(!showHistory)}
                >
                  <History className="h-5 w-5" aria-hidden />
                  {showHistory ? 'Current only' : 'Show history'}
                </button>
              </div>

              {entries.length === 0 ? (
                <div className="mt-4 rounded-xl bg-ink-50 px-4 py-6 text-center">
                  <p className="text-sm text-ink-500">No rates in this table yet.</p>
                  {active.key === 'foam_sheet' && (
                    <>
                      <p className="mx-auto mt-1 max-w-md text-xs text-ink-400">
                        We can fill it from your own rule — thickness × 21 for a 72×36 sheet,
                        scaled for 72×48 — giving all twelve sizes.
                      </p>
                      <button className="btn-primary mt-4" disabled={seedFoam.isPending}
                        onClick={() => seedFoam.mutate()}>
                        {seedFoam.isPending
                          ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                          : <Sparkles className="h-5 w-5" aria-hidden />}
                        Fill standard foam sizes
                      </button>
                    </>
                  )}
                  {seedFoam.isError && (
                    <p role="alert" className="mt-2 text-sm text-red-700">
                      {(seedFoam.error as Error).message}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-max text-sm">
                    <thead>
                      <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                        <th className="py-2 pr-4 font-medium">Look up by</th>
                        <th className="py-2 pr-4 text-right font-medium">Rate</th>
                        <th className="py-2 pr-4 font-medium">From</th>
                        <th className="py-2 pr-4 font-medium">Status</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-200/70">
                      {visible
                        .slice()
                        .sort((a, b) => a.lookup_key.localeCompare(b.lookup_key) ||
                          b.effective_from.localeCompare(a.effective_from))
                        .map((e) => (
                          <tr key={e.id} className={isLive(e) ? '' : 'text-ink-400'}>
                            <td className="py-2 pr-4 font-mono">{e.lookup_key}</td>
                            <td className="py-2 pr-4 text-right font-semibold tabular-nums">
                              {e.rate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2 pr-4 tabular-nums">
                              {new Date(e.effective_from).toLocaleDateString()}
                            </td>
                            <td className="py-2 pr-4">
                              {isLive(e) ? (
                                <span className="badge bg-brand-50 text-brand-700">
                                  <Check className="h-3 w-3" aria-hidden /> In use
                                </span>
                              ) : e.effective_from > today() ? (
                                <span className="badge bg-amber-50 text-amber-700">Scheduled</span>
                              ) : (
                                <span className="badge bg-ink-100 text-ink-500">Superseded</span>
                              )}
                            </td>
                            <td className="py-2">
                              <button
                                className="rounded-lg p-1.5 text-ink-300 hover:bg-red-50 hover:text-red-600"
                                onClick={() => removeEntry.mutate(e.id)}
                                aria-label={`Delete rate ${e.lookup_key}`}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ---------- Add or supersede ---------- */}
              <form
                className="mt-4 flex flex-wrap items-end gap-3 border-t border-ink-200/70 pt-4"
                onSubmit={(e) => { e.preventDefault(); addRate.mutate() }}
              >
                <div>
                  <label className="label-text" htmlFor="rt-key">Look up by</label>
                  <input id="rt-key" className="h-11 w-44 rounded-xl border border-ink-200 px-3 font-mono text-sm"
                    placeholder="72x36x50" value={draft.lookup_key}
                    onChange={(e) => setDraft({ ...draft, lookup_key: e.target.value })} />
                </div>
                <div>
                  <label className="label-text" htmlFor="rt-rate">Rate</label>
                  <input id="rt-rate" type="number" step="any" min="0"
                    className="h-11 w-28 rounded-xl border border-ink-200 px-3 text-right text-sm tabular-nums"
                    value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} />
                </div>
                <div>
                  <label className="label-text" htmlFor="rt-from">Effective from</label>
                  <input id="rt-from" type="date"
                    className="h-11 rounded-xl border border-ink-200 px-3 text-sm"
                    value={draft.effective_from}
                    onChange={(e) => setDraft({ ...draft, effective_from: e.target.value })} />
                </div>
                <button className="btn-primary" type="submit" disabled={addRate.isPending}>
                  {addRate.isPending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
                  Add rate
                </button>
              </form>

              {addRate.isError && (
                <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-red-700">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {(addRate.error as Error).message}
                </p>
              )}

              <p className="mt-3 text-xs leading-relaxed text-ink-400">
                Adding a rate for a name that already exists <strong>supersedes</strong> it from that
                date — the old one is kept so sheets costed earlier still make sense. Sheets already
                finalised keep the rate they were finalised with.
              </p>
            </section>
          )}
        </>
      )}

      {newTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !createTable.isPending && setNewTable(null)}>
          <div className="card w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">New rate table</h2>
            <div>
              <label className="label-text" htmlFor="nt-name">Name</label>
              <input id="nt-name" className="input-field" autoFocus value={newTable.name}
                placeholder="e.g. Plywood by thickness"
                onChange={(e) => setNewTable({ ...newTable, name: e.target.value })} />
            </div>
            {createTable.isError && (
              <p role="alert" className="text-sm text-red-700">{(createTable.error as Error).message}</p>
            )}
            <div className="flex gap-2">
              <button className="btn-primary" disabled={createTable.isPending}
                onClick={() => createTable.mutate()}>
                {createTable.isPending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
                Create
              </button>
              <button className="btn-secondary" onClick={() => setNewTable(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
