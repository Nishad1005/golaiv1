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
