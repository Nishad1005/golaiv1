import { jsPDF } from 'jspdf'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'

// Labels carry BOTH symbologies: Code128 for USB laser scanners on the floor,
// QR for phone/webcam cameras (1D codes decode poorly on webcams).
function qrDataUrl(value: string): Promise<string> {
  return QRCode.toDataURL(value, { margin: 0, width: 256 })
}

export interface ShelfLabel {
  code: string // e.g. Z02-S012 — what the barcode/QR encode
  companyName: string // tenant name, printed on top (client requirement)
  zoneName: string // e.g. "Foam"
  zoneNo: string // e.g. "Zone 3"
  locationLabel: string // client's own words, e.g. "Ghoda 1"
}

function barcodeDataUrl(value: string): string {
  const canvas = document.createElement('canvas')
  JsBarcode(canvas, value, {
    format: 'CODE128',
    displayValue: false,
    margin: 0,
    width: 3,
    height: 80,
  })
  return canvas.toDataURL('image/png')
}

/**
 * Location label sizes.
 * - 'a4': 10 labels per A4 sheet — office printer + sticker sheets
 * - 'thermal-100x50' / 'thermal-75x50' / 'thermal-50x25': ONE label per page,
 *   sized to the roll, for direct thermal printers (TSC TE244, TVS LP46 …).
 *   One label per page is essential: sending an A4 sheet to a label printer
 *   squeezes all ten labels onto a single sticker.
 */
export type ShelfLabelSize = 'a4' | 'thermal-100x50' | 'thermal-75x50' | 'thermal-50x25'

export const SHELF_LABEL_SIZES: { value: ShelfLabelSize; label: string }[] = [
  { value: 'thermal-100x50', label: 'Thermal roll — 100 × 50 mm (one per label)' },
  { value: 'thermal-75x50', label: 'Thermal roll — 75 × 50 mm (one per label)' },
  { value: 'thermal-50x25', label: 'Thermal roll — 50 × 25 mm (one per label)' },
  { value: 'a4', label: 'A4 sheet — 10 labels per page (office printer)' },
]

const THERMAL_DIMS: Record<string, [number, number]> = {
  'thermal-100x50': [100, 50],
  'thermal-75x50': [75, 50],
  'thermal-50x25': [50, 25],
}

/**
 * Generate printable location barcode labels: company name on top, the code
 * big, Code128 (USB laser scanners) + QR (phone cameras), and the zone + the
 * client's own place name ("Ghoda 1") at the bottom.
 */
