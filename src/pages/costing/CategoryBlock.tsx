import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Link2, Plus, Search, Tags, TriangleAlert, X } from 'lucide-react'
import { computeLine } from '../../lib/costing/formulas'
import { useItemSearch } from '../../lib/costing/queries'
import type { CostingCategory, CostingField, DraftLine } from '../../lib/costing/types'

interface Props {
  category: CostingCategory
  lines: DraftLine[]
  /** Live rates for this category's lookup field: lookupKey → rate. */
  rates: Record<string, number>
  readOnly?: boolean
  onChange: (lines: DraftLine[]) => void
}

const money = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })

/** Friendly captions for the values a formula derives (e.g. wood's cft). */
const DERIVED_LABELS: Record<string, string> = { cft: 'CFT', cbm: 'CBM' }

/**
 * One block of the costing sheet — Wood, Foam, Fabric, and 28 others.
 *
 * There is deliberately only ONE of these components: every category renders
 * from its own `costing_category_fields` rows, so adding or reshaping a category
 * is a data change, not a code change.
 *
 * Each line is a CARD, not a table row. A table with eight columns needs
 * horizontal scrolling, which is unusable on the phones this app targets — and
 * it clipped the product-search dropdown, because `overflow-x` cuts off
 * absolutely positioned children. Cards wrap instead.
 */
