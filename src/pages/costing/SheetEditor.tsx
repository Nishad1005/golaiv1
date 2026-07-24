import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Loader2, Lock, Save, TriangleAlert } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { summarise } from '../../lib/costing/formulas'
import { useCostingCategories, useCostingRates, useCostingSheet } from '../../lib/costing/queries'
import { DIMENSION_FIELDS, type DraftLine, type SheetSnapshot } from '../../lib/costing/types'
import { PageHeader } from '../../components/PageHeader'
import { CategoryBlock } from './CategoryBlock'

const money = (n: number) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })

export function SheetEditor() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const { data: categories } = useCostingCategories()
  const { data: rateData } = useCostingRates()
  const { data, isLoading } = useCostingSheet(id)

  const [lines, setLines] = useState<DraftLine[] | null>(null)
  const [header, setHeader] = useState<{ gst_pct: number; margin_pct: number } | null>(null)
  const [saved, setSaved] = useState(false)

  // Seed local state once the sheet arrives. The editor holds everything in
  // memory and saves on demand — a costing sheet is worked on like a
  // spreadsheet, not committed field by field.
  const workingLines = lines ?? (data ? data.lines.map((l) => ({ ...l })) : [])
  const sheet = data?.sheet
  const gstPct = header?.gst_pct ?? sheet?.gst_pct ?? 0
  const marginPct = header?.margin_pct ?? sheet?.margin_pct ?? 0
  const readOnly = sheet?.status !== 'draft'

  /**
   * Rates for a category's lookup field. A category may name its table in
   * `config.rate_table`; otherwise we merge every table, so a rate is found
   * whatever the client called the table. Hardcoding 'foam_sheet' meant an
   * empty dropdown the moment anyone renamed it.
   */
  const ratesFor = (config: Record<string, unknown>): Record<string, number> => {
    const live = rateData?.live ?? {}
    const named = typeof config?.rate_table === 'string' ? config.rate_table : null
    if (named && live[named]) return live[named]
    return Object.assign({}, ...Object.values(live)) as Record<string, number>
  }
  const allRates = Object.assign({}, ...Object.values(rateData?.live ?? {})) as Record<string, number>

  const totals = useMemo(() => {
    const named = workingLines.map((l) => ({
      categoryId: l.category_id,
      categoryName: categories?.find((c) => c.id === l.category_id)?.name ?? '—',
      amount: l.amount,
    }))
    return summarise(named, gstPct, marginPct)
  }, [workingLines, categories, gstPct, marginPct])

  const save = useMutation({
    mutationFn: async (finalise: boolean) => {
      if (!sheet) return
      // Replace the line set wholesale: simpler and safer than diffing, and a
      // costing sheet is small enough that it costs nothing.
      const { error: delErr } = await supabase.from('costing_lines').delete().eq('sheet_id', sheet.id)
      if (delErr) throw new Error(delErr.message)

      if (workingLines.length > 0) {
        const rows = workingLines.map((l, i) => ({
          tenant_id: profile!.tenant_id,
          sheet_id: sheet.id,
          category_id: l.category_id,
          item_id: l.item_id,
          label: l.label,
          sort_order: i,
          inputs: l.inputs,
          amount: l.amount,
          note: l.note,
        }))
        const { error } = await supabase.from('costing_lines').insert(rows)
        if (error) throw new Error(error.message)
      }

      const patch: Record<string, unknown> = {
        gst_pct: gstPct,
        margin_pct: marginPct,
        updated_at: new Date().toISOString(),
      }

      if (finalise) {
        // Freeze the numbers AND the rates behind them. Re-opened in a year this
        // sheet still explains itself, whatever rates have done since.
        const snapshot: SheetSnapshot = {
          finalised_at: new Date().toISOString(),
          subtotal: totals.subtotal,
          gst: totals.gst,
          overhead_margin: totals.overheadMargin,
          total: totals.total,
          categories: totals.byCategory.map((c) => ({
            key: categories?.find((x) => x.id === c.categoryId)?.key ?? c.categoryId,
            name: c.name, amount: c.amount, pct: c.pct,
          })),
          lines: workingLines.map((l) => ({
            category_key: categories?.find((c) => c.id === l.category_id)?.key ?? '',
            label: l.label ?? '', inputs: l.inputs, amount: l.amount,
          })),
          rates: allRates,
        }
        patch.computed = snapshot
        patch.status = 'final'
        patch.finalised_at = snapshot.finalised_at
      }

      const { error: upErr } = await supabase.from('costing_sheets').update(patch).eq('id', sheet.id)
      if (upErr) throw new Error(upErr.message)

      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: finalise ? 'finalise.costing_sheet' : 'update.costing_sheet',
        entityType: 'costing_sheet', entityId: sheet.id,
        after: { total: totals.total, lines: workingLines.length },
      })
    },
    onSuccess: () => {
      setSaved(true)
      setLines(null)
      void queryClient.invalidateQueries({ queryKey: ['costing-sheet', id] })
      void queryClient.invalidateQueries({ queryKey: ['costing-sheets'] })
    },
  })

  if (isLoading || !sheet || !categories) {
    return <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin text-brand-500" />
  }

  const linesFor = (categoryId: string) => workingLines.filter((l) => l.category_id === categoryId)
  const replaceFor = (categoryId: string, next: DraftLine[]) => {
    setSaved(false)
    setLines([...workingLines.filter((l) => l.category_id !== categoryId), ...next])
  }

  return (
    <div>
      <Link to="/costing" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> All costing sheets
      </Link>

      <PageHeader
        title={sheet.name}
        subtitle={`Version ${sheet.version}${sheet.buyer ? ` · ${sheet.buyer}` : ''} · ${new Date(sheet.sheet_date).toLocaleDateString()}`}
        actions={
          readOnly ? (
            <span className="badge bg-ink-100 text-ink-600">
              <Lock className="h-3 w-3" aria-hidden /> Final
            </span>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" disabled={save.isPending} onClick={() => save.mutate(false)}>
                {save.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                Save
              </button>
              <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate(true)}>
                <Lock className="h-5 w-5" aria-hidden /> Finalise
              </button>
            </div>
          )
        }
      />

      {saved && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> Saved.
        </p>
      )}
      {save.isError && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {(save.error as Error).message}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="space-y-2 lg:col-span-2">
          {Object.keys(sheet.dimensions ?? {}).length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-ink-900">Dimensions</h2>
              <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {DIMENSION_FIELDS.filter((d) => sheet.dimensions[d.key]).map((d) => (
                  <div key={d.key} className="flex gap-1.5">
                    <dt className="text-ink-400">{d.label}</dt>
                    <dd className="font-medium tabular-nums">{sheet.dimensions[d.key]}″</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {categories.map((c) => (
            <CategoryBlock
              key={c.id}
              category={c}
              lines={linesFor(c.id)}
              rates={c.formula_kind === 'sheet_yield' ? ratesFor(c.config) : {}}
              readOnly={readOnly}
              onChange={(next) => replaceFor(c.id, next)}
            />
          ))}
        </div>

        {/* ---------- Live summary ---------- */}
        <aside className="card lg:sticky lg:top-6">
          <h2 className="font-semibold text-ink-900">Cost summary</h2>

          {totals.byCategory.length === 0 ? (
            <p className="mt-3 text-sm text-ink-400">
              Add lines to a category and the cost builds up here.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {totals.byCategory.map((c) => (
                <li key={c.categoryId} className="flex items-baseline gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink-600">{c.name}</span>
                  <span className="shrink-0 tabular-nums font-medium">{money(c.amount)}</span>
                  <span className="w-11 shrink-0 text-right text-xs tabular-nums text-ink-400">
                    {c.pct.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-4 space-y-2 border-t border-ink-200/70 pt-3 text-sm">
            <Row label="Material + labour" value={money(totals.subtotal)} />

            <div className="flex items-center gap-2">
              <dt className="flex-1 text-ink-500">GST</dt>
              <PctInput value={gstPct} readOnly={readOnly}
                onChange={(v) => { setSaved(false); setHeader({ gst_pct: v, margin_pct: marginPct }) }} />
              <dd className="w-24 shrink-0 text-right tabular-nums">{money(totals.gst)}</dd>
            </div>

            <div className="flex items-center gap-2">
              <dt className="flex-1 text-ink-500">Overhead + margin</dt>
              <PctInput value={marginPct} readOnly={readOnly}
                onChange={(v) => { setSaved(false); setHeader({ gst_pct: gstPct, margin_pct: v }) }} />
              <dd className="w-24 shrink-0 text-right tabular-nums">{money(totals.overheadMargin)}</dd>
            </div>
          </dl>

          <div className="mt-3 flex items-baseline justify-between gap-2 border-t border-ink-200/70 pt-3">
            <span className="font-semibold text-ink-900">Total price</span>
            <span className="text-2xl font-bold tabular-nums text-ink-900">{money(totals.total)}</span>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-ink-400">
            Margin is charged on material + GST, as in your sheet. Finalising locks these
            numbers and the rates behind them, so this sheet still reads the same next year.
          </p>
        </aside>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="flex-1 text-ink-500">{label}</dt>
      <dd className="w-24 shrink-0 text-right font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function PctInput({ value, readOnly, onChange }: {
  value: number; readOnly?: boolean; onChange: (v: number) => void
}) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <input
        type="number" min="0" step="any"
        className="h-8 w-16 rounded-lg border border-ink-200 px-2 text-right text-sm tabular-nums"
        value={value}
        disabled={readOnly}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        aria-label="Percent"
      />
      <span className="text-xs text-ink-400">%</span>
    </span>
  )
}
