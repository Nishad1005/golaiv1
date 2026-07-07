import { jsPDF } from 'jspdf'
import JsBarcode from 'jsbarcode'

export interface ShelfLabel {
  code: string // e.g. Z02-S012
  zoneName: string
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
 * Generate a printable A4 PDF of shelf barcode labels (2 × 5 grid per page).
 * Each label: big shelf code, Code128 barcode, zone name — matching the
 * physical labels already deployed at the pilot warehouse.
 */
export function generateShelfLabelsPdf(labels: ShelfLabel[], fileName = 'shelf-labels.pdf'): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = 210
  const cols = 2
  const rows = 5
  const marginX = 10
  const marginY = 12
  const cellW = (pageW - marginX * 2) / cols
  const cellH = (297 - marginY * 2) / rows

  labels.forEach((label, i) => {
    const idx = i % (cols * rows)
    if (i > 0 && idx === 0) doc.addPage()
    const col = idx % cols
    const row = Math.floor(idx / cols)
    const x = marginX + col * cellW
    const y = marginY + row * cellH

    doc.setDrawColor(180)
    doc.roundedRect(x + 2, y + 2, cellW - 4, cellH - 4, 2, 2)

    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.text(label.code, x + cellW / 2, y + 14, { align: 'center' })

    const img = barcodeDataUrl(label.code)
    const barcodeW = cellW - 24
    doc.addImage(img, 'PNG', x + 12, y + 20, barcodeW, 18)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(label.zoneName, x + cellW / 2, y + cellH - 8, { align: 'center' })
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
export function generateIssuanceLabelsPdf(labels: IssuanceLabel[], fileName: string): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const cols = 2
  const rows = 2
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
    doc.addImage(img, 'PNG', x + 12, cy, cellW - 24, 16)
    doc.setFontSize(9)
    doc.text(label.issNumber, x + cellW / 2, cy + 21, { align: 'center' })
  })

  doc.save(fileName)
}