export function CategoryBlock({ category, lines, rates, readOnly, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const fields = category.costing_category_fields.filter((f) => f.is_input)

  const total = lines.reduce((s, l) => s + l.amount, 0)
  const warnings = lines.filter((l) => lineWarning(category, l, rates)).length

  const recompute = (line: DraftLine): DraftLine => {
    const rate = lookupRate(category, line, rates)
    const { amount } = computeLine(category.formula_kind, line.inputs, rate)
    return { ...line, amount: Number.isFinite(amount) ? amount : 0 }
  }

  const update = (id: string, patch: Partial<DraftLine>) =>
    onChange(lines.map((l) => (l.id === id ? recompute({ ...l, ...patch }) : l)))

  const setInput = (id: string, key: string, value: string) =>
    onChange(lines.map((l) =>
      l.id === id ? recompute({ ...l, inputs: { ...l.inputs, [key]: value } }) : l))

  const addLine = () =>
    onChange([...lines, {
      id: `new-${crypto.randomUUID()}`,
      category_id: category.id,
      item_id: null,
      label: null,
      sort_order: lines.length,
      inputs: {},
      amount: 0,
      note: null,
      isNew: true,
    }])

  return (
    <section className="card p-0">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-ink-400 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink-900">{category.name}</span>
            {lines.length > 0 && (
              <span className="badge bg-ink-100 text-ink-600 tabular-nums">{lines.length}</span>
            )}
            {warnings > 0 && (
              <span className="badge bg-amber-50 text-amber-700">
                <TriangleAlert className="h-3 w-3" aria-hidden /> {warnings}
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 font-semibold tabular-nums text-ink-800">
          {total > 0 ? money(total) : '—'}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-ink-200/70 px-4 py-4 animate-fade-in motion-reduce:animate-none">
          {lines.length === 0 && (
            <p className="text-sm text-ink-400">Nothing costed here yet.</p>
          )}

          {lines.map((line) => {
            const warn = lineWarning(category, line, rates)
            // Values the formula works out for itself, e.g. wood's cft — shown
            // read-only so the user sees the L×W×T×qty÷144 result.
            const derived = computeLine(category.formula_kind, line.inputs, lookupRate(category, line, rates)).derived
            return (
              <div key={line.id} className="rounded-xl border border-ink-200 bg-cream/40 p-3">
                {/* Product — full width so the search results have room */}
                <div className="flex items-start gap-2">
                  <ItemPicker
                    line={line}
                    readOnly={readOnly}
                    onPick={(item) => update(line.id, {
                      item_id: item?.id ?? null,
                      label: item?.name ?? line.label,
                    })}
                    onLabel={(v) => update(line.id, { label: v })}
                  />
                  {!readOnly && (
                    <button
                      className="shrink-0 rounded-lg p-2 text-ink-300 hover:bg-red-50 hover:text-red-600"
                      onClick={() => onChange(lines.filter((l) => l.id !== line.id))}
                      aria-label="Remove line"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Fields wrap — no horizontal scrolling, works on a phone */}
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  {fields.map((f) => (
                    <div key={f.id}>
                      <label className="mb-1 block text-xs font-medium text-ink-500" htmlFor={`${line.id}-${f.key}`}>
                        {f.label}{f.unit ? ` (${f.unit})` : ''}
                      </label>
                      <FieldInput
                        id={`${line.id}-${f.key}`}
                        field={f}
                        value={line.inputs[f.key]}
                        rates={rates}
                        readOnly={readOnly}
                        onChange={(v) => setInput(line.id, f.key, v)}
                      />
                    </div>
                  ))}

                  {/* Formula-derived values, read-only (e.g. wood CFT) */}
                  {Object.entries(derived).map(([key, val]) => (
                    <div key={key}>
                      <span className="mb-1 block text-xs font-medium text-ink-500">
                        {DERIVED_LABELS[key] ?? key}
                      </span>
                      <span className="flex h-11 min-w-24 items-center rounded-xl border border-dashed border-ink-200 bg-cream px-3 text-sm font-semibold tabular-nums text-ink-700">
                        {val.toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-ink-200/70 pt-2">
                  {warn ? (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden /> {warn}
                    </span>
                  ) : <span />}
                  <span className="text-lg font-bold tabular-nums text-ink-900">
                    {money(line.amount)}
                  </span>
                </div>
              </div>
            )
          })}

          {!readOnly && (
            <button className="btn-secondary" onClick={addLine}>
              <Plus className="h-5 w-5" aria-hidden /> Add line
            </button>
          )}
        </div>
      )}
    </section>
  )
}

/** A rate-lookup field resolves its rate from the table; otherwise it's typed. */
function lookupRate(
  category: CostingCategory,
  line: DraftLine,
  rates: Record<string, number>,
): number | undefined {
  const lookupField = category.costing_category_fields.find((f) => f.data_type === 'rate_lookup')
  if (!lookupField) return undefined
  const key = String(line.inputs[lookupField.key] ?? '')
  return rates[key]
}

/**
 * The warning their spreadsheet cannot produce: a rate with no quantity, or a
 * lookup that matched nothing, both of which quietly cost ₹0 in Excel.
 */
function lineWarning(
  category: CostingCategory,
  line: DraftLine,
  rates: Record<string, number>,
): string | undefined {
  const lookupField = category.costing_category_fields.find((f) => f.data_type === 'rate_lookup')
  if (lookupField) {
    const key = String(line.inputs[lookupField.key] ?? '')
    if (key && rates[key] === undefined) return `No rate set for "${key}"`
  }
  return computeLine(category.formula_kind, line.inputs, lookupRate(category, line, rates)).warning
}

function FieldInput({ id, field, value, rates, readOnly, onChange }: {
  id: string
  field: CostingField
  value: unknown
  rates: Record<string, number>
  readOnly?: boolean
  onChange: (v: string) => void
}) {
  const shown = value === null || value === undefined ? '' : String(value)

  if (field.data_type === 'rate_lookup') {
    const options = Object.keys(rates).sort()
    // An empty dropdown with no explanation is the worst outcome — say why and
    // point at the fix.
    if (options.length === 0) {
      return (
        <Link
          to="/costing/rates"
          className="flex h-11 w-48 items-center gap-1.5 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 text-xs font-medium text-amber-800"
        >
          <Tags className="h-3.5 w-3.5 shrink-0" aria-hidden />
          No rates yet — set them up
        </Link>
      )
    }
    return (
      <select
        id={id}
        className="h-11 w-48 rounded-xl border border-ink-200 bg-white px-3 text-sm"
        value={shown}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o} value={o}>{o} — {money(rates[o])}</option>
        ))}
      </select>
    )
  }

  return (
    <input
      id={id}
      type={field.data_type === 'number' ? 'number' : 'text'}
      inputMode={field.data_type === 'number' ? 'decimal' : undefined}
      step="any"
      className={`h-11 rounded-xl border border-ink-200 px-3 text-sm ${field.data_type === 'number' ? 'w-28 tabular-nums' : 'w-40'}`}
      value={shown}
      disabled={readOnly}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/**
 * Links a line to a real product, which is what makes the sheet queryable —
 * "which sofas use this fabric?" — and lets a future release request be
 * pre-filled. Free text stays allowed for anything not in the master.
 */
function ItemPicker({ line, readOnly, onPick, onLabel }: {
  line: DraftLine
  readOnly?: boolean
  onPick: (item: { id: string; name: string } | null) => void
  onLabel: (v: string) => void
}) {
  const [term, setTerm] = useState('')
  const [focused, setFocused] = useState(false)
  const { data: results, isFetching } = useItemSearch(term)

  if (line.item_id) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5">
        <Link2 className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium text-ink-800">{line.label}</span>
        {!readOnly && (
          <button
            className="shrink-0 rounded px-1.5 text-xs font-medium text-ink-400 hover:text-red-600"
            onClick={() => onPick(null)}
            title="Unlink from the product master"
          >
            Change
          </button>
        )}
      </span>
    )
  }

  const showResults = focused && term.trim().length >= 2

  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" aria-hidden />
      <input
        className="h-11 w-full rounded-xl border border-ink-200 pl-9 pr-3 text-sm"
        placeholder="Search your products, or just type a name…"
        value={term || line.label || ''}
        disabled={readOnly}
        onFocus={() => setFocused(true)}
        // Delay so a click on a result registers before the list closes.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onChange={(e) => { setTerm(e.target.value); onLabel(e.target.value) }}
        aria-label="Product"
      />

      {showResults && (
        <ul className="absolute left-0 right-0 top-12 z-30 max-h-60 overflow-auto rounded-xl border border-ink-200 bg-white py-1 shadow-card-hover">
          {isFetching && (
            <li className="px-3 py-2 text-sm text-ink-400">Searching…</li>
          )}
          {!isFetching && (results ?? []).length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-400">
              Nothing in your product list matches — the typed name will be used.
            </li>
          )}
          {(results ?? []).map((it) => (
            <li key={it.id}>
              <button
                type="button"
                className="block w-full px-3 py-2.5 text-left hover:bg-cream"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick(it); setTerm(''); setFocused(false) }}
              >
                <span className="block truncate text-sm font-medium">{it.name}</span>
                <span className="block text-xs text-ink-400">{it.code} · {it.uom}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
