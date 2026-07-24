import type { SheetTotals } from './formulas'
import type { CostingSheet } from './types'

/**
 * jsPDF is ~400 KB and only needed the moment someone exports. Loaded on demand
 * so a costing user does not pay for it on every page load — same approach as
 * the label printer in lib/labels.ts.
 */
async function pdfKit() {
  const { jsPDF } = await import('jspdf')
  return jsPDF
}

const money = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export interface CostingPdfInput {
  sheet: CostingSheet
  totals: SheetTotals
  companyName: string
  /** Line detail, grouped by category. Omit for a buyer-facing summary. */
  detail?: { category: string; lines: { label: string; amount: number }[] }[]
}

/**
 * A costing sheet as a PDF.
 *
 * Two audiences, one document: the category summary with percentages is what a
 * buyer or an owner reads, and the optional line detail is what the costing
 * manager checks. `includeDetail` decides which you get.
 */
export async function generateCostingPdf(
  { sheet, totals, companyName, detail }: CostingPdfInput,
  fileName?: string,
): Promise<void> {
  const JsPDF = await pdfKit()
  const doc = new JsPDF({ unit: 'mm', format: 'a4' })

  const M = 15                 // page margin
  const W = 210 - M * 2        // usable width
  let y = M

  const line = () => { doc.setDrawColor(210); doc.line(M, y, M + W, y); y += 5 }

  // ---- header ----
  doc.setFontSize(9).setTextColor(120)
  doc.text(companyName, M, y)
  doc.text(new Date(sheet.sheet_date).toLocaleDateString(), M + W, y, { align: 'right' })
  y += 7

  doc.setFontSize(18).setTextColor(20)
  doc.text(sheet.name, M, y)
  y += 7

  doc.setFontSize(10).setTextColor(110)
  const meta = [
    sheet.code ? `Code ${sheet.code}` : null,
    `Version ${sheet.version}`,
    sheet.buyer ? `Buyer: ${sheet.buyer}` : null,
    sheet.status === 'final' ? 'FINAL' : 'DRAFT',
  ].filter(Boolean).join('   ·   ')
  doc.text(meta, M, y)
  y += 6

  const dims = Object.entries(sheet.dimensions ?? {})
  if (dims.length > 0) {
    doc.text(dims.map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}"`).join('   ·   '), M, y)
    y += 6
  }
  y += 1
  line()

  // ---- category summary ----
  doc.setFontSize(11).setTextColor(20)
  doc.text('Cost breakdown', M, y)
  y += 6

  doc.setFontSize(9).setTextColor(130)
  doc.text('Category', M, y)
  doc.text('Amount', M + W - 30, y, { align: 'right' })
  doc.text('Share', M + W, y, { align: 'right' })
  y += 4
  line()

  doc.setFontSize(10).setTextColor(40)
  for (const c of totals.byCategory) {
    if (y > 262) { doc.addPage(); y = M }
    doc.text(c.name, M, y)
    doc.text(money(c.amount), M + W - 30, y, { align: 'right' })
    doc.setTextColor(140)
    doc.text(`${c.pct.toFixed(1)}%`, M + W, y, { align: 'right' })
    doc.setTextColor(40)
    y += 5.5
  }

  y += 2
  line()

  // ---- totals ----
  const total = (label: string, value: number, bold = false) => {
    if (y > 265) { doc.addPage(); y = M }
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 12 : 10).setTextColor(bold ? 20 : 70)
    doc.text(label, M + W - 70, y)
    doc.text(money(value), M + W, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    y += bold ? 7 : 5.5
  }

  total('Material + labour', totals.subtotal)
  if (totals.gst > 0) total(`GST (${sheet.gst_pct}%)`, totals.gst)
  total(`Overhead + margin (${sheet.margin_pct}%)`, totals.overheadMargin)
  y += 1
  line()
  total('Total price', totals.total, true)

  // ---- optional line detail ----
  if (detail && detail.length > 0) {
    doc.addPage()
    y = M
    doc.setFontSize(13).setTextColor(20)
    doc.text('Line detail', M, y)
    y += 8

    for (const group of detail) {
      if (group.lines.length === 0) continue
      if (y > 255) { doc.addPage(); y = M }

      doc.setFontSize(10).setFont('helvetica', 'bold').setTextColor(20)
      doc.text(group.category, M, y)
      y += 5
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(70)

      for (const l of group.lines) {
        if (y > 275) { doc.addPage(); y = M }
        doc.text(l.label || '—', M + 3, y, { maxWidth: W - 40 })
        doc.text(money(l.amount), M + W, y, { align: 'right' })
        y += 4.5
      }
      y += 3
    }
  }

  // ---- footer on every page ----
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(8).setTextColor(160)
    doc.text(
      sheet.finalised_at
        ? `Finalised ${new Date(sheet.finalised_at).toLocaleString()} — rates fixed at that date`
        : 'Draft — figures move as rates change',
      M, 287,
    )
    doc.text(`${p} / ${pages}`, M + W, 287, { align: 'right' })
  }

  const slug = sheet.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  doc.save(fileName ?? `costing-${slug || 'sheet'}-v${sheet.version}.pdf`)
}