export async function generateShelfLabelsPdf(
  labels: ShelfLabel[],
  fileName = 'shelf-labels.pdf',
  size: ShelfLabelSize = 'a4',
): Promise<void> {
  if (labels.length === 0) return

  const qrs = new Map<string, string>()
  for (const l of labels) {
    if (!qrs.has(l.code)) qrs.set(l.code, await qrDataUrl(l.code))
  }

  // Draws one label into the box at (x, y) of size w × h.
  const drawLabel = (doc: jsPDF, label: ShelfLabel, x: number, y: number, w: number, h: number, frame: boolean) => {
    const tiny = h < 30
    const pad = tiny ? 2 : 4
    const qrSide = Math.min(h * 0.42, w * 0.22)

    if (frame) {
      doc.setDrawColor(180)
      doc.roundedRect(x + 2, y + 2, w - 4, h - 4, 2, 2)
    }

    // Company name — their brand on every sticker
    doc.setFontSize(tiny ? 5.5 : 8)
    doc.setFont('helvetica', 'normal')
    doc.text(label.companyName.toUpperCase(), x + w / 2, y + (tiny ? 4 : 6.5), { align: 'center' })

    // The code — readable from a distance
    doc.setFontSize(tiny ? 10 : 18)
    doc.setFont('helvetica', 'bold')
    doc.text(label.code, x + w / 2, y + (tiny ? 9.5 : 14.5), { align: 'center' })

    // Code128 on the left, QR on the right
    const barTop = tiny ? y + 11 : y + 17
    const barH = tiny ? 6.5 : h * 0.28
    doc.addImage(barcodeDataUrl(label.code), 'PNG', x + pad, barTop, w - qrSide - pad * 3, barH)
    doc.addImage(qrs.get(label.code)!, 'PNG', x + w - qrSide - pad, barTop - (tiny ? 1 : 1.5), qrSide, qrSide)

    // The client's own place name, then the zone
    doc.setFontSize(tiny ? 7 : 11)
    doc.setFont('helvetica', 'bold')
    doc.text(label.locationLabel, x + w / 2, y + h - (tiny ? 6 : 10), { align: 'center' })
    doc.setFontSize(tiny ? 5.5 : 8.5)
    doc.setFont('helvetica', 'normal')
    doc.text(`${label.zoneName} (${label.zoneNo})`, x + w / 2, y + h - (tiny ? 2 : 4.5), { align: 'center' })
  }

  // --- Thermal: exactly one label per page, page = the sticker ---------------
  if (size !== 'a4') {
    const [w, h] = THERMAL_DIMS[size]
    const doc = new jsPDF({ unit: 'mm', format: [w, h], orientation: 'landscape' })
    labels.forEach((label, i) => {
      if (i > 0) doc.addPage([w, h], 'landscape')
      drawLabel(doc, label, 0, 0, w, h, false)
    })
    doc.save(fileName)
    return
  }

  // --- A4 sheet: 2 × 5 grid --------------------------------------------------
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const cols = 2
  const rows = 5
  const marginX = 10
  const marginY = 12
  const cellW = (210 - marginX * 2) / cols
  const cellH = (297 - marginY * 2) / rows

  labels.forEach((label, i) => {
    const idx = i % (cols * rows)
    if (i > 0 && idx === 0) doc.addPage()
    const col = idx % cols
    const row = Math.floor(idx / cols)
    drawLabel(doc, label, marginX + col * cellW, marginY + row * cellH, cellW, cellH, true)
  })

  doc.save(fileName)
}

export interface ItemLabel {
  code: string // the item's code (client's own, verbatim), encoded in both symbologies
  name: string
  uom?: string
  category?: string | null
}

/**
 * Item barcode label size presets:
 * - 'a4-24': 24 per A4 sheet (70×37mm) — cheap Avery-type office stickers
 * - 'a4-12': 12 per A4 sheet (105×48mm) — larger office stickers
 * - 'thermal-50x25': one 50×25mm label per page — direct thermal printers
 *   (TVS-E LP46, TSC TE244 etc., the Indian warehouse standard)
 */
export type ItemLabelSize =
  | 'thermal-50x25' | 'thermal-75x50' | 'thermal-100x50' | 'a4-24' | 'a4-12'

export const ITEM_LABEL_SIZES: { value: ItemLabelSize; label: string }[] = [
  { value: 'thermal-50x25', label: 'Thermal roll — 50 × 25 mm (one per label)' },
  { value: 'thermal-75x50', label: 'Thermal roll — 75 × 50 mm (one per label)' },
  { value: 'thermal-100x50', label: 'Thermal roll — 100 × 50 mm (one per label)' },
  { value: 'a4-24', label: 'A4 sheet — 24 labels (70 × 37 mm office stickers)' },
  { value: 'a4-12', label: 'A4 sheet — 12 labels (105 × 48 mm office stickers)' },
]

interface SizeSpec {
  page: [number, number] | 'a4'
  cols: number
  rows: number
  marginX: number
  marginY: number
}

const SIZE_SPECS: Record<ItemLabelSize, SizeSpec> = {
  'a4-24': { page: 'a4', cols: 3, rows: 8, marginX: 8, marginY: 12 },
  'a4-12': { page: 'a4', cols: 2, rows: 6, marginX: 6, marginY: 10 },
  'thermal-50x25': { page: [50, 25], cols: 1, rows: 1, marginX: 0, marginY: 0 },
  'thermal-75x50': { page: [75, 50], cols: 1, rows: 1, marginX: 0, marginY: 0 },
  'thermal-100x50': { page: [100, 50], cols: 1, rows: 1, marginX: 0, marginY: 0 },
}

