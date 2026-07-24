/**
 * The costing formula shapes.
 *
 * Their spreadsheet looks like it is full of arbitrary formulas. It isn't —
 * every formula belongs to a CATEGORY, and all 31 categories reduce to the nine
 * shapes below. So this is a small library of named functions, not a formula
 * engine.
 *
 * That matters beyond tidiness: free-text formulas would bury "12 metres of
 * Cupcake Fabric" inside a string, and Golai could never answer "which products
 * use this fabric?" or reprice everything when a rate moves. Structure is what
 * makes the data queryable, which is the entire reason to leave Excel.
 */

export type FormulaKind =
  | 'fixed'
  | 'qty_rate'
  | 'length_rate'
  | 'volume_rate'
  | 'area_yield'
  | 'sheet_yield'
  | 'cbm'
  | 'carton_area'
  | 'container_alloc'

export interface LineInputs {
  [key: string]: number | string | null | undefined
}

/** Inches³ → cubic feet. 12³ = 1728, but the trade divides by 144 and counts
 *  thickness in inches — matching their sheet exactly rather than "correcting" it. */
const CFT_DIVISOR = 144

/** Cubic metres per cubic inch — their constant, kept verbatim. */
const CBM_PER_CUBIC_INCH = 0.0000163871

function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

export interface ComputeResult {
  amount: number
  /** Values worth showing back to the user, e.g. the derived cft. */
  derived: Record<string, number>
  /** Why the amount is zero when inputs suggest it shouldn't be. */
  warning?: string
}

/**
 * One line's amount.
 *
 * `rate` may be supplied directly on the line or resolved from a rate table by
 * the caller — this function does not fetch anything.
 */
export function computeLine(kind: FormulaKind, inputs: LineInputs, rate?: number): ComputeResult {
  const r = rate !== undefined ? rate : num(inputs.rate)
  const qty = num(inputs.qty)

  switch (kind) {
    case 'fixed':
      return { amount: num(inputs.amount), derived: {} }

    case 'qty_rate':
      return { amount: qty * r, derived: {}, ...zeroCheck(qty, r) }

    case 'length_rate': {
      const length = num(inputs.length)
      return { amount: length * qty * r, derived: {}, ...zeroCheck(qty * length, r) }
    }

    case 'volume_rate': {
      // (L × W × T ÷ 144) × qty = cft, then × price/cft
      const cft = (num(inputs.length) * num(inputs.width) * num(inputs.thickness)) / CFT_DIVISOR * qty
      return { amount: cft * r, derived: { cft }, ...zeroCheck(cft, r) }
    }

    case 'area_yield': {
      // price/sqft × area × qty ÷ pieces per sheet
      const perSheet = num(inputs.per_sheet)
      if (perSheet === 0) {
        return { amount: 0, derived: {}, warning: 'Pieces per sheet is missing' }
      }
      const amount = (r * num(inputs.area) * qty) / perSheet
      return { amount, derived: {}, ...zeroCheck(num(inputs.area) * qty, r) }
    }

    case 'sheet_yield': {
      // (sheet price ÷ pieces per sheet) × qty — the foam VLOOKUP case
      const perSheet = num(inputs.per_sheet)
      if (perSheet === 0) {
        return { amount: 0, derived: {}, warning: 'Pieces per sheet is missing' }
      }
      const amount = (r / perSheet) * qty
      return { amount, derived: {}, ...zeroCheck(qty, r) }
    }

    case 'cbm': {
      const cbm = CBM_PER_CUBIC_INCH * num(inputs.length) * num(inputs.width) * num(inputs.height)
      return { amount: cbm * r, derived: { cbm } }
    }

    case 'carton_area': {
      // (L+W+3) × 2 × (W+H+2) × gsm ÷ 1550 — corrugated board area
      const l = num(inputs.length), w = num(inputs.width), h = num(inputs.height)
      const gsm = num(inputs.gsm) || 60
      const amount = ((l + w + 3) * 2 * (w + h + 2) * gsm) / 1550
      return { amount, derived: {} }
    }

    case 'container_alloc': {
      // (freight ÷ units per container) + (rate × CBM) + handling
      const perContainer = num(inputs.per_container)
      if (perContainer === 0) {
        return { amount: 0, derived: {}, warning: 'Units per container is missing' }
      }
      const cbm = num(inputs.cbm)
      const amount = num(inputs.freight) / perContainer + r * cbm + num(inputs.handling)
      return { amount, derived: {} }
    }

    default:
      return { amount: 0, derived: {}, warning: `Unknown formula: ${kind}` }
  }
}

/**
 * Their sheet's quietest failure: a rate typed in with no quantity, or the
 * reverse, silently produces ₹0 and nobody can tell "not used in this product"
 * from "somebody forgot the number". We surface it instead.
 */
function zeroCheck(quantity: number, rate: number): { warning?: string } {
  if (rate !== 0 && quantity === 0) return { warning: 'Rate entered but no quantity' }
  if (quantity !== 0 && rate === 0) return { warning: 'Quantity entered but no rate' }
  return {}
}

export interface SheetTotals {
  byCategory: { categoryId: string; name: string; amount: number; pct: number }[]
  subtotal: number
  gst: number
  overheadMargin: number
  total: number
}

/**
 * Roll lines up into the summary.
 *
 * Every category with lines appears — the summary is computed, never a list of
 * hand-written cell references. That is what makes the ₹1,071 that fell out of
 * their spreadsheet's total structurally impossible here.
 */
export function summarise(
  lines: { categoryId: string; categoryName: string; amount: number }[],
  gstPct: number,
  marginPct: number,
): SheetTotals {
  const totals = new Map<string, { name: string; amount: number }>()
  for (const l of lines) {
    const cur = totals.get(l.categoryId)
    if (cur) cur.amount += l.amount
    else totals.set(l.categoryId, { name: l.categoryName, amount: l.amount })
  }

  const subtotal = [...totals.values()].reduce((s, c) => s + c.amount, 0)
  const gst = (subtotal * num(gstPct)) / 100
  const overheadMargin = ((subtotal + gst) * num(marginPct)) / 100

  return {
    byCategory: [...totals.entries()]
      .map(([categoryId, c]) => ({
        categoryId,
        name: c.name,
        amount: c.amount,
        pct: subtotal === 0 ? 0 : (c.amount / subtotal) * 100,
      }))
      .sort((a, b) => b.amount - a.amount),
    subtotal,
    gst,
    overheadMargin,
    total: subtotal + gst + overheadMargin,
  }
}

export const __testables = { num, zeroCheck }
