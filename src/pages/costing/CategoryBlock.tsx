import { useState } from 'react'
import { ChevronDown, Link2, Plus, TriangleAlert, X } from 'lucide-react'
import { computeLine } from '../../lib/costing/formulas'
import { useItemSearch } from '../../lib/costing/queries'
import type { CostingCategory, CostingField, DraftLine } from '../../lib/costing/types'

interface Props {
  category: CostingCategory
  lines: DraftLine[]
  /** Live rates for lookup fields: lookupKey → rate. */
  rates: Record<string, number>
  readOnly?: boolean
  onChange: (lines: DraftLine[]) => void
}

/**
 * One block of the costing sheet — Wood, Foam, Fabric, and 28 others.
 *
 * There is deliberately only ONE of these components. Every category renders
 * from its own `costing_category_fields` rows, so adding or reshaping a category
 * is a data change, not a code change. That is what makes 31 blocks tractable,
 * and what will let the next client have completely different ones.
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
          {total > 0 ? total.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}
        </span>
      </button>

      {open && (
        <div className="border-t border-ink-200/70 px-4 py-3 animate-fade-in motion-reduce:animate-none">
          {lines.length === 0 ? (
            <p className="py-3 text-sm text-ink-400">Nothing costed here yet.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="py-2 pr-3 font-medium">Product</th>
                    {fields.map((f) => (
                      <th key={f.id} className="py-2 pr-3 font-medium">
                        {f.label}{f.unit ? ` (${f.unit})` : ''}
                      </th>
                    ))}
                    <th className="py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200/70">
                  {lines.map((line) => {
                    const warn = lineWarning(category, line, rates)
                    return (
                      <tr key={line.id}>
                        <td className="py-2 pr-3">
                          <ItemPicker
                            line={line}
                            readOnly={readOnly}
                            onPick={(item) => update(line.id, {
                              item_id: item?.id ?? null,
                              label: item?.name ?? line.label,
                            })}
                            onLabel={(v) => update(line.id, { label: v })}
                          />
                        </td>

                        {fields.map((f) => (
                          <td key={f.id} className="py-2 pr-3">
                            <FieldInput
                              field={f}
                              value={line.inputs[f.key]}
                              rates={rates}
                              readOnly={readOnly}
                              onChange={(v) => setInput(line.id, f.key, v)}
                            />
                          </td>
                        ))}

                        <td className="py-2 pr-3 text-right">
                          <span className="font-semibold tabular-nums text-ink-800">
                            {line.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </span>
                          {warn && (
                            <span className="block text-xs font-normal text-amber-600">{warn}</span>
                          )}
                        </td>

                        <td className="py-2">
                          {!readOnly && (
                            <button
                              className="rounded-lg p-1.5 text-ink-300 hover:bg-red-50 hover:text-red-600"
                              onClick={() => onChange(lines.filter((l) => l.id !== line.id))}
                              aria-label="Remove line"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!readOnly && (
            <button className="btn-secondary mt-3" onClick={addLine}>
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
    if (key && rates[key] === undefined) return `No rate for "${key}"`
  }
  return computeLine(category.formula_kind, line.inputs, lookupRate(category, line, rates)).warning
}

function FieldInput({ field, value, rates, readOnly, onChange }: {
  field: CostingField
  value: unknown
  rates: Record<string, number>
  readOnly?: boolean
  onChange: (v: string) => void
}) {
  const shown = value === null || value === undefined ? '' : String(value)

  if (field.data_type === 'rate_lookup') {
    const options = Object.keys(rates).sort()
    return (
      <select
        className="h-10 w-40 rounded-lg border border-ink-200 bg-white px-2 text-sm"
        value={shown}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value)}
        aria-label={field.label}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>{o} · {rates[o]}</option>
        ))}
      </select>
    )
  }

  return (
    <input
      type={field.data_type === 'number' ? 'number' : 'text'}
      inputMode={field.data_type === 'number' ? 'decimal' : undefined}
      step="any"
      className={`h-10 rounded-lg border border-ink-200 px-2 text-sm ${field.data_type === 'number' ? 'w-24 tabular-nums' : 'w-36'}`}
      value={shown}
      disabled={readOnly}
      onChange={(e) => onChange(e.target.value)}
      aria-label={field.label}
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
  const { data: results } = useItemSearch(term)

  if (line.item_id) {
    return (
      <span className="flex items-center gap-1.5">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
        <span className="max-w-44 truncate font-medium">{line.label}</span>
        {!readOnly && (
          <button
            className="rounded px-1 text-xs text-ink-400 hover:text-red-600"
            onClick={() => onPick(null)}
            title="Unlink from the product master"
          >
            ✕
          </button>
        )}
      </span>
    )
  }

  return (
    <span className="relative block">
      <input
        className="h-10 w-44 rounded-lg border border-ink-200 px-2 text-sm"
        placeholder="Search or type…"
        value={term || line.label || ''}
        disabled={readOnly}
        onChange={(e) => { setTerm(e.target.value); onLabel(e.target.value) }}
        aria-label="Product"
      />
      {term.length >= 2 && results && results.length > 0 && (
        <ul className="absolute left-0 top-11 z-20 max-h-56 w-64 overflow-auto rounded-xl border border-ink-200 bg-white py-1 shadow-card-hover">
          {results.map((it) => (
            <li key={it.id}>
              <button
                className="block w-full px-3 py-2 text-left text-sm hover:bg-cream"
                onClick={() => { onPick(it); setTerm('') }}
              >
                <span className="block truncate font-medium">{it.name}</span>
                <span className="block text-xs text-ink-400">{it.code} · {it.uom}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}
