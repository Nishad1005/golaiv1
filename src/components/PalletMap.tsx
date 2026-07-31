import { Fragment, useMemo } from 'react'
import type { ReactNode } from 'react'
import { blockLetter } from '../lib/places'

/** The pallet fields the map needs — a subset of Shelf. */
export interface PalletCell {
  id: string
  code: string
  pallet_block?: number | null
  pallet_row?: number | null
  pallet_col?: number | null
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

interface Block {
  block: number
  rows: { row: number; cells: PalletCell[] }[]
  maxCols: number
}

/**
 * The car-park view of a pallet area: several blocks of pallets, each its own
 * grid, with roads (aisles) drawn between the blocks and along the top. Pallets
 * are found here by coordinate (Block · Row · Col), never by scanning a sticker —
 * long stock overhangs the pallet and hides any barcode, which is the whole
 * reason this exists.
 */
export function PalletMap({ pallets, onSelect, selectedId, highlightIds, annotate }: PalletMapProps) {
  const blocks = useMemo<Block[]>(() => {
    const byBlock = new Map<number, PalletCell[]>()
    for (const p of pallets) {
      if (p.pallet_row == null || p.pallet_col == null) continue
      const b = p.pallet_block ?? 1
      const list = byBlock.get(b) ?? []
      list.push(p)
      byBlock.set(b, list)
    }
    return [...byBlock.entries()]
      .sort(([a], [b]) => a - b)
      .map(([block, cells]) => {
        const byRow = new Map<number, PalletCell[]>()
        let maxCols = 0
        for (const c of cells) {
          const r = c.pallet_row as number
          const list = byRow.get(r) ?? []
          list.push(c)
          byRow.set(r, list)
          if ((c.pallet_col as number) > maxCols) maxCols = c.pallet_col as number
        }
        const rows = [...byRow.entries()]
          .sort(([a], [b]) => a - b)
          .map(([row, cs]) => ({ row, cells: cs.sort((a, b) => (a.pallet_col ?? 0) - (b.pallet_col ?? 0)) }))
        return { block, rows, maxCols }
      })
  }, [pallets])

  if (blocks.length === 0) {
    return (
      <p className="rounded-xl bg-ink-50 px-4 py-5 text-center text-sm text-ink-400">
        No pallet positions here yet.
      </p>
    )
  }

  const road = (vertical: boolean) =>
    vertical ? (
      <div className="flex w-7 shrink-0 items-center justify-center self-stretch rounded bg-ink-100">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-ink-400 [writing-mode:vertical-rl]">road</span>
      </div>
    ) : (
      <div className="mb-2 flex items-center justify-center rounded bg-ink-100 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
        road
      </div>
    )

  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200 bg-cream/40 p-3">
      <div className="min-w-max">
        {road(false)}
        <div className="flex items-start gap-2">
          {blocks.map((blk, i) => (
            <Fragment key={blk.block}>
              {i > 0 && road(true)}
              <div>
                <p className="mb-1 text-center text-xs font-semibold text-ink-500">Block {blockLetter(blk.block)}</p>
                <div className="space-y-2">
                  {blk.rows.map((r) => (
                    <div key={r.row} className="grid gap-2"
                      style={{ gridTemplateColumns: `repeat(${blk.maxCols}, minmax(4.25rem, 1fr))` }}>
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
                            <span className="block text-xs font-bold tabular-nums text-ink-800">R{p.pallet_row}·C{p.pallet_col}</span>
                            <span className="block text-[11px] text-ink-400">{note ?? <>&nbsp;</>}</span>
                          </>
                        )
                        const style = { gridColumnStart: p.pallet_col ?? undefined }
                        return onSelect ? (
                          <button key={p.id} type="button" style={style}
                            className={base + ' hover:border-brand-400 hover:bg-brand-50'}
                            onClick={() => onSelect(p)}
                            aria-label={`Block ${blockLetter(blk.block)}, Row ${r.row}, Col ${p.pallet_col}`}>
                            {inner}
                          </button>
                        ) : (
                          <div key={p.id} style={style} className={base}>{inner}</div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}
