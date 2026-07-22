import { useState } from 'react'
import { Loader2, Printer } from 'lucide-react'
import { generateItemLabelsPdf, ITEM_LABEL_SIZES, type ItemLabelSize } from '../lib/labels'
import { logActivity } from '../lib/audit'
import { useAuth } from '../stores/auth'

export interface LabelRow {
  code: string
  name: string
  uom: string
  category: string | null
  /** Units received/held — offered as "one label per unit". Omit if unknown. */
  quantity?: number
}

interface Props {
  rows: LabelRow[]
  onClose: () => void
  /** Where this was triggered from, for the audit log. */
  source: string
  title?: string
}

/**
 * Printing item labels, shared by Admin → Items and the receiving screen.
 *
 * Receiving is where labels are actually needed — goods that reach the shelf
 * unlabelled can never be scanned as products — so it offers "one label per
 * unit received" as the default, which is almost always what someone wants
 * standing in front of an open carton.
 */
export function ItemLabelDialog({ rows, onClose, source, title = 'Print item labels' }: Props) {
  const { profile } = useAuth()
  const hasQuantities = rows.some((r) => (r.quantity ?? 0) > 0)
  const [size, setSize] = useState<ItemLabelSize>('thermal-100x50')
  const [perUnit, setPerUnit] = useState(hasQuantities)
  const [copies, setCopies] = useState('1')
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fixed = Math.max(1, Number(copies) || 1)
  const copiesFor = (r: LabelRow) =>
    perUnit ? Math.max(1, Math.round(r.quantity ?? 1)) : fixed
  const total = rows.reduce((sum, r) => sum + copiesFor(r), 0)

  const print = async () => {
    setPrinting(true)
    setError(null)
    try {
      await generateItemLabelsPdf(
        rows.map((r) => ({
          label: { code: r.code, name: r.name, uom: r.uom, category: r.category },
          copies: copiesFor(r),
        })),
        size,
        `golai-item-labels-${new Date().toISOString().slice(0, 10)}.pdf`,
      )
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'print.item_labels',
        entityType: 'item',
        after: { count: rows.length, labels: total, size, source },
      })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !printing && onClose()}
    >
      <div className="card w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm text-ink-400">
            {rows.length} product{rows.length === 1 ? '' : 's'} · each label carries the product name
            and number in large type, a Code128 barcode (USB scanners) and a QR code (phone cameras).
          </p>
        </div>

        <div>
          <label className="label-text" htmlFor="label-size">Label size</label>
          <select
            id="label-size"
            className="input-field"
            value={size}
            onChange={(e) => setSize(e.target.value as ItemLabelSize)}
          >
            {ITEM_LABEL_SIZES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div>
          <span className="label-text">How many of each</span>
          {hasQuantities && (
            <label className="mb-2 flex min-h-tap cursor-pointer items-center gap-3 rounded-xl border border-ink-200 px-3">
              <input
                type="radio"
                className="h-4 w-4 accent-brand-500"
                checked={perUnit}
                onChange={() => setPerUnit(true)}
              />
              <span className="text-sm">
                <span className="font-medium">One per unit received</span>
                <span className="block text-xs text-ink-400">Matches the quantity on each line</span>
              </span>
            </label>
          )}
          <label className="flex min-h-tap cursor-pointer items-center gap-3 rounded-xl border border-ink-200 px-3">
            {hasQuantities && (
              <input
                type="radio"
                className="h-4 w-4 accent-brand-500"
                checked={!perUnit}
                onChange={() => setPerUnit(false)}
              />
            )}
            <span className="flex flex-1 items-center gap-3 text-sm">
              <span className="font-medium">{hasQuantities ? 'Fixed number each' : 'Copies per product'}</span>
              <input
                type="number"
                min="1"
                className="ml-auto h-10 w-20 rounded-lg border border-ink-200 px-2 text-base tabular-nums"
                value={copies}
                onChange={(e) => setCopies(e.target.value)}
                onFocus={() => setPerUnit(false)}
                aria-label="Copies per product"
              />
            </span>
          </label>
          <p className="mt-1.5 text-xs text-ink-400">
            One sticker per physical bin, box or roll. <strong>{total}</strong> label
            {total === 1 ? '' : 's'} will print.
          </p>
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={printing} onClick={() => void print()}>
            {printing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
            Download PDF
          </button>
          <button className="btn-secondary" disabled={printing} onClick={onClose}>
            Cancel
          </button>
        </div>
        <p className="text-xs text-ink-400">
          In the print dialog choose <strong>Actual size / 100%</strong>, not "Fit to page".
        </p>
      </div>
    </div>
  )
}
