import { describe, expect, it } from 'vitest'
import { linesFromFragments, type Frag } from './pdfRequisition'

// A synthetic page modelling the real ERP requisition layout (y increases
// upward, headers wrap a line down). It deliberately includes the traps that
// broke the first attempt: a "Requisition Requests" title ABOVE the header, a
// "Work Order" header as one run, a product name that wraps two lines, and a
// superscript-decimal quantity split as "12" + ".62" + "sheet".
const COLS = { hash: 30, no: 60, requesting: 140, reqDept: 220, supplier: 300, image: 350, product: 390, reqQty: 520, fulfilled: 580, pending: 640, work: 700, person: 770 }

function page(): Frag[] {
  const f: Frag[] = []
  const add = (str: string, x: number, y: number) => f.push({ str, x, y })
  // Title above the table — must NOT be mistaken for the column header.
  add('Requisition Requests', 30, 760)
  // Header row (y=700) with some labels wrapping to y=690.
  add('#', COLS.hash, 700)
  add('Requisition', COLS.no, 700); add('No.', COLS.no, 690)
  add('Requesting', COLS.requesting, 700); add('Department', COLS.requesting, 690)
  add('Requested', COLS.reqDept, 700); add('Department', COLS.reqDept, 690)
  add('Supplier', COLS.supplier, 700)
  add('Image', COLS.image, 700)
  add('Product', COLS.product, 700)
  add('Requested', COLS.reqQty, 700); add('Qty', COLS.reqQty, 690)
  add('Fulfilled', COLS.fulfilled, 700); add('Qty', COLS.fulfilled, 690)
  add('Pending', COLS.pending, 700); add('Qty', COLS.pending, 690)
  add('Work Order', COLS.work, 700)
  add('Person', COLS.person, 700)
  // Row 1 (y=650)
  add('1', COLS.hash, 650)
  add('UNMPL/PR/26-', COLS.no, 650); add('27/103', COLS.no, 640)
  add('Stapling', COLS.requesting, 650); add('Department', COLS.requesting, 640)
  add('Store', COLS.reqDept, 650); add('Tanawada', COLS.reqDept, 640)
  add('N/A', COLS.supplier, 650)
  add('Allen Key L 4', COLS.product, 650); add('mm', COLS.product, 640)
  add('10', COLS.reqQty, 650); add('pc', COLS.reqQty + 20, 650)
  add('0', COLS.fulfilled, 650); add('pc', COLS.fulfilled + 12, 650)
  add('10', COLS.pending, 650); add('pc', COLS.pending + 12, 650)
  add('UNMPL/WO/26-', COLS.work, 650); add('27/43', COLS.work, 640)
  add('Ejaz', COLS.person, 650)
  // Row 2 (y=600) — wrapped product + superscript-decimal qty 12.62
  add('2', COLS.hash, 600)
  add('UNMPL/PR/26-', COLS.no, 600); add('27/82', COLS.no, 590)
  add('Stapling', COLS.requesting, 600); add('Department', COLS.requesting, 590)
  add('Store', COLS.reqDept, 600)
  add('N/A', COLS.supplier, 600)
  add('Foam Platinum', COLS.product, 600); add('72x36', COLS.product, 590)
  add('12', COLS.reqQty, 600); add('.62', COLS.reqQty + 14, 600); add('sheet', COLS.reqQty + 25, 600)
  add('0', COLS.fulfilled, 600); add('sheet', COLS.fulfilled + 8, 600)
  add('12', COLS.pending, 600); add('sheet', COLS.pending + 8, 600)
  add('UNMPL/WO/26-', COLS.work, 600); add('27/51', COLS.work, 590)
  // Footer ".00 .00 .00" summary row — no product, must be ignored.
  add('.00', COLS.reqQty, 550); add('.00', COLS.fulfilled, 550); add('.00', COLS.pending, 550)
  return f
}

describe('requisition PDF parser', () => {
  const lines = linesFromFragments(page())

  it('reads both product rows (title + footer ignored)', () => {
    expect(lines).toHaveLength(2)
  })
  it('rejoins a product name wrapped across lines', () => {
    expect(lines[0].raw_product).toBe('Allen Key L 4 mm')
    expect(lines[1].raw_product).toBe('Foam Platinum 72x36')
  })
  it('parses quantities, merging a superscript decimal', () => {
    expect(lines[0].requested_qty).toBe(10)
    expect(lines[1].requested_qty).toBe(12.62)
  })
  it('pulls PR no., work order and department per row', () => {
    expect(lines[0].pr_no).toBe('UNMPL/PR/26-27/103')
    expect(lines[0].work_order_no).toBe('UNMPL/WO/26-27/43')
    expect(lines[0].department).toBe('Stapling Department')
    expect(lines[1].pr_no).toBe('UNMPL/PR/26-27/82')
  })
})
