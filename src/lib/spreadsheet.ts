import { parseCsv } from './csv'

/**
 * Read an uploaded spreadsheet into rows of text cells (header row first).
 * CSV is parsed directly; .xlsx/.xls are read with read-excel-file (a small,
 * read-only library, lazy-loaded only when someone actually imports a workbook).
 * Excel is the reliable path for requisition import — structured columns, no PDF
 * layout guessing.
 */
export async function parseSpreadsheet(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    return parseCsv(await file.text())
  }
  // read-excel-file exposes subpaths (no root export); use the browser build.
  const readXlsxFile = (await import('read-excel-file/browser')).default
  const sheet = (await readXlsxFile(file)) as unknown as unknown[][]
  const cell = (c: unknown): string => {
    if (c == null) return ''
    if (c instanceof Date) return c.toLocaleDateString()
    return String(c).trim()
  }
  return sheet.map((r) => r.map(cell))
}
