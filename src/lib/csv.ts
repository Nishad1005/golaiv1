/** Minimal CSV parser: handles quoted fields, commas, CRLF. Returns rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else {
      cell += ch
    }
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

/** Download a CSV file (used for fill-in templates and exports). */
export function downloadCsv(rows: string[][], fileName: string): void {
  const csv = rows
    .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replaceAll('"', '""')}"` : c)).join(','))
    .join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Fill-in template for the zone bulk import. */
export function downloadZoneTemplate(): void {
  downloadCsv(
    [
      ['Zone No.', 'Zone Name', 'Category Type', 'Notes'],
      ['1', 'Main Store (Hardware)', 'Raw Material', 'Hardware items — main storage'],
      ['2', 'Fabric / Leather', 'Raw Material', 'Soft goods — upholstery raw material'],
      ['3', 'Foam', 'Raw Material', 'Foam blocks / sheets'],
    ],
    'golai-zones-template.csv',
  )
}

/** Fill-in template for the item master import. */
export function downloadItemTemplate(): void {
  downloadCsv(
    [
      ['Item Code', 'Barcode', 'Item Name', 'Category', 'Sub Category', 'UOM'],
      ['AU162590', '', 'Cupcake Fabric — Beige', 'Fabric', 'Upholstery', 'm'],
      ['', '8901234567890', 'Foam Block 40 Density', 'Foam', '', 'pcs'],
      ['HW-0042', '', 'Hinge 4 inch SS', 'Hardware', 'Fittings', 'pcs'],
    ],
    'golai-items-template.csv',
  )
}

/** Find the index of the first header matching any of the given aliases (case/space-insensitive). */
export function findColumn(headers: string[], aliases: string[]): number {
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/[\s_-]+/g, ''))
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias)
    if (idx !== -1) return idx
  }
  return -1
}
