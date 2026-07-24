import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Calculator, Copy, Loader2, Lock, Plus, Sparkles, Tags, TriangleAlert } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { useCostingCategories, useCostingSheets } from '../../lib/costing/queries'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'

export function CostingSheets() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: sheets, isLoading } = useCostingSheets()
  const { data: categories } = useCostingCategories()
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', buyer: '', code: '' })

  // First run: the company has a licence but no category blocks yet.
  const seed = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('seed_costing_template')
      if (error) throw new Error(error.message)
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'seed.costing_template', entityType: 'costing', entityId: profile!.tenant_id,
      })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['costing-categories'] }),
  })

  const create = useMutation({
    mutationFn: async (cloneFrom?: string) => {
      const { data: sheet, error } = await supabase
        .from('costing_sheets')
        .insert({
          tenant_id: profile!.tenant_id,
          name: form.name.trim() || 'Untitled product',
          code: form.code.trim() || null,
          buyer: form.buyer.trim() || null,
          created_by: profile!.id,
          dimensions: {},
          margin_pct: 40, // their standard; editable per sheet
        })
        .select()
        .single()
      if (error) throw new Error(error.message)

      // Cloning copies the STRUCTURE and re-reads live rates — the safe version
      // of their habit of copying last product's file, which is how stale
      // references and broken lookups spread through their spreadsheets.
      if (cloneFrom) {
        const { data: src } = await supabase
          .from('costing_lines').select('*').eq('sheet_id', cloneFrom).order('sort_order')
        if (src && src.length > 0) {
          await supabase.from('costing_lines').insert(
            (src as Record<string, unknown>[]).map((l, i) => ({
              tenant_id: profile!.tenant_id,
              sheet_id: sheet.id,
              category_id: l.category_id,
              item_id: l.item_id,
              label: l.label,
              sort_order: i,
              inputs: l.inputs,
              amount: l.amount,
              note: l.note,
            })),
          )
        }
      }
      return sheet as { id: string }
    },
    onSuccess: (sheet) => {
      setShowNew(false)
      setForm({ name: '', buyer: '', code: '' })
      void queryClient.invalidateQueries({ queryKey: ['costing-sheets'] })
      navigate(`/costing/${sheet.id}`)
    },
  })

  const needsSeeding = categories !== undefined && categories.length === 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="Costing"
        subtitle="What each product costs to make, and what it should sell for."
        actions={
          !needsSeeding && (
            <div className="flex flex-wrap gap-2">
              <Link to="/costing/rates" className="btn-secondary">
                <Tags className="h-5 w-5" aria-hidden /> Rate tables
              </Link>
              <button className="btn-primary" onClick={() => setShowNew(true)}>
                <Plus className="h-5 w-5" aria-hidden /> New sheet
              </button>
            </div>
          )
        }
      />

      {needsSeeding && (
        <section className="card border-dashed">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Sparkles className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-ink-900">Set up your costing categories</h2>
              <p className="mt-0.5 text-sm text-ink-400">
                We'll create the standard furniture categories — wood, plywood, foam, fabric,
                labour and the rest — with the right calculation behind each one. You can rename,
                reorder or remove them afterwards.
              </p>
              {seed.isError && (
                <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-red-700">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {(seed.error as Error).message}
                </p>
              )}
              <button className="btn-primary mt-4" disabled={seed.isPending} onClick={() => seed.mutate()}>
                {seed.isPending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
                Create categories
              </button>
            </div>
          </div>
        </section>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !create.isPending && setShowNew(false)}>
          <div className="card w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">New costing sheet</h2>
            <div>
              <label className="label-text" htmlFor="cs-name">Product name</label>
              <input id="cs-name" className="input-field" autoFocus value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Aara Lounge Chair" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label-text" htmlFor="cs-code">Code</label>
                <input id="cs-code" className="input-field" value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div>
                <label className="label-text" htmlFor="cs-buyer">Buyer</label>
                <input id="cs-buyer" className="input-field" value={form.buyer}
                  onChange={(e) => setForm({ ...form, buyer: e.target.value })} />
              </div>
            </div>
            {create.isError && (
              <p role="alert" className="text-sm text-red-700">{(create.error as Error).message}</p>
            )}
            <div className="flex gap-2">
              <button className="btn-primary" disabled={create.isPending || !form.name.trim()}
                onClick={() => create.mutate(undefined)}>
                {create.isPending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
                Create
              </button>
              <button className="btn-secondary" disabled={create.isPending} onClick={() => setShowNew(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <Loader2 className="mx-auto mt-10 h-7 w-7 animate-spin text-brand-500" />
      ) : (sheets ?? []).length === 0 && !needsSeeding ? (
        <EmptyState
          icon={Calculator}
          title="No costing sheets yet"
          detail="A sheet lists everything that goes into one product — materials, labour, packing — and works out what it costs and what it should sell for. Rates come from your rate tables, so changing a price updates every sheet."
        />
      ) : (
        <div className="space-y-2">
          {(sheets ?? []).map((s) => (
            <div key={s.id} className="card flex flex-wrap items-center gap-3">
              <Link to={`/costing/${s.id}`} className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink-900 hover:text-brand-600">{s.name}</span>
                  <span className="badge bg-ink-100 text-ink-600">v{s.version}</span>
                  {s.status === 'final' && (
                    <span className="badge bg-brand-50 text-brand-700">
                      <Lock className="h-3 w-3" aria-hidden /> Final
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-sm text-ink-400">
                  {[s.code, s.buyer, new Date(s.sheet_date).toLocaleDateString()]
                    .filter(Boolean).join(' · ')}
                </span>
              </Link>

              {s.computed && (
                <span className="shrink-0 text-right">
                  <span className="block text-lg font-bold tabular-nums text-ink-900">
                    {s.computed.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                  <span className="block text-xs text-ink-400">total price</span>
                </span>
              )}

              <button
                className="btn-secondary shrink-0"
                title="Start a new sheet from this one — copies the structure and re-reads today's rates"
                onClick={() => {
                  setForm({ name: `${s.name} (copy)`, buyer: s.buyer ?? '', code: '' })
                  create.mutate(s.id)
                }}
              >
                <Copy className="h-5 w-5" aria-hidden /> Clone
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