/**
 * Generate item barcode labels — one physical sticker per unit/roll/box.
 * Each label: item name, code, Code128 (USB scanners) + QR (phone cameras).
 * `copies` lets you print N stickers for N physical pieces of the same item.
 */
export async function generateItemLabelsPdf(
  items: { label: ItemLabel; copies: number }[],
  size: ItemLabelSize,
  fileName: string,
): Promise<void> {
  const spec = SIZE_SPECS[size]
  // Expand copies into a flat list of labels to place
  const flat: ItemLabel[] = []
  for (const { label, copies } of items) {
    for (let c = 0; c < Math.max(1, copies); c++) flat.push(label)
  }
  if (flat.length === 0) return

  // Pre-render barcodes/QRs once per distinct code
  const codes = [...new Set(flat.map((l) => l.code))]
  const bars = new Map(codes.map((c) => [c, barcodeDataUrl(c)]))
  const qrs = new Map<string, string>()
  for (const c of codes) qrs.set(c, await qrDataUrl(c))

  const doc = new jsPDF({
    unit: 'mm',
    format: spec.page === 'a4' ? 'a4' : spec.page,
    orientation: spec.page === 'a4' ? 'portrait' : 'landscape',
  })
  const pageW = spec.page === 'a4' ? 210 : spec.page[0]
  const pageH = spec.page === 'a4' ? 297 : spec.page[1]
  const cellW = (pageW - spec.marginX * 2) / spec.cols
  const cellH = (pageH - spec.marginY * 2) / spec.rows
  const perPage = spec.cols * spec.rows

  flat.forEach((label, i) => {
    const idx = i % perPage
    if (i > 0 && idx === 0) doc.addPage(spec.page === 'a4' ? 'a4' : spec.page, spec.page === 'a4' ? 'portrait' : 'landscape')
    const col = idx % spec.cols
    const row = Math.floor(idx / spec.cols)
    const x = spec.marginX + col * cellW
    const y = spec.marginY + row * cellH
    // Scale by the actual label height so bigger rolls use the space
    const compact = cellH < 30
    const pad = compact ? 1.5 : 3

    // Item name (wrapped, max 2 lines)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(compact ? 7 : 11)
    const nameLines = doc.splitTextToSize(label.name, cellW - pad * 2).slice(0, 2)
    doc.text(nameLines, x + pad, y + pad + 2.5)

    // Code
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(compact ? 6 : 9)
    const codeY = y + pad + (compact ? (nameLines.length > 1 ? 8 : 5) : (nameLines.length > 1 ? 13 : 8))
    doc.text(label.code, x + pad, codeY)

    // Code128 on the left, QR on the right of the lower half
    const barTop = codeY + 1
    const qrSide = Math.min(cellH - (barTop - y) - pad, cellW * 0.32)
    doc.addImage(bars.get(label.code)!, 'PNG', x + pad, barTop, cellW - qrSide - pad * 3, cellH - (barTop - y) - pad - 2.5)
    doc.addImage(qrs.get(label.code)!, 'PNG', x + cellW - qrSide - pad, barTop, qrSide, qrSide)

    // Code text under the barcode
    doc.setFontSize(compact ? 5 : 8)
    doc.text(label.code, x + pad, y + cellH - pad + 0.5)
  })

  doc.save(fileName)
}

export interface IssuanceLabel {
  itemCode: string
  itemName: string
  qty: string // e.g. "13 m"
  soRef: string | null
  customerNote: string | null
  department: string
  foreman: string
  dateIssued: string
  issNumber: string // encoded in the Code128 barcode (scanned on returns)
  rrNumber: string
}

/**
 * Issuance labels (PRD 4.4): stuck on every carton/roll/unit leaving the store.
 * One label per A6-ish quadrant on A4 (2 × 2 per page). "FOR: SO-XXXX" is the
 * dominant element; the barcode encodes the issuance number for return scans.
 */
