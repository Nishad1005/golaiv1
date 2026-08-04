// Extract requisition lines from the client's ERP requisition PDF.
//
// The PDF is a fixed-layout table: #, Requisition No., Requesting Department,
// Requested Department, Supplier, Image, Product, Requested/Fulfilled/Pending
// Qty, Work Order, Person, Remark, Created By, State. pdf.js gives every text
// fragment an (x, y); we find the header row (anchored on the "Product" cell, so
// the "Requisition Requests" title above the table doesn't fool us), learn each
// column's x from its header label (matched loosely — "Work Order" arrives as one
// run), then bucket each row's fragments into columns. That way a product name
// that wraps four lines lands in one cell, and a superscript-decimal quantity
// ("12" + ".62" + "sheet") rejoins to 12.62 — which plain text extraction mangles.

export interface RawReqLine {
  raw_product: string
  requested_qty: number
  pr_no: string | null
  department: string | null
  work_order_no: string | null
}

export interface Frag { str: string; x: number; y: number }

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const tight = (s: string) => s.replace(/\s+/g, '')
const isInt = (s: string) => /^\d{1,4}$/.test(s.trim())
function parseQty(text: string): number {
  const m = tight(text).match(/([\d,]+(?:\.\d+)?)/)
  return m ? Number(m[1].replace(/,/g, '')) : 0
}

function parsePage(items: Frag[], out: RawReqLine[]): boolean {
  // Anchor on the exact "Product" header cell (a product *name* is never just
  // "Product", and the page title has no "Product") — this fixes the column band.
  const product = items
    .filter((f) => f.str.trim() === 'Product')
    .sort((a, b) => b.y - a.y)[0]
  if (!product) return false
  const headerY = product.y

  // Header labels sit in a band around the "Product" cell (some wrap a line down).
  const band = items.filter((f) => f.y <= headerY + 4 && f.y >= headerY - 22)
  const hx = (kw: string, minX = -Infinity, maxX = Infinity): number | null => {
    const hit = band
      .filter((f) => f.str.includes(kw) && f.x > minX && f.x < maxX)
      .sort((a, b) => a.x - b.x)[0]
    return hit ? hit.x : null
  }

  const xProduct = product.x
  const xNo = hx('Requisition')          // "Requisition No." (title excluded by band)
  const xRequesting = hx('Requesting')
  const xProductRight = hx('Requested', xProduct + 5) // the Requested *Qty* header
  const xFulfilled = hx('Fulfilled')
  const xReqDept = xRequesting != null ? hx('Requested', xRequesting + 2, xProduct) : null
  const xWork = hx('Work')
  const xPerson = hx('Person')
  if (xNo == null || xProductRight == null || xFulfilled == null) return false

  const T = 2
  const inCol = (f: Frag, lo: number | null, hi: number | null) =>
    lo != null && f.x >= lo - T && (hi == null || f.x < hi - T)

  const data = items
    .filter((f) => f.y < headerY - 6)
    .sort((a, b) => (b.y - a.y) || (a.x - b.x))

  // Group fragments into visual lines (same y ± tolerance), top to bottom.
  const lines: Frag[][] = []
  for (const f of data) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last[0].y - f.y) <= 3) last.push(f)
    else lines.push([f])
  }

  type Buckets = { pr: Frag[]; dept: Frag[]; prod: Frag[]; qty: Frag[]; wo: Frag[] }
  const fresh = (): Buckets => ({ pr: [], dept: [], prod: [], qty: [], wo: [] })
  const flush = (b: Buckets) => {
    const prod = clean(b.prod.sort((a, c) => (c.y - a.y) || (a.x - c.x)).map((f) => f.str).join(' '))
    const qty = parseQty(b.qty.sort((a, c) => a.x - c.x).map((f) => f.str).join(''))
    if (!prod || qty <= 0) return // header noise / footer ".00" summary rows
    out.push({
      raw_product: prod,
      requested_qty: qty,
      pr_no: tight(b.pr.map((f) => f.str).join('')) || null,
      department: clean(b.dept.map((f) => f.str).join(' ')) || null,
      work_order_no: tight(b.wo.map((f) => f.str).join('')) || null,
    })
  }

  let cur: Buckets | null = null
  for (const line of lines) {
    const isStart = line.some((f) => isInt(f.str) && f.x < xNo - T)
    if (isStart) { if (cur) flush(cur); cur = fresh() }
    if (!cur) continue
    // Real row content lives left of the qty columns; a line with only qty-column
    // items (the ".00 .00 .00" totals footer) is skipped so it can't pollute a row.
    const hasLeft = line.some((f) => f.x >= xNo - T && f.x < xProductRight - T)
    if (!isStart && !hasLeft) continue
    for (const f of line) {
      if (inCol(f, xNo, xRequesting)) cur.pr.push(f)
      else if (inCol(f, xRequesting, xReqDept ?? xProduct)) cur.dept.push(f)
      else if (inCol(f, xProduct, xProductRight)) cur.prod.push(f)
      else if (inCol(f, xProductRight, xFulfilled)) cur.qty.push(f)
      else if (xWork != null && inCol(f, xWork, xPerson)) cur.wo.push(f)
    }
  }
  if (cur) flush(cur)
  return true
}

/** Parse one page's text fragments into requisition lines. Exposed for tests. */
export function linesFromFragments(frags: Frag[]): RawReqLine[] {
  const out: RawReqLine[] = []
  parsePage(frags, out)
  return out
}

/** Read a requisition PDF into structured lines (Product + Requested Qty + …). */
export async function extractRequisitionLines(file: File): Promise<RawReqLine[]> {
  const pdfjs = await import('pdfjs-dist')
  // Worker is bundled as an asset URL by Vite; loaded only when a PDF is imported.
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const out: RawReqLine[] = []
  let sawHeader = false
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const frags: Frag[] = content.items
      .map((it: any) => ({ str: it.str ?? '', x: it.transform[4], y: it.transform[5] }))
      .filter((f: Frag) => f.str.trim() !== '')
    if (parsePage(frags, out)) sawHeader = true
  }
  if (!sawHeader) {
    throw new Error('Could not read the requisition table from this PDF — try the CSV option, or send me this PDF.')
  }
  return out
}
