import { Fragment, useMemo } from 'react'
import type { ReactNode } from 'react'

/** The pallet fields the map needs — a subset of Shelf. */
export interface PalletCell {
  id: string
  code: string
  pallet_row?: number | null
  pallet_col?: number | null
  aisle_after?: boolean | null
  description?: string | null
}

interface PalletMapProps {
  pallets: PalletCell[]
  /** Tap handler — cells become buttons when provided. */
  onSelect?: (pallet: PalletCell) => void
  /** Currently-selected cell (drawn with a ring). */
  selectedId?: string | null
  /** Cells to emphasise, e.g. those holding a searched item. */
  highlightIds?: Set<string>
  /** Small note under the coordinate, e.g. "3 items" or a quantity. */
  annotate?: (pallet: PalletCell) => ReactNode
}

/**
 * The car-park view of a pallet area: one 2-D grid of bays. Columns run across
 * and rows run back, aligned into a grid; an aisle is drawn only after a row
 * that's flagged for one. Pallets are found here by coordinate (Row · Col),
 * never by scanning a sticker — long stock overhangs the pallet and hides any
 * barcode, which is the whole reason this exists.
 */
export function PalletMap({ pallets, onSelect, selectedId, highlightIds, annotate }: PalletMapProps) {
  const { rows, maxCols } = useMemo(() => {
    const byRow = new Map<number, PalletCell[]>()
    let max = 0
    for (const p of pallets) {
      if (p.pallet_row == null || p.pallet_col == null) continue
      const list = byRow.get(p.pallet_row) ?? []
      list.push(p)
      byRow.set(p.pallet_row, list)
      if (p.pallet_col > max) max = p.pallet_col
    }
    const rows = [...byRow.entries()]
      .sort(([a], [b]) => a - b)
      .map(([row, cells]) => ({
        row,
        cells: cells.sort((a, b) => (a.pallet_col ?? 0) - (b.pallet_col ?? 0)),
        aisleAfter: cells.some((c) => c.aisle_after),
      }))
    return { rows, maxCols: max }
  }, [pallets])

  if (rows.length === 0) {
    return (
      <p className="rounded-xl bg-ink-50 px-4 py-5 text-center text-sm text-ink-400">
        No pallet positions here yet.
      </p>
    )
  }

  const wall = (
    <p className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-300">Wall</p>
  )

  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200 bg-cream/40 p-3">
      <div className="min-w-max">
        {wall}
        {rows.map((r, i) => (
          <Fragment key={r.row}>
            {i > 0 && rows[i - 1].aisleAfter && (
              <div className="my-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-ink-300">
                <span className="h-px flex-1 bg-ink-200" /> aisle <span className="h-px flex-1 bg-ink-200" />
              </div>
            )}
            <div className="flex items-stretch gap-2 py-0.5">
              <span className="flex w-12 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-xs font-semibold text-ink-500">
                Row {r.row}
              </span>
              <div className="grid flex-1 gap-2"
                style={{ gridTemplateColumns: `repeat(${maxCols}, minmax(4.25rem, 1fr))` }}>
                {r.cells.map((p) => {
                  const selected = p.id === selectedId
                  const highlighted = highlightIds?.has(p.id)
                  const note = annotate?.(p)
                  const base =
                    'min-h-tap rounded-lg border px-2 py-1.5 text-center transition-colors ' +
                    (selected
                      ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-400'
                      : highlighted
                        ? 'border-brand-300 bg-brand-50'
                        : 'border-ink-200 bg-white')
                  const inner = (
                    <>
                      <span className="block text-sm font-bold tabular-nums text-ink-800">Col {p.pallet_col}</span>
                      <span className="block text-[11px] text-ink-400">{note ?? <>&nbsp;</>}</span>
                    </>
                  )
                  const style = { gridColumnStart: p.pallet_col ?? undefined }
                  return onSelect ? (
                    <button key={p.id} type="button" style={style}
                      className={base + ' hover:border-brand-400 hover:bg-brand-50'}
                      onClick={() => onSelect(p)} aria-label={`Row ${r.row}, Col ${p.pallet_col}`}>
                      {inner}
                    </button>
                  ) : (
                    <div key={p.id} style={style} className={base}>{inner}</div>
                  )
                })}
              </div>
            </div>
          </Fragment>
        ))}
        {wall}
      </div>
    </div>
  )
}