export async function generateIssuanceLabelsPdf(labels: IssuanceLabel[], fileName: string): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const cols = 2
  const rows = 2
  const marginX = 8
  const marginY = 8
  const cellW = (210 - marginX * 2) / cols
  const cellH = (297 - marginY * 2) / rows
  const qrByNumber = new Map<string, string>()
  for (const l of labels) {
    if (!qrByNumber.has(l.issNumber)) qrByNumber.set(l.issNumber, await qrDataUrl(l.issNumber))
  }

  labels.forEach((label, i) => {
    const idx = i % (cols * rows)
    if (i > 0 && idx === 0) doc.addPage()
    const col = idx % cols
    const row = Math.floor(idx / cols)
    const x = marginX + col * cellW
    const y = marginY + row * cellH

    doc.setDrawColor(120)
    doc.roundedRect(x + 2, y + 2, cellW - 4, cellH - 4, 2, 2)

    let cy = y + 14
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text(doc.splitTextToSize(label.itemName, cellW - 16), x + 8, cy)
    cy += 12

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`${label.itemCode}  ·  Qty: ${label.qty}`, x + 8, cy)
    cy += 12

    // The headline: which sales order this material belongs to
    doc.setFontSize(26)
    doc.setFont('helvetica', 'bold')
    doc.text(`FOR: ${label.soRef ?? '—'}`, x + cellW / 2, cy, { align: 'center' })
    cy += 9

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    if (label.customerNote) {
      doc.text(label.customerNote, x + cellW / 2, cy, { align: 'center' })
      cy += 7
    }
    doc.text(`Dept: ${label.department}   Foreman: ${label.foreman}`, x + 8, cy + 2)
    cy += 9
    doc.text(`Issued: ${label.dateIssued}   Ref: ${label.rrNumber}`, x + 8, cy)
    cy += 6

    const img = barcodeDataUrl(label.issNumber)
    doc.addImage(img, 'PNG', x + 12, cy, cellW - 52, 16)
    doc.addImage(qrByNumber.get(label.issNumber)!, 'PNG', x + cellW - 34, cy - 2, 24, 24)
    doc.setFontSize(9)
    doc.text(label.issNumber, x + (cellW - 40) / 2, cy + 21, { align: 'center' })
  })

  doc.save(fileName)
}

export interface CartonLabel {
  cartonBarcode: string
  dcNumber: string
  soRef: string | null
  customerName: string | null
  contents: string // e.g. "2 pcs × Aara 3-seater sofa"
}

/** Dispatch carton labels: scanned by security at gate-out (2 × 3 per A4). */
export async function generateCartonLabelsPdf(labels: CartonLabel[], fileName: string): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const cartonQrs = new Map<string, string>()
  for (const l of labels) {
    if (!cartonQrs.has(l.cartonBarcode)) cartonQrs.set(l.cartonBarcode, await qrDataUrl(l.cartonBarcode))
  }
  const cols = 2
  const rows = 3
  const marginX = 8
  const marginY = 8
  const cellW = (210 - marginX * 2) / cols
  const cellH = (297 - marginY * 2) / rows

  labels.forEach((label, i) => {
    const idx = i % (cols * rows)
    if (i > 0 && idx === 0) doc.addPage()
    const col = idx % cols
    const row = Math.floor(idx / cols)
    const x = marginX + col * cellW
    const y = marginY + row * cellH

    doc.setDrawColor(120)
    doc.roundedRect(x + 2, y + 2, cellW - 4, cellH - 4, 2, 2)

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(label.dcNumber, x + cellW / 2, y + 14, { align: 'center' })

    doc.setFontSize(12)
    doc.text(label.soRef ? `SO: ${label.soRef}` : '', x + cellW / 2, y + 22, { align: 'center' })

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    if (label.customerName) {
      doc.text(label.customerName, x + cellW / 2, y + 29, { align: 'center' })
    }
    doc.text(doc.splitTextToSize(label.contents, cellW - 16), x + 8, y + 38)

    const img = barcodeDataUrl(label.cartonBarcode)
    doc.addImage(img, 'PNG', x + 12, y + cellH - 32, cellW - 52, 16)
    doc.addImage(cartonQrs.get(label.cartonBarcode)!, 'PNG', x + cellW - 34, y + cellH - 36, 24, 24)
    doc.setFontSize(9)
    doc.text(label.cartonBarcode, x + (cellW - 40) / 2, y + cellH - 11, { align: 'center' })
  })

  doc.save(fileName)
}
