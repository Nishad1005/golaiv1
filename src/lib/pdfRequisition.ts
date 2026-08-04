// Extract requisition lines from the client's ERP requisition PDF.
//
// The PDF is a fixed-layout table (see the sample): #, Requisition No.,
// Requesting Department, Requested Department, Supplier, Image, Product,
// Requested/Fulfilled/Pending Qty, Work Order, Person, Remark, Created By, State.
// pdf.js gives every text fragment an (x, y). We read the header row to learn each
// column's x-range, then bucket each row's fragments into columns — so a product
// name that wraps four lines still lands in one cell, and the qty's superscript
// decimal ("10" + ".00") rejoins. Only Product + Requested Qty (+ PR no, work
// order, department) are pulled; everything else is ignored.

export interface RawReqLine {
  raw_product: string
  requested_qty: number
  pr_no: string | null
  department: string | null
  work_order_no: string | null
}

interface Frag { str: string; x: number; y: number }

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const tight = (s: string) => s.replace(/\s+/g, '')
const isInt = (s: string) => /^\d{1,4}$/.test(s.trim())
function parseQty(text: string): number {
  const m = tight(text).match(/([\d,]+(?:\.\d+)?)/)
  return m ? Number(m[1].replace(/,/g, '')) : 0
}

/** First header fragment (top-most) whose text equals `label`. */
function anchorX(frags: Frag[], label: string, after = -Infinity): number | null {
  const hits = frags.filter((f) => f.str.trim() === label && f.x > after).sort((a, b) => b.y - a.y)
  return hits.length ? hits[0].x : null
}

function parsePage(items: Frag[], out: RawReqLine[]) {
  const product = items.find((f) => f.str.trim() === 'Product')
  const work = items.find((f) => f.str.trim() === 'Work')
  if (!product || !work) return // not a requisition page / header not found

  // Column left-edges from the header labels (x). 'Requested' appears twice —
  // the one left of Supplier is Requested Department, the one right of Product is
  // Requested Qty.
  const xNo = anchorX(items, 'Requisition')
  const xRequesting = anchorX(items, 'Requesting')
  const xSupplier = anchorX(items, 'Supplier')
  const xProduct = product.x
  const xReqQty = anchorX(items, 'Requested', xProduct)          // after Product
  const xFulfilled = anchorX(items, 'Fulfilled')
  const xReqDept = xRequesting != null ? anchorX(items, 'Requested', xRequesting) : null
  const xWork = work.x
  const xPerson = anchorX(items, 'Person')
  if (xNo == null || xRequesting == null || xReqQty == null || xFulfilled == null) return

  const colStart = Math.min(...items.map((f) => f.x))
  const headerY = product.y
  const inCol = (f: Frag, lo: number, hi: number) => f.x >= lo - 1 && f.x < hi - 1

  // Data fragments = everything clearly below the header block.
  const data = items.filter((f) => f.y < headerY - 6).sort((a, b) => (b.y - a.y) || (a.x - b.x))

  const deptHi = xReqDept ?? xSupplier ?? xProduct
  const flush = (buckets: { pr: Frag[]; dept: Frag[]; prod: Frag[]; qty: Frag[]; wo: Frag[] }) => {
    const prod = clean(buckets.prod.sort((a, b) => (b.y - a.y) || (a.x - b.x)).map((f) => f.str).join(' '))
    const qty = parseQty(buckets.qty.sort((a, b) => a.x - b.x).map((f) => f.str).join(''))
    if (!prod || qty <= 0) return // footer/summary rows carry no product
    out.push({
      raw_product: prod,
      requested_qty: qty,
      pr_no: tight(buckets.pr.map((f) => f.str).join('')) || null,
      department: clean(buckets.dept.map((f) => f.str).join(' ')) || null,
      work_order_no: tight(buckets.wo.map((f) => f.str).join('')) || null,
    })
  }

  let cur: { pr: Frag[]; dept: Frag[]; prod: Frag[]; qty: Frag[]; wo: Frag[] } | null = null
  const fresh = () => ({ pr: [], dept: [], prod: [], qty: [], wo: [] })
  for (const f of data) {
    // A new row begins at the '#' column (an integer left of the ReqNo column).
    if (f.x < xNo - 1 && isInt(f.str)) {
      if (cur) flush(cur)
      cur = fresh()
      continue
    }
    if (!cur) continue
    if (inCol(f, xNo, xRequesting)) cur.pr.push(f)
    else if (inCol(f, xRequesting, deptHi)) cur.dept.push(f)
    else if (inCol(f, xProduct, xReqQty)) cur.prod.push(f)
    else if (inCol(f, xReqQty, xFulfilled)) cur.qty.push(f)
    else if (xPerson != null ? inCol(f, xWork, xPerson) : f.x >= xWork - 1) cur.wo.push(f)
  }
  if (cur) flush(cur)
  void colStart
}

/** Read a requisition PDF into structured lines (Product + Requested Qty + …). */
export async function extractRequisitionLines(file: File): Promise<RawReqLine[]> {
  const pdfjs = await import('pdfjs-dist')
  // Worker is bundled as an asset URL by Vite; loaded only when a PDF is imported.
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const out: RawReqLine[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const frags: Frag[] = content.items
      .map((it: any) => ({ str: it.str ?? '', x: it.transform[4], y: it.transform[5] }))
      .filter((f: Frag) => f.str.trim() !== '')
    parsePage(frags, out)
  }
  return out
}
