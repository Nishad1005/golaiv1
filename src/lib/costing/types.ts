import type { FormulaKind, LineInputs } from './formulas'

export interface CostingField {
  id: string
  key: string
  label: string
  data_type: 'number' | 'text' | 'rate_lookup'
  unit: string | null
  sort_order: number
  is_input: boolean
  required: boolean
}

export interface CostingCategory {
  id: string
  key: string
  name: string
  sort_order: number
  formula_kind: FormulaKind
  config: Record<string, unknown>
  is_active: boolean
  costing_category_fields: CostingField[]
}

export interface CostingSheet {
  id: string
  code: string | null
  name: string
  version: number
  status: 'draft' | 'final' | 'archived'
  buyer: string | null
  sheet_date: string
  dimensions: Record<string, number | string>
  photo_url: string | null
  gst_pct: number
  margin_pct: number
  computed: SheetSnapshot | null
  finalised_at: string | null
  created_at: string
  updated_at: string
}

export interface CostingLine {
  id: string
  sheet_id: string
  category_id: string
  item_id: string | null
  label: string | null
  sort_order: number
  inputs: LineInputs
  amount: number
  note: string | null
}

/** A line as the editor holds it — `id` is local until first save. */
export interface DraftLine extends Omit<CostingLine, 'id' | 'sheet_id'> {
  id: string
  /** True until this row has been persisted, so saves know to insert. */
  isNew?: boolean
}

export interface CostingRateEntry {
  id: string
  rate_table_id: string
  lookup_key: string
  attributes: Record<string, unknown>
  rate: number
  effective_from: string
  effective_to: string | null
}

export interface CostingRateTable {
  id: string
  key: string
  name: string
  note: string | null
}

/**
 * What gets frozen into `costing_sheets.computed` when a sheet is finalised.
 * Stored rather than recomputed so a sheet costed in March still reads the same
 * in December, whatever the rates have done since.
 */
export interface SheetSnapshot {
  finalised_at: string
  subtotal: number
  gst: number
  overhead_margin: number
  total: number
  categories: { key: string; name: string; amount: number; pct: number }[]
  lines: { category_key: string; label: string; inputs: LineInputs; amount: number }[]
  /** Rates in force at the moment of finalising, so the numbers can be explained. */
  rates: Record<string, number>
}

/** The dimension fields on a sheet header — theirs, from the chair sketch. */
export const DIMENSION_FIELDS: { key: string; label: string }[] = [
  { key: 'depth', label: 'Depth' },
  { key: 'width', label: 'Width' },
  { key: 'height', label: 'Height' },
  { key: 'seat_height', label: 'Seat height' },
  { key: 'seat_width', label: 'Seat width' },
  { key: 'seat_depth', label: 'Seat depth' },
  { key: 'arm_height', label: 'Arm height' },
]
